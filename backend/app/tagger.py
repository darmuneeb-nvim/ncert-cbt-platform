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
    if not settings.gemini_api_key or not settings.gemini_api_key.startswith("AIza"):
        logger.warning("GEMINI_API_KEY is not set or invalid. Skipping AI tagging.")
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
    Fallback method to run rule-based subject, chapter, and concept prediction against taxonomy.
    Ensures questions have Subject/Chapter tags and valid tagging_status so they are CBT eligible.
    """
    taxonomy = load_taxonomy()
    
    questions_to_check = db.query(Question).outerjoin(QuestionTag).filter(
        (QuestionTag.id == None) | 
        (QuestionTag.subject == None) | 
        (QuestionTag.chapter == None) |
        (Question.tagging_status.in_(["untagged", "needs_review"]))
    ).all()

    for q in questions_to_check:
        text = (q.raw_content + " " + (q.options or "")).lower()
        paper_filename = q.paper.filename.lower() if q.paper else ""
        predicted_subject = None
        predicted_chapter = None
        predicted_concept = None
        
        # 1. First check paper filename context
        if any(w in paper_filename for w in ["botany", "zoology", "biology", "bio", "cell cycle", "cell division", "neet pyq"]):
            predicted_subject = "Biology"
        elif any(w in paper_filename for w in ["chemistry", "chem"]):
            predicted_subject = "Chemistry"
        elif any(w in paper_filename for w in ["physics", "phy"]):
            predicted_subject = "Physics"
        elif any(w in paper_filename for w in ["math", "mathematics", "jee main math"]):
            predicted_subject = "Mathematics"

        # 2. Inspect subject keywords if not determined by filename
        if not predicted_subject:
            if any(w in text for w in ["velocity", "force", "acceleration", "optics", "charge", "current", "magnetic", "lens", "mass", "motion", "gravity", "energy", "work", "friction", "speed", "newton", "wavelength"]):
                predicted_subject = "Physics"
            elif any(w in text for w in ["molecule", "atom", "reaction", "acid", "base", "valency", "bond", "equilibrium", "organic", "mol", "nacl", "concentration", "molar", "compound", "chemical", "solvent", "solution"]):
                predicted_subject = "Chemistry"
            elif any(w in text for w in ["cell", "plant", "organ", "chromosome", "dna", "rna", "blood", "heart", "respiration", "species", "taxon", "genus", "family", "order", "class", "phylum", "kingdom", "binomial", "nomenclature", "botany", "zoology", "organism", "living", "reproduction", "meiosis", "mitosis", "interphase", "prophase", "metaphase", "anaphase", "telophase", "chiasmata", "synapsis", "centromere", "chromatid", "spindle"]):
                predicted_subject = "Biology"
            elif any(w in text for w in ["derivative", "integral", "matrix", "determinant", "function", "probability", "trigonometry", "vector", "geometry", "equation", "solve", "value of"]):
                predicted_subject = "Mathematics"
            else:
                predicted_subject = "Biology"

        # 3. Chapter & Concept keyword mapping
        if predicted_subject == "Biology":
            if any(w in text or w in paper_filename for w in ["cell cycle", "cell division", "mitosis", "meiosis", "prophase", "metaphase", "anaphase", "telophase", "chiasmata", "kinetochore", "synapsis", "recombinase", "centromere", "chromatid", "chromosome", "interphase", "g1", "g2", "s phase", "s-phase", "g0", "centriole", "spindle"]):
                predicted_chapter = "Cell: Structure and Functions"
                predicted_concept = "Cell Cycle and Mitosis/Meiosis"
            elif any(w in text for w in ["photosynthesis", "chlorophyll", "calvin", "light reaction"]):
                predicted_chapter = "Plant Physiology"
                predicted_concept = "Photosynthesis in Higher Plants"
            elif any(w in text for w in ["respiration", "krebs", "glycolysis", "atp"]):
                predicted_chapter = "Plant Physiology"
                predicted_concept = "Respiration in Plants"
            elif any(w in text for w in ["reproduction", "embryo", "gamete", "pollination", "sperm", "ovum"]):
                predicted_chapter = "Reproduction"
                predicted_concept = "Human Reproduction"
        elif predicted_subject == "Physics":
            if any(w in text for w in ["motion", "velocity", "acceleration", "projectile"]):
                predicted_chapter = "Kinematics"
                predicted_concept = "Motion in a Straight Line"
            elif any(w in text for w in ["force", "friction", "newton"]):
                predicted_chapter = "Laws of Motion"
                predicted_concept = "Newton's Laws"
            elif any(w in text for w in ["lens", "mirror", "refraction", "reflection", "optics", "prism"]):
                predicted_chapter = "Optics"
                predicted_concept = "Lenses and Prisms"

        # 4. Apply Tag Record
        tag = db.query(QuestionTag).filter(QuestionTag.question_id == q.id).first()
        if not tag:
            tag = QuestionTag(question_id=q.id)
            db.add(tag)
            
        tag.subject = predicted_subject
        if predicted_chapter:
            tag.chapter = predicted_chapter
        if predicted_concept:
            tag.concept = predicted_concept
        if not tag.difficulty:
            tag.difficulty = "medium"
        tag.tag_source = "rule_fallback"
        tag.confidence = 0.85 if predicted_chapter else 0.6
        tag.updated_at = datetime.utcnow()
        
        # 5. Determine tagging status
        if q.correct_answer and tag.subject and tag.chapter:
            q.tagging_status = "fully_tagged"
        elif q.correct_answer and tag.subject:
            q.tagging_status = "subject_tagged"
        elif not q.correct_answer:
            q.tagging_status = "needs_review"
            
        db.commit()
        logger.info(f"Fallback tagged question {q.id} as {predicted_subject} -> {predicted_chapter} (status={q.tagging_status})")

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
