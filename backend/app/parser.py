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

LATEXOCR_AVAILABLE = False
try:
    from pix2tex.cli import LatexOCR
    LATEXOCR_AVAILABLE = True
except ImportError:
    logger.warning("pix2tex not found. LaTeX OCR fallback will be disabled.")

latex_ocr_model = None

def get_latex_ocr():
    global latex_ocr_model
    if not LATEXOCR_AVAILABLE:
        return None
    if latex_ocr_model is None:
        logger.info("Initializing LatexOCR model (this may take a few seconds on first load)...")
        try:
            latex_ocr_model = LatexOCR()
        except Exception as e:
            logger.error(f"Failed to initialize LatexOCR model: {e}")
            return None
    return latex_ocr_model

def get_gemini_model(api_key: str = "", system_instruction: Optional[str] = None):
    """Initializes and returns an active Gemini GenerativeModel instance."""
    key = api_key or settings.gemini_api_key
    if not key:
        return None
    import google.generativeai as genai
    genai.configure(api_key=key)
    
    # Prioritize active models
    candidates = ["gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash-lite"]
    for model_name in candidates:
        try:
            if system_instruction:
                return genai.GenerativeModel(model_name, system_instruction=system_instruction)
            return genai.GenerativeModel(model_name)
        except Exception:
            continue
    return genai.GenerativeModel("gemini-3.7-flash")

def is_equation_heavy(text: str) -> bool:
    if not text or not text.strip():
        return False
    # Count math symbols and operators
    math_chars = sum(1 for c in text if c in "=+-*/^_{}()\\∫∑√πθαβγλω[]$")
    # If math characters represent more than 3% of the text, or if common math/physics keywords appear
    math_keywords = ["sin", "cos", "tan", "log", "lim", "theta", "alpha", "beta", "gamma", "lambda", "omega", "dy/dx", "dx", "dt"]
    has_keyword = any(kw in text.lower() for kw in math_keywords)
    ratio = math_chars / len(text)
    return ratio > 0.03 or has_keyword

def clean_junk_advertisement_lines(text: str) -> str:
    if not text:
        return ""
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

def clean_option_text(opt: str) -> str:
    """Strips leading option bullets like (a), (A), a., 1., etc. to prevent double labeling."""
    if not opt:
        return ""
    cleaned = clean_junk_advertisement_lines(opt).strip()
    # Strip (A), (1), (a), A., 1., a., A), 1) prefixes
    cleaned = re.sub(r'^\s*(?:\([1-4A-Da-d]\)|[1-4A-Da-d][\.\)]|\b[1-4A-Da-d]\b[\.\)])\s*', '', cleaned)
    return cleaned.strip()

def parse_answer_key_grid(text: str) -> Dict[str, str]:
    """
    Parses answer key grids where question numbers and answer options are arranged in:
    - Vertical column blocks (e.g. numbers 1..17 followed by answers d..a)
    - Horizontal alternating rows
    - Standard inline key formats (e.g. 1. a, 1 - B, Q1. (C), etc.)
    """
    key: Dict[str, str] = {}
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # 1. Check vertical column chunks (sequence of consecutive numbers followed by equal length of single letters/digits)
    i = 0
    while i < len(lines):
        if lines[i].isdigit():
            num_seq = []
            cur_i = i
            while cur_i < len(lines) and lines[cur_i].isdigit():
                num_val = int(lines[cur_i])
                if not num_seq or num_val == num_seq[-1] + 1:
                    num_seq.append(num_val)
                    cur_i += 1
                else:
                    break
            
            if len(num_seq) >= 2:
                ans_seq = []
                ans_i = cur_i
                while ans_i < len(lines) and len(ans_seq) < len(num_seq):
                    val = lines[ans_i].lower()
                    if val in ["a", "b", "c", "d", "1", "2", "3", "4"]:
                        ans_seq.append(val)
                        ans_i += 1
                    else:
                        break
                
                if len(ans_seq) == len(num_seq):
                    for n, a in zip(num_seq, ans_seq):
                        v = a.upper()
                        if v in ["1", "2", "3", "4"]:
                            v = chr(ord("A") + int(v) - 1)
                        key[str(n)] = v
                    i = ans_i
                    continue
        i += 1
    
    # 2. Check alternating lines: numbers row followed by answers row
    for i in range(len(lines) - 1):
        l1 = lines[i]
        l2 = lines[i + 1]
        
        nums = re.findall(r'\b\d+\b', l1)
        anss = re.findall(r'\b[a-dA-D1-4]\b', l2)
        
        if nums and anss and len(nums) == len(anss):
            int_nums = [int(n) for n in nums]
            if len(int_nums) >= 2 and all(int_nums[j] < int_nums[j+1] for j in range(len(int_nums)-1)):
                for n, a in zip(nums, anss):
                    val = a.upper()
                    if val in ['1', '2', '3', '4']:
                        val = chr(ord('A') + int(val) - 1)
                    if str(n) not in key:
                        key[str(n)] = val

    # 3. Check standard inline/regex patterns (e.g. 1-A, 1. B, Q1 (C))
    try:
        key_pattern = r'(?:Q|Question|Q\.)?\s*(\d+)\s*[\.\-\:\s\n]+\s*(?:\(([A-Da-d1-4])\)|([A-Da-d1-4]))(?=\s|$|\n)'
        regex_matches = re.finditer(key_pattern, text)
        for m in regex_matches:
            q_num = str(int(m.group(1)))
            raw_ans = (m.group(2) or m.group(3)).upper()
            if raw_ans in ['1', '2', '3', '4']:
                raw_ans = chr(ord('A') + int(raw_ans) - 1)
            if q_num not in key:
                key[q_num] = raw_ans
    except Exception as e:
        logger.error(f"Regex answer key parsing error: {e}")
        
    return key

def extract_answer_key(pages: List[str], total_text: str) -> Dict[str, str]:
    """
    Scans pages for Answer Key markers, runs grid and regex extraction,
    and falls back to Gemini structured extraction if needed.
    """
    answer_key: Dict[str, str] = {}
    answer_key_text = ""
    
    # Locate answer key pages
    for idx, p_text in enumerate(pages):
        lower_p = p_text.lower()
        if "answer key" in lower_p or "answer-key" in lower_p or ("answers" in lower_p and "hints & solutions" not in lower_p and idx > len(pages)/2):
            logger.info(f"Found Answer Key page marker on Page {idx + 1}")
            answer_key_text += p_text + "\n"
            if idx + 1 < len(pages):
                answer_key_text += pages[idx + 1] + "\n"
            break

    if not answer_key_text:
        answer_key_text = "\n".join(pages[-4:]) if len(pages) >= 4 else total_text

    # 1. Attempt grid and regex parsing first
    answer_key = parse_answer_key_grid(answer_key_text)
    logger.info(f"Local grid/regex answer key parsing extracted {len(answer_key)} entries.")

    # 2. If nothing or very few answers found, use Gemini Flash
    if len(answer_key) < 5 and settings.gemini_api_key:
        try:
            model = get_gemini_model()
            if model:
                key_prompt = f"""
Analyze the following text block from an Indian entrance exam paper (JEE/NEET) and extract the Answer Key.
Extract all mappings of Question Number to Correct Answer option (e.g. 1 -> "A", 2 -> "C").
If options are numbers (1, 2, 3, 4), convert them to letters (1->A, 2->B, 3->C, 4->D).

Return the result STRICTLY as a JSON object:
{{
  "answer_key": {{
    "1": "A",
    "2": "B"
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
                    for k, v in gemini_key.items():
                        norm_v = str(v).strip().upper()
                        if norm_v in ['1', '2', '3', '4']:
                            norm_v = chr(ord('A') + int(norm_v) - 1)
                        answer_key[str(k)] = norm_v
                    logger.info(f"Gemini extracted answer key with {len(gemini_key)} items.")
        except Exception as e:
            logger.error(f"Gemini answer key extraction failed: {str(e)}")

    return answer_key

def parse_pdf_to_questions(file_path: str, paper_id: int) -> Dict[str, Any]:
    """
    Parses a PDF mock paper. Extracts page text (running OCR fallback if needed),
    locates the answer key, and uses Gemini Flash structured output to parse questions
    with direct subject, topic, difficulty, and confidence scoring.
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
                latex_ocr = get_latex_ocr()
                
                for idx, img in enumerate(images):
                    logger.info(f"OCRing page {idx + 1}/{len(images)}...")
                    p_text = f"\n--- Page {idx + 1} ---\n"
                    raw_ocr_text = pytesseract.image_to_string(img)
                    
                    if latex_ocr and is_equation_heavy(raw_ocr_text):
                        logger.info(f"Page {idx + 1} is flagged as equation-heavy. Running LatexOCR enhancement...")
                        try:
                            data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
                            line_words = {}
                            for w_idx in range(len(data['text'])):
                                word_txt = data['text'][w_idx].strip()
                                if word_txt:
                                    block_num = data['block_num'][w_idx]
                                    line_num = data['line_num'][w_idx]
                                    key = (block_num, line_num)
                                    if key not in line_words:
                                        line_words[key] = []
                                    line_words[key].append({
                                        'text': word_txt,
                                        'left': data['left'][w_idx],
                                        'top': data['top'][w_idx],
                                        'width': data['width'][w_idx],
                                        'height': data['height'][w_idx]
                                    })
                            
                            page_lines = []
                            for key in sorted(line_words.keys()):
                                words = line_words[key]
                                line_text = " ".join([w['text'] for w in words])
                                if is_equation_heavy(line_text) and len(line_text) > 2:
                                    min_left = max(0, min([w['left'] for w in words]) - 8)
                                    min_top = max(0, min([w['top'] for w in words]) - 8)
                                    max_right = min(img.width, max([w['left'] + w['width'] for w in words]) + 8)
                                    max_bottom = min(img.height, max([w['top'] + w['height'] for w in words]) + 8)
                                    
                                    if max_right > min_left and max_bottom > min_top:
                                        line_crop = img.crop((min_left, min_top, max_right, max_bottom))
                                        try:
                                            latex_val = latex_ocr(line_crop)
                                            if latex_val and latex_val.strip():
                                                line_text = f"${latex_val.strip()}$"
                                        except Exception as ocr_err:
                                            logger.error(f"LatexOCR line transcription failed: {ocr_err}")
                                
                                page_lines.append(line_text)
                            p_text += "\n".join(page_lines)
                        except Exception as data_err:
                            logger.error(f"Failed image_to_data layout parsing: {data_err}")
                            p_text += raw_ocr_text
                    else:
                        p_text += raw_ocr_text
                        
                    pages.append(p_text)
                
                total_text = "\n".join(pages)
                is_ocr = True
            except Exception as e:
                logger.error(f"OCR failed: {str(e)}")
        else:
            logger.warning("OCR required but pytesseract or pdf2image is not installed.")

    # Step 1: Scan & Extract Answer Key
    answer_key = extract_answer_key(pages, total_text)

    # Step 2: Extract questions page-by-page (grouping in batches)
    question_pages = []
    stop_keywords = ["hints & solutions", "detailed solutions", "text solution", "answer key", "answer-key", "answers & explanations"]
    
    for idx, p_text in enumerate(pages):
        lower_p = p_text.lower()
        if any(kw in lower_p for kw in stop_keywords):
            logger.info(f"Detected Solutions/Key section on Page {idx + 1}. Stopping question collection.")
            break
        question_pages.append(p_text)
        
    if not question_pages:
        question_pages = pages

    all_questions = []
    group_size = 4
    page_groups = [question_pages[i:i + group_size] for i in range(0, len(question_pages), group_size)]
    
    model = get_gemini_model()
    if model and settings.gemini_api_key:
        from PIL import Image
        for idx, group in enumerate(page_groups):
            logger.info(f"Parsing page group {idx + 1}/{len(page_groups)} via Gemini...")
            group_text = "\n".join(group)
            
            start_page_num = idx * group_size + 1
            end_page_num = min(start_page_num + len(group) - 1, len(doc))
            
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
                images_manifest = "The following images/diagrams from these pages are provided in the payload:\n"
                for img_idx, img_path in enumerate(group_images):
                    try:
                        f_name = os.path.basename(img_path)
                        img_obj = Image.open(img_path)
                        contents.append(img_obj)
                        images_manifest += f"- Image {img_idx + 1}: \"{f_name}\"\n"
                    except Exception as img_err:
                        logger.error(f"Failed to load image {img_path}: {img_err}")
                images_manifest += "Map matched image filenames to question 'images' array or set null if none.\n"

            prompt = f"""
You are an expert Indian entrance exam (JEE Main / NEET) parsing system.
Extract all questions from the following exam paper text block.

{images_manifest}

Extraction Guidelines:
1. question_number: Integer question index (e.g. 1, 2, 34).
2. raw_content: Full question statement/stem in clean markdown formatting. Keep equations in LaTeX notation ($...$). For Match-the-Following or Statement questions, include the statements and lists in raw_content.
3. question_type: Must be one of: "MCQ" | "AR" | "MATCH" | "NUMERICAL".
4. options: For MCQ, list of exactly 4 option text strings.
   * Strip off option prefixes like (a), (b), (c), (d), 1., 2., A), B) so only the pure option text remains.
5. correct_answer: Option letter ('A', 'B', 'C', 'D') if stated or embedded. Otherwise null.
6. explanation: Embedded solution/explanation if present. Otherwise null.
7. subject: Must be one of: "Physics" | "Chemistry" | "Biology" | "Mathematics".
8. chapter: Chapter or topic title from header (e.g. "Ecosystem", "Electromagnetic Induction").
9. difficulty: "easy" (direct recall), "medium" (single-step application), or "hard" (multi-step reasoning).
10. confidence: Float from 0.0 to 1.0 representing extraction completeness and accuracy.
11. images: List of diagram filenames matched from manifest, or null.

Return the result STRICTLY as a JSON object with this schema:
{{
  "questions": [
    {{
      "question_number": int,
      "raw_content": "string",
      "question_type": "MCQ" | "AR" | "MATCH" | "NUMERICAL",
      "options": ["string", "string", "string", "string"] or null,
      "correct_answer": "string" or null,
      "explanation": "string" or null,
      "subject": "Physics" | "Chemistry" | "Biology" | "Mathematics",
      "chapter": "string",
      "difficulty": "easy" | "medium" | "hard",
      "confidence": float,
      "images": ["string"] or null
    }}
  ]
}}

Exam Paper Text Group:
{group_text}
"""
            contents.append(prompt)
            try:
                response = model.generate_content(
                    contents,
                    generation_config={"response_mime_type": "application/json"}
                )
                data = json.loads(response.text)
                questions_parsed = data.get("questions", [])
                logger.info(f"Page group {idx + 1} yielded {len(questions_parsed)} questions.")
                all_questions.extend(questions_parsed)
                time.sleep(1.0)
            except Exception as e:
                logger.error(f"Gemini batch extraction failed on group {idx + 1}: {str(e)}")
                dummy = get_dummy_parsed_response(group_text)
                all_questions.extend(dummy.get("questions", []))
    else:
        dummy = get_dummy_parsed_response(total_text)
        all_questions = dummy.get("questions", [])

    # Step 3: Extract Explanations from solutions pages if present
    explanations = {}
    solutions_start_idx = len(question_pages)
    if solutions_start_idx < len(pages):
        solutions_text = "\n".join(pages[solutions_start_idx:])
        logger.info("Extracting explanations from solutions section...")
        try:
            pattern = r'(?:^|\n)\s*(?:Q|Question|Q\.)?\s*(\d+)\s*\n*\s*(?:Text Solution|Solution|Explanation):'
            matches = list(re.finditer(pattern, solutions_text, re.IGNORECASE))
            for i, match in enumerate(matches):
                q_num = match.group(1)
                start_idx = match.end()
                end_idx = matches[i+1].start() if i + 1 < len(matches) else len(solutions_text)
                expl_content = solutions_text[start_idx:end_idx].strip()
                explanations[q_num] = clean_junk_advertisement_lines(expl_content)
        except Exception as e:
            logger.error(f"Local explanations extraction error: {e}")

    # Step 4: Post-Processing, Answer Key Matching, and Extraction Review Gate
    processed_questions = []
    seen_q_nums = set()
    
    for q_data in all_questions:
        q_num = q_data.get("question_number")
        if q_num in seen_q_nums or not q_num:
            continue
        seen_q_nums.add(q_num)
        q_num_str = str(q_num)
        
        # Attach explanation if found
        if q_num_str in explanations and not q_data.get("explanation"):
            q_data["explanation"] = clean_junk_advertisement_lines(explanations[q_num_str])

        # Attach answer key if not already embedded
        corr_ans = q_data.get("correct_answer")
        if not corr_ans and q_num_str in answer_key:
            corr_ans = answer_key[q_num_str]
            q_data["correct_answer"] = corr_ans
        elif corr_ans:
            corr_ans = str(corr_ans).strip().upper()
            if corr_ans in ['1', '2', '3', '4']:
                corr_ans = chr(ord('A') + int(corr_ans) - 1)
            q_data["correct_answer"] = corr_ans

        # Clean raw question content
        q_data["raw_content"] = clean_junk_advertisement_lines(q_data.get("raw_content", ""))

        # Clean and validate options list
        raw_opts = q_data.get("options")
        clean_opts = None
        if raw_opts and isinstance(raw_opts, list):
            clean_opts = [clean_option_text(opt) for opt in raw_opts if str(opt).strip()]
            q_data["options"] = clean_opts

        # REVIEW & ERROR GATE EVALUATION
        # Rules:
        # 1. Must have correct_answer
        # 2. For MCQ: must have exactly 4 options (if >4 or <4, flagged)
        # 3. Confidence must be >= 0.7
        # 4. raw_content must be meaningful
        q_type = q_data.get("question_type", "MCQ")
        confidence = float(q_data.get("confidence", 1.0) or 1.0)
        
        has_error = False
        error_reasons = []
        
        if not q_data.get("correct_answer"):
            has_error = True
            error_reasons.append("missing_answer")
            
        if q_type == "MCQ":
            if not clean_opts or len(clean_opts) != 4:
                has_error = True
                error_reasons.append(f"invalid_options_count_{len(clean_opts) if clean_opts else 0}")
                
        if len(q_data.get("raw_content", "")) < 10:
            has_error = True
            error_reasons.append("empty_or_short_question_text")
            
        if confidence < 0.7:
            error_reasons.append("low_confidence")

        # Assign tagging / review status
        if has_error or "low_confidence" in error_reasons:
            q_data["tagging_status"] = "needs_review"
        elif q_data.get("subject") and q_data.get("chapter"):
            q_data["tagging_status"] = "fully_tagged"
        elif q_data.get("subject"):
            q_data["tagging_status"] = "subject_tagged"
        else:
            q_data["tagging_status"] = "untagged"

        q_data["error_reasons"] = error_reasons
        processed_questions.append(q_data)

    processed_questions.sort(key=lambda x: int(x.get("question_number", 0)))

    return {
        "questions": processed_questions,
        "answer_key": answer_key,
        "is_ocr": is_ocr
    }

def get_dummy_parsed_response(raw_text: str) -> Dict[str, Any]:
    """
    Regex-based fallback parser for question extraction.
    """
    logger.info("Generating regex-based fallback parsing...")
    questions = []
    
    pattern = r'(?:(?:^|\n)\s*(?:Q|Question|Q\.)\s*(\d+)(?:[\.\)\s\n]|$))|(?:(?:^|\n)\s*(\d+)[\.\)\:-]\s+)'
    matches = re.finditer(pattern, raw_text, re.IGNORECASE)
    match_list = list(matches)
    
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
        options = []
        combination_parsed = False
        q_type = "MCQ"
        
        # Check if the question contains match combination pattern
        match_pattern = r"(Choose the correct answer from the options given below|Choose the correct option)"
        match_search = re.search(match_pattern, q_text, re.IGNORECASE)
        if match_search:
            split_idx = match_search.start()
            stem_part = q_text[:split_idx].strip()
            choose_line = match_search.group(0)
            options_part = q_text[split_idx + len(choose_line):].strip()
            
            opt_delims = list(re.finditer(r'(?:^|\n|\s{2,})(?:\(([1-4A-Da-d])\)|([1-4A-Da-d])[\)\.])(?=\s+|$)', options_part, re.IGNORECASE))
            if len(opt_delims) >= 4:
                for j, delim in enumerate(opt_delims[:4]):
                    o_start = delim.start()
                    o_end = opt_delims[j+1].start() if j + 1 < len(opt_delims) else len(options_part)
                    opt_str = clean_option_text(options_part[o_start:o_end])
                    options.append(opt_str)
                q_text = stem_part + "\n" + choose_line
                combination_parsed = True
                q_type = "MATCH"

        if not combination_parsed:
            opt_matches = list(re.finditer(r'(?:^|\n|\s{2,})(?:\(([A-Da-d1-4])\)|([A-Da-d1-4])[\)\.])(?=\s+|$)', q_text, re.IGNORECASE))
            if opt_matches and len(opt_matches) >= 4:
                opt_slices = opt_matches[-4:]
                for j, opt_match in enumerate(opt_slices):
                    o_start = opt_match.start()
                    o_end = opt_slices[j+1].start() if j + 1 < len(opt_slices) else len(q_text)
                    opt_str = clean_option_text(q_text[o_start:o_end])
                    options.append(opt_str)
                q_text = q_text[:opt_slices[0].start()].strip()
            else:
                q_type = "NUMERICAL"
            
        questions.append({
            "question_number": q_num,
            "raw_content": clean_junk_advertisement_lines(q_text) or f"Question details {q_num}",
            "question_type": q_type if combination_parsed else ("MCQ" if options else "NUMERICAL"),
            "options": options if options else None,
            "correct_answer": None,
            "explanation": None,
            "confidence": 0.6
        })

        
    return {
        "questions": sorted(questions, key=lambda x: x["question_number"]),
        "answer_key": {}
    }
