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
    images_list: Optional[List[str]] = None

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
    chapters: Optional[List[str]] = None
    concept: Optional[str] = None
    difficulty: Optional[str] = None
    difficulties: Optional[List[str]] = None
    limit: int = 30
    subject_limits: Optional[Dict[str, int]] = None
    mode: str = "practice"
    paper_ids: Optional[List[int]] = None

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

# --- Structured AI Extraction Schemas ---
class ExtractedQuestion(BaseModel):
    question_number: int = Field(description="The integer index of the question (e.g., 1, 2, 51)")
    raw_content: str = Field(description="The text of the question in markdown format with equations in LaTeX")
    question_type: str = Field(default="MCQ", description="One of: 'MCQ', 'AR', 'MATCH', 'NUMERICAL'")
    options: Optional[List[str]] = Field(
        default=None, 
        description="For MCQ, exactly 4 option text strings with option letter/number prefixes removed"
    )
    correct_answer: Optional[str] = Field(default=None, description="The correct answer option (e.g. A, B, C, D) if embedded or detected")
    explanation: Optional[str] = Field(default=None, description="Solution or explanation text if found")
    subject: Optional[str] = Field(default=None, description="Subject: 'Physics', 'Chemistry', 'Biology', or 'Mathematics'")
    chapter: Optional[str] = Field(default=None, description="Chapter or topic title (e.g., 'Ecosystem', 'Electromagnetic Induction')")
    difficulty: Optional[str] = Field(default=None, description="'easy', 'medium', or 'hard'")
    confidence: Optional[float] = Field(default=1.0, description="Extraction confidence score from 0.0 to 1.0")
    images: Optional[List[str]] = Field(default=None, description="Filenames of matched diagram payloads if applicable")

class PaperExtractionResult(BaseModel):
    questions: List[ExtractedQuestion] = Field(default_factory=list)
    answer_key_mapping: Optional[Dict[str, str]] = Field(
        default=None, 
        description="Mapping of question number to answer (e.g., {'1': 'A', '2': 'B'}) if an answer key was detected"
    )

