import time
import asyncio
import json
import os
import sys
import warnings
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import websockets

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
warnings.filterwarnings("ignore")

# Setup Windows CUDA / cuBLAS / cuDNN DLL directories
venv_base = sys.prefix
site_packages_path = os.path.join(venv_base, "Lib", "site-packages")
cublas_bin = os.path.join(site_packages_path, "nvidia", "cublas", "bin")
cudnn_bin = os.path.join(site_packages_path, "nvidia", "cudnn", "bin")

if os.path.exists(cublas_bin):
    os.environ["PATH"] = cublas_bin + os.pathsep + os.environ["PATH"]
    try:
        os.add_dll_directory(cublas_bin)
    except Exception:
        pass

if os.path.exists(cudnn_bin):
    os.environ["PATH"] = cudnn_bin + os.pathsep + os.environ["PATH"]
    try:
        os.add_dll_directory(cudnn_bin)
    except Exception:
        pass

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

WHISPER_SERVICE_URL = "http://localhost:8001/transcribe/base64"
PHRASE_SERVICE_URL = "http://localhost:8002/extract-phrases"
SENTIMENT_SERVICE_URL = "http://localhost:8003/analyze-sentiment"
WHISPER_WS_URL = "ws://localhost:8001/live-stream"

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

@app.websocket("/api/v1/live-stream")
async def gateway_live_stream(websocket: WebSocket):
    await websocket.accept()
    analyzed_sentences = set()

    try:
        async with websockets.connect(
            WHISPER_WS_URL,
            open_timeout=30.0,
            ping_interval=20.0,
            ping_timeout=20.0
        ) as whisper_ws:

            async def forward_audio_chunks():
                try:
                    while True:
                        chunk = await websocket.receive_bytes()
                        await whisper_ws.send(chunk)
                except WebSocketDisconnect:
                    pass
                except Exception:
                    pass

            async def receive_transcripts():
                try:
                    while True:
                        msg_str = await whisper_ws.recv()
                        msg = json.loads(msg_str)
                        transcript = msg.get("transcript", "")

                        if transcript:
                            # 1. Send live partial transcript to frontend UI immediately
                            await websocket.send_json({
                                "type": "partial",
                                "transcript": transcript
                            })

                            # 2. Real-time NLP & emotion evaluation
                            try:
                                client = http_client if http_client is not None else httpx.AsyncClient(timeout=10.0)
                                phrase_res = await client.post(PHRASE_SERVICE_URL, json={"transcript": transcript})
                                if phrase_res.status_code == 200:
                                    matches = phrase_res.json().get("matches", [])

                                    async def analyze_match(match):
                                        isolated_sentence = match["isolated_sentence"]
                                        if isolated_sentence in analyzed_sentences:
                                            return None

                                        sentiment_res = await client.post(SENTIMENT_SERVICE_URL, json={"isolated_sentence": isolated_sentence})
                                        if sentiment_res.status_code == 200:
                                            sentiment_data = sentiment_res.json()
                                            analyzed_sentences.add(isolated_sentence)
                                            return {
                                                "phrase": match["phrase"],
                                                "isolated_sentence": isolated_sentence,
                                                "emotion": sentiment_data["emotion"],
                                                "sentiment_category": sentiment_data["sentiment_category"],
                                                "confidence": sentiment_data["confidence"]
                                            }
                                        return None

                                    results = await asyncio.gather(*(analyze_match(m) for m in matches))
                                    new_issues = [r for r in results if r is not None]

                                    if new_issues:
                                        await websocket.send_json({
                                            "type": "analyzed",
                                            "transcript": transcript,
                                            "detected_issues": new_issues
                                        })
                            except Exception as nlp_err:
                                print(f"[Gateway Live Stream NLP Error] {nlp_err}")
                except Exception:
                    pass

            await asyncio.gather(forward_audio_chunks(), receive_transcripts())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[Gateway Live Stream Error] {e}")