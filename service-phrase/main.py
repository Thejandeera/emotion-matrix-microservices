import spacy
import sys
import subprocess
import requests
from spacy.matcher import PhraseMatcher
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Phrase Extraction Service")

# ⚠️ PASTE YOUR GOOGLE APPS SCRIPT URL HERE
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwudCW1hW9TbEV3btIXJl9rYi3GYU2E1jQ55mAXj9LAniuG8i0SLPMmrRrgWgsdHAQWA/exec"

class TextPayload(BaseModel):
    transcript: str

nlp = None

@app.on_event("startup")
def load_spacy():
    global nlp
    try:
        print("[Phrase Service] Loading en_core_web_sm...")
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        print("[Phrase Service] Model not found. Downloading...")
        subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
        nlp = spacy.load("en_core_web_sm")
    print("[Phrase Service] Ready.")

@app.post("/extract-phrases")
async def extract_phrases(payload: TextPayload):
    if not payload.transcript or not payload.transcript.strip():
        return {
            "matches": [],
            "phrase": "N/A",
            "phrases": [],
            "keyword_sentiment": "neutral",
            "keyword_weight": 0.0
        }

    raw_sentence = payload.transcript.strip()
    print(f"[Phrase Service] Received sentence: '{raw_sentence}'")

    # Fetch latest configuration from Google Sheets
    try:
        remote_data = requests.get(APPS_SCRIPT_URL, timeout=5.0).json()
    except Exception as e:
        print(f"[Phrase Service Warning] Failed to fetch keywords from Apps Script: {e}")
        remote_data = []

    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
    keyword_db = {}
    
    for item in remote_data:
        kw = item.get("keyword", "")
        if kw:
            kw_lower = kw.strip().lower()
            keyword_db[kw_lower] = {
                "sentiment": item.get("sentiment", "neutral"),
                "weight": float(item.get("weight", 0))
            }
            matcher.add(kw, [nlp.make_doc(kw)])

    doc = nlp(raw_sentence)
    matches = matcher(doc)
    
    results = []
    phrases_list = []
    max_weight = 0.0
    top_sentiment = "neutral"
    
    for match_id, start, end in matches:
        matched_span = doc[start:end]
        kw_text = matched_span.text.lower()
        
        kw_info = keyword_db.get(kw_text, {"sentiment": "neutral", "weight": 0.0})
        phrases_list.append(matched_span.text)
        results.append({
            "phrase": matched_span.text,
            "isolated_sentence": raw_sentence,
            "keyword_sentiment": kw_info["sentiment"],
            "keyword_weight": kw_info["weight"]
        })
        
        if kw_info["sentiment"] == "negative":
            top_sentiment = "negative"
        elif kw_info["sentiment"] == "positive" and top_sentiment != "negative":
            top_sentiment = "positive"

        if kw_info["weight"] > max_weight:
            max_weight = kw_info["weight"]
            
    detected_phrase_str = ", ".join(phrases_list) if phrases_list else "N/A"
    
    print(f"[Phrase Service] Output -> Phrase: '{detected_phrase_str}' | Weight: {max_weight} | Keyword Sentiment: {top_sentiment}")
    
    return {
        "matches": results,
        "phrase": detected_phrase_str,
        "phrases": phrases_list,
        "keyword_sentiment": top_sentiment,
        "keyword_weight": max_weight
    }