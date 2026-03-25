from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class QAItem(BaseModel):
    section: str
    question_id: int
    question_text: str
    answer_text: Optional[str] = None
    response_quality: Optional[str] = None  # ok|irrelevant|nonsense|incomplete
    requires_followup: bool = False
    evidence_ref: Optional[str] = None  # timestamp/ref id

class FindingsObject(BaseModel):
    # structural evidence for CIA
    stakeholder_group: Optional[str]
    process: Optional[str]
    current_state: Optional[str]
    future_state: Optional[str]
    what_is_changing: Optional[str]
    impact: Optional[str]
    pp_td: Optional[str]  # People|Process|Technology|Data
    severities: Dict[str, Optional[int]]  # e.g., {"people_degree": 2, ...} Unknown => None
    evidence_refs: List[str]
    confidence: str
    validation_required: bool
    validation_notes: Optional[str]