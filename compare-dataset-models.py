import sys
import subprocess

# Auto-install pandas and openpyxl if missing in virtual environment
try:
    import pandas as pd
    import openpyxl
except ModuleNotFoundError:
    print("[Setup] Missing 'pandas' or 'openpyxl'. Installing dependencies in virtual environment...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pandas", "openpyxl"])
    import pandas as pd
    import openpyxl

import os
import torch
from transformers import pipeline
from openpyxl.styles import PatternFill, Font

DATASET_PATH = "dataset.xlsx"

def main():
    print("=" * 75)
    print("     DATASET EMOTION COMPARISON: RoBERTa vs ModernBERT")
    print("=" * 75)

    if not os.path.exists(DATASET_PATH):
        print(f"❌ Error: Dataset file '{DATASET_PATH}' not found in workspace root.")
        return

    print(f"\n[1/4] Reading dataset from '{DATASET_PATH}'...")
    try:
        df = pd.read_excel(DATASET_PATH)
        print(f"      ✓ Successfully loaded {len(df)} rows. Columns: {list(df.columns)}")
    except Exception as e:
        print(f"❌ Error reading Excel file: {e}")
        return

    if "text" not in df.columns:
        print("❌ Error: Required column 'text' not found in dataset.xlsx!")
        return

    print("\n[2/4] Loading HuggingFace Pipelines...")
    print("      -> Loading RoBERTa ('SamLowe/roberta-base-go_emotions')...")
    try:
        roberta_pipe = pipeline("text-classification", model="SamLowe/roberta-base-go_emotions")
        print("      ✓ RoBERTa loaded.")
    except Exception as e:
        print(f"❌ Failed to load RoBERTa: {e}")
        return

    print("      -> Loading ModernBERT ('cirimus/modernbert-base-go-emotions')...")
    try:
        modernbert_pipe = pipeline("text-classification", model="cirimus/modernbert-base-go-emotions")
        print("      ✓ ModernBERT loaded.")
    except Exception as e:
        print(f"❌ Failed to load ModernBERT: {e}")
        return

    print(f"\n[3/4] Evaluating {len(df)} text samples across both models...")

    roberta_emotions = []
    roberta_confidences = []
    modernbert_emotions = []
    modernbert_confidences = []
    models_match = []

    mismatch_count = 0

    for idx, row in df.iterrows():
        text_val = str(row["text"]).strip() if pd.notna(row["text"]) else ""

        if not text_val:
            roberta_emotions.append("N/A")
            roberta_confidences.append(0.0)
            modernbert_emotions.append("N/A")
            modernbert_confidences.append(0.0)
            models_match.append("MATCH")
            continue

        # RoBERTa prediction
        with torch.inference_mode():
            r_res = roberta_pipe(text_val, truncation=True, max_length=256)[0]
        r_label = r_res["label"]
        r_score = round(float(r_res["score"]), 4)

        # ModernBERT prediction
        with torch.inference_mode():
            m_res = modernbert_pipe(text_val, truncation=True, max_length=256)[0]
        m_label = m_res["label"]
        m_score = round(float(m_res["score"]), 4)

        is_match = (r_label.lower() == m_label.lower())
        if not is_match:
            mismatch_count += 1

        roberta_emotions.append(r_label)
        roberta_confidences.append(r_score)
        modernbert_emotions.append(m_label)
        modernbert_confidences.append(m_score)
        models_match.append("MATCH" if is_match else "MISMATCH")

        status_symbol = "✓" if is_match else "❌ MISMATCH"
        print(f"Row {idx+1:02d}/{len(df)}: '{text_val[:35]}...' | RoBERTa: {r_label} ({r_score * 100:.1f}%) | ModernBERT: {m_label} ({m_score * 100:.1f}%) | {status_symbol}")

    # Add new evaluation columns to DataFrame
    df["roberta_emotion"] = roberta_emotions
    df["roberta_confidence"] = roberta_confidences
    df["modernbert_emotion"] = modernbert_emotions
    df["modernbert_confidence"] = modernbert_confidences
    df["models_match"] = models_match

    # Save DataFrame to dataset.xlsx
    df.to_excel(DATASET_PATH, index=False)
    print(f"\n[4/4] Applying Excel cell highlighting for mismatched predictions in '{DATASET_PATH}'...")

    # Highlight mismatched rows using openpyxl
    wb = openpyxl.load_workbook(DATASET_PATH)
    ws = wb.active

    # Soft red fill for mismatched emotion cells
    mismatch_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
    mismatch_font = Font(color="9C0006", bold=True)

    header_map = {cell.value: idx + 1 for idx, cell in enumerate(ws[1])}
    
    rob_col = header_map.get("roberta_emotion")
    mod_col = header_map.get("modernbert_emotion")
    match_col = header_map.get("models_match")

    for row_idx in range(2, ws.max_row + 1):
        rob_val = ws.cell(row=row_idx, column=rob_col).value
        mod_val = ws.cell(row=row_idx, column=mod_col).value
        
        if rob_val and mod_val and str(rob_val).lower() != str(mod_val).lower():
            if rob_col:
                ws.cell(row=row_idx, column=rob_col).fill = mismatch_fill
                ws.cell(row=row_idx, column=rob_col).font = mismatch_font
            if mod_col:
                ws.cell(row=row_idx, column=mod_col).fill = mismatch_fill
                ws.cell(row=row_idx, column=mod_col).font = mismatch_font
            if match_col:
                ws.cell(row=row_idx, column=match_col).fill = mismatch_fill
                ws.cell(row=row_idx, column=match_col).font = mismatch_font

    wb.save(DATASET_PATH)
    
    print("\n" + "=" * 75)
    print("                     EVALUATION COMPLETED SUCCESSFULLY!")
    print("=" * 75)
    print(f"📊 Total Rows Analyzed : {len(df)}")
    print(f"🎯 Matching Emotions   : {len(df) - mismatch_count}")
    print(f"⚠️ Mismatched Emotions  : {mismatch_count} (highlighted in soft red in Excel)")
    print(f"💾 Updated Dataset File : {os.path.abspath(DATASET_PATH)}")
    print("=" * 75)

if __name__ == "__main__":
    main()
