import pandas as pd
from typing import Dict, Any

def parse_questions_excel(path: str) -> Dict[str, Any]:
    df = pd.read_excel(path)

    # Clean columns
    df["Section"] = df["Section"].astype(str).str.strip()
    df["Question"] = df["Question"].astype(str).str.strip()

    df = df.dropna(subset=["Section", "Question"])

    sections = []
    section_map = {}  # section_title -> index in 'sections'
    section_index = 1

    for _, row in df.iterrows():
        section_title = row["Section"]
        question_text = row["Question"]

        # Create section if first time seeing it
        if section_title not in section_map:
            section_map[section_title] = len(sections)

            sections.append({
                "section_index": section_index,
                "section_title": section_title,
                "questions": []
            })
            section_index += 1

        # Append question to correct section
        section_block = sections[section_map[section_title]]
        seq_num = len(section_block["questions"]) + 1

        section_block["questions"].append({
            "sequence_in_section": seq_num,
            "question_text": question_text,
            "kind": "question",
            "evidence": {"line_indices": [], "text_snippet": ""},
            "confidence": "high"
        })

    return {
        "engagement_id": None,
        "version": "excel-qcat-v1",
        "sections": sections,
        "unknowns": []
    }