# app/services/doc_readers.py
import os
from typing import List, Dict, Tuple
from docx import Document as DocxDocument
from PyPDF2 import PdfReader

TEXT_EXTS = {".txt", ".md"}
DOCX_EXTS = {".docx"}
PDF_EXTS = {".pdf"}

def read_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def read_docx(path: str) -> str:
    doc = DocxDocument(path)
    parts = []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if t:
            parts.append(t)
    return "\n".join(parts)

def read_pdf(path: str) -> str:
    try:
        reader = PdfReader(path)
        parts = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t.strip())
        return "\n\n".join(parts)
    except Exception:
        return ""

def build_corpus(docs_meta: List[Dict]) -> Tuple[str, List[str]]:
    """
    Returns (corpus_text, used_doc_ids). Concatenates readable text from supported docs.
    """
    texts = []
    used_ids = []
    for m in docs_meta:
        ext = os.path.splitext(m["filename"])[1].lower()
        path = m["path"]
        if ext in TEXT_EXTS:
            texts.append(read_txt(path)); used_ids.append(m["id"])
        elif ext in DOCX_EXTS:
            t = read_docx(path); 
            if t.strip(): texts.append(t); used_ids.append(m["id"])
        elif ext in PDF_EXTS:
            t = read_pdf(path); 
            if t.strip(): texts.append(t); used_ids.append(m["id"])
        # (skip images, pptx, etc for now)
    # limit very long corpora if needed
    corpus = "\n\n".join(texts)
    return corpus[:120000], used_ids  # cap to ~120k chars for safety