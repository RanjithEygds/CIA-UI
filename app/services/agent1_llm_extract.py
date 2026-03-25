# app/services/agent1_llm_extract.py
import re
import json
from typing import Dict, Any, List, Tuple, Literal, Annotated
from docx import Document
from pydantic import BaseModel, Field, field_validator
from .llm import llm_call
from .questions_parser import parse_questions_docx as fallback_parser  # fallback to rules-based
from ..models import QuestionCatalog

SECNUM_RE = re.compile(r"^\s*(\d+)\.\s+")

# ---------- Pydantic models (validate strict shape) ----------
class Evidence(BaseModel):
    line_indices: List[int] = Field(default_factory=list)
    text_snippet: str = ""

class QItem(BaseModel):
    sequence_in_section: Annotated[int, Field(ge=1)]
    question_text: Annotated[str, Field(min_length=3)]
    # Use Literal for strict values, and a validator to coerce to lower-case
    kind: Literal["question", "consent", "readback"] = "question"
    evidence: Evidence
    confidence: Literal["high", "medium", "low"] = "high"

    @field_validator("kind", "confidence", mode="before")
    @classmethod
    def _lowercase_literals(cls, v):
        if isinstance(v, str):
            v = v.lower().strip()
        return v

class SectionOut(BaseModel):
    section_index: Annotated[int, Field(ge=1)]
    section_title: Annotated[str, Field(min_length=2)]
    questions: List[QItem] = Field(default_factory=list)

class UnknownItem(BaseModel):
    reason: str
    validation_hint: str = ""

class ExtractOut(BaseModel):
    engagement_id: str
    version: str = "qcat-v1"
    sections: List[SectionOut]
    unknowns: List[UnknownItem] = Field(default_factory=list)

# ---------- Helpers ----------
def _read_docx_lines(docx_path: str) -> List[str]:
    doc = Document(docx_path)
    lines: List[str] = []
    for p in doc.paragraphs:
        t = (p.text or "").rstrip()
        if t:
            lines.append(t)
    return lines

def _build_source_payload(lines: List[str]) -> str:
    buf = []
    for i, t in enumerate(lines, start=1):
        buf.append(f"[line:{i}] {t}")
    return "\n".join(buf)

def _strip_numeric_prefix(title: str) -> str:
    # Convert "10. Wrap-up & Validation (3 min)" -> "Wrap-up & Validation (3 min)"
    m = SECNUM_RE.match(title or "")
    if not m:
        return title.strip()
    # drop "<num>. "
    return title.split(".", 1)[1].strip()

def _validate_against_source(extract: ExtractOut, src_lines: List[str]) -> Tuple[ExtractOut, List[str]]:
    """
    Ensure each question_text can be located in src_lines (exact or simple normalized match).
    Returns (maybe_adjusted_extract, issues).
    """
    issues: List[str] = []

    corpus = "\n".join(src_lines).lower()
    for sec in extract.sections:
        # keep sequence ordering
        sec.questions = sorted(sec.questions, key=lambda q: q.sequence_in_section)
        for q in sec.questions:
            qt = q.question_text.strip()
            found = qt.lower() in corpus
            # Simple normalization for fancy closing quotes
            if not found and qt.endswith("?”"):
                qt2 = qt[:-2] + "?"
                found = qt2.lower() in corpus
            if not found and qt.endswith("?””"):
                qt3 = qt[:-3] + "?"
                found = qt3.lower() in corpus

            if not found:
                issues.append(
                    f"Question not found in source: '{q.question_text[:120]}...' (sec {sec.section_index})"
                )
                q.confidence = "low"

    # enforce numeric ordering of sections
    extract.sections = sorted(extract.sections, key=lambda s: s.section_index)
    return extract, issues

# ---------- Core LLM extraction ----------
def extract_questions_with_llm(engagement_id: str, docx_path: str) -> Dict[str, Any]:
    lines = _read_docx_lines(docx_path)
    source_payload = _build_source_payload(lines)

    system = (
        "You are an expert information extractor for a Change Impact Assessment interview guide.\n"
        "STRICT RULES:\n"
        "- DO NOT invent questions. Extract ONLY the exact askable questions from the provided text.\n"
        "- Ignore labels/instructions ending with a colon, like 'Warm‑up question:' or 'For each chosen group:'.\n"
        "- The first section contains opening guidance with consent; extract the consent question and mark kind=\"consent\".\n"
        "- Preserve original wording and punctuation.\n"
        "- Order sections numerically by their leading number and preserve the question order.\n"
        "- If missing/ambiguous, DO NOT fabricate; use `unknowns` with reason and validation_hint.\n"
        "Return JSON only; no additional text."
    )

    user = (
        f"ENGAGEMENT_ID: {engagement_id}\n\n"
        "SOURCE_LINES (each line is prefixed with [line:<index>]):\n"
        f"{source_payload}\n\n"
        "REQUIREMENTS:\n"
        "- Identify section headers '<number>. <title>'.\n"
        "- Within each section, list ONLY real questions (end with '?' or clear question bullets).\n"
        "- For Section 1, extract the consent sentence from opening guidance (usually includes 'May I proceed...').\n"
        "- Exclude labels ending with ':'; include the 'Read-back: “Here’s what I captured — did I get it right?”' question.\n"
        "- Provide evidence.line_indices for every question using the [line:...] indices.\n"
        "- Provide confidence for each question.\n"
        "OUTPUT: JSON schema -> { engagement_id, version, sections[{section_index,section_title,questions[{sequence_in_section,question_text,kind,evidence{line_indices,text_snippet},confidence}]}], unknowns[] }.\n"
    )

    raw = llm_call(system, user, temperature=0, json_mode=True)

    try:
        data = json.loads(raw)
        extract = ExtractOut.model_validate(data)
    except Exception as ex:
        raise RuntimeError(f"LLM extraction failed or invalid JSON: {ex}\nRaw: {raw[:3000]}")

    # Post-validate against source lines
    extract, issues = _validate_against_source(extract, lines)
    result = extract.model_dump()

    if issues:
        result["unknowns"] = result.get("unknowns", []) + [
            {"reason": "validation", "validation_hint": msg} for msg in issues
        ]
    return result

def write_question_catalog_from_extract(db, engagement_id: str, extract: Dict[str, Any]) -> None:
    # clear existing
    db.query(QuestionCatalog).filter(QuestionCatalog.engagement_id == engagement_id).delete()
    db.commit()

    # write in numeric section order
    for sec in sorted(extract["sections"], key=lambda s: s["section_index"]):
        section_index = int(sec["section_index"])
        section_title = sec["section_title"]
        section_clean = _strip_numeric_prefix(section_title)
        # Normalize to "N. <title>" if needed
        if not section_title.strip().split(".", 1)[0].isdigit():
            section_title = f"{sec['section_index']}. {section_title}"
        for q in sorted(sec["questions"], key=lambda q: q["sequence_in_section"]):
            db.add(
                QuestionCatalog(
                    engagement_id=engagement_id,
                    section_index=section_index,
                    section=section_clean,
                    sequence_in_section=q["sequence_in_section"],
                    question_text=q["question_text"],
                )
            )
    db.commit()