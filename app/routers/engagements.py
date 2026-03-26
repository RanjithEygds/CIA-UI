from datetime import datetime, timezone
import os
import shutil
import uuid
from typing import List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Body
from sqlalchemy.orm import Session

from app.services.agent2_interview import initialize_interview_plan
from app.services.heatmap_service import get_engagement_heatmap
from app.services.insights_agent import get_engagement_insights
from app.services.transcripts_service import get_transcripts_for_engagement
from ..db import SessionLocal
from ..models import (
    Engagement,
    Document,
    EngagementInsights,
    EngagementContext,
    Stakeholder,
    QuestionCatalog,
    Answer,
    Interview,
)
from ..services.agent1_prep import run_agent1_prep
from ..schemas import (
    EngagementCreate,
    EngagementListItem,
    EngagementSummaryOut,
    DocumentUploadResponse,
    QuestionUpdate,
    QuestionCreate,
    StakeholderUpdatePayload,
    UpdateContextRequest,
)

router = APIRouter()

# Default questions master file (ensure this exists!)
DEFAULT_QUESTIONS_PATH = "./app/storage/default/questions.xlsx"

# User-added questions share one synthetic section, ordered after parsed catalog.
CUSTOM_QUESTIONS_SECTION = "Custom questions"


def _ordered_catalog_for_engagement(db: Session, engagement_id: str) -> List[QuestionCatalog]:
    return (
        db.query(QuestionCatalog)
        .filter(QuestionCatalog.engagement_id == engagement_id)
        .order_by(
            QuestionCatalog.section_index.asc(),
            QuestionCatalog.sequence_in_section.asc(),
        )
        .all()
    )


def _questions_preview_rows(items: List[QuestionCatalog]) -> List[dict]:
    return [
        {
            "id": it.id,
            "section_index": it.section_index,
            "section": it.section,
            "sequence_in_section": it.sequence_in_section,
            "question_text": it.question_text,
        }
        for it in items
    ]


def _prune_question_id_from_engagement_plans(
    db: Session, engagement_id: str, question_id: str
) -> None:
    """Remove a catalog id from all stored interview plans for this engagement."""
    interviews = (
        db.query(Interview)
        .filter(Interview.engagement_id == engagement_id)
        .all()
    )
    for iv in interviews:
        plan = iv.questions_plan
        if not plan or not isinstance(plan, dict):
            continue
        new_plan: dict = {}
        changed = False
        for section, qids in plan.items():
            if isinstance(qids, list):
                filtered = [x for x in qids if x != question_id]
                if len(filtered) != len(qids):
                    changed = True
                if filtered:
                    new_plan[section] = filtered
            else:
                new_plan[section] = qids
        if changed:
            iv.questions_plan = new_plan

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("", response_model=dict)
def create_engagement(
    payload: EngagementCreate = Body(default=None),
    db: Session = Depends(get_db),
):
    """
    Creates an engagement and folder structure, and copies the default questions docx
    into /storage/{engagement_id}/questions/Stakeholder Interview Questions.docx
    """
    name = payload.name if payload else None

    e = Engagement(name=name)
    db.add(e)
    db.commit()
    db.refresh(e)

    base = f"./app/storage/{e.id}"
    docs_dir = f"{base}/documents"
    q_dir = f"{base}/questions"
    out_dir = f"{base}/outputs"
    os.makedirs(docs_dir, exist_ok=True)
    os.makedirs(q_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    # Validate default questions existence
    if not os.path.exists(DEFAULT_QUESTIONS_PATH):
        raise HTTPException(
            status_code=500,
            detail=(
                "Default questions file is missing at "
                f"{DEFAULT_QUESTIONS_PATH}. "
                "Ensure the default questions docx exists before creating engagements."
            ),
        )

    # Copy default to canonical name used by Agent 1 parser
    target_questions_path = os.path.join(q_dir, "Stakeholder Interview Questions.xlsx")
    shutil.copyfile(DEFAULT_QUESTIONS_PATH, target_questions_path)

    return {"engagement_id": e.id, "name": e.name}


@router.post("/{engagement_id}/documents", response_model=DocumentUploadResponse)
async def upload_document(
    engagement_id: str,
    file: UploadFile = File(...),
    category: str = Form(default=None),
    name: str = Form(default=None),  # optional display name for UI; not persisted separately
    db: Session = Depends(get_db),
):
    e = db.query(Engagement).get(engagement_id)
    if not e:
        raise HTTPException(404, "Engagement not found")

    folder = f"./app/storage/{engagement_id}/documents"
    os.makedirs(folder, exist_ok=True)

    path = os.path.join(folder, file.filename)
    content = await file.read()
    with open(path, "wb") as f:
        f.write(content)

    doc = Document(
        engagement_id=engagement_id,
        filename=file.filename,
        path=path,
        size_bytes=len(content),
        category=category,
    )
    db.add(doc)
    e.document_count = (e.document_count or 0) + 1
    db.commit()
    db.refresh(doc)

    return DocumentUploadResponse(
        id=doc.id, filename=doc.filename, size_bytes=doc.size_bytes, category=doc.category
    )


@router.get("/{engagement_id}/summary", response_model=EngagementSummaryOut)
def engagement_summary(engagement_id: str, db: Session = Depends(get_db)):
    e = db.query(Engagement).get(engagement_id)
    if not e:
        raise HTTPException(404, "Engagement not found")

    docs = db.query(Document).filter(Document.engagement_id == engagement_id).all()
    doc_list = [
        {
            "id": d.id,
            "filename": d.filename,
            "size_bytes": d.size_bytes,
            "category": d.category,
        }
        for d in docs
    ]

    # Generate preview summary and materialize QuestionCatalog on first call
    if not e.summary:
        e.summary = run_agent1_prep(db, engagement_id)
        db.commit()

    return EngagementSummaryOut(
        engagement_id=e.id,
        name=e.name,
        document_count=e.document_count or 0,
        documents=doc_list,
        summary=e.summary,
    )


@router.post("/{engagement_id}/questions/replace")
async def replace_questions_file(
    engagement_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Replaces the questions file for this engagement with the uploaded DOCX.
    Re-parses the questions into QuestionCatalog (Agent 1).
    """
    e = db.query(Engagement).get(engagement_id)
    if not e:
        raise HTTPException(404, "Engagement not found")

    filename = file.filename or ""
    if not filename.lower().endswith(".docx"):
        raise HTTPException(400, "Only .docx files are supported for questions.")

    q_dir = f"./app/storage/{engagement_id}/questions"
    os.makedirs(q_dir, exist_ok=True)
    target_path = os.path.join(q_dir, "Stakeholder Interview Questions.docx")

    content = await file.read()
    if len(content) < 50:  # fix '&lt;' to '<'
        raise HTTPException(400, "Uploaded file seems empty or invalid.")

    with open(target_path, "wb") as f:
        f.write(content)

    # Re-parse to refresh QuestionCatalog + preview summary
    summary = run_agent1_prep(db, engagement_id)

    return {
        "status": "ok",
        "message": "Questions file replaced and re-parsed successfully.",
        "engagement_id": engagement_id,
        "preview_summary": summary,
    }


@router.get("/{engagement_id}/questions/preview")
def preview_questions(engagement_id: str, db: Session = Depends(get_db)):
    """
    View the parsed questions (from QuestionCatalog) in strict numeric section order,
    then by sequence within each section. Useful for admin/debugging.
    Returns an empty list if none exist yet (e.g. before prep or custom-only flow).
    """

    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found.")

    items = _ordered_catalog_for_engagement(db, engagement_id)
    return {
        "engagement_id": engagement_id,
        "questions": _questions_preview_rows(items),
    }


@router.post("/{engagement_id}/questions", response_model=dict)
def create_question(
    engagement_id: str,
    payload: QuestionCreate,
    db: Session = Depends(get_db),
):
    """
    Add a custom question to the catalog for this engagement.
    New rows sort after parsed sections; multiple custom questions share one section.
    Returns the full ordered question list for the engagement.
    """
    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found.")

    text = (payload.question_text or "").strip()
    if not text:
        raise HTTPException(400, "question_text is required.")

    existing = _ordered_catalog_for_engagement(db, engagement_id)
    custom_rows = [r for r in existing if r.section == CUSTOM_QUESTIONS_SECTION]

    if custom_rows:
        section_index = custom_rows[0].section_index
        sequence_in_section = max(r.sequence_in_section for r in custom_rows) + 1
    elif not existing:
        section_index = 1
        sequence_in_section = 1
    else:
        section_index = max(r.section_index for r in existing) + 1
        sequence_in_section = 1

    new_id = str(uuid.uuid4())
    q = QuestionCatalog(
        id=new_id,
        engagement_id=engagement_id,
        section=CUSTOM_QUESTIONS_SECTION,
        section_index=section_index,
        sequence_in_section=sequence_in_section,
        question_text=text,
    )
    db.add(q)
    db.commit()

    items = _ordered_catalog_for_engagement(db, engagement_id)
    return {
        "status": "created",
        "engagement_id": engagement_id,
        "question": {
            "id": q.id,
            "section": q.section,
            "section_index": q.section_index,
            "question_text": q.question_text,
            "sequence_in_section": q.sequence_in_section,
        },
        "questions": _questions_preview_rows(items),
    }


@router.get("", response_model=List[EngagementListItem])
def list_engagements(db: Session = Depends(get_db)):
    """
    Returns all engagements with key metadata:
    id, name, summary, created_at, document_count
    Sorted by newest first.
    """
    rows = (
        db.query(Engagement)
        .order_by(Engagement.created_at.desc())
        .all()
    )

    return [
        EngagementListItem(
            id=e.id,
            name=e.name,
            summary=e.summary,
            created_at=e.created_at.isoformat() if e.created_at else None,
            document_count=e.document_count or 0,
        )
        for e in rows
    ]


@router.get("/{engagement_id}/details")
def engagement_details(engagement_id: str, db: Session = Depends(get_db)):
    from app.services.agent3_engagement import engagement_summary_agent

    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found")

    state = engagement_summary_agent.invoke({
        "engagement_id": engagement_id,
        "engagement_summary": eng.summary,
        "db": db,
        "generated_insights": None
    })

    # Return current insights
    insights = (
        db.query(EngagementInsights)
        .filter_by(engagement_id=engagement_id)
        .first()
    )

    return {
        "engagement_id": engagement_id,
        "details": insights.insights_json,
        "updated_at": insights.updated_at.isoformat()
    }


@router.get("/{engagement_id}/context")
def get_engagement_context(engagement_id: str, db: Session = Depends(get_db)):
    e = db.query(Engagement).get(engagement_id)
    if not e:
        raise HTTPException(404, "Engagement not found")

    ctx = db.query(EngagementContext).filter(EngagementContext.engagement_id == engagement_id).first()
    if not ctx:
        # Optionally trigger Agent-1 here, or return 404
        raise HTTPException(404, "Context not available. Run /summary first.")

    stakeholders = db.query(Stakeholder)\
        .filter(Stakeholder.engagement_id == engagement_id)\
        .order_by(Stakeholder.name.asc())\
        .all()

    return {
        "engagement_id": engagement_id,
        "change_brief": ctx.change_brief,
        "change_summary": ctx.change_summary_json or [],
        "impacted_groups": ctx.impacted_groups_json or [],
        "type_of_change": ctx.type_of_change_json or {},
        "stakeholders": [
            {
                "id": s.id,
                "name": s.name,
                "email": s.email,
                "role": s.role,
                "department": s.department,
                "engagement_level": s.engagement_level,
                "source_document_id": s.source_document_id
            }
            for s in stakeholders
        ],
        "source_docs": ctx.source_docs or [],
        "updated_at": ctx.updated_at.isoformat() if ctx.updated_at else None
    }


@router.patch("/{engagement_id}/context")
def update_engagement_context(
    engagement_id: str,
    payload: UpdateContextRequest,
    db: Session = Depends(get_db)
):
    ctx = db.query(EngagementContext).filter_by(engagement_id=engagement_id).first()
    if not ctx:
        raise HTTPException(404, "Context not found. Run /summary first.")

    # ✅ Partial updates applied here
    if payload.change_brief is not None:
        ctx.change_brief = payload.change_brief

    if payload.change_summary is not None:
        ctx.change_summary_json = payload.change_summary

    if payload.impacted_groups is not None:
        ctx.impacted_groups_json = [g.dict() for g in payload.impacted_groups]

    if payload.type_of_change is not None:
        ctx.type_of_change_json = payload.type_of_change.dict()

    if payload.stakeholders is not None:
        db.query(Stakeholder).filter_by(engagement_id=engagement_id).delete()

        for s in payload.stakeholders:
            db.add(
                Stakeholder(
                    engagement_id=engagement_id,
                    name=s.name,
                    email=s.email,
                    role=s.role,
                    department=s.department,
                    engagement_level=s.engagement_level,
                    source_document_id=None,
                )
            )

    ctx.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "ok", "message": "Context updated successfully."}


@router.patch("/{engagement_id}/questions/{question_id}", response_model=dict)
def update_question(
    engagement_id: str,
    question_id: str,
    payload: QuestionUpdate,
    db: Session = Depends(get_db)
):
    """
    Update a specific question in the QuestionCatalog by ID.
    Supports partial updates — only the fields provided will be updated.
    """

    q = (
        db.query(QuestionCatalog)
        .filter(
            QuestionCatalog.id == question_id,
            QuestionCatalog.engagement_id == engagement_id
        )
        .first()
    )

    if not q:
        raise HTTPException(404, "Question not found for this engagement.")

    # ✅ Apply only provided values
    if payload.section is not None:
        q.section = payload.section

    if payload.section_index is not None:
        q.section_index = payload.section_index

    if payload.question_text is not None:
        q.question_text = payload.question_text

    if payload.sequence_in_section is not None:
        q.sequence_in_section = payload.sequence_in_section

    db.commit()
    db.refresh(q)

    items = _ordered_catalog_for_engagement(db, engagement_id)
    return {
        "status": "updated",
        "question": {
            "id": q.id,
            "section": q.section,
            "section_index": q.section_index,
            "question_text": q.question_text,
            "sequence_in_section": q.sequence_in_section,
        },
        "questions": _questions_preview_rows(items),
    }


@router.delete("/{engagement_id}/questions/{question_id}", response_model=dict)
def delete_question(
    engagement_id: str,
    question_id: str,
    db: Session = Depends(get_db),
):
    """
    Remove a question from the catalog for this engagement.
    Deletes related answers and prunes the question id from any stored interview plans.
    """
    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found.")

    q = (
        db.query(QuestionCatalog)
        .filter(
            QuestionCatalog.id == question_id,
            QuestionCatalog.engagement_id == engagement_id,
        )
        .first()
    )
    if not q:
        raise HTTPException(404, "Question not found for this engagement.")

    db.query(Answer).filter(
        Answer.question_catalog_id == question_id,
        Answer.engagement_id == engagement_id,
    ).delete(synchronize_session=False)

    _prune_question_id_from_engagement_plans(db, engagement_id, question_id)

    db.delete(q)
    db.commit()

    items = _ordered_catalog_for_engagement(db, engagement_id)
    return {
        "status": "deleted",
        "engagement_id": engagement_id,
        "removed_id": question_id,
        "questions": _questions_preview_rows(items),
    }


@router.post("/{engagement_id}/stakeholders/manual", response_model=dict)
def create_stakeholder_and_interview(
    engagement_id: str,
    name: str = Form(...),
    email: str = Form(None),
    role: str = Form(None),
    department: str = Form(None),
    engagement_level: str = Form(None),
    db: Session = Depends(get_db)
):
    """
    Manually add a stakeholder AND immediately create an interview session.
    Enforces rule: A stakeholder can complete ONLY ONE interview.
    """

    # ✅ Validate engagement
    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found")

    # ✅ Check if stakeholder already exists (name + email recommended)
    existing = (
        db.query(Stakeholder)
        .filter(
            Stakeholder.engagement_id == engagement_id,
            Stakeholder.name == name,
            Stakeholder.email == email,
        )
        .first()
    )

    # ✅ If they already have an interview → restrict duplicate participation
    if existing:
        existing_interview = (
            db.query(Interview)
            .filter(
                Interview.engagement_id == engagement_id,
                Interview.stakeholder_email == existing.email,
            )
            .order_by(Interview.created_at.desc())
            .first()
        )

        if existing_interview and existing_interview.status == "completed":
            raise HTTPException(
                403,
                "This stakeholder has already completed their interview and cannot take it again."
            )

        if existing_interview and existing_interview.status in ("in_progress", "created"):
            return {
                "status": "exists",
                "message": "Stakeholder already has an active interview.",
                "stakeholder_id": existing.id,
                "interview_id": existing_interview.id,
            }

    # ✅ Create new stakeholder
    stakeholder = Stakeholder(
        engagement_id=engagement_id,
        name=name,
        email=email,
        role=role,
        department=department,
        engagement_level=engagement_level,
        source_document_id=None
    )
    db.add(stakeholder)
    db.commit()
    db.refresh(stakeholder)

    # ✅ Create interview and auto-start plan
    interview = Interview(
        engagement_id=engagement_id,
        stakeholder_name=name,
        stakeholder_email=email,
        status="in_progress",
        consent_captured=False,
        questions_plan=initialize_interview_plan(db, engagement_id),
        started_at=datetime.now(timezone.utc)
    )
    db.add(interview)
    db.commit()
    db.refresh(interview)

    return {
        "status": "created",
        "stakeholder_id": stakeholder.id,
        "interview_id": interview.id,
        "message": "Stakeholder created & interview session initialized successfully."
    }


@router.get("/{engagement_id}/stakeholders", response_model=dict)
def list_stakeholders_with_interviews(
    engagement_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns a list of stakeholders for an engagement, 
    each with their interview (if any).
    """

    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found")

    # ✅ Fetch stakeholders for this engagement
    stakeholders = (
        db.query(Stakeholder)
        .filter(Stakeholder.engagement_id == engagement_id)
        .order_by(Stakeholder.created_at.asc())
        .all()
    )

    stakeholder_rows = []

    for s in stakeholders:
        # ✅ Find interview for this stakeholder (email-based linkage)
        interview = (
            db.query(Interview)
            .filter(
                Interview.engagement_id == engagement_id,
                Interview.stakeholder_email == s.email,
            )
            .order_by(Interview.started_at.desc())
            .first()
        )

        stakeholder_rows.append({
            "stakeholder_id": s.id,
            "name": s.name,
            "email": s.email,
            "role": s.role,
            "department": s.department,
            "engagement_level": s.engagement_level,
            "created_at": s.created_at.isoformat() if s.created_at else None,

            # ✅ Interview fields
            "interview_id": interview.id if interview else None,
            "interview_status": interview.status if interview else None,
            "interview_started_at": interview.started_at.isoformat() if interview and interview.started_at else None,
            "interview_ended_at": interview.ended_at.isoformat() if interview and interview.ended_at else None,
        })

    return {
        "engagement_id": engagement_id,
        "count": len(stakeholder_rows),
        "stakeholders": stakeholder_rows
    }

@router.delete("/{engagement_id}/stakeholders/{stakeholder_id}", response_model=dict)
def delete_stakeholder(
    engagement_id: str,
    stakeholder_id: str,
    db: Session = Depends(get_db)
):
    """
    Deletes a stakeholder and their related interviews & answers.
    """

    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found")

    stakeholder = (
        db.query(Stakeholder)
        .filter(
            Stakeholder.id == stakeholder_id,
            Stakeholder.engagement_id == engagement_id,
        )
        .first()
    )

    if not stakeholder:
        raise HTTPException(404, "Stakeholder not found for this engagement")

    # ✅ Delete interviews attached to this stakeholder (email match)
    interviews = (
        db.query(Interview)
        .filter(
            Interview.engagement_id == engagement_id,
            Interview.stakeholder_email == stakeholder.email,
        )
        .all()
    )

    for iv in interviews:
        # Delete answers
        db.query(Answer).filter(Answer.interview_id == iv.id).delete()

        # Delete interview itself
        db.delete(iv)

    # ✅ Delete stakeholder
    db.delete(stakeholder)
    db.commit()

    return {
        "status": "deleted",
        "stakeholder_id": stakeholder_id,
        "engagement_id": engagement_id,
    }


@router.patch("/{engagement_id}/stakeholders/{stakeholder_id}", response_model=dict)
def update_stakeholder(
    engagement_id: str,
    stakeholder_id: str,
    payload: StakeholderUpdatePayload,
    db: Session = Depends(get_db)
):
    """
    Updates stakeholder details (partial update).
    """

    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise HTTPException(404, "Engagement not found")

    stakeholder = (
        db.query(Stakeholder)
        .filter(
            Stakeholder.id == stakeholder_id,
            Stakeholder.engagement_id == engagement_id,
        )
        .first()
    )

    if not stakeholder:
        raise HTTPException(404, "Stakeholder not found for this engagement")

    # ✅ Apply partial updates
    if payload.name is not None:
        stakeholder.name = payload.name

    if payload.email is not None:
        stakeholder.email = payload.email

    if payload.role is not None:
        stakeholder.role = payload.role

    if payload.department is not None:
        stakeholder.department = payload.department

    if payload.engagement_level is not None:
        stakeholder.engagement_level = payload.engagement_level

    db.commit()
    db.refresh(stakeholder)

    return {
        "status": "updated",
        "stakeholder_id": stakeholder_id,
        "engagement_id": engagement_id,
        "updated": {
            "name": stakeholder.name,
            "email": stakeholder.email,
            "role": stakeholder.role,
            "department": stakeholder.department,
            "engagement_level": stakeholder.engagement_level,
        },
    }


@router.get("/{engagement_id}/transcripts", response_model=dict)
def get_engagement_transcripts(
    engagement_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns completed interviews + transcripts using the shared service.
    """
    try:
        return get_transcripts_for_engagement(db, engagement_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/{engagement_id}/insights", response_model=dict)
def get_engagement_insights_endpoint(
    engagement_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns AI-generated insights + key findings for completed interviews.
    Uses caching to avoid re-running LLM if nothing changed.
    """
    return get_engagement_insights(db, engagement_id)


@router.get("/{engagement_id}/heatmap", response_model=dict)
def get_heatmap_endpoint(engagement_id: str, db: Session = Depends(get_db)):
    try:
        return get_engagement_heatmap(db, engagement_id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Failed to generate heatmap: {str(e)}")


