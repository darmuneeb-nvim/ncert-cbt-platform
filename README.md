# NCERT-Tagged CBT Question Bank Platform

A personal-use web platform designed to ingest question banks and mock papers (PDFs/e-files), extract questions, automatically tag them against an NCERT-based taxonomy (Physics, Chemistry, Biology, Mathematics), catalog them in a searchable question library, and deliver them through a JEE Main / NEET-style Computer-Based Test (CBT) player.

The platform tracks granular performance metrics (time spent, speed pacing, accuracy) and automatically routes wrong and skipped questions to external tools (Anki, Notion) as well as mirroring them in-app for review.

---

## 🚀 Current Project Status & Progress

The core platform architecture is fully implemented, with operational backend API endpoints and a fully responsive single-page web app (SPA) React frontend.

| Feature Area | Sub-Feature / Detail | Status |
| :--- | :--- | :--- |
| **Backend Core** | FastAPI endpoints & routing structure | **Completed** |
| | SQLite database structure & SQLAlchemy ORM mapping | **Completed** |
| | Local uploading & file storage system | **Completed** |
| **Ingestion Pipeline** | PDF Text Extraction (PyMuPDF) | **Completed** |
| | OCR Fallback (PyTesseract + pdf2image) for scanned pages | **Completed** |
| | Question parser & formatting agent (Gemini 1.5/3.5 Flash) | **Completed** |
| | Automated Answer Key extractor (Regex & Gemini fallback) | **Completed** |
| **Taxonomy & AI Tagging** | Locked NCERT Subject -> Chapter -> Concept Taxonomy JSON | **Completed** |
| | Gemini-powered batch question tagging & difficulty classification | **Completed** |
| | High-confidence threshold & "Needs Review" status flagging | **Completed** |
| | Rule-based & keyword-based Subject Fallback tagger | **Completed** |
| **CBT Mock Test Player** | JEE Main / NEET style test player interface | **Completed** |
| | Live Timer, Interactive Question Palette (Attempted, Marked, etc.) | **Completed** |
| | Support for multiple formats (MCQ, Assertion-Reason, Numerical) | **Completed** |
| **Attempt Tracking** | Score computation (+4 / -1 JEE scheme) and accuracy metrics | **Completed** |
| | Time-spent logging & Speed Pacing category derivation | **Completed** |
| **Integrations & Mirroring** | Anki integration via AnkiConnect local API for wrong answers | **Completed** |
| | Notion integration via REST API for skipped answers | **Completed** |
| | In-app Flashcard spaced repetition page (mirroring wrong answers) | **Completed** |
| | In-app Skipped Question solver with a 5-minute timer limit | **Completed** |
| | Quiz Session Attempts History timeline | **Completed** |
| **System Customizations** | UI themes (Space Dark, Ocean Dark, Classic Slate) | **Completed** |
| | Font selection & default question timer durations | **Completed** |

---

## 🛠️ Core Functions & Features

### 1. Paper Ingestion & Parsing
* **PDF Upload:** Accepts exam paper PDFs and extracts raw text using **PyMuPDF**.
* **OCR Fallback:** Automatically falls back to **Tesseract OCR** when the selectable text length is negligible (e.g., scanned PDFs).
* **Gemini Parsing:** The parsed text is sent in batches to **Gemini 1.5/3.5 Flash** to clean, format, and classify question blocks into structural JSON models representing MCQs, Numerical inputs, Assertion-Reason, or Match Column questions.
* **Answer Key Matching:** Extracts answer keys using regex and Gemini API analysis. If an answer key is detected/provided, questions are matched and marked as ready.

### 2. AI Taxonomy Tagging
* **Locked Reference Taxonomy:** Tags questions against a predefined hierarchy of standard NCERT subjects, chapters, and concepts loaded from `backend/data/taxonomy.json`.
* **Automated Classification:** Automatically analyzes question text to assign difficulty (`easy`, `medium`, `hard`) and tags.
* **Confidence Gating:** If Gemini's tagging confidence drops below `0.7`, the question's status is set to `needs_review` to suggest manual correction.
* **Keyword Fallback:** If the Gemini API is offline or missing a key, a local rule-based regex fallback identifies key terms to tag at least the `Subject` so the question remains CBT-eligible.

### 3. Library & Question Store
* **Central Catalog:** A unified question database viewable by subject, chapter, or ingestion status.
* **Filtering & Search:** Allows robust queries by Subject, Chapter, Difficulty, Tagging Status, and Question Type.
* **Bulk Management:** Supports bulk taxonomy editing (tagging multiple questions at once) and bulk deletion.

### 4. JEE/NEET CBT Player
* **Authentic Interface:** Standardized computer-based test simulator.
* **Interactive Navigation:** Navigation palette displaying color-coded statuses (Answered, Marked for Review, Unvisited, etc.).
* **Dynamic Formats:** Renders proper interfaces for MCQ options, statement checkboxes for Assertion-Reason, and text boxes for Numerical questions.
* **Submission Grading:** Scores sessions instantly using standard JEE marking rules (+4 for correct, -1 for wrong, 0 for skipped).

### 5. Analytics Dashboard
* **Performance Overview:** Tracks total questions, attempts, average accuracy, and average response times.
* **Weak Concept Analytics:** Highlights concepts with less than 50% accuracy across 3 or more attempts.
* **Speed/Pace Categorization:** Groups attempts into:
  * *Fast-correct* (Correct, ≤45 seconds)
  * *Slow-correct* (Correct, >45 seconds)
  * *Fast-wrong* (Wrong, ≤45 seconds - indicators of guessing)
  * *Slow-wrong* (Wrong, >45 seconds - indicators of genuine knowledge gaps)

### 6. Review & Post-Attempt Routing
* **Anki Integration:** Failed questions trigger an automatic background job pushing structured HTML cards (front: question + options, back: answer + explanation) directly into a local Anki deck via **AnkiConnect**.
* **Notion Integration:** Skipped questions are pushed as items with metadata properties into a user-linked Notion Database via the **Notion API**.
* **In-App Flashcards:** An interactive review mode mirroring wrong questions as spaced-repetition flip-cards.
* **In-App Skipped Solve:** A 5-minute timed exam simulator specifically to retry skipped questions.
* **Temporal History:** Groups individual question attempts into distinct sessions for detailed retrospective reviews.

---

## ⚠️ Shortcomings & Limitations

While highly functional, the platform currently has several shortcomings and technical limitations:

1. **Single-User / No Authentication:**
   * The platform operates under the assumption of a single local user. There is no user registration, password authentication, or session isolation.
   * Multiple users sharing the same deployment will overwrite database entries, settings, and attempts history.
2. **Text-Only Question Parsing (No Image Extraction):**
   * The ingestion pipeline parses and structures text contents only.
   * If a math, physics, or chemistry question relies heavily on an embedded diagram, chart, or visual formula in the PDF, the image is **not** extracted or stored. The CBT Player will only show text, which may make diagram-reliant questions unsolvable.
3. **Local Anki Sync Dependency:**
   * The Anki integration relies on **AnkiConnect**, which is a local desktop application add-on executing on `http://localhost:8765`.
   * For the sync to work, the Anki desktop application must be open and running on the same machine hosting the server during submission. Cloud Anki syncing is not supported directly.
4. **Manual Notion Database Setup Overhead:**
   * Pushing skipped questions to Notion requires the database ID and token. However, the database schema (columns like `Name`, `Subject`, `Chapter`, `Difficulty`, `Correct Answer`) must be manually configured in Notion first by the user. The app cannot auto-generate a new template database structure.
5. **OCR Quality Limits:**
   * Scanned PDFs fall back to PyTesseract. PyTesseract is frequently prone to typographical errors when processing complex mathematical notation, chemical formula subscripts, symbols (like $\theta$, $\alpha$), and matrices.
6. **Locked Taxonomy structure:**
   * The taxonomy is statically loaded from `backend/data/taxonomy.json`. There is no visual UI within the website to add, remove, or modify chapters and concepts dynamically. Any customizations must be edited manually in the taxonomy JSON file.

---

## 💻 Tech Stack

### Backend
* **Web Framework:** FastAPI (Python)
* **ORM & Database:** SQLAlchemy with SQLite (data stored locally at `/backend/data/database.db`)
* **PDF Processing:** PyMuPDF (fitz)
* **OCR Library:** PyTesseract (Tesseract OCR Engine wrapper) + pdf2image
* **AI API Engine:** google-generativeai (Gemini API SDK)
* **HTTP Client:** httpx & requests

### Frontend
* **UI Framework:** React (v19) with TypeScript
* **Build Tool:** Vite
* **Styling:** Vanilla CSS variables for theme and font configurations
* **Icons:** Lucide React

---

## 🛠️ Installation & Running Guide

### Prerequisites
* Python 3.10+
* Node.js 18+
* Tesseract OCR installed on the system path (if OCR fallback is needed)
* Anki Desktop with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) addon installed (if syncing wrong questions)

### Setup Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the workspace root or backend directory and configure the environment variables:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ANKI_CONNECT_URL=http://localhost:8765
   ANKI_DECK_NAME="NEET/JEE Wrong Questions"
   NOTION_TOKEN=your_notion_integration_token_here
   NOTION_DATABASE_ID=your_notion_database_id_here
   ```
5. Run the development server:
   ```bash
   python run.py
   ```
   The backend will start on `http://localhost:8000`.

### Setup Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the frontend dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
   The application will start on `http://localhost:5173`.
