import os
import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case

from .database import engine, Base, get_db, SessionLocal
from .models import Paper, Question, QuestionTag, Attempt, RoutingLog
from .schemas import (
    PaperResponse, QuestionResponse, QuestionDetailResponse,
    QuestionTagUpdate, TestGenerateRequest, TestSubmissionRequest,
    TestSubmissionResult, DashboardStatsResponse, SubjectStat, ConceptStat,
    AnswerKeySubmitRequest, BulkTagRequest, BulkDeleteRequest
)
from .config import settings
from .parser import parse_pdf_to_questions
from .tagger import run_subject_only_tagging_fallback_task, run_batch_tagging_task
from .integrations import push_to_anki, push_to_notion

# Initialize DB tables
Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NCERT-Tagged CBT API", version="1.0.0")

# Enable CORS for frontend Vite server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------
# INGESTION ENDPOINTS
# ----------------------------------------------------

@app.post("/api/papers/upload", response_model=Dict[str, Any])
async def upload_paper(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    answer_key_text: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Uploads a mock paper PDF, extracts text, runs OCR if needed,
    and structures questions via Gemini 1.5 Flash.
    """
    logger.info(f"Received paper upload request for: {file.filename}")
    
    # Save the file locally
    upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Create Paper record
    paper = Paper(
        filename=file.filename,
        file_path=file_path,
        answer_key_status="pending"
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)

    # 1. Run parsing pipeline
    parsed_data = parse_pdf_to_questions(file_path)
    
    questions_list = parsed_data.get("questions", [])
    extracted_key = parsed_data.get("answer_key", {})
    is_ocr = parsed_data.get("is_ocr", False)

    # Add questions to DB
    for q_data in questions_list:
        # Options list conversion to JSON string
        opts_json = json.dumps(q_data.get("options")) if q_data.get("options") else None
        
        # Check if we have an answer for this question
        q_num = str(q_data.get("question_number"))
        corr_ans = q_data.get("correct_answer")
        if q_num in extracted_key:
            corr_ans = extracted_key[q_num]

        question = Question(
            paper_id=paper.id,
            question_number=q_data.get("question_number"),
            raw_content=q_data.get("raw_content"),
            question_type=q_data.get("question_type", "MCQ"),
            options=opts_json,
            correct_answer=corr_ans,
            explanation=q_data.get("explanation"),
            tagging_status="untagged"
        )
        db.add(question)

    db.commit()

    # Handle Answer Key status matching
    # If the user uploaded/input a manual key, apply it
    if answer_key_text:
        try:
            manual_key = json.loads(answer_key_text)
            apply_key_to_paper(db, paper.id, manual_key)
            paper.answer_key_status = "matched"
        except Exception as e:
            logger.error(f"Failed to apply manual key: {str(e)}")
            paper.answer_key_status = "pending"
    elif extracted_key:
        apply_key_to_paper(db, paper.id, extracted_key)
        paper.answer_key_status = "matched"
    else:
        # Check if all questions have correct answers, otherwise pending
        all_answered = db.query(Question).filter(Question.paper_id == paper.id, Question.correct_answer == None).count() == 0
        paper.answer_key_status = "matched" if all_answered else "pending"

    db.commit()

    # Trigger async subject fallback tagging so the user can use it immediately for tests
    background_tasks.add_task(run_subject_only_tagging_fallback_task)
    # Trigger background batch tagging for fuller taxonomy
    background_tasks.add_task(run_batch_tagging_task)

    return {
        "paper_id": paper.id,
        "filename": paper.filename,
        "questions_parsed": len(questions_list),
        "answer_key_status": paper.answer_key_status,
        "ocr_fallback_triggered": is_ocr
    }

def apply_key_to_paper(db: Session, paper_id: int, key_dict: Dict[str, str]):
    for q_num_str, ans in key_dict.items():
        try:
            q_num = int(q_num_str)
            q = db.query(Question).filter(Question.paper_id == paper_id, Question.question_number == q_num).first()
            if q:
                q.correct_answer = str(ans).strip()
        except ValueError:
            continue

@app.post("/api/papers/{paper_id}/answer-key")
def submit_answer_key(paper_id: int, req: AnswerKeySubmitRequest, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    apply_key_to_paper(db, paper_id, req.answers)
    paper.answer_key_status = "matched"
    db.commit()
    return {"status": "success", "message": "Answer key matched successfully."}

# ----------------------------------------------------
# LIBRARY ENDPOINTS
# ----------------------------------------------------

@app.get("/api/papers", response_model=List[PaperResponse])
def list_papers(db: Session = Depends(get_db)):
    papers = db.query(Paper).all()
    res = []
    for p in papers:
        count = db.query(Question).filter(Question.paper_id == p.id).count()
        res.append(PaperResponse(
            id=p.id,
            filename=p.filename,
            answer_key_status=p.answer_key_status,
            created_at=p.created_at,
            question_count=count
        ))
    return res

@app.delete("/api/papers/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
        
    # Delete PDF file from disk if it exists
    if paper.file_path and os.path.exists(paper.file_path):
        try:
            os.remove(paper.file_path)
            logger.info(f"Deleted PDF file from disk: {paper.file_path}")
        except Exception as e:
            logger.error(f"Failed to delete PDF file: {str(e)}")
            
    # Delete DB records (cascading takes care of related tables)
    db.delete(paper)
    db.commit()
    return {"status": "success", "message": "Paper and associated questions deleted successfully."}

@app.get("/api/questions", response_model=Dict[str, Any])
def list_questions(
    subject: Optional[str] = None,
    chapter: Optional[str] = None,
    difficulty: Optional[str] = None,
    tagging_status: Optional[str] = None,
    question_type: Optional[str] = None,
    page: int = 1,
    limit: int = 25,
    db: Session = Depends(get_db)
):
    query = db.query(Question).outerjoin(QuestionTag)
    
    if subject:
        query = query.filter(QuestionTag.subject == subject)
    if chapter:
        query = query.filter(QuestionTag.chapter == chapter)
    if difficulty:
        query = query.filter(QuestionTag.difficulty == difficulty)
    if tagging_status:
        query = query.filter(Question.tagging_status == tagging_status)
    if question_type:
        query = query.filter(Question.question_type == question_type)

    total = query.count()
    offset = (page - 1) * limit
    questions = query.order_by(Question.id).offset(offset).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "questions": [QuestionResponse.from_orm(q) for q in questions]
    }

@app.get("/api/questions/{question_id}", response_model=QuestionDetailResponse)
def get_question(question_id: int, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return QuestionDetailResponse.from_orm(q)

@app.put("/api/questions/{question_id}/tags", response_model=QuestionResponse)
def update_question_tags(question_id: int, req: QuestionTagUpdate, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    tag = db.query(QuestionTag).filter(QuestionTag.question_id == question_id).first()
    if not tag:
        tag = QuestionTag(question_id=question_id)
        db.add(tag)

    tag.subject = req.subject
    tag.chapter = req.chapter
    tag.concept = req.concept
    tag.difficulty = req.difficulty
    tag.tag_source = "manual"
    tag.confidence = 1.0
    tag.updated_at = datetime.utcnow()
    
    q.tagging_status = "fully_tagged"
    db.commit()
    db.refresh(q)
    return QuestionResponse.from_orm(q)

@app.post("/api/questions/bulk-tag")
def bulk_tag_questions(req: BulkTagRequest, db: Session = Depends(get_db)):
    if not req.question_ids:
        return {"status": "success", "message": "No questions selected."}
        
    for q_id in req.question_ids:
        q = db.query(Question).filter(Question.id == q_id).first()
        if not q:
            continue
            
        tag = db.query(QuestionTag).filter(QuestionTag.question_id == q_id).first()
        if not tag:
            tag = QuestionTag(question_id=q_id)
            db.add(tag)
            
        if req.subject is not None:
            tag.subject = req.subject
        if req.chapter is not None:
            tag.chapter = req.chapter
        if req.concept is not None:
            tag.concept = req.concept
        if req.difficulty is not None:
            tag.difficulty = req.difficulty
            
        tag.tag_source = "manual"
        tag.confidence = 1.0
        tag.updated_at = datetime.utcnow()
        
        q.tagging_status = "fully_tagged"
        
    db.commit()
    return {"status": "success", "message": f"Successfully updated tags for {len(req.question_ids)} questions."}

@app.post("/api/questions/bulk-delete")
def bulk_delete_questions(req: BulkDeleteRequest, db: Session = Depends(get_db)):
    if not req.question_ids:
        return {"status": "success", "message": "No questions selected."}
        
    deleted_count = 0
    for q_id in req.question_ids:
        q = db.query(Question).filter(Question.id == q_id).first()
        if q:
            db.delete(q)
            deleted_count += 1
            
    db.commit()
    return {"status": "success", "message": f"Successfully deleted {deleted_count} questions."}

@app.post("/api/tagger/run")
def trigger_tagger(background_tasks: BackgroundTasks):
    """Triggers batch tagging manually."""
    background_tasks.add_task(run_batch_tagging_task)
    return {"status": "triggered", "message": "Batch tagging running in background."}

# ----------------------------------------------------
# CBT PLAYER ENDPOINTS
# ----------------------------------------------------

@app.post("/api/tests/generate", response_model=List[QuestionResponse])
def generate_test(req: TestGenerateRequest, db: Session = Depends(get_db)):
    """
    Generates a mock test session.
    A question must have at least a Subject tag to be CBT-eligible.
    """
    all_questions = []

    # Case A: Advanced Question Count Filter (subjects specified individually)
    if req.subject_limits:
        # Filter out subjects with 0 count
        active_limits = {k: v for k, v in req.subject_limits.items() if v > 0}
        
        for subj, limit_cnt in active_limits.items():
            query = db.query(Question).join(QuestionTag).filter(QuestionTag.subject == subj)
            
            # Apply common filters
            if req.chapter:
                query = query.filter(QuestionTag.chapter == req.chapter)
            if req.concept:
                query = query.filter(QuestionTag.concept == req.concept)
                
            # Apply difficulties multiselect or single select
            if req.difficulties:
                query = query.filter(QuestionTag.difficulty.in_(req.difficulties))
            elif req.difficulty:
                query = query.filter(QuestionTag.difficulty == req.difficulty)
                
            subj_questions = query.order_by(func.random()).limit(limit_cnt).all()
            all_questions.extend(subj_questions)
            
    # Case B: Standard filters with multiselect subjects and difficulties
    else:
        query = db.query(Question).join(QuestionTag).filter(QuestionTag.subject != None)
        
        # Apply subjects multiselect or single select
        if req.subjects:
            query = query.filter(QuestionTag.subject.in_(req.subjects))
        elif req.subject:
            query = query.filter(QuestionTag.subject == req.subject)
            
        if req.chapter:
            query = query.filter(QuestionTag.chapter == req.chapter)
        if req.concept:
            query = query.filter(QuestionTag.concept == req.concept)
            
        # Apply difficulties multiselect or single select
        if req.difficulties:
            query = query.filter(QuestionTag.difficulty.in_(req.difficulties))
        elif req.difficulty:
            query = query.filter(QuestionTag.difficulty == req.difficulty)
            
        all_questions = query.order_by(func.random()).limit(req.limit).all()
        
    if not all_questions:
        raise HTTPException(status_code=404, detail="No matching CBT-eligible questions found.")
        
    return [QuestionResponse.from_orm(q) for q in all_questions]

@app.post("/api/tests/submit", response_model=TestSubmissionResult)
async def submit_test(
    req: TestSubmissionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Submits a completed CBT paper, logs attempts, triggers Anki sync (for wrong answers),
    and Notion sync (for skipped answers) in background tasks.
    """
    details = []
    correct_cnt = 0
    wrong_cnt = 0
    skipped_cnt = 0
    
    for item in req.submissions:
        q = db.query(Question).filter(Question.id == item.question_id).first()
        if not q:
            continue
        
        # Calculate result status
        is_skipped = (item.selected_answer is None or item.selected_answer.strip() == "")
        is_correct = False
        
        if is_skipped:
            res_str = "skipped"
            skipped_cnt += 1
        elif q.correct_answer and item.selected_answer.strip().upper() == q.correct_answer.strip().upper():
            res_str = "correct"
            correct_cnt += 1
            is_correct = True
        else:
            res_str = "wrong"
            wrong_cnt += 1
            
        # Get attempt count for this question
        prev_attempts = db.query(Attempt).filter(Attempt.question_id == q.id).count()
        
        # Log attempt
        attempt = Attempt(
            question_id=q.id,
            time_spent=item.time_spent,
            result=res_str,
            selected_answer=item.selected_answer,
            attempt_number=prev_attempts + 1
        )
        db.add(attempt)
        db.commit()
        db.refresh(attempt)
        details.append(attempt)

        # Post-attempt routing triggered asynchronously
        tag = db.query(QuestionTag).filter(QuestionTag.question_id == q.id).first()
        subj = tag.subject if tag else None
        ch = tag.chapter if tag else None
        con = tag.concept if tag else None
        diff = tag.difficulty if tag else None

        if res_str == "wrong":
            # Push to Anki
            background_tasks.add_task(
                push_to_anki_task, db, q.id, q.raw_content, q.options, q.correct_answer, q.explanation, subj, ch, con, diff
            )
        elif res_str == "skipped":
            # Push to Notion
            background_tasks.add_task(
                push_to_notion_task, db, q.id, q.raw_content, q.options, q.correct_answer, subj, ch, diff
            )

    total_attempted = correct_cnt + wrong_cnt
    total_q = len(req.submissions)
    score = (correct_cnt * 4) - (wrong_cnt * 1) # JEE marking scheme (+4, -1)
    accuracy = (correct_cnt / total_attempted * 100) if total_attempted > 0 else 0.0

    return TestSubmissionResult(
        attempted=total_attempted,
        correct=correct_cnt,
        wrong=wrong_cnt,
        skipped=skipped_cnt,
        score=score,
        accuracy=accuracy,
        details=details
    )

# Async wrappers for background tasks that update the routing log
def push_to_anki_task(db_session_factory, q_id, q_text, q_opts, corr, expl, subj, ch, con, diff):
    db = SessionLocal()
    try:
        # Convert JSON options string back to list of strings
        opts_list = json.loads(q_opts) if q_opts else None
        success = push_to_anki(q_text, opts_list, corr, expl, subj, ch, con, diff)
        log = RoutingLog(
            question_id=q_id,
            destination="anki",
            status="success" if success else "failed"
        )
        db.add(log)
        db.commit()
    finally:
        db.close()

async def push_to_notion_task(db_session_factory, q_id, q_text, q_opts, corr, subj, ch, diff):
    db = SessionLocal()
    try:
        opts_list = json.loads(q_opts) if q_opts else None
        success = await push_to_notion(q_text, opts_list, corr, subj, ch, diff)
        log = RoutingLog(
            question_id=q_id,
            destination="notion",
            status="success" if success else "failed"
        )
        db.add(log)
        db.commit()
    finally:
        db.close()

# ----------------------------------------------------
# DASHBOARD & ANALYTICS ENDPOINTS
# ----------------------------------------------------

@app.get("/api/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Computes attempt metrics, speed profiles, and weak concepts."""
    total_q = db.query(Question).count()
    total_attempts = db.query(Attempt).count()
    
    # Average accuracy
    correct_attempts = db.query(Attempt).filter(Attempt.result == "correct").count()
    wrong_attempts = db.query(Attempt).filter(Attempt.result == "wrong").count()
    total_graded = correct_attempts + wrong_attempts
    avg_accuracy = (correct_attempts / total_graded * 100) if total_graded > 0 else 0.0
    
    # Average time
    avg_time = db.query(func.avg(Attempt.time_spent)).scalar() or 0.0

    # Subject-wise statistics
    subjects = ["Physics", "Chemistry", "Biology", "Mathematics"]
    subject_wise_stats = []
    for s in subjects:
        total_s = db.query(Question).join(QuestionTag).filter(QuestionTag.subject == s).count()
        attempts_s = db.query(Attempt).join(Question).join(QuestionTag).filter(QuestionTag.subject == s).count()
        correct_s = db.query(Attempt).join(Question).join(QuestionTag).filter(QuestionTag.subject == s, Attempt.result == "correct").count()
        wrong_s = db.query(Attempt).join(Question).join(QuestionTag).filter(QuestionTag.subject == s, Attempt.result == "wrong").count()
        
        graded_s = correct_s + wrong_s
        acc_s = (correct_s / graded_s * 100) if graded_s > 0 else 0.0
        
        subject_wise_stats.append(SubjectStat(
            subject=s,
            total_questions=total_s,
            attempted=attempts_s,
            correct=correct_s,
            accuracy=acc_s
        ))

    # Weak concepts (Accuracy < 50%, minimum 3 attempts)
    weak_concepts_query = db.query(
        QuestionTag.concept,
        func.count(Attempt.id).label("attempts_cnt"),
        func.sum(case((Attempt.result == 'correct', 1), else_=0)).label("correct_cnt")
    ).join(Question, Question.id == QuestionTag.question_id)\
     .join(Attempt, Attempt.question_id == Question.id)\
     .group_by(QuestionTag.concept)\
     .having(func.count(Attempt.id) >= 3).all()

    weak_concepts = []
    for row in weak_concepts_query:
        concept_name, attempts_cnt, correct_cnt = row
        acc = (correct_cnt / attempts_cnt * 100) if attempts_cnt > 0 else 0.0
        if acc < 50 and concept_name:
            weak_concepts.append(ConceptStat(
                concept=concept_name,
                attempts=attempts_cnt,
                accuracy=acc
            ))
            
    # Sort weak concepts by lowest accuracy
    weak_concepts.sort(key=lambda x: x.accuracy)

    # Derived speed categorization (Fast <= 45s, Slow > 45s)
    fast_correct = db.query(Attempt).filter(Attempt.result == "correct", Attempt.time_spent <= 45).count()
    slow_correct = db.query(Attempt).filter(Attempt.result == "correct", Attempt.time_spent > 45).count()
    fast_wrong = db.query(Attempt).filter(Attempt.result == "wrong", Attempt.time_spent <= 45).count()
    slow_wrong = db.query(Attempt).filter(Attempt.result == "wrong", Attempt.time_spent > 45).count()

    return DashboardStatsResponse(
        total_questions=total_q,
        total_attempts=total_attempts,
        average_accuracy=avg_accuracy,
        average_time_per_question=avg_time,
        subject_wise=subject_wise_stats,
        weak_concepts=weak_concepts,
        fast_correct=fast_correct,
        slow_correct=slow_correct,
        fast_wrong=fast_wrong,
        slow_wrong=slow_wrong
    )

# ----------------------------------------------------
# LOCAL MIRROR ENDPOINTS
# ----------------------------------------------------

@app.get("/api/in-app/flashcards", response_model=List[QuestionResponse])
def get_in_app_flashcards(db: Session = Depends(get_db)):
    """
    Fetches questions whose *most recent* attempt was wrong.
    Serves as an in-app spaced repetition / review pool.
    """
    # Subquery for most recent attempt ID per question
    subq = db.query(
        Attempt.question_id,
        func.max(Attempt.timestamp).label("max_ts")
    ).group_by(Attempt.question_id).subquery()
    
    wrong_q_ids = db.query(Attempt.question_id).join(
        subq, (Attempt.question_id == subq.c.question_id) & (Attempt.timestamp == subq.c.max_ts)
    ).filter(Attempt.result == "wrong").all()
    
    ids = [row[0] for row in wrong_q_ids]
    questions = db.query(Question).filter(Question.id.in_(ids)).all()
    return [QuestionResponse.from_orm(q) for q in questions]

@app.get("/api/in-app/skipped", response_model=List[QuestionResponse])
def get_in_app_skipped(db: Session = Depends(get_db)):
    """
    Fetches questions whose *most recent* attempt was skipped.
    """
    subq = db.query(
        Attempt.question_id,
        func.max(Attempt.timestamp).label("max_ts")
    ).group_by(Attempt.question_id).subquery()
    
    skipped_q_ids = db.query(Attempt.question_id).join(
        subq, (Attempt.question_id == subq.c.question_id) & (Attempt.timestamp == subq.c.max_ts)
    ).filter(Attempt.result == "skipped").all()
    
    ids = [row[0] for row in skipped_q_ids]
    questions = db.query(Question).filter(Question.id.in_(ids)).all()
    return [QuestionResponse.from_orm(q) for q in questions]

@app.get("/api/attempts/history")
def get_attempts_history(db: Session = Depends(get_db)):
    """
    Groups attempts temporally into distinct quiz sessions and returns detailed results.
    """
    attempts = db.query(Attempt).order_by(Attempt.timestamp.desc()).all()
    
    sessions = []
    current_session = []
    
    for att in attempts:
        if not current_session:
            current_session.append(att)
        else:
            time_gap = (current_session[-1].timestamp - att.timestamp).total_seconds()
            if time_gap <= 5:
                current_session.append(att)
            else:
                sessions.append(current_session)
                current_session = [att]
    if current_session:
        sessions.append(current_session)
        
    history = []
    for idx, sess in enumerate(sessions):
        # Sort session attempts by question number to preserve paper order
        sess = sorted(sess, key=lambda a: a.question.question_number if a.question else a.id)
        
        correct = sum(1 for a in sess if a.result == "correct")
        wrong = sum(1 for a in sess if a.result == "wrong")
        skipped = sum(1 for a in sess if a.result == "skipped")
        score = correct * 4 - wrong * 1
        
        total_graded = correct + wrong
        accuracy = (correct / total_graded * 100) if total_graded > 0 else 0.0
        
        submissions_details = []
        for a in sess:
            q = a.question
            if not q:
                continue
            
            # Find subject from tags
            subject = "General"
            if q.tags:
                subject = q.tags.subject
            
            submissions_details.append({
                "id": a.id,
                "question_id": q.id,
                "question_number": q.question_number,
                "raw_content": q.raw_content,
                "question_type": q.question_type,
                "options": json.loads(q.options) if q.options else None,
                "correct_answer": q.correct_answer,
                "explanation": q.explanation,
                "selected_answer": a.selected_answer,
                "result": a.result,
                "time_spent": a.time_spent,
                "subject": subject
            })
            
        history.append({
            "session_id": str(idx + 1),
            "timestamp": sess[0].timestamp.isoformat() + "Z",
            "total_questions": len(sess),
            "correct": correct,
            "wrong": wrong,
            "skipped": skipped,
            "score": score,
            "accuracy": accuracy,
            "submissions": submissions_details
        })
        
    return history

@app.get("/api/dashboard/questions", response_model=List[QuestionResponse])
def get_dashboard_questions(type: str, db: Session = Depends(get_db)):
    """
    Returns filtered lists of questions mapped to clickable dashboard metrics cards.
    """
    query = db.query(Question).outerjoin(QuestionTag)
    
    if type == "library":
        questions = query.order_by(Question.id).all()
        
    elif type == "attempts":
        # Group by question to retrieve all questions with attempts
        questions = query.join(Attempt, Attempt.question_id == Question.id).group_by(Question.id).order_by(Question.id).all()
        
    elif type == "accuracy":
        # Sort attempted questions by accuracy descending
        all_q = query.all()
        q_stats = []
        for q in all_q:
            atts = db.query(Attempt).filter(Attempt.question_id == q.id).all()
            if not atts:
                accuracy = -1.0
                attempts_cnt = 0
            else:
                correct = sum(1 for a in atts if a.result == "correct")
                accuracy = (correct / len(atts)) * 100
                attempts_cnt = len(atts)
            q_stats.append((q, accuracy, attempts_cnt))
        # Sort attempted questions: highest accuracy first, then attempts count
        q_stats.sort(key=lambda x: (x[2] > 0, x[1], x[2]), reverse=True)
        questions = [x[0] for x in q_stats if x[2] > 0]
        
    elif type == "pace":
        # Sort attempted questions: fastest average pacing first
        all_q = query.all()
        q_stats = []
        for q in all_q:
            atts = db.query(Attempt).filter(Attempt.question_id == q.id).all()
            if not atts:
                avg_pace = 999999.0
                attempts_cnt = 0
            else:
                avg_pace = sum(a.time_spent for a in atts) / len(atts)
                attempts_cnt = len(atts)
            q_stats.append((q, avg_pace, attempts_cnt))
        # Sort attempted questions: fastest avg time first
        q_stats.sort(key=lambda x: (x[2] > 0, -x[1]), reverse=True)
        questions = [x[0] for x in q_stats if x[2] > 0]
        
    elif type.startswith("speed_"):
        profile = type.split("speed_")[1]
        q_ids_query = db.query(Attempt.question_id)
        if profile == "fast_correct":
            q_ids_query = q_ids_query.filter(Attempt.result == "correct", Attempt.time_spent <= 45)
        elif profile == "slow_correct":
            q_ids_query = q_ids_query.filter(Attempt.result == "correct", Attempt.time_spent > 45)
        elif profile == "fast_wrong":
            q_ids_query = q_ids_query.filter(Attempt.result == "wrong", Attempt.time_spent <= 45)
        elif profile == "slow_wrong":
            q_ids_query = q_ids_query.filter(Attempt.result == "wrong", Attempt.time_spent > 45)
        
        q_ids = [row[0] for row in q_ids_query.group_by(Attempt.question_id).all()]
        questions = query.filter(Question.id.in_(q_ids)).all()
        
    elif type.startswith("subject_"):
        subj = type.split("subject_")[1]
        questions = query.filter(QuestionTag.subject == subj).order_by(Question.id).all()
        
    else:
        questions = []
        
    response_data = []
    for q in questions:
        last_att = db.query(Attempt).filter(Attempt.question_id == q.id).order_by(Attempt.timestamp.desc()).first()
        res_obj = QuestionResponse.from_orm(q)
        res_obj.last_attempt_time = last_att.time_spent if last_att else None
        response_data.append(res_obj)
        
    return response_data
