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

def parse_pdf_to_questions(file_path: str, paper_id: int) -> Dict[str, Any]:
    """
    Parses a PDF mock paper. Extracts page text (running OCR fallback if needed),
    locates the answer key by querying the final pages, and parses questions
    page-group by page-group to avoid token size limits and number extraction errors.
    """
    logger.info(f"Beginning PDF extraction pipeline for: {file_path} (Paper ID: {paper_id})")
    doc = fitz.open(file_path)
    
    # Extract images and save them locally
    images_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "images", f"paper_{paper_id}")
    os.makedirs(images_dir, exist_ok=True)
    
    extracted_images_count = 0
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        try:
            image_list = page.get_images(full=True)
            for img_idx, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                
                # Heuristic filters: ignore tiny decorative elements
                width = base_image.get("width", 0)
                height = base_image.get("height", 0)
                if width < 50 or height < 50:
                    continue
                    
                image_ext = base_image["ext"]
                filename = f"page_{page_idx + 1}_img_{img_idx}.{image_ext}"
                filepath = os.path.join(images_dir, filename)
                with open(filepath, "wb") as f:
                    f.write(image_bytes)
                extracted_images_count += 1
        except Exception as e:
            logger.error(f"Error extracting images from page {page_idx + 1}: {e}")
            
    logger.info(f"Extracted {extracted_images_count} images from PDF.")
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
            from PIL import Image
            genai.configure(api_key=settings.gemini_api_key)
            model = genai.GenerativeModel("gemini-1.5-flash")
            
            # Recreate image folder path to match group files
            images_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "images", f"paper_{paper_id}")
            
            for idx, group in enumerate(page_groups):
                logger.info(f"Parsing page group {idx + 1}/{len(page_groups)} via Gemini...")
                group_text = "\n".join(group)
                
                # Determine page range of this group
                start_page_num = idx * group_size + 1
                end_page_num = min(start_page_num + len(group) - 1, len(doc))
                
                # Gather images matching this page range
                group_images = []
                for page_num in range(start_page_num, end_page_num + 1):
                    prefix = f"page_{page_num}_img_"
                    if os.path.exists(images_dir):
                        for f_name in sorted(os.listdir(images_dir)):
                            if f_name.startswith(prefix):
                                group_images.append(os.path.join(images_dir, f_name))
                
                contents = []
                images_manifest = ""
                
                if group_images:
                    images_manifest = "The following images/diagrams from these pages are provided to you as input payloads in the request order:\n"
                    for img_idx, img_path in enumerate(group_images):
                        try:
                            f_name = os.path.basename(img_path)
                            img_obj = Image.open(img_path)
                            contents.append(img_obj)
                            images_manifest += f"- Payload Image {img_idx + 1} corresponds to filename: \"{f_name}\"\n"
                        except Exception as img_err:
                            logger.error(f"Failed to load image {img_path}: {img_err}")
                    
                    images_manifest += """
If any question relies on or refers to a diagram/image provided in the request payload, you MUST map that image filename from the list above to the question's 'images' array.
For example, if Question 3 refers to Payload Image 1, set its 'images' to ["page_1_img_0.png"] (using the exact filename matched from the list above). If no diagram belongs to the question, set 'images' to null or an empty list.
"""

                prompt = f"""
You are an expert Indian entrance exam (JEE Main / NEET) parsing system.
Analyze the following text from a group of pages in an exam paper and extract all questions.

{images_manifest}

For each question, extract:
- question_number: The integer index of the question (e.g., 1, 2, 51). Pay special attention to the number written next to the question statement. Do NOT assign everything to 1.
- raw_content: The text of the question (use markdown for clean formatting, keep chemical formulas/math equations formatted nicely).
- question_type: Must be one of: "MCQ" | "AR" | "MATCH" | "NUMERICAL".
- options: For MCQ and MATCH/combination questions, a list of 4 options. 
  * IMPORTANT: Do not include option letters (A, B, C, D) or numbers (1, 2, 3, 4) or surrounding brackets in the final elements of the options array. Clean them off so they only contain the text of the options (e.g., return 'Genus', not '(A) Genus' or 'A) Genus'). This prevents double option label rendering in the player UI.
  * MATCH type and combination questions: For questions containing a list of pairs/columns (e.g., List-I/List-II, or items A, B, C, D, E matched with I, II, III, IV, V), followed by a phrase like "Choose the correct answer from the options given below:" (or similar), and then 4 multiple-choice options showing combinations (e.g., "(1) A-II, B-I, C-V, D-III, E-IV"):
    1. The entire list of pairs/columns AND the "Choose the correct answer..." line MUST be included in the `raw_content` as plain text/markdown.
    2. The `options` list MUST ONLY contain the final 4 selectable combination choices, with option labels (such as (1), (2), (3), (4) or (A), (B), (C), (D)) stripped out.
    3. Never treat individual pair items (e.g., "E. Parietal – Argemone") as options, and never merge them into the final combination options. They belong strictly in the `raw_content`.
- correct_answer: The correct option character (A, B, C, D) if found in this text block. Otherwise null.
- explanation: Any embedded solution explanation if found in this text block. Otherwise null.
- images: A list of string filenames (e.g. ["page_1_img_0.png"]) matched from the provided image payload manifest if the question has an associated diagram. Otherwise null.

Return the result STRICTLY as a JSON object with this schema:
{{
  "questions": [
    {{
      "question_number": int,
      "raw_content": "string",
      "question_type": "MCQ" | "AR" | "MATCH" | "NUMERICAL",
      "options": ["string"] or null,
      "correct_answer": "string" or null,
      "explanation": "string" or null,
      "images": ["string"] or null
    }}
  ]
}}

Exam Paper Text Group:
{group_text}
"""
                contents.append(prompt)
                
                response = model.generate_content(
                    contents,
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
        combination_parsed = False
        q_type = "MCQ"
        
        # Check if the question contains the special combination pattern:
        # A list of pairs followed by "Choose the correct answer..." and then combination options
        match_pattern = r"(Choose the correct answer from the options given below|Choose the correct option)"
        match_search = re.search(match_pattern, q_text, re.IGNORECASE)
        if match_search:
            split_idx = match_search.start()
            stem_part = q_text[:split_idx].strip()
            choose_line = match_search.group(0)
            options_part = q_text[split_idx + len(choose_line):].strip()
            
            # The options in options_part can be separated by (1)/(2)/(3)/(4) or (A)/(B)/(C)/(D) or similar
            opt_delims = list(re.finditer(r'(?:^|\n|\s{2,})(?:\(([1-4A-Da-d])\)|([1-4A-Da-d])[\)\.])(?=\s+|$)', options_part, re.IGNORECASE))
            if len(opt_delims) >= 4:
                for j, delim in enumerate(opt_delims[:4]):
                    o_start = delim.start()
                    o_end = opt_delims[j+1].start() if j + 1 < len(opt_delims) else len(options_part)
                    opt_str = options_part[o_start:o_end].strip()
                    # Clean the option prefix, e.g. (1) A-I... -> A-I... or (A) A-I... -> A-I...
                    opt_str = re.sub(r'^\s*(?:\([1-4A-Da-d]\)|[1-4A-Da-d][\)\.])\s*', '', opt_str)
                    options.append(clean_junk_advertisement_lines(opt_str))
                q_text = stem_part + "\n" + choose_line
                combination_parsed = True
                q_type = "MATCH"

        if not combination_parsed:
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
            else:
                q_type = "NUMERICAL"
            
        questions.append({
            "question_number": q_num,
            "raw_content": q_text or f"Question details {q_num}",
            "question_type": q_type if combination_parsed else ("MCQ" if options else "NUMERICAL"),
            "options": options if options else None,
            "correct_answer": None,
            "explanation": None
        })
        
    return {
        "questions": sorted(questions, key=lambda x: x["question_number"]),
        "answer_key": {}
    }
