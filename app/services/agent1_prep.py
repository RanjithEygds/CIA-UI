import os
import re
import logging
from sqlalchemy.orm import Session
from ..models import Document, Engagement, QuestionCatalog, EngagementContext, Stakeholder
from .llm import llm_call
from .agent1_llm_extract import (
    extract_questions_with_llm,
    write_question_catalog_from_extract,
)
from .questions_parser import parse_questions_docx as fallback_parser
from .questions_parser_excel import parse_questions_excel  # ✅ NEW IMPORT
from .doc_readers import build_corpus
from .stakeholder_excel import parse_stakeholders_from_excels
from .agent1_context_extract import extract_context_from_corpus

logger = logging.getLogger(__name__)


def _fallback_preview(meta):
    lines = []
    lines.append(f"Preview summary (fallback): {len(meta)} document(s) uploaded.")
    for m in meta:
        lines.append(f"- {m['filename']} ({m['size']} bytes) [{m.get('category') or 'Uncategorized'}]")
    return "\n".join(lines)


def run_agent1_prep(db: Session, engagement_id: str) -> str:
    # 1. Gather documents
    docs = db.query(Document).filter(Document.engagement_id == engagement_id).all()
    meta = [
        {"id": d.id, "filename": d.filename, "path": d.path,
         "size": d.size_bytes, "category": d.category}
        for d in docs
    ]

    # Build doclist summary prompt for LLM
    doclist_for_prompt = "\n".join(
        [f"- {m['filename']} ({m['size']} bytes) [{m['category'] or 'Uncategorized'}]" for m in meta]
    )

    # 2. Generate Preview Summary
    try:
        system = (
            "You are Agent 1 (Prep). Summarize uploaded documents for the preview in 150–300 words. "
            "Do not invent; if content is unknown, say 'Unknown'."
        )
        preview_summary = llm_call(system, f"Documents:\n{doclist_for_prompt}\n", temperature=0.1)
    except Exception as ex:
        logger.exception(f"LLM preview summary failed: {ex}")
        preview_summary = _fallback_preview(meta)

    # --- QUESTION EXTRACTION PIPELINE ---
    q_dir = f"./app/storage/{engagement_id}/questions"
    excel_path = os.path.join(q_dir, "Stakeholder Interview Questions.xlsx")
    parsed = None

    # Detect DOCX question file
    docx_path = os.path.join(q_dir, "Stakeholder Interview Questions.docx")
    if not os.path.exists(docx_path):
        # Also support mistakenly saved as uppercase / different filename
        for fname in os.listdir(q_dir):
            if fname.lower().endswith(".docx"):
                docx_path = os.path.join(q_dir, fname)
                break

    # ✅ CASE 1 — Excel extraction
    if excel_path:
        try:
            parsed = parse_questions_excel(excel_path)
            parsed["engagement_id"] = engagement_id
            logger.info(f"✅ Excel questions parsed: {excel_path}")
        except Exception as ex:
            logger.exception(f"❌ Excel parsing failed: {ex}")
            parsed = None

    # ✅ CASE 2 — DOCX LLM extraction
    if parsed is None and os.path.exists(docx_path):
        try:
            parsed = extract_questions_with_llm(engagement_id, docx_path)
            logger.info("✅ DOCX parsed via LLM")
        except Exception as ex:
            logger.exception("❌ LLM DOCX extract failed, trying fallback…")
            parsed = None

    # ✅ CASE 3 — DOCX fallback parser
    if parsed is None and os.path.exists(docx_path):
        fb_sections = fallback_parser(docx_path)
        sections = []
        for s in fb_sections:
            title = s["section_title"]
            m = re.match(r"^\s*(\d+)\.\s+", title)
            idx = int(m.group(1)) if m else 9999

            sections.append({
                "section_index": idx,
                "section_title": title,
                "questions": [
                    {
                        "sequence_in_section": q["sequence_in_section"],
                        "question_text": q["text"],
                        "kind": "question",
                        "evidence": {"line_indices": [], "text_snippet": ""},
                        "confidence": "medium",
                    }
                    for q in s["questions"]
                ]
            })

        parsed = {
            "engagement_id": engagement_id,
            "version": "fallback",
            "sections": sections,
            "unknowns": []
        }
        logger.info("✅ Deterministic fallback parser used")

    # ✅ FINAL — ENSURE PARSED IS NOT NONE
    if parsed is None:
        raise RuntimeError(
            f"❌ Failed to parse questions: No valid Excel or DOCX found for engagement {engagement_id}"
        )

    # Write into DB
    write_question_catalog_from_extract(db, engagement_id, parsed)

    # --- CONTEXT EXTRACTION ---
    corpus, used_doc_ids = build_corpus(meta)
    ctx = extract_context_from_corpus(corpus)

    # --- STAKEHOLDER extraction ---
    excel_docs = [m for m in meta if m["filename"].lower().endswith((".xlsx", ".xls"))]
    stakeholders = parse_stakeholders_from_excels(excel_docs)

    # --- SAVE CONTEXT ---
    existing_ctx = db.query(EngagementContext).filter(
        EngagementContext.engagement_id == engagement_id
    ).first()

    if not existing_ctx:
        existing_ctx = EngagementContext(
            engagement_id=engagement_id,
            change_brief=ctx["change_brief"],
            change_summary_json=ctx["change_summary"],
            impacted_groups_json=ctx["impacted_groups"],
            type_of_change_json=ctx["type_of_change"],
            source_docs=used_doc_ids,
        )
        db.add(existing_ctx)
    else:
        existing_ctx.change_brief = ctx["change_brief"]
        existing_ctx.change_summary_json = ctx["change_summary"]
        existing_ctx.impacted_groups_json = ctx["impacted_groups"]
        existing_ctx.type_of_change_json = ctx["type_of_change"]
        existing_ctx.source_docs = used_doc_ids

    # Replace stakeholders
    db.query(Stakeholder).filter(Stakeholder.engagement_id == engagement_id).delete()
    for s in stakeholders:
        db.add(Stakeholder(
            engagement_id=engagement_id,
            name=s["name"],
            email=s["email"],
            role=s["role"],
            department=s["department"],
            engagement_level=s["engagement_level"],
        ))
    db.commit()

    # Save preview summary
    db.query(Engagement).get(engagement_id).summary = preview_summary
    db.commit()

    return preview_summary

