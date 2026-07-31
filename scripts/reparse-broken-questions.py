#!/usr/bin/env python3
import os
import sys
import json
from datetime import datetime

# Add backend directory to sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
sys.path.append(BACKEND_DIR)

from app.database import SessionLocal
from app.models import Question
from app.parser import get_dummy_parsed_response

def reparse_broken_questions():
    db = SessionLocal()
    try:
        # Fetch all questions
        questions = db.query(Question).all()
        broken_questions = []
        
        # Identify questions where options contain "Choose the correct answer"
        # or "Choose the correct option"
        for q in questions:
            opts_str = q.options or ""
            if "Choose the correct answer" in opts_str or "Choose the correct option" in opts_str:
                broken_questions.append(q)
                
        if not broken_questions:
            print("No broken matching combination questions found in the database.")
            return
            
        print(f"Found {len(broken_questions)} questions with the broken options pattern. Re-parsing...")
        
        for q in broken_questions:
            # Reconstruct the combined text of the question
            old_options = json.loads(q.options) if q.options else []
            combined_text = q.raw_content + "\n" + "\n".join(old_options)
            
            # Re-parse using the updated fallback parser
            parsed = get_dummy_parsed_response(combined_text)
            questions_list = parsed.get("questions", [])
            
            if questions_list:
                reparsed_q = questions_list[0]
                
                print(f"\nUpdating Question ID {q.id} (Number: {q.question_number}):")
                print(f"  Old raw content length: {len(q.raw_content)}")
                print(f"  New raw content length: {len(reparsed_q['raw_content'])}")
                print(f"  Old options: {q.options}")
                print(f"  New options: {json.dumps(reparsed_q['options'])}")
                
                # Update DB record
                q.raw_content = reparsed_q["raw_content"]
                q.options = json.dumps(reparsed_q["options"])
                q.question_type = reparsed_q["question_type"]
                q.tagging_status = "untagged"  # Mark untagged to trigger retagging
                
                # Delete old tags so the tagger runs fresh
                if q.tags:
                    db.delete(q.tags)
            else:
                print(f"\nWarning: Could not re-parse Question ID {q.id}.")
                
        db.commit()
        print("\nDatabase update committed successfully.")
        
        # Now trigger the batch tagging background task to retag the updated questions
        print("Re-running the AI/fallback tagger on the updated questions...")
        from app.tagger import run_batch_tagging_task
        run_batch_tagging_task()
        print("Retagging task completed.")
        
    except Exception as e:
        db.rollback()
        print(f"Error during migration: {str(e)}", file=sys.stderr)
    finally:
        db.close()

if __name__ == "__main__":
    reparse_broken_questions()
