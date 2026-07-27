import spacy
import sys
import subprocess
from spacy.matcher import PhraseMatcher
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Phrase Extraction Service")

class TextPayload(BaseModel):
    transcript: str

nlp = None
matcher = None

@app.on_event("startup")
def load_spacy():
    global nlp, matcher
    try:
        print("[Phrase Service] Loading en_core_web_sm...")
        nlp = spacy.load("en_core_web_sm")
    except OSError:
        print("[Phrase Service] Model en_core_web_sm not found. Downloading...")
        subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
        nlp = spacy.load("en_core_web_sm")
    
    print("[Phrase Service] Configuring PhraseMatcher...")
    matcher = PhraseMatcher(nlp.vocab, attr="LOWER")
    

    target_phrases = [
        "wrong item", "overcharged on my monthly bill", "money back",
        "ruined my trip", "internet has been down", "completely unacceptable", "speak to a manager"
    ]
    patterns = [nlp.make_doc(text) for text in target_phrases]
    matcher.add("SUPPORT_ISSUES", patterns)
    print("[Phrase Service] Ready.")

@app.post("/extract-phrases")
async def extract_phrases(payload: TextPayload):
    if not payload.transcript:
        return {"matches": []}

    doc = nlp(payload.transcript)
    matches = matcher(doc)
    
    results = []
    analyzed_sentences = set()
    
    for match_id, start, end in matches:
        matched_span = doc[start:end]
        isolated_sentence = matched_span.sent.text.strip()
        
   
        if isolated_sentence not in analyzed_sentences:
            results.append({
                "phrase": matched_span.text,
                "isolated_sentence": isolated_sentence
            })
            analyzed_sentences.add(isolated_sentence)
            
    return {"matches": results}