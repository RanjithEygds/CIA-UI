from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any


class EngagementCreate(BaseModel):
    name: Optional[str] = None

class EngagementOut(BaseModel):
    id: str
    name: Optional[str] = None
    document_count: int
    summary: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class DocumentUploadResponse(BaseModel):
    id: str
    filename: str
    size_bytes: int
    category: Optional[str] = None

class EngagementSummaryOut(BaseModel):
    engagement_id: str
    name: Optional[str]
    document_count: int
    documents: List[Dict[str, Any]]
    summary: Optional[str]

class EngagementListItem(BaseModel):
    id: str
    name: Optional[str]
    summary: Optional[str]
    document_count: int
    created_at: Optional[str]
    change_brief: Optional[str] = None
    change_summary: List[Any] = []


class EngagementListOut(BaseModel):
    engagements: List[EngagementListItem]

class InterviewStartIn(BaseModel):
    engagement_id: str
    stakeholder_name: str
    stakeholder_email: EmailStr

class InterviewOut(BaseModel):
    interview_id: str
    engagement_id: str
    status: str

class InterviewFirstIn(BaseModel):
    brief: Optional[str] = Field(default=None, description="Optional change brief to introduce")

class NextQuestionOut(BaseModel):
    question_id: str
    section: str
    section_index: int
    sequence_in_section: int
    question_text: str

class InterviewAnswerIn(BaseModel):
    question_id: str
    answer_text: str

class TranscriptOut(BaseModel):
    interview_id: str
    consent_captured: bool
    transcript: str

class InsightsOut(BaseModel):
    scope: str
    data: Dict[str, Any]


class ImpactGroup(BaseModel):
    name: str
    description: Optional[str] = None
    confidence: Optional[str] = "Low"

class TypeOfChange(BaseModel):
    current: Optional[str] = None
    future: Optional[str] = None
    description: Optional[str] = None
    confidence: Optional[str] = "Low"

class StakeholderUpdate(BaseModel):
    id: Optional[str] = None
    name: str
    email: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    engagement_level: Optional[str] = None

class UpdateContextRequest(BaseModel):
    change_brief: Optional[str] = None
    change_summary: Optional[List[str]] = None
    impacted_groups: Optional[List[ImpactGroup]] = None
    type_of_change: Optional[TypeOfChange] = None
    stakeholders: Optional[List[StakeholderUpdate]] = None

class QuestionUpdate(BaseModel):
    section: Optional[str] = None
    section_index: Optional[int] = None
    question_text: Optional[str] = None
    sequence_in_section: Optional[int] = None

class QuestionCreate(BaseModel):
    question_text: str = Field(..., min_length=1)


class StakeholderUpdatePayload(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    engagement_level: Optional[str] = None


class KeyFinding(BaseModel):
    text: str = Field(..., min_length=5, max_length=300)

class InsightsOut(BaseModel):
    engagement_id: str
    version: str = "insight-v1"
    summary: str  # 100-150 word summary
    key_findings: List[KeyFinding]  # 5-8 findings
    transcript_hash: str  # used for caching 

