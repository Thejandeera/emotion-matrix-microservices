import os
import base64
import tempfile
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel
from huggingface_hub import snapshot_download

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
        m = WhisperModel(model_name_or_path, device="cuda", compute_type="int8_float16") 
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
       
        segments, _ = model.transcribe(
            temp_file_path,
            beam_size=1,
            best_of=1,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        transcript = " ".join([segment.text for segment in segments]).strip()
    except Exception as e:
        print(f"[Whisper Service Error] Transcription failed: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid audio format or audio decoding error: {str(e)}")
    finally:
       
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    return {"transcript": transcript}