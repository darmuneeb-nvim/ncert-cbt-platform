from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

# --- Tag Schemas ---
class QuestionTagBase(BaseModel):
    subject: Optional[str] = None
    chapter: Optional[str] = None
    concept: Optional[str] = None
    difficulty: Optional[str] = None # easy, medium, hard
    tag_source: str = "ai"
    confidence: Optional[float] = None

class QuestionTagUpdate(BaseModel):
    subject: Optional[str] = None
    chapter: Optional[str] = None
    concept: Optional[str] = None
    difficulty: Optional[str] = None

class QuestionTagResponse(QuestionTagBase):
    id: int
    question_id: int
    updated_at: datetime

    class Config:
        from_attributes = True

# --- Attempt Schemas ---
class AttemptCreate(BaseModel):
    question_id: int
    time_spent: int # seconds
    selected_answer: Optional[str] = None
    result: str # correct, wrong, skipped

class AttemptResponse(BaseModel):
    id: int
    question_id: int
    time_spent: int
    result: str
    selected_answer: Optional[str] = None
    attempt_number: int
    timestamp: datetime

    class Config:
        from_attributes = True

# --- Question Schemas ---
class QuestionBase(BaseModel):
    question_number: int
    raw_content: str
    question_type: str # MCQ, AR, MATCH, NUMERICAL
    options: Optional[str] = None # JSON string
    correct_answer: Optional[str] = None
    explanation: Optional[str] = None
    tagging_status: str = "untagged"

class QuestionResponse(QuestionBase):
    id: int
    paper_id: int
    created_at: datetime
    tags: Optional[QuestionTagResponse] = None
    last_attempt_time: Optional[int] = None

    class Config:
        from_attributes = True

class QuestionDetailResponse(QuestionResponse):
    attempts: List[AttemptResponse] = []

    class Config:
        from_attributes = True

# --- Paper Schemas ---
class PaperBase(BaseModel):
    filename: str
    answer_key_status: str

class PaperResponse(PaperBase):
    id: int
    created_at: datetime
    question_count: int = 0

    class Config:
        from_attributes = True

# --- Test Schemas ---
class TestGenerateRequest(BaseModel):
    subject: Optional[str] = None
    subjects: Optional[List[str]] = None
    chapter: Optional[str] = None
    concept: Optional[str] = None
    difficulty: Optional[str] = None
    difficulties: Optional[List[str]] = None
    limit: int = 30
    subject_limits: Optional[Dict[str, int]] = None
    mode: str = "practice"

class TestSubmissionItem(BaseModel):
    question_id: int
    selected_answer: Optional[str] = None
    time_spent: int # seconds

class TestSubmissionRequest(BaseModel):
    submissions: List[TestSubmissionItem]

class TestSubmissionResult(BaseModel):
    attempted: int
    correct: int
    wrong: int
    skipped: int
    score: float
    accuracy: float
    details: List[AttemptResponse]

# --- Analytics/Dashboard Schemas ---
class SubjectStat(BaseModel):
    subject: str
    total_questions: int
    attempted: int
    correct: int
    accuracy: float

class ConceptStat(BaseModel):
    concept: str
    attempts: int
    accuracy: float

class DashboardStatsResponse(BaseModel):
    total_questions: int
    total_attempts: int
    average_accuracy: float
    average_time_per_question: float
    subject_wise: List[SubjectStat]
    weak_concepts: List[ConceptStat]
    fast_correct: int
    slow_correct: int
    fast_wrong: int
    slow_wrong: int

# --- In-app Flashcard Schemas ---
class FlashcardReviewRequest(BaseModel):
    grade: int # 1 (wrong), 2 (easy/correct), etc. to trigger SR interval shifts

# --- Answer Key Submission Schema ---
class AnswerKeySubmitRequest(BaseModel):
    answers: Dict[str, str] # e.g. {"1": "A", "2": "B", "3": "12.5"}

# --- Bulk Actions Schemas ---
class BulkTagRequest(BaseModel):
    question_ids: List[int]
    subject: Optional[str] = None
    chapter: Optional[str] = None
    concept: Optional[str] = None
    difficulty: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    question_ids: List[int]
