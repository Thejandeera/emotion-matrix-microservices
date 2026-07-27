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
    if not payload.transcript:
        return {"matches": []}

    # Fetch latest configuration from Google Sheets
    try:
        remote_data = requests.get(APPS_SCRIPT_URL).json()
    except Exception:
        remote_data = []

    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
    keyword_db = {}
    
    for item in remote_data:
        kw = item["keyword"]
        keyword_db[kw] = {"sentiment": item["sentiment"], "weight": item["weight"]}
        matcher.add(kw, [nlp.make_doc(kw)])

    doc = nlp(payload.transcript)
    matches = matcher(doc)
    
    results = []
    analyzed_sentences = set()
    
    for match_id, start, end in matches:
        matched_span = doc[start:end]
        isolated_sentence = matched_span.sent.text.strip()
        kw_text = matched_span.text.lower()
        
        if isolated_sentence not in analyzed_sentences:
            kw_info = keyword_db.get(kw_text, {"sentiment": "neutral", "weight": 0})
            results.append({
                "phrase": matched_span.text,
                "isolated_sentence": isolated_sentence,
                "keyword_sentiment": kw_info["sentiment"],
                "keyword_weight": kw_info["weight"]
            })
            analyzed_sentences.add(isolated_sentence)
            
    return {"matches": results}