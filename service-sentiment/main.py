import os
import sys
import warnings
import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TOKENIZERS_PARALLELISM"] = "false"
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

app = FastAPI(title="Sentiment & Emotion Service")

class TextPayload(BaseModel):
    isolated_sentence: str

roberta_model = None


def categorize_emotion(emotion: str, score: float) -> str:
    positive_emotions = {"admiration", "amusement", "approval", "caring", "desire", "excitement", "gratitude", "joy", "love", "optimism", "pride", "relief"}
    negative_emotions = {"anger", "annoyance", "disappointment", "disapproval", "disgust", "embarrassment", "fear", "grief", "nervousness", "remorse", "sadness"}

    if emotion in positive_emotions:
        return "positive" if score >= 0.60 else "neutral"
    elif emotion in negative_emotions:
        return "negative" if score >= 0.70 else "neutral"
    else:
        return "positive" if emotion == "surprise" and score >= 0.80 else "neutral"

@app.on_event("startup")
def load_model():
    global roberta_model
    print("[Sentiment Service] Loading RoBERTa emotion classifier...")
    device = 0 if torch.cuda.is_available() else -1
    roberta_model = pipeline("text-classification", model="SamLowe/roberta-base-go_emotions", device=device)
    print(f"[Sentiment Service] Model loaded successfully on device: {device}.")

@app.post("/analyze-sentiment")
async def analyze_sentiment(payload: TextPayload):
    if not payload.isolated_sentence:
        return {"emotion": "neutral", "sentiment_category": "neutral", "confidence": 0.0}
        
    with torch.inference_mode():
        result = roberta_model(payload.isolated_sentence, truncation=True, max_length=512)[0]
    
    emotion = result["label"]
    confidence = round(result["score"], 4)
    sentiment_category = categorize_emotion(emotion, confidence)
    
    return {
        "emotion": emotion,
        "sentiment_category": sentiment_category,
        "confidence": confidence
    }