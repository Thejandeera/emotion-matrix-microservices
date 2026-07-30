import torch
from typing import List, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI(title="Sentiment & Emotion Service")

class HistoryItem(BaseModel):
    sentiment_category: str = "neutral"
    keyword_sentiment: str = "neutral"

class TextPayload(BaseModel):
    isolated_sentence: str
    keyword_sentiment: str = "neutral"
    keyword_weight: float = 0.0
    history: List[HistoryItem] = []

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

def calculate_overall_score(history: List[HistoryItem], current_category: str, current_kw_sentiment: str) -> int:
    all_items = [
        {"sentiment_category": item.sentiment_category, "keyword_sentiment": item.keyword_sentiment}
        for item in history
    ]
    all_items.append({"sentiment_category": current_category, "keyword_sentiment": current_kw_sentiment})

    negative_count = sum(1 for i in all_items if i.get("keyword_sentiment") == "negative" or i.get("sentiment_category") == "negative")
    positive_count = sum(1 for i in all_items if i.get("keyword_sentiment") == "positive" or i.get("sentiment_category") == "positive")
    total_count = len(all_items)

    if total_count == 0:
        return 0

    if negative_count > 0:
        neg_ratio = negative_count / total_count
        score = round(-30 - neg_ratio * 60)
    elif positive_count > 0:
        pos_ratio = positive_count / total_count
        score = round(30 + pos_ratio * 60)
    else:
        score = 0
    return max(-100, min(100, score))

@app.on_event("startup")
def load_model():
    global roberta_model
    print("[Sentiment Service] Loading RoBERTa emotion classification model...")
    roberta_model = pipeline("text-classification", model="SamLowe/roberta-base-go_emotions")
    print("[Sentiment Service] RoBERTa model ready.")

@app.post("/analyze-sentiment")
async def analyze_sentiment(payload: TextPayload):
    if not payload.isolated_sentence or not payload.isolated_sentence.strip():
        return {
            "emotion": "neutral",
            "sentiment_category": "neutral",
            "confidence": 0.0,
            "overall_score": 0
        }
        
    print(f"[Sentiment Service] Input context: '{payload.isolated_sentence}' | KW Sent: '{payload.keyword_sentiment}' | KW Weight: {payload.keyword_weight}")

    with torch.inference_mode():
        result = roberta_model(payload.isolated_sentence, truncation=True, max_length=256)[0]
    
    emotion = result["label"]
    base_confidence = result["score"]
    
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

    # Compute overall score in backend
    overall_score = calculate_overall_score(payload.history, final_category, payload.keyword_sentiment)
    
    print(f"[Sentiment Service] Model raw: label='{result['label']}' score={result['score']:.4f} -> Category='{final_category}' conf={final_confidence} | Overall Score={overall_score}%")

    return {
        "emotion": emotion,
        "sentiment_category": final_category,
        "confidence": final_confidence,
        "overall_score": overall_score
    }

@app.post("/analyze-sentiment-batch")
async def analyze_sentiment_batch(payload: BatchPayload):
    if not payload.items:
        return {"results": []}

    sentences = [item.isolated_sentence for item in payload.items]
    
    with torch.inference_mode():
        batch_results = roberta_model(sentences, truncation=True, max_length=128, batch_size=32)

    output = []
    for item, result in zip(payload.items, batch_results):
        emotion = result["label"]
        base_confidence = result["score"]

        modifier = (item.keyword_weight / 100.0) * 0.40
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