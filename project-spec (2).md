# NCERT-Tagged CBT Question Bank Platform — Project Spec

## Overview
A personal-use web platform that ingests question banks/papers (PDF/e-files), auto-extracts and tags questions against an NCERT-based taxonomy, stores them in a searchable library, and delivers them in a JEE Main/NEET-style Computer-Based Test (CBT) interface. Tracks attempt history and routes wrong/skipped questions to external tools (Anki, Notion) or in-app equivalents.

**Scale:** Single user (personal project). **Budget ceiling:** ~₹1000 total, rest free-tier. **Platform:** Starting as a web app (open to hosting suggestions).

---

## Core Feature Set

### 1. Ingestion
- Upload PDFs/e-files containing question banks or papers.
- **Gate rule:** a question bank is only registered/stored if an answer key is present — either embedded in the same file or uploaded separately and matched by question number.
- No answer key → bank held in a pending/rejected state, not added to the library.

### 2. Extraction
- Parse mixed question types: MCQ (single correct), assertion-reason, match-the-following, numerical/integer type.
- OCR fallback for scanned (non-text-selectable) PDFs.

### 3. AI Tagging
- Each question tagged with **Subject → Chapter → Concept**, matched against a **locked NCERT taxonomy** (generated once via AI from NCERT PDFs, human-reviewed, then frozen as the reference source of truth).
- Each question also tagged **Difficulty: Easy / Medium / Hard**, using the rule:
  - Easy = direct recall from an NCERT line
  - Medium = applying a concept/formula to a standard new situation
  - Hard = multi-step reasoning or combining concepts across chapters
- **Tagging queue system:**
  - Each question has a `tagging_status`: `untagged` / `subject_tagged` / `fully_tagged` / `needs_review`.
  - Daily background job (respecting free API quota) pulls untagged questions in batches (~15–20 per request to conserve request-count quotas) and tags them, prioritizing **Subject tag first for all questions**, then Chapter/Concept/Difficulty.
  - **Manual tagging** is always allowed and takes priority — a manually tagged question is marked done and skipped by the AI job.
  - Tag suggestions with low AI confidence are flagged `needs_review` for manual confirmation.

### 4. Library
- Single question store (no duplication); multiple browsing views (subject-wise, chapter-wise, topic-wise) are just filtered queries over the same data.
- **CBT eligibility rule:** a question needs *at minimum* a Subject tag to be usable in any test. Fuller tags unlock narrower filtering (e.g., chapter/topic-specific test generation) but are not required for basic usability.

### 5. CBT Test Player
- JEE Main/NEET-style interface: timer, question palette (attempted / not attempted / marked for review / not visited), free navigation between questions.
- Renders each question type appropriately (radio options for MCQ, two-statement layout for assertion-reason, matching UI for match-the-following, input field for numerical).

### 6. Attempt Tracking
Per question, per attempt, capture:
- Time spent (seconds)
- Result: Correct / Wrong / Skipped
- Selected vs. correct answer
- Timestamp, attempt number (if retried)

Derived categorization:
- Fast-correct / Slow-correct
- Fast-wrong (guess) / Slow-wrong (genuine gap)
- Revisit pool: wrong + skipped questions feed a "weak concepts" list

### 7. Post-Attempt Routing
- **Wrong questions →** pushed to Anki via AnkiConnect (local HTTP API, only works while Anki desktop is open with the AnkiConnect addon installed):
  - Single fixed deck (user-specified, e.g. "NEET Wrong Questions")
  - Tags: `subject::chapter::topic` (nested) + `difficulty::easy/medium/hard`
  - Card front = question (+options), back = correct answer + explanation
  - Also mirrored as an in-app flashcard/spaced-repetition mode (for when Anki isn't used)
- **Skipped questions →** pushed to a user-specified Notion database via the Notion API (OAuth), mapped to matching database properties.
  - Also mirrored as an in-app "Skipped" tab/list

### 8. Attempted Question Library
- Separate library section for previously attempted questions (design deferred — to be detailed in a later phase).

---

## Data Model (high level)
- `questions` — id, raw content, type, options, correct_answer, source_paper_id, tagging_status
- `taxonomy` — locked subject → chapter → concept reference list (per subject)
- `question_tags` — question_id, subject, chapter, concept, difficulty, tag_source (ai/manual), confidence
- `papers` — id, source file, answer_key_status
- `attempts` — id, question_id, timestamp, time_spent, result, selected_answer
- `routing_log` — question_id, destination (anki/notion), pushed_at

---

## Suggested Tech Stack
| Layer | Choice | Notes |
|---|---|---|
| Frontend | React (TypeScript) | CBT player + library UI |
| Backend | Python (FastAPI) or Node.js | Python preferred for PDF/OCR libraries |
| Database | PostgreSQL (or SQLite to start) | Relational fits tag/attempt relationships |
| PDF/OCR | PyMuPDF + Tesseract | Text extraction + scanned-page fallback |
| AI | Gemini API (Flash for volume, Pro for accuracy-critical tagging) | Separate from Gemini Pro subscription — needs its own API key/billing |
| Anki integration | AnkiConnect (local HTTP, desktop-only) | No public Anki cloud API exists |
| Notion integration | Notion API (OAuth) | |
| Hosting | Vercel / Render / Supabase free tier | Sufficient for single-user scale |

## Reference / Fork Candidates (reduce build-from-scratch work)
- **PDF-to-CBT** (github.com/CodeOmnium/PDF-to-CBT) — PDF upload, CV-based question box detection, OCR, question-type detection (SCQ/MCQ/Integer/Match Column), JEE-style marking scheme, optimized for free-tier deployment.
- **pdf2cbt** (github.com/TheMoonVyy/pdf2cbt) — working CBT test-player (timer, palette, navigation) that runs as a local server.
- Neither project handles NCERT tagging, difficulty classification, or Anki/Notion routing — that layer is the custom part to build.

## Budget Reality
- Hosting, Anki, Notion API, and Gemini Flash: free.
- ₹1000 ceiling covers occasional Gemini Pro-tier API calls for harder tagging cases; expect a slower, batch-paced, partly manual-review workflow rather than fully automated bulk processing.

## Known Open Items (deferred, not blockers)
- Partial-answer-key handling (reject whole bank vs. partial registration)
- Fixed vs. personalized time benchmarks for fast/slow classification
- Notion database schema template
- Full design of the separate "Attempted Question Library" section
- Final hosting choice (open to suggestions)

## Skills Required
HTML/CSS/JS → React fundamentals → REST API backend basics → relational DB design → PDF/OCR handling → external API integration (Gemini, AnkiConnect, Notion) → prompt engineering for consistent structured tagging output → Git/GitHub (for forking reference repos).

---
*This document is intended as a build brief for an agentic coding assistant to scaffold the initial project structure.*
