import os
import re
import json
import time
import logging
from typing import List, Dict, Any, Tuple, Optional
import fitz  # PyMuPDF
from .config import settings

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import OCR libraries (optional fallback if not installed)
TESSERACT_AVAILABLE = False
try:
    import pytesseract
    from pdf2image import convert_from_path
    TESSERACT_AVAILABLE = True
except ImportError:
    logger.warning("pytesseract or pdf2image not found. OCR fallback will be disabled.")

def clean_junk_advertisement_lines(text: str) -> str:
    if not text:
        return text
    lines = text.split("\n")
    cleaned_lines = []
    for line in lines:
        l_strip = line.strip()
        # Clean advertisement lines or empty vertical dividers
        if l_strip in ["Android App", "iOS App", "PW Website", "NEET", "|", "Choose the correct option."]:
            continue
        cleaned_lines.append(line)
    
    # Rejoin and strip trailing/leading spaces/newlines
    res = "\n".join(cleaned_lines).strip()
    return res

def parse_pdf_to_questions(file_path: str) -> Dict[str, Any]:
    """
    Parses a PDF mock paper. Extracts page text (running OCR fallback if needed),
    locates the answer key by querying the final pages, and parses questions
    page-group by page-group to avoid token size limits and number extraction errors.
    """
    logger.info(f"Beginning PDF extraction pipeline for: {file_path}")
    doc = fitz.open(file_path)
    pages = []
    
    for page in doc:
        pages.append(page.get_text())

    total_text = "\n".join(pages)
    is_ocr = False

    # If selectable text is negligible, fall back to Tesseract OCR
    if len(total_text.strip()) < 100:
        if TESSERACT_AVAILABLE:
            logger.info("PDF contains negligible selectable text. Running OCR fallback...")
            try:
                images = convert_from_path(file_path)
                pages = []
                for idx, img in enumerate(images):
                    logger.info(f"OCRing page {idx + 1}/{len(images)}...")
                    p_text = f"\n--- Page {idx + 1} ---\n"
                    p_text += pytesseract.image_to_string(img)
                    pages.append(p_text)
                total_text = "\n".join(pages)
                is_ocr = True
            except Exception as e:
                logger.error(f"OCR failed: {str(e)}")
        else:
            logger.warning("OCR required but pytesseract or pdf2image is not installed.")

    # Step 1: Scan for answer key block specifically on the last 4 pages
    answer_key = {}
    answer_key_text = ""
    
    # Let's search all pages for "Answer Key" block to extract it directly
    for idx, p_text in enumerate(pages):
        lower_p = p_text.lower()
        if "answer key" in lower_p or "answer-key" in lower_p or ("answers" in lower_p and "hints & solutions" not in lower_p and idx > len(pages)/2):
            logger.info(f"Found Answer Key page marker on Page {idx + 1}")
            answer_key_text += p_text + "\n"
            if idx + 1 < len(pages):
                answer_key_text += pages[idx + 1] + "\n"
            break

    if not answer_key_text:
        logger.info("No explicit Answer Key page marker found. Defaulting to final 4 pages.")
        answer_key_text = "\n".join(pages[-4:]) if len(pages) >= 4 else total_text
    
    # Attempt local regex extraction first
    try:
        key_pattern = r'(?:Q|Question|Q\.)?\s*(\d+)\s*[\.\-\s\n]*\s*(?:\(([A-D])\)|([A-D]))'
        regex_matches = re.finditer(key_pattern, answer_key_text, re.IGNORECASE)
        for m in regex_matches:
            q_num = m.group(1)
            ans = m.group(2) or m.group(3)
            answer_key[q_num] = ans.upper()
        logger.info(f"Local regex answer key extraction found {len(answer_key)} entries.")
    except Exception as e:
        logger.error(f"Local regex answer key extraction failed: {str(e)}")

    # If local regex found nothing and API key is present, try Gemini
    if not answer_key and settings.gemini_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            key_prompt = f"""
Analyze the following text block from the end of an Indian mock test paper (JEE/NEET) and extract the Answer Key.
Search specifically for mapping of Question Number to Correct Answer option (e.g., 1-B, 2-C, 3. D or in tables).

Return the result STRICTLY as a JSON object with this schema:
{{
  "answer_key": {{
    "1": "A",
    "2": "C"
  }}
}}

Text Block:
{answer_key_text}
"""
            key_response = model.generate_content(
                key_prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            key_data = json.loads(key_response.text)
            gemini_key = key_data.get("answer_key", {})
            if gemini_key:
                answer_key.update(gemini_key)
            logger.info(f"Successfully extracted answer key via Gemini with {len(gemini_key)} items.")
        except Exception as e:
            logger.error(f"Gemini answer key extraction failed: {str(e)}")

    # Step 2: Extract questions page-by-page
    # Stop collecting question pages when we hit standard Solutions/Answer Key headers
    question_pages = []
    stop_keywords = ["hints & solutions", "detailed solutions", "text solution", "answer key", "answer-key", "answers & explanations"]
    
    for idx, p_text in enumerate(pages):
        lower_p = p_text.lower()
        if any(kw in lower_p for kw in stop_keywords):
            logger.info(f"Detected Solutions/Key section on Page {idx + 1} ({p_text[:50].strip()}). Stopping question page collection.")
            break
        question_pages.append(p_text)
        
    if not question_pages:
        # Fallback to all pages if filter accidentally emptied the pages
        question_pages = pages

    all_questions = []
    group_size = 5
    page_groups = [question_pages[i:i + group_size] for i in range(0, len(question_pages), group_size)]
    
    if settings.gemini_api_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            for idx, group in enumerate(page_groups):
                logger.info(f"Parsing page group {idx + 1}/{len(page_groups)} via Gemini...")
                group_text = "\n".join(group)
                
                prompt = f"""
You are an expert Indian entrance exam (JEE Main / NEET) parsing system.
Analyze the following text from a group of pages in an exam paper and extract all questions.

For each question, extract:
- question_number: The integer index of the question (e.g., 1, 2, 51). Pay special attention to the number written next to the question statement. Do NOT assign everything to 1.
- raw_content: The text of the question (use markdown for clean formatting, keep chemical formulas/math equations formatted nicely).
- question_type: Must be one of: "MCQ" | "AR" | "MATCH" | "NUMERICAL".
- options: For MCQ, a list of 4 options. 
  * IMPORTANT: Do not include option letters (A, B, C, D) or surrounding brackets in the final elements of the options array. Clean them off so they only contain the text of the options (e.g., return 'Genus', not '(A) Genus' or 'A) Genus'). This prevents double option label rendering in the player UI.
  * MATCH type questions columns (such as List-I and List-II lists) must remain inside the `raw_content`. The `options` list must only contain the final choice combinations (e.g. A-I, B-II, C-III, D-IV). Never treat column entries as separate options.
- correct_answer: The correct option character (A, B, C, D) if found in this text block. Otherwise null.
- explanation: Any embedded solution explanation if found in this text block. Otherwise null.

Return the result STRICTLY as a JSON object with this schema:
{{
  "questions": [
    {{
      "question_number": int,
      "raw_content": "string",
      "question_type": "MCQ" | "AR" | "MATCH" | "NUMERICAL",
      "options": ["string"] or null,
      "correct_answer": "string" or null,
      "explanation": "string" or null
    }}
  ]
}}

Exam Paper Text Group:
{group_text}
"""
                response = model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                data = json.loads(response.text)
                questions_parsed = data.get("questions", [])
                logger.info(f"Page group {idx + 1} yielded {len(questions_parsed)} questions.")
                all_questions.extend(questions_parsed)
                
                # Sleep briefly to avoid hit rate limits
                time.sleep(1.0)
                
        except Exception as e:
            logger.error(f"Gemini batch question parsing failed: {str(e)}")
            dummy = get_dummy_parsed_response(total_text)
            all_questions = dummy.get("questions", [])
    else:
        # Fallback to regex
        dummy = get_dummy_parsed_response(total_text)
        all_questions = dummy.get("questions", [])

    # Step 3: Extract Explanations from the solutions page text (if solutions pages were skipped)
    explanations = {}
    solutions_start_idx = len(question_pages)
    if solutions_start_idx < len(pages):
        solutions_text = "\n".join(pages[solutions_start_idx:])
        logger.info(f"Extracting explanations from solutions section (pages {solutions_start_idx + 1} to {len(pages)})...")
        
        # Try local regex extraction first
        try:
            pattern = r'(?:^|\n)\s*(?:Q|Question|Q\.)?\s*(\d+)\s*\n*\s*(?:Text Solution|Solution|Explanation):'
            matches = list(re.finditer(pattern, solutions_text, re.IGNORECASE))
            for i, match in enumerate(matches):
                q_num = match.group(1)
                start_idx = match.end()
                end_idx = matches[i+1].start() if i + 1 < len(matches) else len(solutions_text)
                expl_content = solutions_text[start_idx:end_idx].strip()
                # Clean footers
                if "Android App" in expl_content:
                    expl_content = expl_content.split("Android App")[0].strip()
                explanations[q_num] = expl_content
            logger.info(f"Local regex explanations extraction found {len(explanations)} entries.")
        except Exception as e:
            logger.error(f"Local regex explanations extraction failed: {str(e)}")

        # If local regex found nothing and API key is present, try Gemini
        if not explanations and settings.gemini_api_key:
            try:
                import google.generativeai as genai
                genai.configure(api_key=settings.gemini_api_key)
                model = genai.GenerativeModel("gemini-1.5-flash")
                
                expl_prompt = f"""
Analyze the following text block containing Solutions and Explanations for the exam questions.
Extract the explanation text for each question number.

Return the result STRICTLY as a JSON object with this schema:
{{
  "explanations": {{
    "1": "Explanation for question 1...",
    "2": "Explanation for question 2..."
  }}
}}

Solutions Text:
{solutions_text[:40000]}
"""
                expl_response = model.generate_content(
                    expl_prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                expl_data = json.loads(expl_response.text)
                gemini_expl = expl_data.get("explanations", {})
                if gemini_expl:
                    explanations.update(gemini_expl)
                logger.info(f"Successfully extracted {len(gemini_expl)} explanations via Gemini.")
            except Exception as e:
                logger.error(f"Gemini explanations extraction failed: {str(e)}")

    # Map explanations back to questions and clean content
    for q_data in all_questions:
        q_num_str = str(q_data.get("question_number"))
        if q_num_str in explanations:
            q_data["explanation"] = clean_junk_advertisement_lines(explanations[q_num_str])
        
        # Clean raw question content
        q_data["raw_content"] = clean_junk_advertisement_lines(q_data.get("raw_content", ""))
        
        # Clean options list if any
        if q_data.get("options"):
            q_data["options"] = [clean_junk_advertisement_lines(opt) for opt in q_data["options"]]
        
    return {
        "questions": all_questions,
        "answer_key": answer_key,
        "is_ocr": is_ocr
    }

def get_dummy_parsed_response(raw_text: str) -> Dict[str, Any]:
    """
    Smarter fallback parser. Looks only for valid start-of-line numbering
    and deduplicates numbers to avoid matching option bullets as new questions.
    """
    logger.info("Generating regex-based dummy parsing...")
    questions = []
    
    # Matches:
    # 1. Q1 or Question 1 followed by newline or dot/parenthesis/space
    # 2. Number followed by dot/parenthesis/colon/dash and space (avoiding page/other numbers)
    pattern = r'(?:(?:^|\n)\s*(?:Q|Question|Q\.)\s*(\d+)(?:[\.\)\s\n]|$))|(?:(?:^|\n)\s*(\d+)[\.\)\:-]\s+)'
    matches = re.finditer(pattern, raw_text, re.IGNORECASE)
    match_list = list(matches)
    
    # Filter duplicate question numbers
    seen_numbers = set()
    filtered_matches = []
    for match in match_list:
        q_num = int(match.group(1) or match.group(2))
        if q_num not in seen_numbers:
            seen_numbers.add(q_num)
            filtered_matches.append(match)
            
    for i, match in enumerate(filtered_matches):
        q_num = int(match.group(1) or match.group(2))
        start_idx = match.end()
        end_idx = filtered_matches[i+1].start() if i + 1 < len(filtered_matches) else len(raw_text)
        
        q_text = raw_text[start_idx:end_idx].strip()
        
        # Extrapolate option contents (A, B, C, D)
        options = []
        opt_matches = list(re.finditer(r'(?:^|\n|\s{2,})(?:\(([A-Da-d])\)|([A-Da-d])[\)\.])(?=\s+|$)', q_text, re.IGNORECASE))
        if opt_matches:
            is_match_question = any(kw in q_text.lower() for kw in ["match list", "list-i", "list - i", "list-ii", "list - ii", "match the following"])
            
            # If Match Column layout and we matched both columns and choices, only grab final choices
            if is_match_question and len(opt_matches) > 4:
                option_matches = opt_matches[-4:]
            else:
                option_matches = opt_matches

            for j, opt_match in enumerate(option_matches):
                o_start = opt_match.start()
                o_end = option_matches[j+1].start() if j + 1 < len(option_matches) else len(q_text)
                opt_str = q_text[o_start:o_end].strip()
                # Clean prefix parentheses standardizing e.g., (A) Genus -> A) Genus
                opt_str = re.sub(r'^\(([A-Da-d])\)\s*', r'\1) ', opt_str)
                options.append(clean_junk_advertisement_lines(opt_str))
                
            # Clean original question block of option texts (going up to first option choice match)
            q_text = q_text[:option_matches[0].start()].strip()
            
        questions.append({
            "question_number": q_num,
            "raw_content": q_text or f"Question details {q_num}",
            "question_type": "MCQ" if options else "NUMERICAL",
            "options": options if options else None,
            "correct_answer": None,
            "explanation": None
        })
        
    return {
        "questions": sorted(questions, key=lambda x: x["question_number"]),
        "answer_key": {}
    }
