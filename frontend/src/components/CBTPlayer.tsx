import { useEffect, useState, useRef } from "react";
import { api, API_BASE_URL } from "../api";
import type { Question, TestSubmissionResult, Paper } from "../api";
import { Clock, Award, AlertTriangle, Eye, Zap, Sparkles, BookOpen, Layers, Target, ChevronDown, ChevronUp, Check, Play } from "lucide-react";
import confetti from "canvas-confetti";
import { NCERT_TAXONOMY } from "../taxonomy";
import FormattedQuestion from "./FormattedQuestion";

interface QuestionState {
  question: Question;
  selectedAnswer: string | null;
  status: "not_visited" | "not_answered" | "answered" | "marked_review" | "answered_marked";
  timeSpent: number; // in seconds
}

export default function CBTPlayer() {
  // Test generation configs
  const [testLimit, setTestLimit] = useState(() => {
    return Number(localStorage.getItem("cbt_limit") || "10");
  });
  
  // Selected Subject (Defaults to Biology or All)
  const [selectedSubject, setSelectedSubject] = useState<string>(() => {
    return localStorage.getItem("cbt_selected_subject") || "Biology";
  });

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>(() => {
    return localStorage.getItem("cbt_selected_difficulty") || "all";
  });

  const [presetMode, setPresetMode] = useState<"10" | "20" | "45" | "90" | "custom">(() => {
    const lim = Number(localStorage.getItem("cbt_limit") || "10");
    if ([10, 20, 45, 90].includes(lim)) return String(lim) as any;
    return "custom";
  });

  const [showOptionalFilters, setShowOptionalFilters] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedPapers, setSelectedPapers] = useState<number[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [availableQuestionsCount, setAvailableQuestionsCount] = useState<number>(38);

  useEffect(() => {
    api.getPapers().then(setPapers).catch(console.error);
  }, []);

  // Fetch question counts
  useEffect(() => {
    api.getQuestions({
      subject: selectedSubject === "all" ? undefined : selectedSubject,
      limit: 1
    }).then((res) => {
      setAvailableQuestionsCount(res.total);
    }).catch(() => {
      setAvailableQuestionsCount(38);
    });
  }, [selectedSubject]);

  const activeChapters = (selectedSubject !== "all" && NCERT_TAXONOMY[selectedSubject])
    ? Object.keys(NCERT_TAXONOMY[selectedSubject])
    : Object.entries(NCERT_TAXONOMY).flatMap(([s, chs]) => Object.keys(chs).map(c => `${s}: ${c}`));

  // Persist configurations
  useEffect(() => {
    localStorage.setItem("cbt_limit", String(testLimit));
    localStorage.setItem("cbt_selected_subject", selectedSubject);
    localStorage.setItem("cbt_selected_difficulty", selectedDifficulty);
  }, [testLimit, selectedSubject, selectedDifficulty]);

  // Test states
  const [questions, setQuestions] = useState<Question[]>([]);
  const [testStates, setTestStates] = useState<QuestionState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTestActive, setIsTestActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submission results
  const [result, setResult] = useState<TestSubmissionResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Timer reference
  const timerRef = useRef<any>(null);
  const questionTimerRef = useRef<any>(null);

  // Trigger confetti when test results load
  useEffect(() => {
    if (result) {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 }
      });
    }
  }, [result]);

  // Clean timers on unmount
  useEffect(() => {
    return () => {
      stopTimers();
    };
  }, []);

  const stopTimers = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
  };

  const handleStartTest = () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    setShowResult(false);
    
    const params: any = {
      limit: testLimit || 10
    };

    if (selectedSubject !== "all") {
      params.subject = selectedSubject;
    }
    
    if (selectedDifficulty !== "all") {
      params.difficulty = selectedDifficulty;
    }

    if (selectedChapters.length > 0) {
      params.chapters = selectedChapters.map(c => c.includes(":") ? c.split(":")[1].trim() : c);
    }
    if (selectedPapers.length > 0) {
      params.paper_ids = selectedPapers;
    }
    
    api.generateTest(params).then((data) => {
      setQuestions(data);
      
      // Initialize question states
      const states: QuestionState[] = data.map((q, idx) => ({
        question: q,
        selectedAnswer: null,
        status: idx === 0 ? "not_answered" : "not_visited",
        timeSpent: 0
      }));
      
      setTestStates(states);
      setCurrentIndex(0);
      
      // Calculate total test duration based on per-subject settings
      let totalTestSeconds = 0;
      data.forEach((q) => {
        const subj = q.tags?.subject || "General";
        const customSubjSec = localStorage.getItem(`cbt_duration_${subj}`);
        if (customSubjSec) {
          totalTestSeconds += Number(customSubjSec);
        } else {
          const globalDefaultSec = Number(localStorage.getItem("cbt_default_duration") || "180");
          totalTestSeconds += globalDefaultSec;
        }
      });
      setTimeLeft(totalTestSeconds || data.length * 180);
      setIsTestActive(true);
      setGenerating(false);
      
      startTimers();
    }).catch((err) => {
      setError(err.message || "Failed to find matching CBT-eligible questions for this selection.");
      setGenerating(false);
    });
  };

  const startTimers = () => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopTimers();
          handleSubmitTest(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    questionTimerRef.current = setInterval(() => {
      setTestStates((prevStates) => {
        const updated = [...prevStates];
        if (updated[currentIndex]) {
          updated[currentIndex] = {
            ...updated[currentIndex],
            timeSpent: updated[currentIndex].timeSpent + 1
          };
        }
        return updated;
      });
    }, 1000);
  };

  useEffect(() => {
    if (isTestActive) {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      
      setTestStates((prev) => {
        const updated = [...prev];
        if (updated[currentIndex] && updated[currentIndex].status === "not_visited") {
          updated[currentIndex].status = "not_answered";
        }
        return updated;
      });

      questionTimerRef.current = setInterval(() => {
        setTestStates((prevStates) => {
          const updated = [...prevStates];
          if (updated[currentIndex]) {
            updated[currentIndex] = {
              ...updated[currentIndex],
              timeSpent: updated[currentIndex].timeSpent + 1
            };
          }
          return updated;
        });
      }, 1000);
    }
  }, [currentIndex, isTestActive]);

  const handleSelectAnswer = (ans: string) => {
    setTestStates((prev) => {
      const updated = [...prev];
      updated[currentIndex].selectedAnswer = ans;
      if (updated[currentIndex].status === "marked_review" || updated[currentIndex].status === "answered_marked") {
        updated[currentIndex].status = "answered_marked";
      } else {
        updated[currentIndex].status = "answered";
      }
      return updated;
    });
  };

  const handleClearResponse = () => {
    setTestStates((prev) => {
      const updated = [...prev];
      updated[currentIndex].selectedAnswer = null;
      updated[currentIndex].status = "not_answered";
      return updated;
    });
  };

  const handleSaveAndNext = () => {
    const currentState = testStates[currentIndex];
    
    setTestStates((prev) => {
      const updated = [...prev];
      if (currentState.selectedAnswer) {
        updated[currentIndex].status = "answered";
      } else {
        updated[currentIndex].status = "not_answered";
      }
      return updated;
    });

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleMarkForReviewAndNext = () => {
    const currentState = testStates[currentIndex];
    
    setTestStates((prev) => {
      const updated = [...prev];
      if (currentState.selectedAnswer) {
        updated[currentIndex].status = "answered_marked";
      } else {
        updated[currentIndex].status = "marked_review";
      }
      return updated;
    });

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSubmitTest = (auto = false) => {
    if (!auto && !window.confirm("Are you sure you want to submit the test?")) return;
    
    stopTimers();
    setSubmitting(true);

    const submissions = testStates.map((state) => ({
      question_id: state.question.id,
      selected_answer: state.selectedAnswer,
      time_spent: state.timeSpent
    }));

    api.submitTest(submissions)
      .then((res) => {
        setResult(res);
        setSubmitting(false);
        setIsTestActive(false);
        setShowResult(true);
      })
      .catch((err) => {
        alert(`Failed to submit: ${err.message}`);
        setSubmitting(false);
      });
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Render question content formatting formulas/options
  const renderQuestionBody = (q: Question) => {
    const hasOptions = Boolean(q.options && q.question_type !== "NUMERICAL");
    const currentState = testStates[currentIndex];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Question Type & Subject Header Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="badge badge-easy" style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700 }}>
            {q.question_type === "MATCH" ? "Match The Following" : q.question_type}
          </span>
          {q.tags?.subject && (
            <span style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: 600 }}>
              {q.tags.subject} {q.tags.chapter ? `• ${q.tags.chapter}` : ""}
            </span>
          )}
        </div>

        {/* Clean Formatted Question Content (Tables & Math) */}
        <FormattedQuestion content={q.raw_content} fontSize="1.05rem" />

        {/* Extracted Diagram/Images */}
        {q.images_list && q.images_list.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "15px", margin: "10px 0" }}>
            {q.images_list.map((imgName, imgIdx) => (
              <img 
                key={imgIdx} 
                src={`${API_BASE_URL}/images/paper_${q.paper_id}/${imgName}`}
                alt={`Question ${q.question_number} Diagram ${imgIdx + 1}`}
                style={{ 
                  maxWidth: "100%", 
                  maxHeight: "350px", 
                  objectFit: "contain",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  padding: "8px"
                }} 
              />
            ))}
          </div>
        )}

        {/* Dynamic Question Option Buttons (Supports MCQ, AR, and MATCH) */}
        {hasOptions && q.options && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            {JSON.parse(q.options).map((opt: string, idx: number) => {
              const optChar = String.fromCharCode(65 + idx); // A, B, C, D
              const isSelected = currentState?.selectedAnswer === optChar;
              
              return (
                <label 
                  key={idx}
                  onClick={() => handleSelectAnswer(optChar)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    padding: "14px 18px",
                    border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "rgba(99, 102, 241, 0.12)" : "rgba(255,255,255,0.02)",
                    boxShadow: isSelected ? "0 0 12px rgba(99, 102, 241, 0.25)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      backgroundColor: isSelected ? "var(--primary)" : "rgba(255,255,255,0.08)",
                      color: isSelected ? "#fff" : "var(--text-secondary)",
                      border: isSelected ? "none" : "1px solid var(--border-color)",
                      flexShrink: 0
                    }}
                  >
                    {optChar}
                  </div>
                  
                  <span style={{ fontSize: "0.95rem", color: "var(--text-primary)", lineHeight: "1.4" }}>
                    {opt}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {q.question_type === "NUMERICAL" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px", maxWidth: "250px" }}>
            <label className="form-label">Input correct numerical value:</label>
            <input 
              type="text" 
              className="form-input"
              placeholder="e.g. 10.25 or -5"
              value={currentState?.selectedAnswer || ""}
              onChange={(e) => handleSelectAnswer(e.target.value)}
              style={{ padding: "12px 16px", fontSize: "1.1rem", fontFamily: "var(--font-mono)", textAlign: "center" }}
            />
          </div>
        )}
      </div>
    );
  };

  // ----------------------------------------------------
  // STREAMLINED PRACTICE SETUP SCREEN
  // ----------------------------------------------------
  if (!isTestActive && !showResult) {
    const subjects = [
      { id: "Biology", label: "Biology", count: 38, color: "var(--success)" },
      { id: "Physics", label: "Physics", count: 0, color: "var(--primary)" },
      { id: "Chemistry", label: "Chemistry", count: 0, color: "var(--warning)" },
      { id: "Mathematics", label: "Mathematics", count: 0, color: "#8b5cf6" },
      { id: "all", label: "All Subjects", count: availableQuestionsCount, color: "var(--text-primary)" },
    ];

    const presets = [
      { id: "10", label: "⚡ Sprint (10Q)", count: 10, desc: "~15-20 mins" },
      { id: "20", label: "🎯 Target (20Q)", count: 20, desc: "~30-40 mins" },
      { id: "45", label: "🧪 Subject Mock (45Q)", count: 45, desc: "~45-60 mins" },
      { id: "90", label: "🏆 Grand Mock (90Q)", count: 90, desc: "~3 Hours" },
      { id: "custom", label: "⚙️ Custom", count: testLimit, desc: "Personalized" }
    ];

    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", minHeight: "85vh", padding: "32px 16px" }}>
        <div className="glass-panel" style={{ width: "100%", maxWidth: "640px", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Header */}
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", backgroundColor: "rgba(99, 102, 241, 0.12)", color: "var(--primary)", padding: "4px 12px", borderRadius: "20px", fontSize: "0.8rem", fontWeight: 700, marginBottom: "8px" }}>
              <Zap size={14} /> CBT EXAM ENGINE
            </div>
            <h1 style={{ fontSize: "1.6rem", fontWeight: "800", margin: "0 0 6px 0" }}>
              Create Practice Session
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: 0 }}>
              Simulate JEE / NEET entrance test player with instant scoring & analytics.
            </p>
          </div>

          {error && (
            <div style={{ padding: "12px 16px", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--danger)", borderRadius: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
              <AlertTriangle size={18} color="var(--danger)" />
              <span style={{ fontSize: "0.85rem", color: "var(--danger)", fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {/* 1. Quick Presets */}
          <div>
            <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>
              1. Choose Practice Format
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px" }}>
              {presets.map((p) => {
                const isSelected = presetMode === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPresetMode(p.id as any);
                      if (p.id !== "custom") setTestLimit(p.count);
                    }}
                    style={{
                      padding: "10px 8px",
                      borderRadius: "8px",
                      border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)",
                      backgroundColor: isSelected ? "rgba(99, 102, 241, 0.15)" : "rgba(255,255,255,0.02)",
                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "2px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: "0.82rem", fontWeight: isSelected ? 700 : 500 }}>
                      {p.label}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Subject Selection */}
          <div>
            <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>
              2. Select Subject
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: "8px" }}>
              {subjects.map((s) => {
                const isSelected = selectedSubject === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSubject(s.id)}
                    style={{
                      padding: "12px 8px",
                      borderRadius: "8px",
                      border: isSelected ? `2px solid ${s.color}` : "1px solid var(--border-color)",
                      backgroundColor: isSelected ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.15)",
                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{s.label}</span>
                    <span style={{ 
                      fontSize: "0.68rem", 
                      padding: "2px 6px", 
                      borderRadius: "10px", 
                      backgroundColor: s.count > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.05)",
                      color: s.count > 0 ? "var(--success)" : "var(--text-muted)"
                    }}>
                      {s.count > 0 ? `${s.count} Qs` : "0 Qs"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Question Count (if custom or tweaking) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <label className="form-label" style={{ margin: 0 }}>
                3. Number of Questions: <strong style={{ color: "var(--primary)" }}>{testLimit}</strong>
              </label>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {[5, 10, 15, 20, 30, 38].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    setTestLimit(cnt);
                    setPresetMode("custom");
                  }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    border: testLimit === cnt ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                    backgroundColor: testLimit === cnt ? "var(--primary)" : "rgba(255,255,255,0.03)",
                    color: testLimit === cnt ? "#fff" : "var(--text-secondary)",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  {cnt} Qs
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="180"
                value={testLimit}
                onChange={(e) => {
                  setTestLimit(Math.max(1, parseInt(e.target.value, 10) || 1));
                  setPresetMode("custom");
                }}
                className="form-input"
                style={{ width: "70px", padding: "6px 8px", textAlign: "center", fontSize: "0.85rem", height: "32px" }}
              />
            </div>
          </div>

          {/* 4. Difficulty Selector */}
          <div>
            <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>
              4. Difficulty Level
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { id: "all", label: "All Levels", color: "var(--primary)" },
                { id: "easy", label: "🟢 Easy", color: "var(--success)" },
                { id: "medium", label: "🟡 Medium", color: "var(--warning)" },
                { id: "hard", label: "🟣 Hard", color: "#8b5cf6" }
              ].map((diff) => {
                const isSelected = selectedDifficulty === diff.id;
                return (
                  <button
                    key={diff.id}
                    type="button"
                    onClick={() => setSelectedDifficulty(diff.id)}
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: "6px",
                      border: isSelected ? `1px solid ${diff.color}` : "1px solid var(--border-color)",
                      backgroundColor: isSelected ? `${diff.color}20` : "rgba(255,255,255,0.02)",
                      color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: "0.82rem",
                      cursor: "pointer"
                    }}
                  >
                    {diff.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Optional Chapter / Paper Refinements (Collapsible) */}
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
            <button
              type="button"
              onClick={() => setShowOptionalFilters(!showOptionalFilters)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                cursor: "pointer",
                padding: "4px 0"
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 600 }}>
                🔍 Filter by Specific Chapter or Paper (Optional)
              </span>
              {showOptionalFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showOptionalFilters && (
              <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px", padding: "14px", backgroundColor: "rgba(0,0,0,0.15)", borderRadius: "8px" }}>
                <div>
                  <label className="form-label" style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Chapter</label>
                  <select
                    className="form-select"
                    style={{ fontSize: "0.85rem", padding: "8px" }}
                    value={selectedChapters[0] || ""}
                    onChange={(e) => setSelectedChapters(e.target.value ? [e.target.value] : [])}
                  >
                    <option value="">All Chapters in Syllabus</option>
                    {activeChapters.map((ch) => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: "0.75rem", marginBottom: "4px" }}>Source Paper</label>
                  <select
                    className="form-select"
                    style={{ fontSize: "0.85rem", padding: "8px" }}
                    value={selectedPapers[0] || ""}
                    onChange={(e) => setSelectedPapers(e.target.value ? [Number(e.target.value)] : [])}
                  >
                    <option value="">All Uploaded Papers</option>
                    {papers.map((p) => (
                      <option key={p.id} value={p.id}>{p.filename} ({p.question_count} Qs)</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Test Overview Summary Box */}
          <div style={{
            padding: "14px 18px",
            borderRadius: "8px",
            backgroundColor: "rgba(99, 102, 241, 0.06)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.85rem"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                {selectedSubject === "all" ? "All Subjects Practice" : `${selectedSubject} Drill`}
              </span>
              <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                Marking Scheme: <strong>+4 / -1 / 0</strong>
              </span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 800, color: "var(--primary)", fontSize: "1rem" }}>
                {testLimit} Questions
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                ~{Math.round((testLimit * 180) / 60)} mins limit
              </span>
            </div>
          </div>

          {/* Start CTA */}
          <button 
            onClick={handleStartTest} 
            className="btn btn-primary" 
            disabled={generating}
            style={{
              width: "100%",
              padding: "16px",
              fontSize: "1.05rem",
              fontWeight: 800,
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              boxShadow: "0 4px 16px rgba(99, 102, 241, 0.4)"
            }}
          >
            {generating ? (
              <>Searching question vault...</>
            ) : (
              <>
                <Play size={18} fill="currentColor" /> Start Practice Test
              </>
            )}
          </button>

        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SUBMISSION REPORT CARD LAYOUT (POST-TEST)
  // ----------------------------------------------------
  if (showResult && result) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "85vh", padding: "32px" }}>
        <div className="glass-panel" style={{ width: "650px", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center" }}>
            <Award size={48} color="var(--warning)" style={{ filter: "drop-shadow(0 0 12px var(--warning))" }} />
            <h1 style={{ fontSize: "1.6rem", fontWeight: "700", marginTop: "10px" }}>CBT Exam Report Card</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Answers graded and logs synced to Anki (incorrects) and Notion (skipped).
            </p>
          </div>

          {/* Primary stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", padding: "20px", backgroundColor: "var(--bg-tertiary)", borderRadius: "8px", textAlign: "center" }}>
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Total Score</span>
              <div style={{ fontSize: "2rem", fontWeight: "800", color: result.score >= 0 ? "var(--success)" : "var(--danger)" }}>
                {result.score} pts
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>+4 / -1 rules</span>
            </div>
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Accuracy</span>
              <div style={{ fontSize: "2rem", fontWeight: "800", color: "var(--primary)" }}>
                {result.accuracy.toFixed(0)}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>On attempted answers</span>
            </div>
            <div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Time / Question</span>
              <div style={{ fontSize: "2rem", fontWeight: "800", color: "var(--info)" }}>
                {(testStates.reduce((acc, s) => acc + s.timeSpent, 0) / testStates.length).toFixed(0)}s
              </div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Average pacing</span>
            </div>
          </div>

          {/* Correct/Wrong/Skipped breakout */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "0 10px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "var(--success)" }}></div>
              <span style={{ fontSize: "0.9rem" }}>Correct: <strong>{result.correct}</strong></span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "var(--danger)" }}></div>
              <span style={{ fontSize: "0.9rem" }}>Wrong: <strong>{result.wrong}</strong></span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "var(--text-muted)" }}></div>
              <span style={{ fontSize: "0.9rem" }}>Skipped: <strong>{result.skipped}</strong></span>
            </div>
          </div>

          {/* Sync routing notifications */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border-color)", paddingTop: "20px" }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: "600" }}>Post-Attempt Sync Mappings</h3>
            
            {result.wrong > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", backgroundColor: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.15)", borderRadius: "6px", fontSize: "0.85rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><Zap size={14} color="var(--danger)" /> Syncing wrong questions to Anki...</span>
                <span className="badge badge-hard" style={{ fontSize: "0.75rem" }}>{result.wrong} Cards deck: NEET/JEE Wrong Questions</span>
              </div>
            )}
            
            {result.skipped > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", backgroundColor: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: "6px", fontSize: "0.85rem" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><Eye size={14} color="var(--warning)" /> Syncing skipped questions to Notion...</span>
                <span className="badge badge-medium" style={{ fontSize: "0.75rem" }}>{result.skipped} entries database</span>
              </div>
            )}
          </div>

          <button onClick={() => setShowResult(false)} className="btn btn-secondary" style={{ width: "100%", padding: "12px" }}>
            Return to Setup
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // CBT ACTIVE TEST PLAYER LAYOUT
  // ----------------------------------------------------
  const currentQuestion = questions[currentIndex];

  const answeredCount = testStates.filter((s) => s.status === "answered" || s.status === "answered_marked").length;
  const markedReviewCount = testStates.filter((s) => s.status === "marked_review").length;
  const answeredMarkedCount = testStates.filter((s) => s.status === "answered_marked").length;
  const notAnsweredCount = testStates.filter((s) => s.status === "not_answered").length;
  const notVisitedCount = testStates.filter((s) => s.status === "not_visited").length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "calc(100vh - 80px)", overflow: "hidden" }}>
      
      {/* Left Column: Question viewer & navigation */}
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        
        {/* Top title bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid var(--border-color)", backgroundColor: "var(--bg-secondary)" }}>
          <span style={{ fontWeight: "600", fontSize: "0.95rem" }}>
            Question No. {currentIndex + 1} of {questions.length}
          </span>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", padding: "2px 8px", borderRadius: "4px", backgroundColor: "var(--bg-tertiary)" }}>
              Marks: <strong style={{ color: "var(--success)" }}>+4</strong> / <strong style={{ color: "var(--danger)" }}>-1</strong>
            </span>
          </div>
        </div>

        {/* Central question body */}
        <div style={{ flexGrow: "1", overflowY: "auto", padding: "32px 40px" }}>
          {currentQuestion && renderQuestionBody(currentQuestion)}
        </div>

        {/* Bottom Actions Tray */}
        <div style={{ padding: "20px 32px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", backgroundColor: "var(--bg-secondary)" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-secondary" onClick={handleClearResponse}>
              Clear Response
            </button>
            <button 
              className="btn" 
              onClick={handleMarkForReviewAndNext}
              style={{ backgroundColor: "rgba(139, 92, 246, 0.15)", border: "1px solid #8b5cf6", color: "#a78bfa" }}
            >
              Mark for Review & Next
            </button>
          </div>
          
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              className="btn btn-secondary"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex(currentIndex - 1)}
            >
              Back
            </button>
            <button className="btn btn-primary" onClick={handleSaveAndNext}>
              Save & Next
            </button>
          </div>
        </div>

      </div>

      {/* Right Column: Timer, Student summary & Question Palette */}
      <div style={{ borderLeft: "1px solid var(--border-color)", backgroundColor: "var(--bg-secondary)", display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
        
        {/* Section 1: Timer & Student Card */}
        <div style={{ padding: "24px", borderBottom: "1px solid var(--border-color)", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: "10px" }}>
            <Clock size={20} color="var(--primary)" />
            <div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: "500" }}>TIME REMAINING</div>
              <div style={{ fontSize: "1.4rem", fontWeight: "700", fontFamily: "var(--font-mono)" }}>
                {formatTime(timeLeft)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px", border: "1px solid var(--border-color)", borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.15)" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "700" }}>C</div>
            <div>
              <div style={{ fontWeight: "600", fontSize: "0.85rem" }}>CBT Mock Candidate</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Course: JEE/NEET Prep</div>
            </div>
          </div>
        </div>

        {/* Section 2: Legend counts */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="palette-btn palette-answered" style={{ width: "20px", height: "20px", fontSize: "0.6rem" }}></span>
            <span>Answered ({answeredCount})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="palette-btn palette-not-answered" style={{ width: "20px", height: "20px", fontSize: "0.6rem" }}></span>
            <span>Not Answered ({notAnsweredCount})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="palette-btn palette-marked-review" style={{ width: "20px", height: "20px", fontSize: "0.6rem" }}></span>
            <span>Marked for Rev. ({markedReviewCount})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="palette-btn palette-answered-marked" style={{ width: "20px", height: "20px", fontSize: "0.6rem" }}></span>
            <span>Ans. & Marked ({answeredMarkedCount})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="palette-btn palette-not-visited" style={{ width: "20px", height: "20px", fontSize: "0.6rem" }}></span>
            <span>Not Visited ({notVisitedCount})</span>
          </div>
        </div>

        {/* Section 3: Question palette grid */}
        <div style={{ padding: "24px", flexGrow: "1" }}>
          <div style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "14px" }}>Question Palette:</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
            {testStates.map((state, idx) => {
              let styleClass = "palette-not-visited";
              if (state.status === "answered") styleClass = "palette-answered";
              if (state.status === "not_answered") styleClass = "palette-not-answered";
              if (state.status === "marked_review") styleClass = "palette-marked-review";
              if (state.status === "answered_marked") styleClass = "palette-answered-marked";

              return (
                <button 
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`palette-btn ${styleClass} ${currentIndex === idx ? "active" : ""}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 4: Submit button */}
        <div style={{ padding: "24px", borderTop: "1px solid var(--border-color)" }}>
          <button 
            onClick={() => handleSubmitTest(false)} 
            className="btn btn-danger" 
            disabled={submitting}
            style={{ width: "100%", padding: "12px", fontSize: "0.95rem" }}
          >
            {submitting ? "Submitting exam..." : "Submit Test Paper"}
          </button>
        </div>

      </div>

    </div>
  );
}
