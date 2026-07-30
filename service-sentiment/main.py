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

def process_sentiment_calculation(emotion: str, base_confidence: float, kw_sentiment: str, kw_weight: float) -> dict:
    modifier = (float(kw_weight) / 100.0) * 0.40
    adjusted_confidence = base_confidence
    current_category = categorize_emotion(emotion, base_confidence)

    if kw_sentiment == "negative":
        if current_category == "negative":
            adjusted_confidence = min(1.0, base_confidence + modifier)
        else:
            adjusted_confidence = max(0.1, base_confidence - modifier)
            if adjusted_confidence < 0.4:
                emotion = "annoyance"
                adjusted_confidence = 0.5 + modifier
    elif kw_sentiment == "positive":
        if current_category == "positive":
            adjusted_confidence = min(1.0, base_confidence + modifier)
        else:
            adjusted_confidence = max(0.1, base_confidence - modifier)

    final_confidence = round(adjusted_confidence, 4)
    final_category = categorize_emotion(emotion, final_confidence)

    if final_category == "neutral":
        if final_confidence > 0.50:
            final_category = "positive"
            final_confidence = round(final_confidence - 0.50, 4)
            return {
                "emotion": emotion,
                "sentiment_category": final_category,
                "confidence": final_confidence,
                "ignore": False
            }
        else:
            return {
                "emotion": emotion,
                "sentiment_category": "ignore",
                "confidence": final_confidence,
                "ignore": True
            }

    return {
        "emotion": emotion,
        "sentiment_category": final_category,
        "confidence": final_confidence,
        "ignore": False
    }

@app.post("/analyze-sentiment")
async def analyze_sentiment(payload: TextPayload):
    if not payload.isolated_sentence or not payload.isolated_sentence.strip():
        return {"emotion": "neutral", "sentiment_category": "ignore", "confidence": 0.0, "ignore": True}
        
    print(f"[Sentiment Service] Input context: '{payload.isolated_sentence}' | KW Sent: '{payload.keyword_sentiment}' | KW Weight: {payload.keyword_weight}")

    with torch.inference_mode():
        result = roberta_model(payload.isolated_sentence, truncation=True, max_length=256)[0]
    
    res = process_sentiment_calculation(
        emotion=result["label"],
        base_confidence=result["score"],
        kw_sentiment=payload.keyword_sentiment,
        kw_weight=payload.keyword_weight
    )
    
    print(f"[Sentiment Service] Model raw: label='{result['label']}' score={result['score']:.4f} -> Final category='{res['sentiment_category']}' confidence={res['confidence']}")
    return res

@app.post("/analyze-sentiment-batch")
async def analyze_sentiment_batch(payload: BatchPayload):
    if not payload.items:
        return {"results": []}

    sentences = [item.isolated_sentence for item in payload.items]
    
    with torch.inference_mode():
        batch_results = roberta_model(sentences, truncation=True, max_length=128, batch_size=32)

    output = []
    for item, result in zip(payload.items, batch_results):
        res = process_sentiment_calculation(
            emotion=result["label"],
            base_confidence=result["score"],
            kw_sentiment=item.keyword_sentiment,
            kw_weight=item.keyword_weight
        )
        output.append(res)

    return {"results": output}