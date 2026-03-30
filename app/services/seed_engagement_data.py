import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.services.llm import llm_call
from ..models import Engagement, Stakeholder, Interview, Answer, QuestionCatalog
from ..db import engine
import random

SENTIMENT_OPTIONS = ["positive", "neutral", "negative", "mixed"]

def pick_random_sentiment() -> str:
    return random.choice(SENTIMENT_OPTIONS)


ENGAGEMENT_ID = "e864554e-9792-4abb-8b1c-a917d247721e"

# --------------------------------------------------------------------
# 1. Impacted Groups (2 Stakeholders Each)
# --------------------------------------------------------------------

IMPACTED_GROUPS = {
    "Claims": [
        {"name": "Priya Menon", "email": "priya.menon@ey.com", "role": "Claims Specialist", "department": "Claims"},
        {"name": "Rahul Verma", "email": "rahul.verma@ey.com", "role": "Senior Claims Analyst", "department": "Claims"},
    ],
    "Underwriting": [
        {"name": "Sophia Lane", "email": "sophia.lane@ey.com", "role": "Underwriter", "department": "Underwriting"},
        {"name": "Marcus Lee", "email": "marcus.lee@ey.com", "role": "Risk Underwriter", "department": "Underwriting"},
    ],
    "Policy Servicing": [
        {"name": "Nisha Arora", "email": "nisha.arora@ey.com", "role": "Policy Service Associate", "department": "Policy Servicing"},
        {"name": "John Patel", "email": "john.patel@ey.com", "role": "Policy Service Lead", "department": "Policy Servicing"},
    ],
    "Support Functions": [
        {"name": "Emily Rogers", "email": "emily.rogers@ey.com", "role": "Business Support Officer", "department": "Support Functions"},
        {"name": "Arjun Desai", "email": "arjun.desai@ey.com", "role": "IT Support Analyst", "department": "Support Functions"},
    ],
    "HR Teams": [
        {"name": "Tanvi Shah", "email": "tanvi.shah@ey.com", "role": "HR Business Partner", "department": "HR"},
        {"name": "Eric Gomez", "email": "eric.gomez@ey.com", "role": "Talent Development Manager", "department": "HR"},
    ],
}

# --------------------------------------------------------------------
# 2. LLM powered answers
# --------------------------------------------------------------------
def generate_llm_answer(
    group: str,
    stakeholder_name: str,
    question_text: str,
    engagement_context: str,
    sentiment: str
) -> str:

    system_prompt = f"""
    You are a senior change consultant generating realistic interview answers.
    The stakeholder you are role-playing is from the group: {group}.
    Name: {stakeholder_name}

    ENGAGEMENT CONTEXT:
    {engagement_context}

    RESPONSE GUIDELINES:
    - Tone must match this sentiment: {sentiment}
    - Be specific to the group's real work (Claims, Underwriting, HR, etc.)
    - Mention actual processes, tools, pain points, or workflows
    - Be natural and conversational, not robotic
    - Length: 2–4 sentences
    """

    user_prompt = f"""
    Interview question:
    \"\"\"{question_text}\"\"\"    

    Provide the answer as if the stakeholder is responding honestly and spontaneously.
    """

    try:
        response = llm_call(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.35,
            json_mode=False
        )
        return response.strip()

    except Exception:
        return f"[Fallback Answer | Sentiment={sentiment}] {question_text}"

# --------------------------------------------------------------------
# 3. Get enaggement context
# --------------------------------------------------------------------
def get_engagement_context(session, engagement_id: str) -> str:
    eng = session.query(Engagement).get(engagement_id)
    if not eng:
        return ""
    return eng.summary or "No engagement summary available."

# --------------------------------------------------------------------
# 4. Seeder Execution
# --------------------------------------------------------------------

with Session(engine) as session:
    eng_context = get_engagement_context(session, ENGAGEMENT_ID)

    # ✅ Insert all stakeholders
    stakeholder_records = []

    for group_name, group_members in IMPACTED_GROUPS.items():
        for member in group_members:
            st = Stakeholder(
                engagement_id=ENGAGEMENT_ID,
                name=member["name"],
                email=member["email"],
                role=member["role"],
                department=member["department"],
                engagement_level="Engaged",
                extra_json={"seeded": True, "group": group_name},
            )
            session.add(st)
            session.flush()
            stakeholder_records.append((st.id, group_name, st.name))

    # ✅ Fetch Questions
    questions = (
        session.query(QuestionCatalog)
        .filter(QuestionCatalog.engagement_id == ENGAGEMENT_ID)
        .order_by(QuestionCatalog.section_index, QuestionCatalog.sequence_in_section)
        .all()
    )

    # ✅ Create interviews (with group-specific answers)
    for stake_id, group, name in stakeholder_records:
        sentiment = pick_random_sentiment()

        interview = Interview(
            engagement_id=ENGAGEMENT_ID,
            stakeholder_name=name,
            stakeholder_email=f"{name.replace(' ', '.').lower()}@ey.com",
            status="completed",
            consent_captured=True,
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
            questions_plan={"sections": [q.id for q in questions]}
        )
        session.add(interview)
        session.flush()

        # ✅ Insert Answers
        for idx, q in enumerate(questions, start=1):
            answer_text = generate_llm_answer(
                        group=group,
                        stakeholder_name=name,
                        question_text=q.question_text,
                        engagement_context=eng_context,
                        sentiment=sentiment
                    )

            answer = Answer(
                interview_id=interview.id,
                engagement_id=ENGAGEMENT_ID,
                question_catalog_id=q.id,
                section=q.section,
                question_text=q.question_text,
                answer_text=answer_text,
                response_quality="ok",
                requires_followup=False,
                metadata_json={"seeded": True, "group": group},
            )
            session.add(answer)

    session.commit()

print("✅ Enhanced group-specific seed data inserted successfully!")