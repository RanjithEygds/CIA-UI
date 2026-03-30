# seed_engagement_data.py

import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..models import Engagement, Stakeholder, Interview, Answer, QuestionCatalog
from ..db import engine

ENGAGEMENT_ID = "1bec2b1a-31a2-465a-938e-0aa95a8af927"

STAKEHOLDERS = [
    {"name": "Alice Martin", "email": "alice@example.com", "role": "Operations Lead", "department": "Operations"},
    {"name": "Brian Singh", "email": "brian@example.com", "role": "HR Manager", "department": "Human Resources"},
    {"name": "Carla Gomez", "email": "carla@example.com", "role": "Tech Architect", "department": "IT"},
    {"name": "David Chen", "email": "dchen@example.com", "role": "Finance Controller", "department": "Finance"},
    {"name": "Evelyn Patel", "email": "epatel@example.com", "role": "Customer Success Lead", "department": "Customer Success"},
]

# --- Slightly varied answers for realism ---
def generate_answer_text(stakeholder_name, question_text, variation_seed):
    base = {
        1: f"{stakeholder_name} oversees key responsibilities and is focused on current priorities aligned with transformation goals.",
        2: "The group is defined by its core functional responsibilities and cross-team collaboration.",
        3: "The most impacted top-level process is workflow automation and data-driven decision support.",
        4: "Today the process is manual, fragmented, and relies heavily on informal communication.",
        5: "Future state involves streamlined workflows with automation and standardised decision paths.",
        6: "Key changes include modified roles, new tools, and enhanced data visibility.",
        7: "Change size: Medium-to-High depending on function.",
        8: "Overall feeling: cautiously optimistic.",
        9: "Current mood: mixed but trending positive.",
        10: "Change appetite varies but is improving.",
        11: "Past success came from strong governance and communication.",
        12: "Must-haves include training, clarity, and leadership alignment.",
        13: "Success looks like a unified, efficient, and technology-enabled organisation.",
        14: "Most affected areas include Operations, IT, and Finance.",
        15: "Expected changes include process redesign, new responsibilities, and increased digital enablement.",
        16: "Additional stakeholder groups include partners and external service teams.",
        17: "Impacts peak during go-live and stabilisation.",
        18: "Yes, parallel initiatives may increase load.",
        19: "Key challenges include adoption resistance and integration issues.",
        20: "People will need training, support, and communication.",
        21: "New skills include analytics, workflow navigation, and cross-functional coordination.",
        22: "Benefits include efficiency, reduced risk, and improved customer outcomes.",
        23: "Benefits will be generally well-received with proper communication.",
        24: "The summary sounds accurate with minor clarifications.",
        25: "Validation should involve key SMEs and process owners."
    }
    # Add small variation
    return base[variation_seed] + f" (perspective: {stakeholder_name})"


with Session(engine) as session:

    # ✅ 1. Seed Stakeholders
    stakeholder_ids = []
    for s in STAKEHOLDERS:
        st = Stakeholder(
            engagement_id=ENGAGEMENT_ID,
            name=s["name"],
            email=s["email"],
            role=s["role"],
            department=s["department"],
            engagement_level="Engaged",
            extra_json={"seeded": True},
        )
        session.add(st)
        session.flush()  # ensures st.id is populated
        stakeholder_ids.append(st.id)

    # ✅ 2. Fetch all question catalog rows
    questions = (
        session.query(QuestionCatalog)
        .filter(QuestionCatalog.engagement_id == ENGAGEMENT_ID)
        .order_by(QuestionCatalog.section_index, QuestionCatalog.sequence_in_section)
        .all()
    )

    # ✅ 3. Create 5 completed interviews
    for i, stakeholder_id in enumerate(stakeholder_ids):
        stakeholder = session.query(Stakeholder).get(stakeholder_id)

        interview = Interview(
            engagement_id=ENGAGEMENT_ID,
            stakeholder_name=stakeholder.name,
            stakeholder_email=stakeholder.email,
            status="completed",
            consent_captured=True,
            started_at=datetime.now(timezone.utc),
            ended_at=datetime.now(timezone.utc),
            questions_plan={"sections": [q.id for q in questions]}
        )
        session.add(interview)
        session.flush()

        # ✅ 4. Create answers for every question
        for q_index, q in enumerate(questions, start=1):
            answer = Answer(
                interview_id=interview.id,
                engagement_id=ENGAGEMENT_ID,
                question_catalog_id=q.id,
                section=q.section,
                question_text=q.question_text,
                answer_text=generate_answer_text(
                    stakeholder_name=stakeholder.name,
                    question_text=q.question_text,
                    variation_seed=q_index,
                ),
                response_quality="ok",
                requires_followup=False,
                metadata_json={"seeded": True}
            )
            session.add(answer)

    session.commit()

print("✅ Seed data inserted successfully.")
