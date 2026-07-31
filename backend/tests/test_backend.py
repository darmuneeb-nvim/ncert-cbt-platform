import unittest
import os
import sys
import json

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.parser import get_dummy_parsed_response
from app.tagger import load_taxonomy
from app.database import Base, engine, SessionLocal
from app.models import Paper, Question, QuestionTag, Attempt

class TestCBTPlatform(unittest.TestCase):
    
    def setUp(self):
        # Create tables in test database (SQLite in-memory is perfect for testing!)
        # Overwrite connection parameters
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=engine)

    def test_regex_parser_fallback(self):
        """Verifies that the regex-based fallback parser extracts questions and options correctly."""
        raw_text = """
        1. What is the dimensions of force?
        A) MLT-2
        B) ML2T-2
        C) ML-1T-2
        D) None of these
        
        2. The chemical formula of water is:
        A) H2O
        B) CO2
        C) O2
        D) H2
        """
        parsed = get_dummy_parsed_response(raw_text)
        questions = parsed.get("questions", [])
        
        self.assertEqual(len(questions), 2)
        self.assertEqual(questions[0]["question_number"], 1)
        self.assertEqual(questions[0]["question_type"], "MCQ")
        self.assertEqual(len(questions[0]["options"]), 4)
        self.assertIn("MLT-2", questions[0]["options"][0])
        
        self.assertEqual(questions[1]["question_number"], 2)
        self.assertEqual(len(questions[1]["options"]), 4)

    def test_taxonomy_loading(self):
        """Verifies that the locked NCERT taxonomy loaded from JSON is not empty."""
        taxonomy = load_taxonomy()
        self.assertIsNotNone(taxonomy)
        self.assertIn("Physics", taxonomy)
        self.assertIn("Chemistry", taxonomy)
        self.assertIn("Biology", taxonomy)
        self.assertIn("Mathematics", taxonomy)

    def test_database_crud_and_relationships(self):
        """Verifies SQLAlchemy CRUD operations for Papers, Questions, Tags, and Attempts."""
        # 1. Add paper
        paper = Paper(filename="test_mock.pdf", file_path="/path/test_mock.pdf", answer_key_status="matched")
        self.db.add(paper)
        self.db.commit()
        self.assertIsNotNone(paper.id)

        # 2. Add question
        q1 = Question(
            paper_id=paper.id,
            question_number=1,
            raw_content="What is the derivative of x^2?",
            question_type="MCQ",
            options=json.dumps(["A) x", "B) 2x", "C) x^2", "D) 2"]),
            correct_answer="B"
        )
        self.db.add(q1)
        self.db.commit()
        self.assertIsNotNone(q1.id)

        # 3. Add tags
        tag = QuestionTag(
            question_id=q1.id,
            subject="Mathematics",
            chapter="Limit, Continuity and Differentiability",
            concept="Differentiability of Functions",
            difficulty="easy"
        )
        self.db.add(tag)
        
        # 4. Add attempt
        attempt = Attempt(
            question_id=q1.id,
            time_spent=25,
            result="correct",
            selected_answer="B"
        )
        self.db.add(attempt)
        self.db.commit()

        # 5. Queries and relationship assertions
        fetched_q = self.db.query(Question).filter(Question.id == q1.id).first()
        self.assertEqual(fetched_q.paper.filename, "test_mock.pdf")
        self.assertEqual(fetched_q.tags.subject, "Mathematics")
        self.assertEqual(len(fetched_q.attempts), 1)
        self.assertEqual(fetched_q.attempts[0].result, "correct")

    def test_match_following_combination_parser(self):
        """Verifies that Match-the-following style questions with combination choices are parsed correctly."""
        raw_text = """
        1. Match the following columns:
        A. Axile – Althaea
        B. Marginal – Pea
        C. Parietal – Mustard
        D. Free central – Primrose
        E. Parietal – Argemone
        Choose the correct answer from the options given below:
        (1) A-II, B-I, C-V, D-III, E-IV
        (2) A-I, B-II, C-III, D-IV, E-V
        (3) A-III, B-IV, C-I, D-II, E-V
        (4) A-V, B-III, C-IV, D-I, E-II
        """
        parsed = get_dummy_parsed_response(raw_text)
        questions = parsed.get("questions", [])
        
        self.assertEqual(len(questions), 1)
        q = questions[0]
        self.assertEqual(q["question_number"], 1)
        self.assertEqual(q["question_type"], "MATCH")
        
        # Options list should have exactly 4 entries (A-D combination answers)
        self.assertEqual(len(q["options"]), 4)
        self.assertEqual(q["options"][0], "A-II, B-I, C-V, D-III, E-IV")
        self.assertEqual(q["options"][1], "A-I, B-II, C-III, D-IV, E-V")
        self.assertEqual(q["options"][2], "A-III, B-IV, C-I, D-II, E-V")
        self.assertEqual(q["options"][3], "A-V, B-III, C-IV, D-I, E-II")
        
        # Stem contains the full A-E pair list as plain text
        self.assertIn("A. Axile", q["raw_content"])
        self.assertIn("E. Parietal – Argemone", q["raw_content"])
        self.assertIn("Choose the correct answer from the options given below", q["raw_content"])

if __name__ == "__main__":
    unittest.main()
