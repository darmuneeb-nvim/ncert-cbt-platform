import os
import json
import logging
import time
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime

from .config import settings
from .models import Question, QuestionTag
from .database import SessionLocal

logger = logging.getLogger(__name__)

TAXONOMY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "taxonomy.json"
)

def load_taxonomy() -> Dict[str, Any]:
    """Loads the locked NCERT taxonomy JSON."""
    if not os.path.exists(TAXONOMY_PATH):
        logger.error(f"Taxonomy file not found at {TAXONOMY_PATH}!")
        return {}
    try:
        with open(TAXONOMY_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading taxonomy: {str(e)}")
        return {}

def run_batch_tagging(db: Session, batch_size: int = 20) -> int:
    """
    Pulls untagged or partially tagged questions, requests Gemini to tag them in a batch,
    and updates the database with the results.
    Returns the count of successfully tagged questions.
    """
    if not settings.gemini_api_key:
        logger.warning("GEMINI_API_KEY is not set. Skipping AI tagging.")
        return 0

    # Load taxonomy
    taxonomy = load_taxonomy()
    if not taxonomy:
        logger.warning("Taxonomy is empty. Skipping AI tagging.")
        return 0

    # Fetch questions that need tagging
    # Priority: 1. untagged, 2. subject_tagged (but not fully tagged), and source is not manual
    questions_to_tag = db.query(Question).outerjoin(QuestionTag).filter(
        Question.tagging_status.in_(["untagged", "subject_tagged"]),
        (QuestionTag.tag_source != "manual") | (QuestionTag.id == None)
    ).limit(batch_size).all()

    if not questions_to_tag:
        logger.info("No questions require tagging at the moment.")
        return 0

    logger.info(f"Preparing to tag a batch of {len(questions_to_tag)} questions...")

    # Build prompt and batch data
    batch_data = []
    for q in questions_to_tag:
        batch_data.append({
            "id": q.id,
            "type": q.question_type,
            "content": q.raw_content,
            "options": json.loads(q.options) if q.options else None
        })

    from .parser import get_gemini_model
    model = get_gemini_model()
    if not model:
        logger.warning("Failed to initialize Gemini model. Skipping AI tagging.")
        return 0

    prompt = f"""
You are an AI tagging engine for JEE/NEET questions.
Your goal is to tag the provided batch of questions against a locked NCERT taxonomy.

Locked NCERT Taxonomy Structure (Subject -> Chapter -> Concept):
{json.dumps(taxonomy, indent=2)}

Tagging Rules:
1. Subject: Must be one of the top-level keys in the taxonomy: "Physics", "Chemistry", "Biology", or "Mathematics".
2. Chapter: Must match exactly one of the chapters listed under that Subject. If none matches, pick the closest fit from the list.
3. Concept: Must match exactly one of the concepts under that Chapter. If none matches, pick the closest fit.
4. Difficulty: Must be one of:
   - "easy": Direct recall of factual knowledge from standard NCERT lines.
   - "medium": Direct application of a concept or standard formula in a new situation.
   - "hard": Multi-step reasoning or combining multiple concepts across chapters.
5. Confidence: A decimal from 0.0 to 1.0. If you are highly uncertain, give a score below 0.7.

Question Batch:
{json.dumps(batch_data, indent=2)}

Return the tagging results STRICTLY as a JSON object with this schema:
{{
  "tags": [
    {{
      "id": int,
      "subject": "string",
      "chapter": "string",
      "concept": "string",
      "difficulty": "easy" | "medium" | "hard",
      "confidence": float
    }}
  ]
}}
"""
    try:
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        result = json.loads(response.text)
        tagged_results = result.get("tags", [])

        tagged_count = 0
        for tag_info in tagged_results:
            q_id = tag_info.get("id")
            question = db.query(Question).filter(Question.id == q_id).first()
            if not question:
                continue

            # Fetch or create the tag record
            tag = db.query(QuestionTag).filter(QuestionTag.question_id == q_id).first()
            if not tag:
                tag = QuestionTag(question_id=q_id)
                db.add(tag)

            # Update tag details
            tag.subject = tag_info.get("subject")
            tag.chapter = tag_info.get("chapter")
            tag.concept = tag_info.get("concept")
            tag.difficulty = tag_info.get("difficulty")
            tag.confidence = tag_info.get("confidence", 1.0)
            tag.tag_source = "ai"
            tag.updated_at = datetime.utcnow()

            # Determine tagging status
            confidence = tag.confidence or 0.0
            if confidence < 0.7:
                question.tagging_status = "needs_review"
            else:
                question.tagging_status = "fully_tagged"

            db.commit()
            tagged_count += 1

        logger.info(f"Successfully tagged {tagged_count} out of {len(questions_to_tag)} questions.")
        return tagged_count

    except Exception as e:
        logger.error(f"Batch tagging failed: {str(e)}")
        # In case of API failure or JSON parse error, tag subject only as fallback if possible
        # to ensure they are CBT-eligible, but mark them as untagged/needs_review.
        db.rollback()
        return 0

def run_subject_only_tagging_fallback(db: Session):
    """
    Fallback method to run low-cost or rule-based subject prediction.
    Ensures questions have AT LEAST a Subject tag so they are CBT eligible.
    """
    untagged_questions = db.query(Question).outerjoin(QuestionTag).filter(
        Question.tagging_status == "untagged",
        (QuestionTag.id == None) | (QuestionTag.subject == None)
    ).all()

    for q in untagged_questions:
        text = q.raw_content.lower()
        predicted_subject = None
        
        # 1. Inspect keyword matches
        if any(w in text for w in ["velocity", "force", "acceleration", "optics", "charge", "current", "magnetic", "lens", "mass", "motion", "gravity", "energy", "work", "friction", "speed"]):
            predicted_subject = "Physics"
        elif any(w in text for w in ["molecule", "atom", "reaction", "acid", "base", "valency", "bond", "equilibrium", "organic", "mol", "nacl", "dissolved", "concentration", "molar", "compound", "chemical", "solvent", "solution"]):
            predicted_subject = "Chemistry"
        elif any(w in text for w in ["cell", "plant", "organ", "chromosome", "dna", "rna", "blood", "heart", "respiration", "species", "taxon", "genus", "family", "order", "class", "phylum", "kingdom", "binomial", "nomenclature", "botany", "zoology", "organism", "living", "reproduction"]):
            predicted_subject = "Biology"
        elif any(w in text for w in ["derivative", "integral", "matrix", "determinant", "function", "probability", "trigonometry", "vector", "geometry", "equation", "solve", "value of"]):
            predicted_subject = "Mathematics"
            
        # 2. Context-aware file fallback if no direct keyword match
        if not predicted_subject:
            paper_filename = q.paper.filename.lower() if q.paper else ""
            if any(w in paper_filename for w in ["botany", "zoology", "biology", "bio"]):
                predicted_subject = "Biology"
            elif any(w in paper_filename for w in ["chemistry", "chem"]):
                predicted_subject = "Chemistry"
            elif any(w in paper_filename for w in ["physics", "phy"]):
                predicted_subject = "Physics"
            elif any(w in paper_filename for w in ["math", "mathematics", "jee"]):
                predicted_subject = "Mathematics"
            else:
                predicted_subject = "Biology" # Default NEET/Botany fallback

        # 3. Apply Tag Record
        tag = db.query(QuestionTag).filter(QuestionTag.question_id == q.id).first()
        if not tag:
            tag = QuestionTag(question_id=q.id)
            db.add(tag)
            
        tag.subject = predicted_subject
        if not tag.difficulty:
            tag.difficulty = "medium"
        tag.tag_source = "manual" # local fallback indicator
        tag.confidence = 0.5
        tag.updated_at = datetime.utcnow()
        
        q.tagging_status = "subject_tagged"
        db.commit()
        logger.info(f"Fallback tagged question {q.id} as subject: {predicted_subject}")

def run_subject_only_tagging_fallback_task():
    """
    Self-contained background task to tag untagged questions with their predicted subjects.
    Avoids request session lifecycle closure crashes.
    """
    logger.info("Starting background subject fallback tagging task...")
    db = SessionLocal()
    try:
        run_subject_only_tagging_fallback(db)
        logger.info("Background subject fallback tagging task finished successfully.")
    except Exception as e:
        logger.error(f"Background subject fallback tagging failed: {str(e)}")
    finally:
        db.close()

def run_batch_tagging_task():
    """
    Self-contained background task to recursively process batch taxonomy tagging
    via Gemini until there are no untagged/partially-tagged questions.
    """
    logger.info("Starting background batch taxonomy tagging task...")
    db = SessionLocal()
    try:
        total_tagged = 0
        while True:
            tagged = run_batch_tagging(db, batch_size=20)
            if tagged == 0:
                break
            total_tagged += tagged
            time.sleep(1.0) # sleep briefly between API requests to avoid rate limits
        
        # Run subject-only rule fallback for any leftover untagged questions
        run_subject_only_tagging_fallback(db)
        logger.info(f"Background batch taxonomy tagging task finished. Tagged {total_tagged} questions via AI, remainder via local fallback.")
    except Exception as e:
        logger.error(f"Background batch taxonomy tagging failed: {str(e)}")
        try:
            run_subject_only_tagging_fallback(db)
        except Exception as fe:
            logger.error(f"Fallback tagging also failed: {str(fe)}")
    finally:
        db.close()
