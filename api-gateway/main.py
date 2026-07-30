import time
import asyncio
import hashlib
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import redis.asyncio as redis
import re

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
    session_id: str = "default"

class TextPayload(BaseModel):
    text: str
    session_id: str = "default"

WHISPER_SERVICE_URL = "http://localhost:8001/transcribe/base64"
PHRASE_SERVICE_URL = "http://localhost:8002/extract-phrases"
SENTIMENT_SERVICE_URL = "http://localhost:8003/analyze-sentiment"

http_client: httpx.AsyncClient = None
redis_client: redis.Redis = None

@app.on_event("startup")
async def startup_event():
    global http_client, redis_client
    http_client = httpx.AsyncClient(timeout=30.0, limits=httpx.Limits(max_keepalive_connections=20, max_connections=100))
    print("[Gateway] Connecting to Redis at localhost:6379...")
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    print("[Gateway] Redis ready.")

@app.on_event("shutdown")
async def shutdown_event():
    global http_client, redis_client
    if http_client:
        await http_client.aclose()
    if redis_client:
        await redis_client.aclose()

async def analyze_message_sliding_window(incoming_text: str, session_id: str, start_time: float, client: httpx.AsyncClient, service_source: str = "direct_text"):
    if not incoming_text or not incoming_text.strip():
        return {
            "status": "success",
            "processing_time_ms": 0,
            "sentence": "",
            "phrase": "N/A",
            "phrases": [],
            "keyword_sentiment": "neutral",
            "keyword_weight": 0.0,
            "emotion": "neutral",
            "sentiment_category": "neutral",
            "confidence": 0.0,
            "window_messages": [],
            "dropped_message": None,
            "combined_context": ""
        }

    raw_sentence = incoming_text.strip()
    print(f"\n[Gateway] === Processing New Message (Session: '{session_id}') ===")
    print(f"[Gateway] Incoming Message: '{raw_sentence}'")

    # 1. Keyword / Phrase extraction on the current incoming message
    detected_phrase = "N/A"
    phrases_list = []
    kw_sentiment = "neutral"
    kw_weight = 0.0
    try:
        phrase_res = await client.post(PHRASE_SERVICE_URL, json={"transcript": raw_sentence})
        phrase_res.raise_for_status()
        p_data = phrase_res.json()
        detected_phrase = p_data.get("phrase", "N/A")
        phrases_list = p_data.get("phrases", [])
        kw_sentiment = p_data.get("keyword_sentiment", "neutral")
        kw_weight = float(p_data.get("keyword_weight", 0.0))
        print(f"[Gateway] Keyword Detection -> Phrase: '{detected_phrase}' | Weight: {kw_weight} | Sentiment: '{kw_sentiment}'")
    except Exception as e:
        print(f"[Gateway Error] Phrase Service call failed: {e}")

    # 2. Redis Sliding Window Management (Max 4 items)
    redis_key = f"session_window:{session_id}"
    await redis_client.rpush(redis_key, raw_sentence)
    window_length = await redis_client.llen(redis_key)
    
    dropped_msg = None
    if window_length > 4:
        dropped_msg = await redis_client.lpop(redis_key)
        print(f"[Gateway] Sliding Window > 4! Dropped oldest message from Redis top: '{dropped_msg}'")

    current_window = await redis_client.lrange(redis_key, 0, -1)
    print(f"[Gateway] Updated Redis Sliding Window (size={len(current_window)}): {current_window}")

    # 3. Sentiment Analysis on Combined Window Input
    combined_context = " ".join(current_window)
    print(f"[Gateway] Combined Sliding Window Text for Sentiment: '{combined_context}'")

    emotion = "neutral"
    sentiment_category = "neutral"
    confidence = 0.0

    try:
        sentiment_res = await client.post(
            SENTIMENT_SERVICE_URL,
            json={
                "isolated_sentence": combined_context,
                "keyword_sentiment": kw_sentiment,
                "keyword_weight": kw_weight
            }
        )
        sentiment_res.raise_for_status()
        s_data = sentiment_res.json()
        emotion = s_data.get("emotion", "neutral")
        sentiment_category = s_data.get("sentiment_category", "neutral")
        confidence = float(s_data.get("confidence", 0.0))
        print(f"[Gateway] Sentiment Service Result -> Category: '{sentiment_category}' | Emotion: '{emotion}' | Conf: {confidence}")
    except Exception as e:
        print(f"[Gateway Error] Sentiment Service call failed: {e}")

    end_time = time.perf_counter()
    processing_time_ms = round((end_time - start_time) * 1000, 2)

    result_obj = {
        "status": "success",
        "processing_time_ms": processing_time_ms,
        "sentence": raw_sentence,
        "phrase": detected_phrase,
        "phrases": phrases_list,
        "keyword_sentiment": kw_sentiment,
        "keyword_weight": kw_weight,
        "emotion": emotion,
        "sentiment_category": sentiment_category,
        "confidence": confidence,
        "window_messages": current_window,
        "dropped_message": dropped_msg,
        "combined_context": combined_context,
        "source": service_source
    }
    
    print(f"[Gateway] Response Ready (Time: {processing_time_ms}ms)\n")
    return result_obj

@app.post("/api/v1/process-text")
async def process_text(payload: TextPayload):
    try:
        start_time = time.perf_counter()
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        return await analyze_message_sliding_window(payload.text, payload.session_id, start_time, client, service_source="text_direct")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Gateway Error: {str(e)}")

@app.post("/api/v1/reset-session")
async def reset_session(session_id: str = "default"):
    try:
        redis_key = f"session_window:{session_id}"
        await redis_client.delete(redis_key)
        print(f"[Gateway] Cleared Redis sliding window session: '{session_id}'")
        return {"status": "success", "message": f"Session '{session_id}' cleared."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset session: {str(e)}")

@app.post("/api/v1/process-audio")
async def process_audio(payload: AudioPayload):
    try:
        start_time = time.perf_counter()
        client = http_client if http_client is not None else httpx.AsyncClient(timeout=30.0)
        
        try:
            whisper_res = await client.post(WHISPER_SERVICE_URL, json={"audio_data": payload.audio_data})
            whisper_res.raise_for_status()
            transcript = whisper_res.json().get("transcript", "")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=503, detail=f"Whisper service error: {str(e)}")
            
        return await analyze_message_sliding_window(transcript, payload.session_id, start_time, client, service_source="whisper_audio")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Gateway Error: {str(e)}")