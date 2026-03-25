import pandas as pd
from typing import Dict, Any, List

def parse_questions_excel(path: str) -> Dict[str, Any]:
    df = pd.read_excel(path)

    required_cols = ["Section", "Question"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in Excel: {missing}")

    # ✅ FIX: Use .str.strip() instead of .strip()
    df["Section"] = df["Section"].astype(str).str.strip()
    df["Question"] = df["Question"].astype(str).str.strip()

    # Drop empty rows
    df = df.dropna(subset=["Section", "Question"])

    # ✅ Group into dict: {section_title: [questions...]}
    grouped = df.groupby("Section")["Question"].apply(list).to_dict()

    sections = []
    section_index = 1

    # ✅ Build correct extract structure
    for section_title, questions in grouped.items():

        section_block = {
            "section_index": section_index,
            "section_title": section_title,
            "questions": []
        }

        seq = 1
        for q in questions:
            section_block["questions"].append({
                "sequence_in_section": seq,
                "question_text": q,
                "kind": "question",
                "evidence": {"line_indices": [], "text_snippet": ""},
                "confidence": "high"
            })
            seq += 1

        sections.append(section_block)
        section_index += 1

    return {
        "engagement_id": None,
        "version": "excel-qcat-v1",
        "sections": sections,
        "unknowns": []
    }