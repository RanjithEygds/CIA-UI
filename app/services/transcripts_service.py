# app/services/transcripts_service.py

from sqlalchemy.orm import Session
from typing import Dict, List
from ..models import Engagement, Interview, QuestionCatalog, Answer


def get_transcripts_for_engagement(db: Session, engagement_id: str) -> Dict:
    """
    INTERNAL reusable function.
    Returns completed interviews + full Q/A transcripts
    WITHOUT being tied to FastAPI routing.
    """

    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise ValueError("Engagement not found")

    # Fetch completed interviews
    completed_interviews = (
        db.query(Interview)
        .filter(
            Interview.engagement_id == engagement_id,
            Interview.status.in_(["completed", "ended"])
        )
        .order_by(Interview.started_at.asc())
        .all()
    )

    # Load catalog questions
    catalog_map = {
        q.id: q
        for q in db.query(QuestionCatalog)
        .filter(QuestionCatalog.engagement_id == engagement_id)
        .order_by(QuestionCatalog.section_index.asc(), QuestionCatalog.sequence_in_section.asc())
        .all()
    }

    output_rows = []

    for iv in completed_interviews:
        answers = (
            db.query(Answer)
            .filter(Answer.interview_id == iv.id)
            .order_by(Answer.timestamp.asc())
            .all()
        )

        transcript_rows = [
            {
                "question_id": catalog_map[a.question_catalog_id].id,
                "section": catalog_map[a.question_catalog_id].section,
                "question_text": catalog_map[a.question_catalog_id].question_text,
                "answer_text": a.answer_text,
            }
            for a in answers
            if a.question_catalog_id in catalog_map
        ]

        output_rows.append({
            "interview_id": iv.id,
            "stakeholder_name": iv.stakeholder_name,
            "stakeholder_email": iv.stakeholder_email,
            "transcript": transcript_rows
        })

    return {
        "engagement_id": engagement_id,
        "engagement_name": eng.name,
        "completed_interviews": output_rows
    }