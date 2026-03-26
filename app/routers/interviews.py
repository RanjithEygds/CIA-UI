import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.services.agent1_prep import run_agent1_prep
from app.services.llm import llm_call, llm_stream
from app.services.transcripts_service import get_transcript_for_interview
from ..db import SessionLocal
from ..models import Engagement, Interview, Transcript, Answer, QuestionCatalog, Document
from ..schemas import InterviewStartIn, InterviewOut, InterviewFirstIn, NextQuestionOut, InterviewAnswerIn, TranscriptOut
from ..services.agent2_interview import (
    classify_user_intent,
    evaluate_answer,
    generate_clarification,
    generate_clarification_stream,
    initialize_interview_plan,
    get_next_question,
    build_section_readback_if_ready,
    finalize_interview_summary_and_transcript,
    stream_static_text,
)

router = APIRouter()

MAX_FOLLOWUPS = 2


def _sse_data(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

@router.post("/start", response_model=InterviewOut)
def start_interview(payload: InterviewStartIn, db: Session = Depends(get_db)):
    e = db.query(Engagement).get(payload.engagement_id)
    if not e:
        raise HTTPException(404, "Engagement not found")
    iv = Interview(
        engagement_id=payload.engagement_id,
        stakeholder_name=payload.stakeholder_name,
        stakeholder_email=payload.stakeholder_email,
        status="in_progress",
        consent_captured=False
    )
    # plan = sections -> [question_ids] from QuestionCatalog
    iv.questions_plan = initialize_interview_plan(db, payload.engagement_id)
    db.add(iv)
    db.commit()
    db.refresh(iv)
    return InterviewOut(interview_id=iv.id, engagement_id=iv.engagement_id, status=iv.status)


def _build_manifest(db: Session, engagement_id: str) -> list[dict]:
    docs = db.query(Document).filter(Document.engagement_id == engagement_id).all()
    return [
        {
            "filename": d.filename,
            "size_bytes": d.size_bytes,
            "category": d.category,
        }
        for d in docs
    ]

def _fallback_overview(manifest: list[dict], engagement_name: str | None, existing_summary: str | None) -> str:
    """
    Deterministic, neutral overview when LLM isn’t available.
    Uses the existing e.summary (Agent-1) if present, but paraphrases to keep it brief/neutral.
    """
    name = engagement_name or "this engagement"
    count = len(manifest)
    parts = []
    parts.append(
        f"This interview relates to {name}. We aim to establish a shared understanding of the change "
        "and capture potential impacts across people, processes, technology and data."
    )
    parts.append(
        f"{count} supporting document(s) have been provided to inform this discussion (e.g., scope, "
        "timelines, roles, and high-level ways of working)."
    )
    parts.append(
        "This orientation is for context only. If anything sounds inaccurate or incomplete, please correct us."
    )
    return " ".join(parts)

@router.post("/{interview_id}/first")
def first_intro(
    interview_id: str,
    payload: InterviewFirstIn = InterviewFirstIn(),
    db: Session = Depends(get_db),
):
    """
    Introduce CIMMIE and generate a short, neutral orientation for the interviewee
    based on the engagement’s uploaded documents (not per-document summaries).
    Also returns the standard consent question.
    """
    # --- Resolve interview & engagement ---
    iv = db.query(Interview).get(interview_id)
    if not iv:
        raise HTTPException(404, "Interview not found")

    eng = db.query(Engagement).get(iv.engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found for this interview")

    if not eng.summary:
        eng.summary = run_agent1_prep(db, eng.id)  # also materializes QuestionCatalog for the engagement
        db.commit()

    # --- Build manifest (just filenames/cats/sizes to show what's informing the brief) ---
    manifest = _build_manifest(db, eng.id)

    analyst_brief = (payload.brief or "").strip()  # optional add-on from facilitator

    context_brief = None
    try:
        # Build a compact, neutral, single‑paragraph orientation based on the engagement summary + manifest
        docs_bullets = "\n".join(
            [
                f"- {m['filename']} ({m['size_bytes']} bytes) [{m.get('category') or 'Uncategorized'}]"
                for m in manifest
            ]
        ) or "- (none)"

        system = (
            "You are drafting a short, neutral orientation for a stakeholder interview about an upcoming change.\n"
            "STRICT RULES:\n"
            "- DO NOT invent details; if uncertain, say 'Unknown' and optionally propose neutral validation (e.g., 'Confirm in SoW').\n"
            "- 75–100 words, stakeholder‑friendly; single paragraph.\n"
            "- Do NOT summarize each document; synthesize a single high‑level overview of purpose, scope, and intent.\n"
            "- Avoid commitments, decisions, or policy statements. Use cautious language ('may', 'intended', 'planned').\n"
            "- No personal data or attributions."
        )

        user = (
            f"ENGAGEMENT_NAME: {eng.name or '(unspecified)'}\n\n"
            f"EXISTING_PREVIEW_SUMMARY (internal draft, paraphrase—not verbatim):\n{eng.summary or '(none)'}\n\n"
            f"DOCUMENTS_FOR_CONTEXT (do not summarize one-by-one):\n{docs_bullets}\n\n"
            f"ANALYST_BRIEF (optional, may echo in 1 line if helpful):\n{analyst_brief or '(none)'}\n\n"
            "TASK:\n"
            "- Compose a single paragraph that sets context: what this interview is about and why it matters;\n"
            "- Lightly reference the types of materials that inform this session (scope, timeline, roles) without listing them;\n"
            "- Set expectations for coverage (people/process/technology/data) without reproducing the question list;\n"
            "- Invite corrections if anything is inaccurate."
        )

        context_brief = llm_call(system, user, temperature=0.2)
    except Exception:
        context_brief = None

    if not context_brief:
        context_brief = _fallback_overview(manifest, eng.name, eng.summary)

    # (Optional) Stamp interview start time if not already set
    if iv.started_at is None:
        iv.started_at = datetime.now(timezone.utc)
        db.commit()


    return {
        "context_brief": context_brief,
    }


@router.post("/{interview_id}/first/stream")
async def first_intro_stream(
    interview_id: str,
    payload: InterviewFirstIn = InterviewFirstIn(),
):
    async def event_stream():
        db = SessionLocal()
        try:
            iv = db.query(Interview).get(interview_id)
            if not iv:
                yield _sse_data({"type": "error", "message": "Interview not found"})
                return
            eng = db.query(Engagement).get(iv.engagement_id)
            if not eng:
                yield _sse_data({"type": "error", "message": "Engagement not found for this interview"})
                return

            if not eng.summary:
                eng.summary = run_agent1_prep(db, eng.id)
                db.commit()

            manifest = _build_manifest(db, eng.id)
            analyst_brief = (payload.brief or "").strip()
            docs_bullets = "\n".join(
                [
                    f"- {m['filename']} ({m['size_bytes']} bytes) [{m.get('category') or 'Uncategorized'}]"
                    for m in manifest
                ]
            ) or "- (none)"

            system = (
                "You are drafting a short, neutral orientation for a stakeholder interview about an upcoming change.\n"
                "STRICT RULES:\n"
                "- DO NOT invent details; if uncertain, say 'Unknown' and optionally propose neutral validation (e.g., 'Confirm in SoW').\n"
                "- 75–100 words, stakeholder‑friendly; single paragraph.\n"
                "- Do NOT summarize each document; synthesize a single high-level overview of purpose, scope, and intent.\n"
                "- Avoid commitments, decisions, or policy statements. Use cautious language ('may', 'intended', 'planned').\n"
                "- No personal data or attributions."
            )
            user = (
                f"ENGAGEMENT_NAME: {eng.name or '(unspecified)'}\n\n"
                f"EXISTING_PREVIEW_SUMMARY (internal draft, paraphrase—not verbatim):\n{eng.summary or '(none)'}\n\n"
                f"DOCUMENTS_FOR_CONTEXT (do not summarize one-by-one):\n{docs_bullets}\n\n"
                f"ANALYST_BRIEF (optional, may echo in 1 line if helpful):\n{analyst_brief or '(none)'}\n\n"
                "TASK:\n"
                "- Compose a single paragraph that sets context: what this interview is about and why it matters;\n"
                "- Lightly reference the types of materials that inform this session (scope, timeline, roles) without listing them;\n"
                "- Set expectations for coverage (people/process/technology/data) without reproducing the question list;\n"
                "- Invite corrections if anything is inaccurate."
            )

            yield _sse_data({"type": "begin_part", "part": "context"})

            context_brief = None
            try:
                pieces: list[str] = []
                async for ch in llm_stream(system, user, temperature=0.2):
                    pieces.append(ch)
                    yield _sse_data({"type": "delta", "text": ch})
                context_brief = "".join(pieces)
            except Exception:
                context_brief = None

            if not context_brief or not context_brief.strip():
                context_brief = _fallback_overview(manifest, eng.name, eng.summary)
                async for ch in stream_static_text(context_brief):
                    yield _sse_data({"type": "delta", "text": ch})

            if iv.started_at is None:
                iv.started_at = datetime.now(timezone.utc)
                db.commit()

            yield _sse_data({"type": "done", "context_brief": context_brief})
        finally:
            db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{interview_id}/next", response_model=NextQuestionOut)
def next_question(interview_id: str, db: Session = Depends(get_db)):
    """
    Returns the next question verbatim, respecting the strict order in questions_plan.
    If at a section boundary with all answers captured, returns a 'readback' payload with type='readback' (you can also model a different response).
    """
    iv = db.query(Interview).get(interview_id)
    if not iv:
        raise HTTPException(404, "Interview not found")
    q = get_next_question(db, iv)
    if not q:
        return {"question_id": -1, "section": "DONE", "question_text": "All questions completed."}
    return NextQuestionOut(question_id=q["id"], section=q["section"], question_text=q["text"], section_index=q["section_index"], sequence_in_section=q["sequence_in_section"])

@router.post("/{interview_id}/answer")
def submit_answer(interview_id: str, payload: InterviewAnswerIn, db: Session = Depends(get_db)):
    iv = db.query(Interview).get(interview_id)
    qc = db.query(QuestionCatalog).get(payload.question_id)

    # ⚠ Clarification detection
    intent = classify_user_intent(qc.question_text, payload.answer_text)
    if intent == "clarification":
        clarification = generate_clarification(db, iv, qc.question_text)
        return {
            "status": "clarification",
            "bot_reply": clarification,
            "stay_on_question": True
        }

    # ⚠ Evaluate with context
    quality, followup = evaluate_answer(db, iv, qc.question_text, payload.answer_text)

    # Save answer turn
    # --- LOOK FOR EXISTING ANSWER FOR THIS QUESTION ---
    existing = db.query(Answer).filter(
        Answer.interview_id == iv.id,
        Answer.question_catalog_id == qc.id
    ).first()
    
    if existing:
        if existing.metadata_json is None:
            existing.metadata_json = {"turn": 1, "followups": 0}
        else:
            existing.metadata_json.setdefault("followups", 0)

    # If this is a follow-up exchange (not first turn)
    if existing:
        # Append follow-up text to the existing answer
        existing.answer_text += f"\n {payload.answer_text}"
        existing.response_quality = quality
        existing.requires_followup = (quality != "ok")
        existing.metadata_json["followups"] += 1
        db.commit()
    else:
        # First answer OR Final good answer → Create new row
        ans = Answer(
            interview_id=iv.id,
            engagement_id=iv.engagement_id,
            question_catalog_id=qc.id,
            section=qc.section,
            question_text=qc.question_text,
            answer_text=payload.answer_text,
            response_quality=quality,
            requires_followup=(quality != "ok"),
            metadata_json={"turn": 1, "followups": 0}
        )
        db.add(ans)
        db.commit()
        existing = ans

    # ⚠ If follow-up needed but MAX reached → mark answer as accepted anyway
    # determine followup count for this question
    if existing and existing.metadata_json:
        followups_count = existing.metadata_json.get("followups", 0)
    else:
        followups_count = 0

    # ⚠ If follow-up needed but MAX reached → mark answer as accepted anyway
    if quality != "ok" and followups_count >= MAX_FOLLOWUPS:
        readback = build_section_readback_if_ready(db, iv, qc.section)
        return {
            "status": "recorded",
            "stay_on_question": False,
            "readback": readback,
            "reason": "max_followups_reached"
        }

    # ⚠ Normal follow-up case
    if quality != "ok" and followup:
        return {
            "status": "followup",
            "bot_reply": followup,
            "stay_on_question": True
        }

    # ⚠ Final OK answer → compute readback now
    readback = build_section_readback_if_ready(db, iv, qc.section)

    return {
        "status": "recorded",
        "stay_on_question": False,
        "readback": readback
    }


@router.post("/{interview_id}/answer/stream")
async def submit_answer_stream(
    interview_id: str,
    payload: InterviewAnswerIn,
):
    async def event_stream():
        db = SessionLocal()
        try:
            iv = db.query(Interview).get(interview_id)
            qc = db.query(QuestionCatalog).get(payload.question_id)
            if not iv or not qc:
                yield _sse_data({"type": "error", "message": "Interview or question not found"})
                return

            intent = classify_user_intent(qc.question_text, payload.answer_text)
            if intent == "clarification":
                yield _sse_data({"type": "begin_part", "part": "clarification"})
                bot_pieces: list[str] = []
                try:
                    async for ch in generate_clarification_stream(db, iv, qc.question_text):
                        bot_pieces.append(ch)
                        yield _sse_data({"type": "delta", "text": ch})
                    bot_reply = "".join(bot_pieces)
                    if not bot_reply.strip():
                        raise ValueError("empty clarification")
                except Exception:
                    bot_reply = generate_clarification(db, iv, qc.question_text)
                    async for ch in stream_static_text(bot_reply):
                        yield _sse_data({"type": "delta", "text": ch})

                yield _sse_data({
                    "type": "done",
                    "result": {
                        "status": "clarification",
                        "bot_reply": bot_reply,
                        "stay_on_question": True,
                    },
                })
                return

            quality, followup = evaluate_answer(db, iv, qc.question_text, payload.answer_text)

            existing = db.query(Answer).filter(
                Answer.interview_id == iv.id,
                Answer.question_catalog_id == qc.id,
            ).first()

            if existing:
                if existing.metadata_json is None:
                    existing.metadata_json = {"turn": 1, "followups": 0}
                else:
                    existing.metadata_json.setdefault("followups", 0)

            if existing:
                existing.answer_text += f"\n {payload.answer_text}"
                existing.response_quality = quality
                existing.requires_followup = quality != "ok"
                existing.metadata_json["followups"] += 1
                db.commit()
            else:
                ans = Answer(
                    interview_id=iv.id,
                    engagement_id=iv.engagement_id,
                    question_catalog_id=qc.id,
                    section=qc.section,
                    question_text=qc.question_text,
                    answer_text=payload.answer_text,
                    response_quality=quality,
                    requires_followup=(quality != "ok"),
                    metadata_json={"turn": 1, "followups": 0},
                )
                db.add(ans)
                db.commit()
                existing = ans

            if existing and existing.metadata_json:
                followups_count = existing.metadata_json.get("followups", 0)
            else:
                followups_count = 0

            if quality != "ok" and followups_count >= MAX_FOLLOWUPS:
                readback = build_section_readback_if_ready(db, iv, qc.section)
                result_obj = {
                    "status": "recorded",
                    "stay_on_question": False,
                    "readback": readback,
                    "reason": "max_followups_reached",
                }
                if readback:
                    yield _sse_data({"type": "begin_part", "part": "readback"})
                    async for ch in stream_static_text(readback):
                        yield _sse_data({"type": "delta", "text": ch})
                yield _sse_data({"type": "begin_part", "part": "nudge"})
                async for ch in stream_static_text("Thanks — let's move ahead."):
                    yield _sse_data({"type": "delta", "text": ch})
                nq = get_next_question(db, iv)
                if not nq:
                    done_line = "Interview completed. Thank you for your responses."
                    yield _sse_data({"type": "begin_part", "part": "completion"})
                    async for ch in stream_static_text(done_line):
                        yield _sse_data({"type": "delta", "text": ch})
                    yield _sse_data({
                        "type": "done",
                        "result": result_obj,
                        "next_question": None,
                        "interview_completed": True,
                    })
                else:
                    yield _sse_data({"type": "begin_part", "part": "question"})
                    async for ch in stream_static_text(nq["text"]):
                        yield _sse_data({"type": "delta", "text": ch})
                    yield _sse_data({
                        "type": "done",
                        "result": result_obj,
                        "next_question": {
                            "question_id": str(nq["id"]),
                            "section": nq["section"],
                            "question_text": nq["text"],
                            "section_index": nq["section_index"],
                            "sequence_in_section": nq["sequence_in_section"],
                        },
                        "interview_completed": False,
                    })
                return

            if quality != "ok" and followup:
                yield _sse_data({"type": "begin_part", "part": "followup"})
                fu = (followup or "").strip() or followup or ""
                async for ch in stream_static_text(fu):
                    yield _sse_data({"type": "delta", "text": ch})
                yield _sse_data({
                    "type": "done",
                    "result": {
                        "status": "followup",
                        "bot_reply": fu,
                        "stay_on_question": True,
                    },
                })
                return

            readback = build_section_readback_if_ready(db, iv, qc.section)
            result_obj = {
                "status": "recorded",
                "stay_on_question": False,
                "readback": readback,
            }
            if readback:
                yield _sse_data({"type": "begin_part", "part": "readback"})
                async for ch in stream_static_text(readback):
                    yield _sse_data({"type": "delta", "text": ch})

            nq = get_next_question(db, iv)
            if not nq:
                done_line = "Interview completed. Thank you for your responses."
                yield _sse_data({"type": "begin_part", "part": "completion"})
                async for ch in stream_static_text(done_line):
                    yield _sse_data({"type": "delta", "text": ch})
                yield _sse_data({
                    "type": "done",
                    "result": result_obj,
                    "next_question": None,
                    "interview_completed": True,
                })
            else:
                yield _sse_data({"type": "begin_part", "part": "question"})
                async for ch in stream_static_text(nq["text"]):
                    yield _sse_data({"type": "delta", "text": ch})
                yield _sse_data({
                    "type": "done",
                    "result": result_obj,
                    "next_question": {
                        "question_id": str(nq["id"]),
                        "section": nq["section"],
                        "question_text": nq["text"],
                        "section_index": nq["section_index"],
                        "sequence_in_section": nq["sequence_in_section"],
                    },
                    "interview_completed": False,
                })
        finally:
            db.close()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{interview_id}/end")
def end_interview(interview_id: str, db: Session = Depends(get_db)):
    iv = db.query(Interview).get(interview_id)
    if not iv:
        raise HTTPException(404, "Interview not found")
    iv.status = "completed"
    db.commit()

    # finalize transcript + final summary
    transcript_text, final_summary = finalize_interview_summary_and_transcript(db, iv)
    tr = Transcript(interview_id=iv.id, content=transcript_text)
    db.add(tr)
    db.commit()
    return {"status": "completed", "final_summary": final_summary}

@router.get("/{interview_id}/transcript", response_model=dict)
def get_single_interview_transcript(
    interview_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns transcript for a SINGLE completed (or ended) interview.
    Matches the format of engagement-level transcripts.
    """

    try:
        return get_transcript_for_interview(db, interview_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load transcript: {str(e)}")

@router.get("/{interview_id}/sections")
def list_sections(interview_id: str, db: Session = Depends(get_db)):
    """
    Returns list of all sections for this interview, including:
    - section_index (numeric)
    - section_title (readable)
    - total_questions
    - answered
    - remaining
    - completed
    """

    # 1) Validate interview
    iv = db.query(Interview).get(interview_id)
    if not iv:
        raise HTTPException(404, "Interview not found")

    engagement_id = iv.engagement_id

    # 2) Load catalog questions
    qitems = (
        db.query(QuestionCatalog)
        .filter(QuestionCatalog.engagement_id == engagement_id)
        .order_by(QuestionCatalog.section_index.asc(), QuestionCatalog.sequence_in_section.asc())
        .all()
    )
    if not qitems:
        raise HTTPException(404, "No questions parsed for this engagement")

    # 3) Load all answers for this interview
    answered_ids = {
        ans.question_catalog_id
        for ans in db.query(Answer).filter(Answer.interview_id == interview_id).all()
    }

    # 4) Group by section
    grouped: dict[int, dict] = {}
    for q in qitems:
        idx = q.section_index
        if idx not in grouped:
            grouped[idx] = {
                "section_index": idx,
                "section_title": q.section,
                "total_questions": 0,
                "answered": 0,
                "remaining": 0,
                "completed": False,
            }

        grouped[idx]["total_questions"] += 1
        if q.id in answered_ids:
            grouped[idx]["answered"] += 1

    # 5) Compute remaining + completed
    for sec in grouped.values():
        sec["remaining"] = sec["total_questions"] - sec["answered"]
        sec["completed"] = sec["answered"] == sec["total_questions"]

    # 6) Assemble output in numeric order
    sections = [
        grouped[idx]
        for idx in sorted(grouped.keys())
    ]

    return {
        "interview_id": interview_id,
        "engagement_id": engagement_id,
        "sections": sections,
    }

