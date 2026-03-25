import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Boolean, JSON
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()
UUID_STR = String(36)

class Engagement(Base):
    __tablename__ = "engagements"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # metadata / rollup
    document_count = Column(Integer, default=0)
    summary = Column(Text, nullable=True)  # Agent 1 preview summary

    documents = relationship("Document", back_populates="engagement", cascade="all, delete-orphan")
    interviews = relationship("Interview", back_populates="engagement", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=False)
    filename = Column(String(512), nullable=False)
    path = Column(String(1024), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    category = Column(String(128), nullable=True)  # e.g., SOW, OrgChart, Roadmap
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    engagement = relationship("Engagement", back_populates="documents")


class Interview(Base):
    __tablename__ = "interviews"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=False)
    stakeholder_name = Column(String(255), nullable=False)
    stakeholder_email = Column(String(255), nullable=False)
    status = Column(String(64), default="created")  # created|in_progress|completed|ended
    consent_captured = Column(Boolean, default=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    # stored JSON to support versioned question plan (sections -> list of question IDs)
    questions_plan = Column(JSON, nullable=True)

    engagement = relationship("Engagement", back_populates="interviews")
    answers = relationship("Answer", back_populates="interview", cascade="all, delete-orphan")


class QuestionCatalog(Base):
    """
    Materialized from 'Stakeholder Interview Questions.docx' per engagement.
    Keep stable IDs for strict ordering.
    """
    __tablename__ = "question_catalog"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=False)
    section = Column(String(255), nullable=False)  # e.g., "1. Opening & Consent"
    section_index = Column(Integer, nullable=False)
    sequence_in_section = Column(Integer, nullable=False)  # preserving exact order
    question_text = Column(Text, nullable=False)


class Answer(Base):
    __tablename__ = "answers"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = Column(UUID_STR, ForeignKey("interviews.id"), nullable=False)
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=False)
    question_catalog_id = Column(UUID_STR, ForeignKey("question_catalog.id"), nullable=False)
    section = Column(String(255), nullable=False)
    question_text = Column(Text, nullable=False)
    answer_text = Column(Text, nullable=True)
    timestamp_utc = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # LLM classifiers / QA signals
    response_quality = Column(String(64), nullable=True)  # ok|irrelevant|nonsense|incomplete
    requires_followup = Column(Boolean, default=False)
    metadata_json = Column(JSON, nullable=True)
    interview = relationship("Interview", back_populates="answers")


class Transcript(Base):
    __tablename__ = "transcripts"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    interview_id = Column(UUID_STR, ForeignKey("interviews.id"), nullable=False, unique=True)
    content = Column(Text, nullable=False)  # verbatim Q/A with timestamps + consent flag
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Insights(Base):
    """
    Can store per-interview insights or engagement-level cross-interview insights.
    """
    __tablename__ = "insights"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=True)
    interview_id = Column(UUID_STR, ForeignKey("interviews.id"), nullable=True)
    scope = Column(String(64), nullable=False)  # "interview" | "engagement"
    # JSON storing PP/T/D lenses, severity ratings, evidence tags, validation items
    insights_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CIATemplateRow(Base):
    """
    Rows ready to export to XLSX; golden source capture aligned to EY CIA template.
    """
    __tablename__ = "cia_template_rows"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=False)
    interview_id = Column(UUID_STR, ForeignKey("interviews.id"), nullable=True)  # optional
    process = Column(Text, nullable=True)
    current_state = Column(Text, nullable=True)
    future_state = Column(Text, nullable=True)
    what_is_changing = Column(Text, nullable=True)
    impact = Column(Text, nullable=True)
    change_impact_summary = Column(Text, nullable=True)
    change_insights = Column(Text, nullable=True)
    stakeholder_group = Column(Text, nullable=True)
    pp_td = Column(String(16), nullable=True)  # People|Process|Technology|Data
    benefit_or_challenge = Column(String(16), nullable=True)  # Benefit|Challenge|blank
    # Numeric severities according to EY scale 0..3; nullable if 'Unknown'
    people_degree = Column(Integer, nullable=True)
    people_skills_degree = Column(Integer, nullable=True)
    process_new_or_interim_degree = Column(Integer, nullable=True)
    process_policies_degree = Column(Integer, nullable=True)
    tech_degree = Column(Integer, nullable=True)
    data_reporting_degree = Column(Integer, nullable=True)
    evidence_refs = Column(Text, nullable=True)  # quote refs / doc refs
    confidence = Column(String(16), nullable=True)  # e.g., High|Medium|Low
    validation_required = Column(Boolean, default=False)
    validation_notes = Column(Text, nullable=True)

class EngagementInsights(Base):
    __tablename__ = "engagement_insights"

    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), unique=True, nullable=False)

    # The entire generated output
    insights_json = Column(JSON, nullable=False)

    # List of interview IDs used to generate the insights
    interviews_used = Column(JSON, nullable=False)

    # Optional: version number, future-proofing
    version = Column(Integer, default=1)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    
class EngagementContext(Base):
    """
    Agent-1 materialized context per engagement.
    """
    __tablename__ = "engagement_context"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), unique=True, nullable=False)
    change_brief = Column(Text, nullable=True)     # ~80-120 words
    change_summary_json = Column(JSON, nullable=True)
    type_of_change_json = Column(JSON, nullable=True)
    impacted_groups_json = Column(JSON, nullable=True)  # [{"name": "...", "description":"...", "confidence":"High|Med|Low"}]
    source_docs = Column(JSON, nullable=True)      # doc ids used
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class Stakeholder(Base):
    """
    Stakeholders parsed primarily from Excel; optionally LLM-backed fallback.
    """
    __tablename__ = "stakeholders"
    id = Column(UUID_STR, primary_key=True, default=lambda: str(uuid.uuid4()))
    engagement_id = Column(UUID_STR, ForeignKey("engagements.id"), nullable=False)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    role = Column(String(255), nullable=True)          # e.g., "HR Lead" or title
    department = Column(String(255), nullable=True)
    engagement_level = Column(String(64), nullable=True)  # e.g., Consulted|Engaged|Responsible|Accountable|Informed
    source_document_id = Column(UUID_STR, nullable=True)  # which uploaded doc it came from
    extra_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))