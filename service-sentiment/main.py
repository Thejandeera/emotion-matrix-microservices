import torch
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI(title="Sentiment & Emotion Service")

class TextPayload(BaseModel):
    isolated_sentence: str
    keyword_sentiment: str = "neutral"
    keyword_weight: float = 0.0

class BatchItem(BaseModel):
    isolated_sentence: str
    keyword_sentiment: str = "neutral"
    keyword_weight: float = 0.0

class BatchPayload(BaseModel):
    items: List[BatchItem]

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
    print("[Sentiment Service] Loading RoBERTa emotion classification model...")
    roberta_model = pipeline("text-classification", model="SamLowe/roberta-base-go_emotions")
    print("[Sentiment Service] RoBERTa model ready.")

@app.post("/analyze-sentiment")
async def analyze_sentiment(payload: TextPayload):
    if not payload.isolated_sentence:
        return {"emotion": "neutral", "sentiment_category": "neutral", "confidence": 0.0}
        
    with torch.inference_mode():
        result = roberta_model(payload.isolated_sentence, truncation=True, max_length=128)[0]
    
    emotion = result["label"]
    base_confidence = result["score"]
    
    modifier = (float(payload.keyword_weight) / 100.0) * 0.40
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

@app.post("/analyze-sentiment-batch")
async def analyze_sentiment_batch(payload: BatchPayload):
    if not payload.items:
        return {"results": []}

    sentences = [item.isolated_sentence for item in payload.items]
    
    with torch.inference_mode():
        # High-performance PyTorch vectorized batching
        batch_results = roberta_model(sentences, truncation=True, max_length=128, batch_size=32)

    output = []
    for item, result in zip(payload.items, batch_results):
        emotion = result["label"]
        base_confidence = result["score"]

        modifier = (float(item.keyword_weight) / 100.0) * 0.40
        adjusted_confidence = base_confidence
        current_category = categorize_emotion(emotion, base_confidence)

        if item.keyword_sentiment == "negative":
            if current_category == "negative":
                adjusted_confidence = min(1.0, base_confidence + modifier)
            else:
                adjusted_confidence = max(0.1, base_confidence - modifier)
                if adjusted_confidence < 0.4:
                    emotion = "annoyance"
                    adjusted_confidence = 0.5 + modifier
        elif item.keyword_sentiment == "positive":
            if current_category == "positive":
                adjusted_confidence = min(1.0, base_confidence + modifier)
            else:
                adjusted_confidence = max(0.1, base_confidence - modifier)

        final_confidence = round(adjusted_confidence, 4)
        final_category = categorize_emotion(emotion, final_confidence)

        output.append({
            "emotion": emotion,
            "sentiment_category": final_category,
            "confidence": final_confidence
        })

    return {"results": output}