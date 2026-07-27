import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI(title="Sentiment & Emotion Service")

class TextPayload(BaseModel):
    isolated_sentence: str
    keyword_sentiment: str = "neutral"
    keyword_weight: float = 0.0

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
    roberta_model = pipeline("text-classification", model="SamLowe/roberta-base-go_emotions")

@app.post("/analyze-sentiment")
async def analyze_sentiment(payload: TextPayload):
    if not payload.isolated_sentence:
        return {"emotion": "neutral", "sentiment_category": "neutral", "confidence": 0.0}
        
    with torch.inference_mode():
        result = roberta_model(payload.isolated_sentence, truncation=True, max_length=512)[0]
    
    emotion = result["label"]
    base_confidence = result["score"]
    
    # -----------------------------------------------------
    # IMPACT WEIGHT ALGORITHM
    # Converts 0-100 weight into a max 0.40 confidence modifier
    # -----------------------------------------------------
    modifier = (payload.keyword_weight / 100.0) * 0.40
    adjusted_confidence = base_confidence
    
    current_category = categorize_emotion(emotion, base_confidence)
    
    if payload.keyword_sentiment == "negative":
        if current_category == "negative":
            adjusted_confidence = min(1.0, base_confidence + modifier)
        else:
            adjusted_confidence = max(0.1, base_confidence - modifier)
            if adjusted_confidence < 0.4:
                emotion = "annoyance" 
                adjusted_confidence = 0.5 + modifier
                
    elif payload.keyword_sentiment == "positive":
        if current_category == "positive":
            adjusted_confidence = min(1.0, base_confidence + modifier)
        else:
            adjusted_confidence = max(0.1, base_confidence - modifier)

    final_confidence = round(adjusted_confidence, 4)
    final_category = categorize_emotion(emotion, final_confidence)
    
    return {
        "emotion": emotion,
        "sentiment_category": final_category,
        "confidence": final_confidence
    }