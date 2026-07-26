import time
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

app = FastAPI(title="Emotion Matrix API Gateway")

# Allow the Next.js frontend to communicate with this gateway
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

# Local network URLs for the microservices
WHISPER_SERVICE_URL = "http://localhost:8001/transcribe/base64"
PHRASE_SERVICE_URL = "http://localhost:8002/extract-phrases"
SENTIMENT_SERVICE_URL = "http://localhost:8003/analyze-sentiment"

# Shared HTTPX client with connection pooling
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

@app.post("/api/v1/process-audio")
async def process_audio(payload: AudioPayload):
    try:
        start_time = time.perf_counter()
        
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        
        # ==========================================
        # 1. Get Transcript from Whisper Service
        # ==========================================
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

        # ==========================================
        # 2. Extract Phrases & Context
        # ==========================================
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

        # ==========================================
        # 3. Analyze Emotion for Each Target Context (In Parallel)
        # ==========================================
        async def analyze_match(match):
            isolated_sentence = match["isolated_sentence"]
            try:
                sentiment_res = await client.post(SENTIMENT_SERVICE_URL, json={"isolated_sentence": isolated_sentence})
                sentiment_res.raise_for_status()
                sentiment_data = sentiment_res.json()
                
                return {
                    "phrase": match["phrase"],
                    "isolated_sentence": isolated_sentence,
                    "emotion": sentiment_data["emotion"],
                    "sentiment_category": sentiment_data["sentiment_category"],
                    "confidence": sentiment_data["confidence"]
                }
            except httpx.HTTPError as e:
                print(f"Warning: Sentiment analysis failed for sentence '{isolated_sentence}': {e}")
                return None

        results = await asyncio.gather(*(analyze_match(m) for m in matches))
        final_results = [r for r in results if r is not None]

        end_time = time.perf_counter()
        processing_time_ms = round((end_time - start_time) * 1000, 2)

        # Return the fully packaged payload back to the Next.js frontend
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