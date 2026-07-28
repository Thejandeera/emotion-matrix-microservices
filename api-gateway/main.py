import time
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI(title="Emotion Matrix API Gateway")

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AudioPayload(BaseModel):
    audio_data: str

class TextPayload(BaseModel):
    text: str

WHISPER_SERVICE_URL = "http://localhost:8001/transcribe/base64"
PHRASE_SERVICE_URL = "http://localhost:8002/extract-phrases"
SENTIMENT_BATCH_SERVICE_URL = "http://localhost:8003/analyze-sentiment-batch"

http_client: httpx.AsyncClient = None

@app.on_event("startup")
async def startup_event():
    global http_client
    http_client = httpx.AsyncClient(timeout=30.0, limits=httpx.Limits(max_keepalive_connections=20, max_connections=100))

@app.on_event("shutdown")
async def shutdown_event():
    global http_client
    if http_client:
        await http_client.aclose()

async def analyze_text_pipeline(transcript: str, start_time: float, client: httpx.AsyncClient, service_source: str = "direct_text"):
    if not transcript or not transcript.strip():
        return {"status": "success", "transcript": "", "detected_issues": [], "processing_time_ms": 0, "source": service_source}

    transcript = transcript.strip()

    # 1. Extract Phrases & Context from Phrase Extraction Service (Port 8002)
    try:
        phrase_res = await client.post(PHRASE_SERVICE_URL, json={"transcript": transcript})
        phrase_res.raise_for_status()
        matches = phrase_res.json().get("matches", [])
    except httpx.HTTPStatusError as e:
        try:
            detail = e.response.json().get("detail", str(e))
        except Exception:
            detail = str(e)
        raise HTTPException(status_code=e.response.status_code, detail=f"Phrase extraction service error: {detail}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Phrase extraction service unreachable: {str(e)}")

    # 2. Prepare All Sentences in Transcript for Emotion Analysis
    import re
    raw_sentences = re.split(r'(?<=[.!?])\s+', transcript)
    sentences = [s.strip() for s in raw_sentences if s.strip()]
    if not sentences:
        sentences = [transcript]

    phrase_map = {}
    for m in matches:
        sent_key = m.get("isolated_sentence", "").strip()
        if sent_key:
            phrase_map[sent_key] = m

    items_to_analyze = []
    for sent in sentences:
        m_info = phrase_map.get(sent)
        if not m_info:
            for k, v in phrase_map.items():
                if k in sent or sent in k:
                    m_info = v
                    break
        
        matched_phrase = m_info.get("phrase", "N/A") if m_info else "N/A"
        kw_sent = m_info.get("keyword_sentiment", "neutral") if m_info else "neutral"
        kw_weight = m_info.get("keyword_weight", 0) if m_info else 0
        
        items_to_analyze.append({
            "phrase": matched_phrase,
            "isolated_sentence": sent,
            "keyword_sentiment": kw_sent,
            "keyword_weight": kw_weight
        })

    # 3. Vectorized Batch Call to Sentiment Microservice (Port 8003)
    batch_payload_items = [
        {
            "isolated_sentence": item["isolated_sentence"],
            "keyword_sentiment": item["keyword_sentiment"],
            "keyword_weight": item["keyword_weight"]
        }
        for item in items_to_analyze
    ]

    final_results = []
    try:
        sentiment_res = await client.post(SENTIMENT_BATCH_SERVICE_URL, json={"items": batch_payload_items})
        sentiment_res.raise_for_status()
        batch_outputs = sentiment_res.json().get("results", [])
        
        for item, s_data in zip(items_to_analyze, batch_outputs):
            final_results.append({
                "phrase": item["phrase"],
                "isolated_sentence": item["isolated_sentence"],
                "keyword_sentiment": item["keyword_sentiment"],
                "keyword_weight": item["keyword_weight"],
                "emotion": s_data.get("emotion", "neutral"),
                "sentiment_category": s_data.get("sentiment_category", "neutral"),
                "confidence": s_data.get("confidence", 0.0)
            })
    except Exception as e:
        print(f"Warning: Sentiment batch analysis error: {e}")
        for item in items_to_analyze:
            final_results.append({
                "phrase": item["phrase"],
                "isolated_sentence": item["isolated_sentence"],
                "keyword_sentiment": item["keyword_sentiment"],
                "keyword_weight": item["keyword_weight"],
                "emotion": "neutral",
                "sentiment_category": "neutral",
                "confidence": 0.0
            })

    end_time = time.perf_counter()
    processing_time_ms = round((end_time - start_time) * 1000, 2)

    return {
        "status": "success",
        "processing_time_ms": processing_time_ms,
        "transcript": transcript,
        "detected_issues": final_results,
        "source": service_source
    }

@app.post("/api/v1/process-text")
async def process_text(payload: TextPayload):
    try:
        start_time = time.perf_counter()
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        return await analyze_text_pipeline(payload.text, start_time, client, service_source="text_direct")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Gateway Error: {str(e)}")

@app.post("/api/v1/process-audio")
async def process_audio(payload: AudioPayload):
    try:
        start_time = time.perf_counter()
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        
        # 1. Get Transcript from Whisper Service
        try:
            whisper_res = await client.post(WHISPER_SERVICE_URL, json={"audio_data": payload.audio_data})
            whisper_res.raise_for_status()
            transcript = whisper_res.json().get("transcript", "")
        except httpx.HTTPStatusError as e:
            try:
                detail = e.response.json().get("detail", str(e))
            except Exception:
                detail = str(e)
            raise HTTPException(status_code=e.response.status_code, detail=f"Whisper service error: {detail}")
        except httpx.RequestError as e:
            raise HTTPException(status_code=503, detail=f"Whisper service unreachable: {str(e)}")
            
        return await analyze_text_pipeline(transcript, start_time, client, service_source="whisper_audio")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Gateway Error: {str(e)}")