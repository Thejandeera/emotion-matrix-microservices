import os
import sys
import warnings
import base64
import tempfile
import json
import asyncio
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
warnings.filterwarnings("ignore")

# Setup Windows CUDA / cuBLAS / cuDNN DLL directories so GPU acceleration loads cleanly
venv_base = sys.prefix
site_packages_path = os.path.join(venv_base, "Lib", "site-packages")

possible_dll_dirs = [
    os.path.join(site_packages_path, "nvidia", "cublas", "bin"),
    os.path.join(site_packages_path, "nvidia", "cudnn", "bin"),
    os.path.join(site_packages_path, "nvidia", "cuda_runtime", "bin"),
    os.path.join(site_packages_path, "nvidia", "cuda_nvrtc", "bin"),
    os.path.join(site_packages_path, "torch", "lib"),
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.0\bin",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.2\bin",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.3\bin",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.4\bin",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.5\bin",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.6\bin",
]

for d in possible_dll_dirs:
    if os.path.exists(d):
        os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]
        try:
            os.add_dll_directory(d)
        except Exception:
            pass

app = FastAPI(title="Whisper Transcription Service")

class AudioPayload(BaseModel):
    audio_data: str

model = None

@app.on_event("startup")
def load_model():
    global model
    model_name_or_path = os.getenv("WHISPER_MODEL", "base")
    
    if model_name_or_path == "large-v3-turbo":
        print("[Whisper Service] Downloading/Loading 'large-v3-turbo' model...")
        model_name_or_path = snapshot_download(repo_id="deepdml/faster-whisper-large-v3-turbo-ct2")
    else:
        print(f"[Whisper Service] Loading '{model_name_or_path}' model...")

    cpu_threads = int(os.getenv("WHISPER_CPU_THREADS", os.cpu_count() or 4))

    try:
        # Try GPU execution using int8_float16 quantization for memory efficiency
        m = WhisperModel(model_name_or_path, device="cuda", compute_type="int8_float16") 
        # Validate that CUDA libraries actually load during inference
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
            f.write(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\x3e\x00\x00\x00\x7d\x00\x00\x02\x00\x10\x00data\x00\x00\x00\x00")
            tmp_path = f.name
        try:
            list(m.transcribe(tmp_path)[0])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        model = m
        print(f"[Whisper Service] GPU Model '{model_name_or_path}' loaded successfully.")
    except Exception as e:
        print(f"[Whisper Service] CUDA load/execution failed ({e}), falling back to CPU...")
        model = WhisperModel(model_name_or_path, device="cpu", compute_type="int8", cpu_threads=cpu_threads)
        print(f"[Whisper Service] CPU Model loaded successfully with {cpu_threads} CPU threads.")

def _sync_transcribe(audio_file_path: str) -> str:
    if model is None:
        return ""
    segments, _ = model.transcribe(
        audio_file_path,
        beam_size=1,
        best_of=1,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300)
    )
    return " ".join([segment.text for segment in segments]).strip()

@app.post("/transcribe/base64")
async def transcribe(payload: AudioPayload):
    if model is None:
        raise HTTPException(status_code=500, detail="Whisper model is not initialized")

    try:
        audio_bytes = base64.b64decode(payload.audio_data)
        if not audio_bytes:
            return {"transcript": ""}
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
            tmp_file.write(audio_bytes)
            temp_file_path = tmp_file.name
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode base64: {str(e)}")

    try:
        transcript = await asyncio.to_thread(_sync_transcribe, temp_file_path)
    except Exception as e:
        print(f"[Whisper Service Error] Transcription failed: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid audio format or audio decoding error: {str(e)}")
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    return {"transcript": transcript}

@app.websocket("/live-stream")
async def live_stream(websocket: WebSocket):
    await websocket.accept()
    raw_audio_buffer = bytearray()
    temp_file = f"temp_{id(websocket)}.webm"
    last_text = ""
    is_transcribing = False

    try:
        while True:
            chunk = await websocket.receive_bytes()
            if not chunk:
                continue
            raw_audio_buffer.extend(chunk)

            # Skip if a transcription task is already running in background thread or buffer is too small
            if is_transcribing or len(raw_audio_buffer) < 4000:
                continue

            is_transcribing = True
            try:
                with open(temp_file, "wb") as f:
                    f.write(raw_audio_buffer)

                full_transcript = await asyncio.to_thread(_sync_transcribe, temp_file)
                if full_transcript and full_transcript != last_text:
                    last_text = full_transcript
                    await websocket.send_json({
                        "type": "partial",
                        "transcript": full_transcript
                    })
            except Exception:
                pass
            finally:
                is_transcribing = False

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"[Whisper WebSocket Error] {e}")
    finally:
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass