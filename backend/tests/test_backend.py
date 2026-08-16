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
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        # Clean tables before running each test
        self.db.query(Attempt).delete()
        self.db.query(QuestionTag).delete()
        self.db.query(Question).delete()
        self.db.query(Paper).delete()
        self.db.commit()

    def tearDown(self):
        self.db.close()


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

    def test_parse_answer_key_grid(self):
        """Verifies parsing horizontal/tabular answer key grids from NEET/JEE papers."""
        from app.parser import parse_answer_key_grid
        
        # Test 1: 34 questions Ecosystem sample
        sample_eco = """
        1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17
        a b b d a c a d d d c c b a d a d
        18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34
        a d b c b b a d d d d b b d d d a
        Answer Key
        """
        key_eco = parse_answer_key_grid(sample_eco)
        self.assertEqual(len(key_eco), 34)
        self.assertEqual(key_eco["1"], "A")
        self.assertEqual(key_eco["2"], "B")
        self.assertEqual(key_eco["6"], "C")
        self.assertEqual(key_eco["10"], "D")
        self.assertEqual(key_eco["34"], "A")

        # Test 2: 16 questions Physics sample
        sample_phy = """
        Electromagnetic Induction 3
        1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16
        c a d b d c d d d b d d d d c b
        Answer Key
        """
        key_phy = parse_answer_key_grid(sample_phy)
        self.assertEqual(len(key_phy), 16)
        self.assertEqual(key_phy["1"], "C")
        self.assertEqual(key_phy["2"], "A")
        self.assertEqual(key_phy["3"], "D")
        self.assertEqual(key_phy["16"], "B")

    def test_cbt_test_generation_excludes_unanswered_and_errored_questions(self):
        """Verifies that questions without correct_answer or flagged as needs_review/error are excluded from CBT generation."""
        from app.main import generate_test
        from app.schemas import TestGenerateRequest

        paper = Paper(filename="mock.pdf", file_path="/mock.pdf", answer_key_status="matched")
        self.db.add(paper)
        self.db.commit()

        # Valid Question
        q_valid = Question(
            paper_id=paper.id,
            question_number=1,
            raw_content="Valid question?",
            question_type="MCQ",
            options=json.dumps(["Opt1", "Opt2", "Opt3", "Opt4"]),
            correct_answer="A",
            tagging_status="fully_tagged"
        )
        self.db.add(q_valid)
        self.db.flush()
        tag1 = QuestionTag(question_id=q_valid.id, subject="Biology", difficulty="easy")
        self.db.add(tag1)

        # Unanswered Question (should be excluded)
        q_no_ans = Question(
            paper_id=paper.id,
            question_number=2,
            raw_content="Question with no answer?",
            question_type="MCQ",
            options=json.dumps(["Opt1", "Opt2", "Opt3", "Opt4"]),
            correct_answer=None,
            tagging_status="needs_review"
        )
        self.db.add(q_no_ans)
        self.db.flush()
        tag2 = QuestionTag(question_id=q_no_ans.id, subject="Biology", difficulty="easy")
        self.db.add(tag2)

        # Errored / Needs Review Question (should be excluded)
        q_error = Question(
            paper_id=paper.id,
            question_number=3,
            raw_content="Question with malformed options?",
            question_type="MCQ",
            options=json.dumps(["Only 1 option"]),
            correct_answer="B",
            tagging_status="needs_review"
        )
        self.db.add(q_error)
        self.db.flush()
        tag3 = QuestionTag(question_id=q_error.id, subject="Biology", difficulty="easy")
        self.db.add(tag3)
        self.db.commit()

        # Generate test
        req = TestGenerateRequest(subject="Biology", limit=10)
        res = generate_test(req, self.db)

        # Only the valid question should be returned
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].id, q_valid.id)

if __name__ == "__main__":
    unittest.main()

