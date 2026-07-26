const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "http://localhost:8000/api";

export interface QuestionTag {
  id: number;
  question_id: number;
  subject: string | null;
  chapter: string | null;
  concept: string | null;
  difficulty: string | null;
  tag_source: string;
  confidence: number | null;
  updated_at: string;
}

export interface Question {
  id: number;
  paper_id: number;
  question_number: number;
  raw_content: string;
  question_type: "MCQ" | "AR" | "MATCH" | "NUMERICAL";
  options: string | null; // JSON list string
  correct_answer: string | null;
  explanation: string | null;
  tagging_status: "untagged" | "subject_tagged" | "fully_tagged" | "needs_review";
  created_at: string;
  tags?: QuestionTag;
  last_attempt_time?: number | null;
}

export interface Paper {
  id: number;
  filename: string;
  answer_key_status: "pending" | "matched" | "no_key";
  created_at: string;
  question_count: number;
}

export interface TestSubmissionItem {
  question_id: number;
  selected_answer: string | null;
  time_spent: number;
}

export interface Attempt {
  id: number;
  question_id: number;
  time_spent: number;
  result: "correct" | "wrong" | "skipped";
  selected_answer: string | null;
  attempt_number: number;
  timestamp: string;
}

export interface TestSubmissionResult {
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  accuracy: number;
  details: Attempt[];
}

export interface SubjectStat {
  subject: string;
  total_questions: number;
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface ConceptStat {
  concept: string;
  attempts: number;
  accuracy: number;
}

export interface DashboardStats {
  total_questions: number;
  total_attempts: number;
  average_accuracy: number;
  average_time_per_question: number;
  subject_wise: SubjectStat[];
  weak_concepts: ConceptStat[];
  fast_correct: number;
  slow_correct: number;
  fast_wrong: number;
  slow_wrong: number;
}

export const api = {
  // Papers
  async getPapers(): Promise<Paper[]> {
    const res = await fetch(`${API_BASE_URL}/papers`);
    if (!res.ok) throw new Error("Failed to fetch papers");
    return res.json();
  },

  async uploadPaper(file: File, answerKeyText?: string): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    if (answerKeyText) {
      formData.append("answer_key_text", answerKeyText);
    }
    const res = await fetch(`${API_BASE_URL}/papers/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Failed to upload paper");
    return res.json();
  },

  async deletePaper(paperId: number): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/papers/${paperId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete paper");
    return res.json();
  },

  async submitAnswerKey(paperId: number, answers: Record<string, string>): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/papers/${paperId}/answer-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) throw new Error("Failed to submit answer key");
    return res.json();
  },

  // Questions
  async getQuestions(params: {
    subject?: string;
    chapter?: string;
    difficulty?: string;
    tagging_status?: string;
    question_type?: string;
    page?: number;
    limit?: number;
  }): Promise<{ total: number; questions: Question[] }> {
    const searchParams = new URLSearchParams();
    if (params.subject) searchParams.append("subject", params.subject);
    if (params.chapter) searchParams.append("chapter", params.chapter);
    if (params.difficulty) searchParams.append("difficulty", params.difficulty);
    if (params.tagging_status) searchParams.append("tagging_status", params.tagging_status);
    if (params.question_type) searchParams.append("question_type", params.question_type);
    if (params.page) searchParams.append("page", String(params.page));
    if (params.limit) searchParams.append("limit", String(params.limit));

    const res = await fetch(`${API_BASE_URL}/questions?${searchParams.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch questions");
    return res.json();
  },

  async getQuestionDetail(id: number): Promise<Question & { attempts: Attempt[] }> {
    const res = await fetch(`${API_BASE_URL}/questions/${id}`);
    if (!res.ok) throw new Error("Failed to fetch question detail");
    return res.json();
  },

  async bulkTagQuestions(
    ids: number[],
    tags: { subject?: string; chapter?: string; concept?: string; difficulty?: string }
  ): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/questions/bulk-tag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_ids: ids, ...tags }),
    });
    if (!res.ok) throw new Error("Failed to bulk tag questions");
    return res.json();
  },

  async bulkDeleteQuestions(ids: number[]): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/questions/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_ids: ids }),
    });
    if (!res.ok) throw new Error("Failed to bulk delete questions");
    return res.json();
  },

  async updateQuestionTags(
    id: number,
    tags: { subject?: string; chapter?: string; concept?: string; difficulty?: string }
  ): Promise<Question> {
    const res = await fetch(`${API_BASE_URL}/questions/${id}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tags),
    });
    if (!res.ok) throw new Error("Failed to update tags");
    return res.json();
  },

  async triggerTagger(): Promise<any> {
    const res = await fetch(`${API_BASE_URL}/tagger/run`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to trigger tagger");
    return res.json();
  },

  // CBT Test
  async generateTest(params: {
    subject?: string;
    subjects?: string[];
    chapter?: string;
    concept?: string;
    difficulty?: string;
    difficulties?: string[];
    limit?: number;
    subject_limits?: Record<string, number>;
  }): Promise<Question[]> {
    const res = await fetch(`${API_BASE_URL}/tests/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to generate test");
    }
    return res.json();
  },

  async submitTest(submissions: TestSubmissionItem[]): Promise<TestSubmissionResult> {
    const res = await fetch(`${API_BASE_URL}/tests/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissions }),
    });
    if (!res.ok) throw new Error("Failed to submit test");
    return res.json();
  },

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    const res = await fetch(`${API_BASE_URL}/dashboard/stats`);
    if (!res.ok) throw new Error("Failed to fetch stats");
    return res.json();
  },

  // Local Mirrors
  async getFlashcards(): Promise<Question[]> {
    const res = await fetch(`${API_BASE_URL}/in-app/flashcards`);
    if (!res.ok) throw new Error("Failed to fetch flashcards");
    return res.json();
  },

  async getSkipped(): Promise<Question[]> {
    const res = await fetch(`${API_BASE_URL}/in-app/skipped`);
    if (!res.ok) throw new Error("Failed to fetch skipped list");
    return res.json();
  },

  async getAttemptsHistory(): Promise<QuizSessionAttempt[]> {
    const res = await fetch(`${API_BASE_URL}/attempts/history`);
    if (!res.ok) throw new Error("Failed to fetch attempts history");
    return res.json();
  },

  async getDashboardQuestions(type: string): Promise<Question[]> {
    const res = await fetch(`${API_BASE_URL}/dashboard/questions?type=${type}`);
    if (!res.ok) throw new Error("Failed to fetch dashboard questions");
    return res.json();
  },
};

export interface HistorySubmissionItem {
  id: number;
  question_id: number;
  question_number: number;
  raw_content: string;
  question_type: "MCQ" | "AR" | "MATCH" | "NUMERICAL";
  options: string[] | null;
  correct_answer: string | null;
  explanation: string | null;
  selected_answer: string | null;
  result: "correct" | "wrong" | "skipped";
  time_spent: number;
  subject: string;
}

export interface QuizSessionAttempt {
  session_id: string;
  timestamp: string;
  total_questions: number;
  correct: number;
  wrong: number;
  skipped: number;
  score: number;
  accuracy: number;
  submissions: HistorySubmissionItem[];
}
