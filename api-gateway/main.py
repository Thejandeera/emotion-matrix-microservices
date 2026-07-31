import time
import re
import asyncio
from typing import List, Optional
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
    speaker: Optional[str] = "caller"

class MessagePayload(BaseModel):
    text: str
    speaker: Optional[str] = "caller"

WHISPER_SERVICE_URL = "http://localhost:8001/transcribe/base64"
PHRASE_SERVICE_URL = "http://localhost:8002/extract-keywords"
SENTIMENT_SERVICE_URL = "http://localhost:8003/analyze-sentiment"
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

@app.post("/api/v1/process-message")
async def process_message(payload: MessagePayload):
    try:
        start_time = time.perf_counter()
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        
        text = payload.text.strip()
        speaker = payload.speaker if payload.speaker in ["agent", "caller"] else "caller"
        if not text:
            return {"status": "success", "detected_issues": [], "processing_time_ms": 0}

        # 1. Detect Keywords via Phrase Service
        detected_keywords = []
        try:
            phrase_res = await client.post(PHRASE_SERVICE_URL, json={"text": text})
            if phrase_res.status_code == 200:
                detected_keywords = phrase_res.json().get("keywords", phrase_res.json().get("matches", []))
        except Exception as e:
            print(f"Warning: Keyword detection service error: {e}")

        # 2. Get RoBERTa Sentiment & Confidence via Sentiment Service
        emotion = "neutral"
        sentiment_category = "neutral"
        confidence = 0.0
        try:
            sentiment_res = await client.post(SENTIMENT_SERVICE_URL, json={"text": text})
            if sentiment_res.status_code == 200:
                s_data = sentiment_res.json()
                emotion = s_data.get("emotion", "neutral")
                sentiment_category = s_data.get("sentiment_category", "neutral")
                confidence = float(s_data.get("confidence", 0.0))
        except Exception as e:
            print(f"Warning: Sentiment analysis service error: {e}")

        end_time = time.perf_counter()
        processing_time_ms = round((end_time - start_time) * 1000, 2)

        return {
            "status": "success",
            "processing_time_ms": processing_time_ms,
            "detected_issues": [{
                "text": text,
                "isolated_sentence": text,
                "speaker": speaker,
                "phrase": detected_keywords[0]["keyword"] if detected_keywords else "N/A",
                "detected_keywords": detected_keywords,
                "emotion": emotion,
                "sentiment_category": sentiment_category,
                "confidence": confidence
            }]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Gateway Error: {str(e)}")

@app.post("/api/v1/process-audio")
async def process_audio(payload: AudioPayload):
    try:
        start_time = time.perf_counter()
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        speaker = payload.speaker if payload.speaker in ["agent", "caller"] else "caller"
        
        # 1. Transcribe Audio via Whisper Service
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
            
        if not transcript:
            return {"status": "success", "transcript": "", "detected_issues": [], "processing_time_ms": 0}

        # 2. Split Transcript into Sentences
        raw_sentences = re.split(r'(?<=[.!?])\s+', transcript.strip())
        sentences = [s.strip() for s in raw_sentences if s.strip()]
        if not sentences:
            sentences = [transcript.strip()]

        # 3. Detect Keywords for full transcript
        keywords_per_sentence = []
        for sent in sentences:
            try:
                phrase_res = await client.post(PHRASE_SERVICE_URL, json={"text": sent})
                if phrase_res.status_code == 200:
                    kws = phrase_res.json().get("keywords", phrase_res.json().get("matches", []))
                    keywords_per_sentence.append(kws)
                else:
                    keywords_per_sentence.append([])
            except Exception:
                keywords_per_sentence.append([])

        # 4. Vectorized Batch Sentiment Call to Sentiment Service
        batch_payload_items = [{"isolated_sentence": sent} for sent in sentences]

        final_results = []
        try:
            sentiment_res = await client.post(SENTIMENT_BATCH_SERVICE_URL, json={"items": batch_payload_items})
            sentiment_res.raise_for_status()
            batch_outputs = sentiment_res.json().get("results", [])
            
            for sent, kws, s_data in zip(sentences, keywords_per_sentence, batch_outputs):
                final_results.append({
                    "text": sent,
                    "isolated_sentence": sent,
                    "speaker": speaker,
                    "phrase": kws[0]["keyword"] if kws else "N/A",
                    "detected_keywords": kws,
                    "emotion": s_data.get("emotion", "neutral"),
                    "sentiment_category": s_data.get("sentiment_category", "neutral"),
                    "confidence": float(s_data.get("confidence", 0.0))
                })
        except Exception as e:
            print(f"Warning: Sentiment batch analysis error: {e}")
            for sent, kws in zip(sentences, keywords_per_sentence):
                final_results.append({
                    "text": sent,
                    "isolated_sentence": sent,
                    "speaker": speaker,
                    "phrase": kws[0]["keyword"] if kws else "N/A",
                    "detected_keywords": kws,
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
            "detected_issues": final_results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Gateway Error: {str(e)}")