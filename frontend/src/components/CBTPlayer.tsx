import { useEffect, useState, useRef } from "react";
import { api, API_BASE_URL } from "../api";
import type { Question, TestSubmissionResult } from "../api";
import { Clock, Award, AlertTriangle, Eye, Zap } from "lucide-react";
import confetti from "canvas-confetti";

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
  
  // Multiselect & Advanced options states
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem("cbt_subjects");
      return val ? JSON.parse(val) : ["Physics", "Chemistry", "Biology", "Mathematics"];
    } catch {
      return ["Physics", "Chemistry", "Biology", "Mathematics"];
    }
  });
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem("cbt_difficulties");
      return val ? JSON.parse(val) : ["easy", "medium", "hard"];
    } catch {
      return ["easy", "medium", "hard"];
    }
  });
  const [isAdvancedActive, setIsAdvancedActive] = useState(() => {
    return localStorage.getItem("cbt_advanced") === "true";
  });
  const [subjectLimits, setSubjectLimits] = useState<Record<string, number>>(() => {
    try {
      const val = localStorage.getItem("cbt_limits");
      return val ? JSON.parse(val) : { Physics: 5, Chemistry: 5, Biology: 5, Mathematics: 5 };
    } catch {
      return { Physics: 5, Chemistry: 5, Biology: 5, Mathematics: 5 };
    }
  });

  // Persist configurations to localStorage
  useEffect(() => {
    localStorage.setItem("cbt_limit", String(testLimit));
  }, [testLimit]);

  useEffect(() => {
    localStorage.setItem("cbt_subjects", JSON.stringify(selectedSubjects));
  }, [selectedSubjects]);

  useEffect(() => {
    localStorage.setItem("cbt_difficulties", JSON.stringify(selectedDifficulties));
  }, [selectedDifficulties]);

  useEffect(() => {
    localStorage.setItem("cbt_advanced", String(isAdvancedActive));
  }, [isAdvancedActive]);

  useEffect(() => {
    localStorage.setItem("cbt_limits", JSON.stringify(subjectLimits));
  }, [subjectLimits]);
  
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
    
    const params: any = {};
    if (isAdvancedActive) {
      params.subject_limits = subjectLimits;
      const totalLimit = Object.values(subjectLimits).reduce((acc, v) => acc + v, 0);
      params.limit = totalLimit;
    } else {
      params.subjects = selectedSubjects;
      params.difficulties = selectedDifficulties;
      params.limit = testLimit;
    }
    
    // Compatibility fallback for API
    if (params.difficulties && params.difficulties.length === 1) {
      params.difficulty = params.difficulties[0];
    }
    if (params.subjects && params.subjects.length === 1) {
      params.subject = params.subjects[0];
    }
    
    api.generateTest(params).then((data) => {
      setQuestions(data);
      
      // Initialize question states
      const states: QuestionState[] = data.map((q, idx) => ({
        question: q,
        selectedAnswer: null,
        status: idx === 0 ? "not_answered" : "not_visited", // first is instantly visited
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
      setTimeLeft(totalTestSeconds);
      setIsTestActive(true);
      setGenerating(false);
      
      // Start test timer countdown
      startTimers();
    }).catch((err) => {
      setError(err.message || "Failed to find matching CBT-eligible questions.");
      setGenerating(false);
    });
  };

  const startTimers = () => {
    // 1. Overall test timer
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopTimers();
          handleSubmitTest(true); // Auto-submit when time is up
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // 2. Active question timer (tracks seconds on active question)
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

  // Re-start active question tracking when index changes
  useEffect(() => {
    if (isTestActive) {
      if (questionTimerRef.current) clearInterval(questionTimerRef.current);
      
      // Mark current question as "not_answered" if it was "not_visited"
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
      // Update state indicator
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
    const isMCQ = q.question_type === "MCQ" || q.question_type === "AR";
    const currentState = testStates[currentIndex];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Question Text */}
        <div style={{ fontSize: "1.05rem", whiteSpace: "pre-wrap", lineHeight: "1.6", fontWeight: "500" }}>
          {q.raw_content}
        </div>

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

        {/* Dynamic Question Forms */}
        {isMCQ && q.options && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
            {JSON.parse(q.options).map((opt: string, idx: number) => {
              const optChar = String.fromCharCode(65 + idx); // A, B, C, D
              const isSelected = currentState?.selectedAnswer === optChar;
              
              return (
                <label 
                  key={idx}
                  onClick={() => handleSelectAnswer(optChar)}
                  style={{
                    display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px",
                    border: isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)",
                    borderRadius: "6px", cursor: "pointer",
                    backgroundColor: isSelected ? "var(--bg-accent)" : "rgba(255,255,255,0.02)",
                    transition: "all 0.15s ease"
                  }}
                >
                  <input 
                    type="radio" 
                    name={`q-${q.id}`} 
                    checked={isSelected}
                    onChange={() => {}} // handled by click
                    style={{ accentColor: "var(--primary)", width: "16px", height: "16px" }}
                  />
                  <span style={{ fontSize: "0.95rem" }}>{opt}</span>
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

        {q.question_type === "MATCH" && q.options && (
          <div style={{ marginTop: "10px" }}>
            <p className="form-label" style={{ marginBottom: "8px" }}>Provide matching columns (Map Column I row to Column II code, e.g. A-P, B-R...):</p>
            <textarea
              className="form-input"
              placeholder="Format: A-P, B-R, C-Q, D-S"
              value={currentState?.selectedAnswer || ""}
              onChange={(e) => handleSelectAnswer(e.target.value)}
              style={{ height: "60px", fontFamily: "var(--font-mono)", fontSize: "1rem" }}
            />
          </div>
        )}
      </div>
    );
  };

  // ----------------------------------------------------
  // TEST SETUP LAYOUT (PRE-TEST)
  // ----------------------------------------------------
  if (!isTestActive && !showResult) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh", padding: "32px" }}>
        <div className="glass-panel" style={{ width: "520px", padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: "700", marginBottom: "8px", textAlign: "center" }}>
              Configure Mock CBT Test
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textAlign: "center" }}>
              Simulate NTA NEET/JEE computer-based test platform aligned with NCERT syllabus.
            </p>
          </div>

          {error && (
            <div className="glass-panel" style={{ borderColor: "var(--danger)", padding: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
              <AlertTriangle size={16} color="var(--danger)" />
              <span style={{ fontSize: "0.8rem", color: "var(--danger)" }}>{error}</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Subject Selector (Hide if Advanced Limit is checked since that specifies counts per subject) */}
            {!isAdvancedActive && (
              <div className="form-group">
                <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>Select Subjects (Multiselect)</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {["Physics", "Chemistry", "Biology", "Mathematics"].map((subj) => {
                    const isSelected = selectedSubjects.includes(subj);
                    return (
                      <button
                        key={subj}
                        onClick={() => {
                          setSelectedSubjects((prev) => {
                            if (prev.includes(subj)) {
                              if (prev.length === 1) return prev; // Do not empty
                              return prev.filter((s) => s !== subj);
                            } else {
                              return [...prev, subj];
                            }
                          });
                        }}
                        className={`btn ${isSelected ? "btn-primary" : "btn-secondary"}`}
                        style={{
                          flex: "1 1 calc(50% - 8px)",
                          padding: "10px 14px",
                          fontSize: "0.85rem",
                          border: isSelected ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                          boxShadow: isSelected ? "0 0 8px rgba(99, 102, 241, 0.25)" : "none",
                          transition: "all 0.15s ease"
                        }}
                      >
                        {subj}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Difficulty Selector */}
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: "8px", display: "block" }}>Select Difficulty (Multiselect)</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { value: "easy", label: "Easy", color: "var(--success)" },
                  { value: "medium", label: "Medium", color: "var(--warning)" },
                  { value: "hard", label: "Hard", color: "#8b5cf6" }
                ].map((diff) => {
                  const isSelected = selectedDifficulties.includes(diff.value);
                  return (
                    <button
                      key={diff.value}
                      onClick={() => {
                        setSelectedDifficulties((prev) => {
                          if (prev.includes(diff.value)) {
                            if (prev.length === 1) return prev; // Do not empty
                            return prev.filter((d) => d !== diff.value);
                          } else {
                            return [...prev, diff.value];
                          }
                        });
                      }}
                      className="btn"
                      style={{
                        flex: "1",
                        padding: "10px 12px",
                        fontSize: "0.85rem",
                        backgroundColor: isSelected ? diff.color : "rgba(255,255,255,0.02)",
                        border: isSelected ? `1px solid ${diff.color}` : "1px solid var(--border-color)",
                        color: isSelected ? "#fff" : "var(--text-secondary)",
                        boxShadow: isSelected ? `0 0 8px ${diff.color}40` : "none",
                        transition: "all 0.15s ease"
                      }}
                    >
                      {diff.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advanced Toggle */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginTop: "8px" }}>
              <div>
                <label className="form-label" style={{ margin: "0", display: "block" }}>Advanced Question Cap</label>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Choose specific question counts per subject</span>
              </div>
              <label className="switch" style={{ position: "relative", display: "inline-block", width: "46px", height: "24px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={isAdvancedActive} 
                  onChange={(e) => setIsAdvancedActive(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: isAdvancedActive ? "var(--primary)" : "#374151",
                  transition: ".2s ease", borderRadius: "24px"
                }}>
                  <span style={{
                    position: "absolute", content: '""', height: "18px", width: "18px", left: "3px", bottom: "3px",
                    backgroundColor: "#fff", transition: ".2s ease", borderRadius: "50%",
                    transform: isAdvancedActive ? "translateX(22px)" : "none"
                  }} />
                </span>
              </label>
            </div>

            {/* Standard Limit Selection */}
            {!isAdvancedActive && (
              <div className="form-group">
                <label className="form-label">Questions Count</label>
                <select className="form-select" value={testLimit} onChange={(e) => setTestLimit(Number(e.target.value))}>
                  <option value={5}>5 Questions (Quick Check)</option>
                  <option value={10}>10 Questions (Standard Drill)</option>
                  <option value={15}>15 Questions (Intense Run)</option>
                  <option value={30}>30 Questions (Full Mock)</option>
                </select>
              </div>
            )}

            {/* Advanced Subject Limits Panel */}
            {isAdvancedActive && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", backgroundColor: "var(--bg-tertiary)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                <h4 style={{ fontSize: "0.85rem", fontWeight: "700", marginBottom: "4px" }}>Set Subject Counts</h4>
                {["Physics", "Chemistry", "Biology", "Mathematics"].map((subj) => (
                  <div key={subj} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: "500" }}>{subj}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button 
                        onClick={() => setSubjectLimits(prev => ({ ...prev, [subj]: Math.max(0, prev[subj] - 1) }))}
                        className="btn btn-secondary"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", minWidth: "26px", height: "26px" }}
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="0"
                        max="50"
                        value={subjectLimits[subj]}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Math.max(0, Math.min(50, parseInt(e.target.value, 10) || 0));
                          setSubjectLimits(prev => ({ ...prev, [subj]: val }));
                        }}
                        style={{
                          width: "48px",
                          height: "26px",
                          textAlign: "center",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.9rem",
                          fontWeight: "600",
                          backgroundColor: "rgba(0,0,0,0.15)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "4px",
                          color: "var(--text-primary)",
                          padding: "0"
                        }}
                      />
                      <button 
                        onClick={() => setSubjectLimits(prev => ({ ...prev, [subj]: Math.min(30, prev[subj] + 1) }))}
                        className="btn btn-secondary"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", minWidth: "26px", height: "26px" }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                
                {/* Dynamic total count summary */}
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border-color)", paddingTop: "10px", marginTop: "4px", fontSize: "0.85rem", fontWeight: "700" }}>
                  <span>Total Selected Questions:</span>
                  <span style={{ color: "var(--primary)" }}>
                    {Object.values(subjectLimits).reduce((acc, v) => acc + v, 0)} questions
                  </span>
                </div>
              </div>
            )}
          </div>

          <button 
            onClick={handleStartTest} 
            className="btn btn-primary" 
            disabled={generating || (isAdvancedActive && Object.values(subjectLimits).reduce((acc, v) => acc + v, 0) === 0)}
            style={{ width: "100%", padding: "14px", fontSize: "1rem" }}
          >
            {generating ? "Searching question vault..." : "Initialize CBT Exam"}
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
