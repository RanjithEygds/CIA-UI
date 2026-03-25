# app/services/agent2_interview.py
import json

from sqlalchemy.orm import Session
from ..models import Engagement, QuestionCatalog, Answer, Interview
from .llm import llm_call

def initialize_interview_plan(db: Session, engagement_id: int):
    # sections ordered lexicographically (relies on 5.1, 5.2 ... naming)
    qlist = db.query(QuestionCatalog).filter(QuestionCatalog.engagement_id==engagement_id).order_by(
        QuestionCatalog.section_index.asc(), QuestionCatalog.sequence_in_section.asc()).all()
    plan = {}
    for q in qlist:
        plan.setdefault(q.section, []).append(q.id)
    return plan

def refine_question_for_user(question_text, prev_answers, engagement_summary=None):
    system = """
    You rephrase interview questions using the user's previously given answers
    AND engagement context — but you MUST NOT change the meaning of the question.

    Rules:
    - Rephrase only if it makes the question clearer or more tailored.
    - If user context does NOT add meaningful clarity → return the original question verbatim.
    - DO NOT add new facts.
    - DO NOT speculate or be creative.
    - DO NOT change the interpretation or scope.
    - Keep it short, natural, and interviewer-friendly.
    - If question is a wrap-up or validation question (e.g., "Here are the key takeaways..."):
        → Replace with a summarization prompt based on the user's answers.
    """

    user = f"""
    ORIGINAL QUESTION:
    {question_text}

    RECENT USER ANSWERS:
    {prev_answers or "(none)"}

    ENGAGEMENT SUMMARY:
    {engagement_summary or "(none)"}
    """

    refined = llm_call(system, user)

    # fail-safe: if LLM deviates → fallback
    if not refined or len(refined.strip()) < 5:
        return question_text

    return refined.strip()


def is_validation_question(text: str):
    text = text.lower()
    return (
        "key takeaways" in text
        or "does this sound accurate" in text
        or "readback" in text
        or "summary" in text
    )


def build_dynamic_summary(db: Session, interview: Interview):
    answers = db.query(Answer).filter(
        Answer.interview_id == interview.id
    ).order_by(Answer.timestamp_utc.asc()).all()

    if not answers:
        return None

    qa_text = "\n".join([f"Q: {a.question_text}\nA: {a.answer_text}" for a in answers])

    system = """
    Create a clear, neutral summary of what the stakeholder has said so far.
    DO NOT invent. Only summarize the given answers. Keep to 3–6 bullets.
    """
    return llm_call(system, qa_text)


def get_next_question(db: Session, interview: Interview):
    # Find next unanswered question in plan
    for section, qids in interview.questions_plan.items():
        for qid in qids:
            exists = db.query(Answer).filter(
                Answer.interview_id == interview.id,
                Answer.question_catalog_id == qid
            ).first()

            if not exists:
                q = db.query(QuestionCatalog).get(qid)

                # Get previous answers
                prev = db.query(Answer).filter(
                    Answer.interview_id == interview.id
                ).order_by(Answer.timestamp_utc.asc()).all()
                prev_formatted = "\n".join([f"- {a.question_text}: {a.answer_text}" for a in prev])

                # Special case: validation question
                if is_validation_question(q.question_text):
                    summary = build_dynamic_summary(db, interview)
                    if summary:
                        refined_text = (
                            "Here are the key takeaways so far:\n"
                            f"{summary}\n\nDoes this look accurate?"
                        )
                    else:
                        refined_text = q.question_text
                else:
                    eng = db.query(Engagement).get(interview.engagement_id)
                    refined_text = refine_question_for_user(
                        q.question_text,
                        prev_formatted,
                        eng.summary if eng else None
                    )

                return {
                    "id": q.id,
                    "section": q.section,
                    "text": refined_text,
                    "section_index": q.section_index,
                    "sequence_in_section": q.sequence_in_section
                }

    return None


def evaluate_answer_quality(answer_text: str, question_text: str):
    system = "You are a quality checker. Classify response strictly as one of: ok|irrelevant|nonsense|incomplete. If incomplete, suggest a single short follow-up."
    user = f"Question: {question_text}\nAnswer: {answer_text}\nReturn JSON: {{'quality':'ok|irrelevant|nonsense|incomplete','requires_followup':true|false}}"
    out = llm_call(system, user)
    # naive parse (replace with robust JSON parse)
    quality = "ok" if "ok" in out else ("incomplete" if "incomplete" in out else ("irrelevant" if "irrelevant" in out else ("nonsense" if "nonsense" in out else "ok")))
    requires_followup = "true" in out.lower()
    return quality, requires_followup

def build_section_readback_if_ready(db: Session, interview: Interview, section: str):
    plan_qids = interview.questions_plan.get(section, [])

    # Fetch all answers for this section
    answers = db.query(Answer).filter(
        Answer.interview_id == interview.id,
        Answer.section == section
    ).order_by(Answer.timestamp_utc.asc()).all()

    # Group by question
    answers_by_question = {}
    for a in answers:
        answers_by_question.setdefault(a.question_catalog_id, []).append(a)

    # Must have at least one answer for each qid
    if len(answers_by_question) < len(plan_qids):
        return None

    final_answers = []
    for qid in plan_qids:
        if qid not in answers_by_question:
            return None

        last = answers_by_question[qid][-1]

        # Only accept OK answers
        if last.response_quality != "ok":
            return None

        final_answers.append(last)

    # Build readback now
    qa_text = "\n".join([f"Q: {a.question_text}\nA: {a.answer_text}" for a in final_answers])

    system = (
        "Produce a concise read-back strictly from stakeholder final answers. "
        "No new content. If information is missing, say 'Unknown'."
    )
    return llm_call(system, qa_text)

def finalize_interview_summary_and_transcript(db: Session, interview: Interview):
    answers = db.query(Answer).filter(Answer.interview_id==interview.id).order_by(Answer.timestamp_utc.asc()).all()
    transcript_lines = [f"[{a.timestamp_utc.isoformat()}] Q: {a.question_text}\nA: {a.answer_text}" for a in answers]
    transcript_text = "\n\n".join(transcript_lines)

    # Final summary strictly from the answers
    system = "Create a precise summary of the interview strictly from the transcript; do not invent."
    user = transcript_text[:8000]  # truncate if needed
    final_summary = llm_call(system, user)

    return transcript_text, final_summary

def classify_user_intent(question_text, user_text):
    system = """
    You classify whether the user is:
      - Asking for clarification of the question
      - Providing an answer

    Return ONLY ONE WORD:
      "clarification"
      "answer"

    Rules:
      - If user asks "what do you mean", "could you clarify", "explain", "examples", "not sure", etc → clarification
      - If user tries answering even partially → answer
    """

    user = f"QUESTION: {question_text}\nUSER: {user_text}"
    out = llm_call(system, user).strip().lower()

    if "clarification" in out:
        return "clarification"
    return "answer"


def generate_clarification(db, interview, question_text):
    # load engagement summary
    eng = db.query(Engagement).get(interview.engagement_id)
    # load previous answers
    prev_answers = db.query(Answer)\
        .filter(Answer.interview_id == interview.id)\
        .order_by(Answer.timestamp_utc.asc())\
        .all()
    prev_snippets = "\n".join([f"- {a.question_text}: {a.answer_text}" for a in prev_answers])

    system = """
        You are CIMMIE. Provide a helpful, simple clarification of the question.
        Rules:
        - Use ONLY the context provided.
        - Explain what the question is asking for.
        - Give 1 example answer.
        - DO NOT repeat the question text.
        - DO NOT rephrase the question.
        - DO NOT invent new facts.
    """
    user = f"Question: {question_text}\nPrevious: {prev_snippets or '(none)'}\nEng Summary: {eng.summary}"
    return llm_call(system, user)

def evaluate_answer(db, interview, question_text, answer_text):
    eng = db.query(Engagement).get(interview.engagement_id)
    prev_answers = db.query(Answer).filter(
        Answer.interview_id == interview.id
    ).order_by(Answer.timestamp_utc.asc()).all()

    prev = "\n".join([f"- {a.question_text}: {a.answer_text}" for a in prev_answers][-6:])
    system = """
    Evaluate the user's answer strictly for relevance and basic sufficiency.
    This is a Change Impact Assessment interview — there are no right or wrong answers.

    Quality rules:
    - "ok" → The answer directly addresses the question (even briefly).
    - "irrelevant" → Answer does not relate to the question.
    - "nonsense" → Answer is incoherent, empty, or meaningless.
    - "incomplete" → Only if the answer is missing essential meaning AND a follow‑up would clarify it.

    Do NOT mark an answer incomplete just because it is short.
    Do NOT ask for more detail unless it's needed for understanding.

    Return strict JSON:
    {
    "quality": "...",
    "followup": "short follow-up question or empty string"
    }
    """

    user = f"""
    QUESTION:
    {question_text}

    ANSWER:
    {answer_text}

    ENGAGEMENT SUMMARY:
    {eng.summary or "None"}

    RECENT ANSWERS:
    {prev or "None"}
    """
    out = llm_call(system, user, json_mode=True)
    data = json.loads(out)
    return data["quality"], data["followup"]
