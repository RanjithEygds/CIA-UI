import json
from datetime import datetime, timezone
from typing import TypedDict, List, Dict, Any

from langgraph.graph import StateGraph, END
from sqlalchemy.orm import Session

from app.services.llm import llm_call
from app.models import Engagement, Interview, Answer, Transcript, EngagementInsights


# --------------------------
#   STATE DEFINITION
# --------------------------

class EngagementSummaryState(TypedDict, total=False):
    engagement_id: str
    engagement_summary: str | None

    interviews_data: List[Dict[str, Any]]
    completed_interview_ids: List[str]

    insights_existing: Dict[str, Any] | None
    insights_existing_ids: List[str] | None

    needs_regeneration: bool
    generated_insights: Dict[str, Any] | None

    db: Session   # IMPORTANT: DB injected in the initial call


# --------------------------
#   NODE 1: Load Interviews
# --------------------------

def load_interviews(state: EngagementSummaryState) -> EngagementSummaryState:
    db = state["db"]
    engagement_id = state["engagement_id"]

    completed_interviews: List[Interview] = (
        db.query(Interview)
        .filter(Interview.engagement_id == engagement_id,
                Interview.status == "completed")
        .all()
    )
    completed_ids = [iv.id for iv in completed_interviews]

    interviews_payload = []
    for iv in completed_interviews:
        answers = (
            db.query(Answer)
            .filter(Answer.interview_id == iv.id)
            .all()
        )
        transcript = (
            db.query(Transcript)
            .filter(Transcript.interview_id == iv.id)
            .first()
        )

        interviews_payload.append({
            "interview_id": iv.id,
            "stakeholder_name": iv.stakeholder_name,
            "stakeholder_email": iv.stakeholder_email,
            "started_at": iv.started_at.isoformat() if iv.started_at else None,
            "ended_at": iv.ended_at.isoformat() if iv.ended_at else None,

            "answers": [
                {
                    "section": a.section,
                    "question": a.question_text,
                    "answer": a.answer_text,
                    "quality": a.response_quality,
                    "requires_followup": a.requires_followup,
                }
                for a in answers
            ],
            "transcript": transcript.content if transcript else "",
        })

    # store into state
    state["interviews_data"] = interviews_payload
    state["completed_interview_ids"] = completed_ids

    # load existing insights if exist
    existing = db.query(EngagementInsights).filter_by(
        engagement_id=engagement_id
    ).first()

    if existing:
        state["insights_existing"] = existing.insights_json
        state["insights_existing_ids"] = existing.interviews_used or []
    else:
        state["insights_existing"] = None
        state["insights_existing_ids"] = []

    return state


# --------------------------
#   NODE 2: Check if Stale
# --------------------------

def check_if_stale(state: EngagementSummaryState) -> EngagementSummaryState:
    completed_ids = sorted(state["completed_interview_ids"])
    used_ids = sorted(state["insights_existing_ids"] or [])

    state["needs_regeneration"] = (completed_ids != used_ids)
    return state


# --------------------------
#   NODE 3: Generate Insights (LLM)
# --------------------------

CIA_SYSTEM_PROMPT = """
You are an expert Change Impact Assessment generator.

STRICT RULES:
- NO invention. Use ONLY content present in interviews + engagement summary.
- If a fact is unknown, say: "Unknown – requires validation".
- Produce final output AS JSON ONLY.
- Maintain structure, coherence, traceability.
- Summaries must reflect the People / Process / Technology / Data (PPTD) lenses.

OUTPUT JSON SCHEMA:
{
  "lens_summary": {
    "people": {"severity": "...", "summary": "...", "evidence": [...]},
    "process": {"severity": "...", "summary": "...", "evidence": [...]},
    "technology": {"severity": "...", "summary": "...", "evidence": [...]},
    "data": {"severity": "...", "summary": "...", "evidence": [...]}
  },
  "impact_records": [
    {
      "lens": "People|Process|Technology|Data",
      "area": "...",
      "impact": "...",
      "severity": "Low|Medium|High",
      "source": "Interview|Document|Mixed"
    }
  ],
  "cia_template_text": "Full filled-out template in text",
  "narrative": "Rich summary narrative...",
  "stakeholder_summaries": [
    {
      "name": "...",
      "interview_id": "...",
      "summary": "...",
      "key_points": [...]
    }
  ]
}
"""

def generate_insights_llm(state: EngagementSummaryState) -> EngagementSummaryState:
    system = CIA_SYSTEM_PROMPT

    user = {
        "engagement_summary": state["engagement_summary"],
        "interviews": state["interviews_data"],
    }

    insights_str = llm_call(
        system,
        json.dumps(user),
        temperature=0.2,
        json_mode=True
    )

    try:
        insights_json = json.loads(insights_str)
    except Exception:
        # even if model fails, we must prevent crash
        insights_json = {"error": "Invalid LLM JSON", "raw": insights_str}

    state["generated_insights"] = insights_json
    return state


# --------------------------
#   NODE 4: Save Insights to DB
# --------------------------

def save_to_db(state: EngagementSummaryState) -> EngagementSummaryState:
    db = state["db"]
    engagement_id = state["engagement_id"]

    completed_ids = sorted(state["completed_interview_ids"])
    insights_json = state["generated_insights"]

    existing = db.query(EngagementInsights).filter_by(
        engagement_id=engagement_id
    ).first()

    if existing:
        existing.insights_json = insights_json
        existing.interviews_used = completed_ids
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
    else:
        new = EngagementInsights(
            engagement_id=engagement_id,
            insights_json=insights_json,
            interviews_used=completed_ids,
        )
        db.add(new)
        db.commit()

    return state


# --------------------------
#   BUILD THE GRAPH
# --------------------------

graph = StateGraph(EngagementSummaryState)

graph.add_node("load_interviews", load_interviews)
graph.add_node("check_if_stale", check_if_stale)
graph.add_node("generate_insights_llm", generate_insights_llm)
graph.add_node("save_to_db", save_to_db)

graph.set_entry_point("load_interviews")

graph.add_edge("load_interviews", "check_if_stale")

graph.add_conditional_edges(
    "check_if_stale",
    lambda state: "generate" if state["needs_regeneration"] else END,
    {
        "generate": "generate_insights_llm",
        END: END,
    },
)

graph.add_edge("generate_insights_llm", "save_to_db")

engagement_summary_agent = graph.compile()