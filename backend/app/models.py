from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from .database import Base

class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    answer_key_status = Column(String, default="no_key") # pending | matched | no_key
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    questions = relationship("Question", back_populates="paper", cascade="all, delete-orphan")

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False)
    question_number = Column(Integer, nullable=False)
    raw_content = Column(String, nullable=False)
    question_type = Column(String, nullable=False) # MCQ | AR | MATCH | NUMERICAL
    options = Column(String, nullable=True) # JSON string representation
    correct_answer = Column(String, nullable=True)
    explanation = Column(String, nullable=True)
    tagging_status = Column(String, default="untagged") # untagged | subject_tagged | fully_tagged | needs_review
    images = Column(String, nullable=True) # JSON list of string filenames
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def images_list(self) -> list[str]:
        if not self.images:
            return []
        import json
        try:
            return json.loads(self.images)
        except Exception:
            return []

    # Relationships
    paper = relationship("Paper", back_populates="questions")
    tags = relationship("QuestionTag", uselist=False, back_populates="question", cascade="all, delete-orphan")
    attempts = relationship("Attempt", back_populates="question", cascade="all, delete-orphan")
    routing_logs = relationship("RoutingLog", back_populates="question", cascade="all, delete-orphan")

class QuestionTag(Base):
    __tablename__ = "question_tags"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), unique=True, nullable=False)
    subject = Column(String, nullable=True)
    chapter = Column(String, nullable=True)
    concept = Column(String, nullable=True)
    difficulty = Column(String, nullable=True) # easy | medium | hard
    tag_source = Column(String, default="ai") # ai | manual
    confidence = Column(Float, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    question = relationship("Question", back_populates="tags")

class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    time_spent = Column(Integer, nullable=False) # in seconds
    result = Column(String, nullable=False) # correct | wrong | skipped
    selected_answer = Column(String, nullable=True)
    attempt_number = Column(Integer, default=1)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    question = relationship("Question", back_populates="attempts")

class RoutingLog(Base):
    __tablename__ = "routing_logs"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), nullable=False)
    destination = Column(String, nullable=False) # anki | notion
    status = Column(String, nullable=False) # success | failed
    pushed_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    question = relationship("Question", back_populates="routing_logs")
