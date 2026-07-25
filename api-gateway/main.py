import time
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

@app.post("/api/v1/process-audio")
async def process_audio(payload: AudioPayload):
    try:
        start_time = time.perf_counter()
        
        # We use an async httpx client so the gateway doesn't block while waiting for ML inference
        async with httpx.AsyncClient(timeout=45.0) as client:
            
            # ==========================================
            # 1. Get Transcript from Whisper Service
            # ==========================================
            try:
                whisper_res = await client.post(WHISPER_SERVICE_URL, json={"audio_data": payload.audio_data})
                whisper_res.raise_for_status()
                transcript = whisper_res.json().get("transcript", "")
            except httpx.HTTPError as e:
                raise HTTPException(status_code=503, detail=f"Whisper service error: {str(e)}")
                
            if not transcript:
                return {"status": "success", "transcript": "", "detected_issues": [], "processing_time_ms": 0}

            # ==========================================
            # 2. Extract Phrases & Context
            # ==========================================
            try:
                phrase_res = await client.post(PHRASE_SERVICE_URL, json={"transcript": transcript})
                phrase_res.raise_for_status()
                matches = phrase_res.json().get("matches", [])
            except httpx.HTTPError as e:
                raise HTTPException(status_code=503, detail=f"Phrase extraction service error: {str(e)}")

            # ==========================================
            # 3. Analyze Emotion for Each Target Context
            # ==========================================
            final_results = []
            for match in matches:
                isolated_sentence = match["isolated_sentence"]
                try:
                    sentiment_res = await client.post(SENTIMENT_SERVICE_URL, json={"isolated_sentence": isolated_sentence})
                    sentiment_res.raise_for_status()
                    sentiment_data = sentiment_res.json()
                    
                    final_results.append({
                        "phrase": match["phrase"],
                        "isolated_sentence": isolated_sentence,
                        "emotion": sentiment_data["emotion"],
                        "sentiment_category": sentiment_data["sentiment_category"],
                        "confidence": sentiment_data["confidence"]
                    })
                except httpx.HTTPError as e:
                    # If sentiment fails for one sentence, log it but continue processing others
                    print(f"Warning: Sentiment analysis failed for sentence '{isolated_sentence}': {e}")
                    continue

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