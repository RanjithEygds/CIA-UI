from typing import List, Dict

from app.services.transcripts_service import get_transcripts_for_engagement
from .llm import llm_call
from ..schemas import InsightsOut, KeyFinding
from ..models import Engagement, EngagementInsights
from sqlalchemy.orm import Session
import json
import hashlib
import json
from typing import Dict

def hash_transcripts(transcripts):
    """
    transcripts = list of completed interview transcript dicts
    """
    payload = json.dumps(transcripts, sort_keys=True)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()

INSIGHTS_SYSTEM_PROMPT = """
You are an expert insights synthesizer for Change Impact Assessment interviews.

STRICT RULES:
- DO NOT invent content. Base everything only on the provided transcripts.
- Provide a single brief summary (100–150 words).
- Provide 5–8 key findings; each finding must be 20–30 words.
- Key findings must reference actual interview patterns, themes, or recurring issues.
- No corporate buzzwords, no filler language.
- Output MUST be valid JSON.
"""

def generate_insights_with_llm(engagement_id: str, transcripts: list) -> Dict:
    transcript_text = json.dumps(transcripts, indent=2)

    user_prompt = f"""
ENGAGEMENT_ID: {engagement_id}

TRANSCRIPTS (all completed interviews):
{transcript_text}

REQUIREMENTS:
- Summary: 100-150 words
- Key findings: 5-8 bullet items, each 20-30 words
Return JSON in schema:
{{ 
  "summary": "...", 
  "key_findings": [{{"text": "..."}}, ...]
}}
"""

    raw = llm_call(
        system=INSIGHTS_SYSTEM_PROMPT,
        user=user_prompt,
        temperature=0,
        json_mode=True
    )

    data = json.loads(raw)
    return data


def get_engagement_insights(db: Session, engagement_id: str) -> Dict:
    # 1) validate engagement
    eng = db.query(Engagement).get(engagement_id)
    if not eng:
        raise Exception("Engagement not found")

    # 2) pull completed transcripts
    transcripts_data = get_transcripts_for_engagement(db, engagement_id)
    completed = transcripts_data["completed_interviews"]
    
    if not completed or len(completed) == 0:
            return {
                "engagement_id": engagement_id,
                "engagement_name": eng.name,
                "summary": None,
                "key_findings": [],
                "cached": False,
                "message": "No completed interviews found. Please complete at least one interview to generate insights."
            }

    # 3) compute hash to detect changes
    new_hash = hash_transcripts(completed)

    # 4) check existing insights
    cached = db.query(EngagementInsights).filter_by(engagement_id=engagement_id).first()

    if cached and cached.transcript_hash == new_hash:
        # ✅ no recompute needed
        return {
            "engagement_id": engagement_id,
            "engagement_name": eng.name,
            "summary": cached.summary,
            "key_findings": json.loads(cached.key_findings_json),
            "cached": True
        }

    # 5) generate new insights
    generated = generate_insights_with_llm(engagement_id, completed)

    # 6) store/update cache
    if not cached:
        cached = EngagementInsights(engagement_id=engagement_id)

    cached.summary = generated["summary"]
    cached.key_findings_json = json.dumps(generated["key_findings"])
    cached.transcript_hash = new_hash

    db.add(cached)
    db.commit()

    return {
        "engagement_id": engagement_id,
        "engagement_name": eng.name,
        "summary": cached.summary,
        "key_findings": json.loads(cached.key_findings_json),
        "cached": False
    }