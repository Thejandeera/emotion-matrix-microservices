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
    print("[Whisper Service] Downloading/Loading 'large-v3-turbo' model...")
    model_path = snapshot_download(repo_id="deepdml/faster-whisper-large-v3-turbo-ct2")
    # Forces GPU execution using int8_float16 quantization for memory efficiency
    model = WhisperModel(model_path, device="cuda", compute_type="int8_float16") 
    print("[Whisper Service] Model loaded successfully.")

@app.post("/transcribe/base64")
async def transcribe(payload: AudioPayload):
    try:
        # Decode the Base64 payload into bytes
        audio_bytes = base64.b64decode(payload.audio_data)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
            tmp_file.write(audio_bytes)
            temp_file_path = tmp_file.name
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to decode base64: {str(e)}")

    try:
        # Execute VAD-filtered inference 
        segments, _ = model.transcribe(temp_file_path, beam_size=5, vad_filter=True)
        transcript = " ".join([segment.text for segment in segments]).strip()
    finally:
        # Always clean up the temporary disk file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    return {"transcript": transcript}