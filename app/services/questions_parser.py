from docx import Document

def parse_questions_docx(path:str):
    """
    Returns: list of sections, each section = {
      "section_title": str,
      "questions": [ {"text": str, "sequence_in_section": int} ... ]
    }
    Maintains exact order; ignores any text not recognized as question lines.
    """
    doc = Document(path)
    sections = []
    current = None
    q_idx = 0

    def is_section_title(text):
        return text.strip() and text.strip()[0].isdigit() and "." in text[:4] 

    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if not t:
            continue
        if is_section_title(t):
            if current and current["questions"]:
                sections.append(current)
            current = {"section_title": t, "questions": []}
            q_idx = 0
        else:
            if current:
                q_idx += 1
                current["questions"].append({
                    "text": t,
                    "sequence_in_section": q_idx
                })
    if current and current["questions"]:
        sections.append(current)
    return sections