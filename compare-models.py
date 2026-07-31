import time
import torch
from transformers import pipeline

# Positive and negative emotion mappings for categorization
POSITIVE_EMOTIONS = {
    "admiration", "amusement", "approval", "caring", "desire", 
    "excitement", "gratitude", "joy", "love", "optimism", "pride", "relief"
}

NEGATIVE_EMOTIONS = {
    "anger", "annoyance", "disappointment", "disapproval", "disgust", 
    "embarrassment", "fear", "grief", "nervousness", "remorse", "sadness"
}

def categorize_emotion(emotion: str, score: float) -> str:
    """Categorize an emotion label into positive, negative, or neutral based on confidence thresholds."""
    if emotion in POSITIVE_EMOTIONS:
        return "positive" if score >= 0.50 else "neutral"
    elif emotion in NEGATIVE_EMOTIONS:
        return "negative" if score >= 0.40 else "neutral"
    else:
        return "positive" if emotion == "surprise" and score >= 0.80 else "neutral"

def main():
    print("=" * 75)
    print("          EMOTION MODEL COMPARISON: RoBERTa vs ModernBERT")
    print("=" * 75)

    # 1. Load RoBERTa Model
    print("\n[1/2] Loading RoBERTa ('SamLowe/roberta-base-go_emotions')...")
    try:
        roberta_pipe = pipeline("text-classification", model="SamLowe/roberta-base-go_emotions")
        print("      ✓ RoBERTa loaded successfully.")
    except Exception as e:
        print(f"      ❌ Failed to load RoBERTa model: {e}")
        return

    # 2. Load ModernBERT Model
    print("\n[2/2] Loading ModernBERT ('cirimus/modernbert-base-go-emotions')...")
    try:
        modernbert_pipe = pipeline("text-classification", model="cirimus/modernbert-base-go-emotions")
        print("      ✓ ModernBERT loaded successfully.")
    except Exception as e:
        print(f"      ❌ Failed to load ModernBERT model: {e}")
        return

    print("\n" + "=" * 75)
    print("Type any text input to compare models side-by-side (type 'exit' to quit).")
    print("=" * 75)

    while True:
        try:
            text_input = input("\nEnter Text Input > ").strip()
            if not text_input:
                continue
            if text_input.lower() in ("exit", "quit", "q"):
                print("Exiting model comparison tool. Goodbye!")
                break

            # --- RoBERTa Evaluation ---
            roberta_start = time.perf_counter()
            with torch.inference_mode():
                roberta_res = roberta_pipe(text_input, truncation=True, max_length=256)[0]
            roberta_time_ms = round((time.perf_counter() - roberta_start) * 1000, 2)
            
            roberta_label = roberta_res["label"]
            roberta_score = float(roberta_res["score"])
            roberta_category = categorize_emotion(roberta_label, roberta_score)

            # --- ModernBERT Evaluation ---
            modernbert_start = time.perf_counter()
            with torch.inference_mode():
                modernbert_res = modernbert_pipe(text_input, truncation=True, max_length=256)[0]
            modernbert_time_ms = round((time.perf_counter() - modernbert_start) * 1000, 2)
            
            modernbert_label = modernbert_res["label"]
            modernbert_score = float(modernbert_res["score"])
            modernbert_category = categorize_emotion(modernbert_label, modernbert_score)

            # --- Formatted Table Display ---
            print("\n" + "-" * 75)
            print(f"INPUT TEXT: \"{text_input}\"")
            print("-" * 75)
            
            col_width_param = 24
            col_width_val = 22
            
            header = f"{'Evaluation Parameter':<{col_width_param}} | {'RoBERTa (base)':<{col_width_val}} | {'ModernBERT (base)':<{col_width_val}}"
            separator = "-" * len(header)
            
            print(header)
            print(separator)
            print(f"{'Execution Time (ms)':<{col_width_param}} | {f'{roberta_time_ms} ms':<{col_width_val}} | {f'{modernbert_time_ms} ms':<{col_width_val}}")
            print(f"{'Predicted Emotion':<{col_width_param}} | {roberta_label:<{col_width_val}} | {modernbert_label:<{col_width_val}}")
            print(f"{'Confidence Score':<{col_width_param}} | {f'{roberta_score * 100:.2f}%':<{col_width_val}} | {f'{modernbert_score * 100:.2f}%':<{col_width_val}}")
            print(f"{'Categorized Sentiment':<{col_width_param}} | {roberta_category.upper():<{col_width_val}} | {modernbert_category.upper():<{col_width_val}}")
            print(separator)

            # --- Evaluation & Speed Delta ---
            if roberta_time_ms > 0 and modernbert_time_ms > 0:
                diff_ms = abs(roberta_time_ms - modernbert_time_ms)
                faster_model = "ModernBERT" if modernbert_time_ms < roberta_time_ms else "RoBERTa"
                print(f"⚡ Speed Comparison: {faster_model} was {diff_ms:.2f} ms faster.")
            
            same_emotion = "YES (Identical)" if roberta_label == modernbert_label else "NO (Different)"
            print(f"🎯 Emotion Match    : {same_emotion}")
            print("-" * 75)

        except KeyboardInterrupt:
            print("\nExiting comparison tool. Goodbye!")
            break
        except Exception as e:
            print(f"[Error evaluating input]: {e}")

if __name__ == "__main__":
    main()
