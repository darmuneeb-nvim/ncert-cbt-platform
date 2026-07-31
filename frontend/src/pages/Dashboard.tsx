import { useEffect, useState, useCallback } from "react";
import { api } from "../api";
import type { DashboardStats, Question } from "../api";
import { 
  BookOpen, 
  CheckCircle, 
  Clock, 
  Percent, 
  AlertTriangle, 
  ArrowLeft, 
  ArrowRight, 
  Play, 
  X, 
  Check, 
  Eye 
} from "lucide-react";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dashboard Click-to-Review Modal States
  const [selectedTabType, setSelectedTabType] = useState<string | null>(null);
  const [modalTitle, setModalTitle] = useState("");
  const [questionsList, setQuestionsList] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Interactive Question Review States
  const [activeReviewIndex, setActiveReviewIndex] = useState<number | null>(null);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [isCbtMode, setIsCbtMode] = useState(false);
  const [cbtSelectedAnswer, setCbtSelectedAnswer] = useState<string | null>(null);
  const [isCbtChecked, setIsCbtChecked] = useState(false);

  // 1-Minute Timer States for Dashboard CBT Review attempts
  const [cbtTimeLeft, setCbtTimeLeft] = useState(60);
  const [isCbtTimerActive, setIsCbtTimerActive] = useState(false);

  useEffect(() => {
    api.getDashboardStats()
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load dashboard statistics.");
        setLoading(false);
      });
  }, []);

  const handleCbtSubmitAuto = useCallback(() => {
    if (activeReviewIndex === null || questionsList.length === 0) return;
    const activeQuestion = questionsList[activeReviewIndex];
    setIsCbtChecked(true);
    setIsCbtTimerActive(false);

    api.submitTest([{
      question_id: activeQuestion.id,
      selected_answer: cbtSelectedAnswer || "",
      time_spent: 60
    }]).then(() => {
      // Reload stats and update question's last_attempt_time locally in list
      api.getDashboardStats().then(setStats);
      setQuestionsList(prev => prev.map((q, i) => i === activeReviewIndex ? { ...q, last_attempt_time: 60 } : q));
    }).catch(err => console.error(err));
  }, [activeReviewIndex, questionsList, cbtSelectedAnswer]);

  // 1-Minute Timer countdown effect
  useEffect(() => {
    let timerId: any;
    if (isCbtMode && isCbtTimerActive && cbtTimeLeft > 0 && !isCbtChecked) {
      timerId = setInterval(() => {
        setCbtTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerId);
            setIsCbtTimerActive(false);
            handleCbtSubmitAuto();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [isCbtMode, isCbtTimerActive, cbtTimeLeft, isCbtChecked, activeReviewIndex, handleCbtSubmitAuto]);



  const handleCbtSubmitManual = () => {
    if (activeReviewIndex === null || questionsList.length === 0) return;
    const activeQuestion = questionsList[activeReviewIndex];
    setIsCbtChecked(true);
    setIsCbtTimerActive(false);

    const timeSpent = 60 - cbtTimeLeft;

    api.submitTest([{
      question_id: activeQuestion.id,
      selected_answer: cbtSelectedAnswer || "",
      time_spent: timeSpent
    }]).then(() => {
      // Reload stats and update question's last_attempt_time locally in list
      api.getDashboardStats().then(setStats);
      setQuestionsList(prev => prev.map((q, i) => i === activeReviewIndex ? { ...q, last_attempt_time: timeSpent } : q));
    }).catch(err => console.error(err));
  };

  const handleTabClick = (type: string, title: string) => {
    setSelectedTabType(type);
    setModalTitle(title);
    setLoadingQuestions(true);
    setQuestionsList([]);
    
    api.getDashboardQuestions(type)
      .then((data) => {
        setQuestionsList(data);
        setLoadingQuestions(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingQuestions(false);
      });
  };

  const handleOpenReview = (index: number) => {
    setActiveReviewIndex(index);
    setIsCardFlipped(false);
    setIsCbtMode(false);
    setCbtSelectedAnswer(null);
    setIsCbtChecked(false);
    setIsCbtTimerActive(false);
    setCbtTimeLeft(60);
  };

  const handleNextQuestion = () => {
    if (activeReviewIndex !== null && activeReviewIndex + 1 < questionsList.length) {
      handleOpenReview(activeReviewIndex + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (activeReviewIndex !== null && activeReviewIndex > 0) {
      handleOpenReview(activeReviewIndex - 1);
    }
  };

  const toggleCbtMode = () => {
    if (isCbtMode) {
      setIsCbtMode(false);
      setIsCbtChecked(false);
      setIsCbtTimerActive(false);
    } else {
      setIsCbtMode(true);
      setIsCbtChecked(false);
      setCbtSelectedAnswer(null);
      setCbtTimeLeft(60);
      setIsCbtTimerActive(true);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <div style={{ border: "4px solid rgba(255,255,255,0.1)", borderLeft: "4px solid #6366f1", borderRadius: "50%", width: "40px", height: "40px", animation: "spin 1s linear infinite" }}></div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ margin: "32px", borderColor: "var(--danger)", padding: "20px", display: "flex", gap: "12px", alignItems: "center" }}>
        <AlertTriangle color="var(--danger)" />
        <div>
          <h3 style={{ color: "var(--danger)" }}>Error Loading Statistics</h3>
          <p style={{ color: "var(--text-secondary)" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Helpers for percentages
  const totalCorrect = stats.fast_correct + stats.slow_correct;
  const totalWrong = stats.fast_wrong + stats.slow_wrong;
  const totalAnswers = totalCorrect + totalWrong;

  const pctFastCorrect = totalAnswers ? Math.round((stats.fast_correct / totalAnswers) * 100) : 0;
  const pctSlowCorrect = totalAnswers ? Math.round((stats.slow_correct / totalAnswers) * 100) : 0;
  const pctFastWrong = totalAnswers ? Math.round((stats.fast_wrong / totalAnswers) * 100) : 0;
  const pctSlowWrong = totalAnswers ? Math.round((stats.slow_wrong / totalAnswers) * 100) : 0;

  const activeReviewQuestion = activeReviewIndex !== null ? questionsList[activeReviewIndex] : null;

  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "32px" }}>
      <div>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "700", marginBottom: "8px" }}>Welcome Back Aspirant</h1>
        <p style={{ color: "var(--text-secondary)" }}>Analyze mock computer-based test stats, drill speed profiles, and review subject syllabus metrics.</p>
      </div>

      {/* Top Level Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
        <div 
          onClick={() => handleTabClick("library", "Library Questions")}
          className="glass-panel stat-card"
          style={{ cursor: "pointer", transition: "transform 0.15s ease, border-color 0.15s ease" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="stat-label">Library Questions</span>
            <BookOpen size={20} color="var(--primary)" />
          </div>
          <span className="stat-value">{stats.total_questions}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><Eye size={12} /> Click to Review list</span>
        </div>

        <div 
          onClick={() => handleTabClick("attempts", "Total Attempts")}
          className="glass-panel stat-card"
          style={{ cursor: "pointer", transition: "transform 0.15s ease, border-color 0.15s ease" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="stat-label">Total Attempts</span>
            <CheckCircle size={20} color="var(--success)" />
          </div>
          <span className="stat-value" style={{ color: "var(--success)" }}>{stats.total_attempts}</span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><Eye size={12} /> Click to Review list</span>
        </div>

        <div 
          onClick={() => handleTabClick("accuracy", "Average Accuracy")}
          className="glass-panel stat-card"
          style={{ cursor: "pointer", transition: "transform 0.15s ease, border-color 0.15s ease" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="stat-label">Avg. Accuracy</span>
            <Percent size={20} color="var(--warning)" />
          </div>
          <span className="stat-value" style={{ color: "var(--warning)" }}>
            {stats.average_accuracy.toFixed(1)}%
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><Eye size={12} /> Highest accuracy first</span>
        </div>

        <div 
          onClick={() => handleTabClick("pace", "Average Pace")}
          className="glass-panel stat-card"
          style={{ cursor: "pointer", transition: "transform 0.15s ease, border-color 0.15s ease" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="stat-label">Avg. Pace</span>
            <Clock size={20} color="var(--info)" />
          </div>
          <span className="stat-value" style={{ color: "var(--info)" }}>
            {stats.average_time_per_question.toFixed(0)}s
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><Eye size={12} /> Fastest average time first</span>
        </div>
      </div>

      {/* Grid: Speed profile & Weak concepts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", alignItems: "start" }}>
        
        {/* Speed & Attempt Profiles */}
        <div className="glass-panel" style={{ height: "100%" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "20px" }}>Speed & Attempt Profile</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            <div 
              onClick={() => handleTabClick("speed_fast_correct", "Fast-Correct (Active Mastery)")}
              style={{ cursor: "pointer", padding: "8px", borderRadius: "6px" }}
              className="hover-bg"
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Fast-Correct (Active Mastery)</span>
                <span style={{ fontWeight: "600", color: "var(--success)" }}>{stats.fast_correct} ({pctFastCorrect}%)</span>
              </div>
              <div style={{ height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctFastCorrect}%`, backgroundColor: "var(--success)", boxShadow: "0 0 8px var(--success)" }}></div>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>Correct answers in &le; 45 seconds (solid concepts).</p>
            </div>

            <div 
              onClick={() => handleTabClick("speed_slow_correct", "Slow-Correct (Needs Practice)")}
              style={{ cursor: "pointer", padding: "8px", borderRadius: "6px" }}
              className="hover-bg"
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Slow-Correct (Needs Practice)</span>
                <span style={{ fontWeight: "600", color: "var(--info)" }}>{stats.slow_correct} ({pctSlowCorrect}%)</span>
              </div>
              <div style={{ height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctSlowCorrect}%`, backgroundColor: "var(--info)", boxShadow: "0 0 8px var(--info)" }}></div>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>Correct answers in &gt; 45 seconds (computationally slow).</p>
            </div>

            <div 
              onClick={() => handleTabClick("speed_fast_wrong", "Fast-Wrong (Blind Guessing)")}
              style={{ cursor: "pointer", padding: "8px", borderRadius: "6px" }}
              className="hover-bg"
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Fast-Wrong (Blind Guessing)</span>
                <span style={{ fontWeight: "600", color: "var(--warning)" }}>{stats.fast_wrong} ({pctFastWrong}%)</span>
              </div>
              <div style={{ height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctFastWrong}%`, backgroundColor: "var(--warning)", boxShadow: "0 0 8px var(--warning)" }}></div>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>Wrong answers in &le; 45 seconds (silly mistakes/guessing).</p>
            </div>

            <div 
              onClick={() => handleTabClick("speed_slow_wrong", "Slow-Wrong (Concept Gap)")}
              style={{ cursor: "pointer", padding: "8px", borderRadius: "6px" }}
              className="hover-bg"
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "6px" }}>
                <span>Slow-Wrong (Concept Gap)</span>
                <span style={{ fontWeight: "600", color: "var(--danger)" }}>{stats.slow_wrong} ({pctSlowWrong}%)</span>
              </div>
              <div style={{ height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctSlowWrong}%`, backgroundColor: "var(--danger)", boxShadow: "0 0 8px var(--danger)" }}></div>
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px" }}>Wrong answers in &gt; 45 seconds (clear misunderstanding of topic).</p>
            </div>

          </div>
        </div>

        {/* Weak Concepts List */}
        <div className="glass-panel" style={{ height: "100%" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "20px" }}>Weak NCERT Concepts</h2>
          {stats.weak_concepts.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 10px", color: "var(--text-muted)", textAlign: "center" }}>
              <CheckCircle size={36} color="var(--success)" style={{ marginBottom: "12px" }} />
              <p style={{ fontWeight: "500" }}>No major weak concepts!</p>
              <p style={{ fontSize: "0.8rem" }}>Keep attempting mock tests to unlock specific concept warnings (&lt; 50% accuracy on 3+ attempts).</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {stats.weak_concepts.slice(0, 5).map((item, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", backgroundColor: "var(--bg-tertiary)", borderRadius: "6px" }}>
                  <div>
                    <div style={{ fontWeight: "600", fontSize: "0.9rem" }}>{item.concept}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{item.attempts} attempts recorded</div>
                  </div>
                  <span className="badge badge-hard" style={{ fontSize: "0.8rem" }}>
                    {item.accuracy.toFixed(0)}% Accuracy
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Subject Wise Performance Table */}
      <div className="glass-panel">
        <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "20px" }}>Subject-wise Standing</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                <th style={{ padding: "12px 8px" }}>Subject</th>
                <th style={{ padding: "12px 8px" }}>Total Questions</th>
                <th style={{ padding: "12px 8px" }}>Attempted</th>
                <th style={{ padding: "12px 8px" }}>Correct</th>
                <th style={{ padding: "12px 8px" }}>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {stats.subject_wise.map((row, index) => (
                <tr 
                  key={index} 
                  onClick={() => handleTabClick("subject_" + row.subject, row.subject + " Standing Questions")}
                  style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)", fontSize: "0.95rem", cursor: "pointer" }}
                  className="hover-bg"
                >
                  <td style={{ padding: "16px 8px", fontWeight: "600" }}>{row.subject}</td>
                  <td style={{ padding: "16px 8px" }}>{row.total_questions}</td>
                  <td style={{ padding: "16px 8px" }}>{row.attempted}</td>
                  <td style={{ padding: "16px 8px", color: "var(--success)" }}>{row.correct}</td>
                  <td style={{ padding: "16px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "600" }}>{row.accuracy.toFixed(1)}%</span>
                      <div style={{ width: "80px", height: "6px", backgroundColor: "var(--bg-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${row.accuracy}%`, backgroundColor: row.accuracy >= 70 ? "var(--success)" : row.accuracy >= 50 ? "var(--warning)" : "var(--danger)" }}></div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. Modal: Question List viewer */}
      {selectedTabType !== null && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
          backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 900, 
          display: "flex", justifyContent: "center", alignItems: "center", padding: "24px"
        }}>
          <div className="glass-panel animate-scale" style={{ 
            width: "100%", maxWidth: "700px", maxHeight: "80vh", overflowY: "auto", 
            padding: "32px", display: "flex", flexDirection: "column", gap: "20px", position: "relative"
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>{modalTitle}</h2>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {loadingQuestions ? "Fetching records..." : `${questionsList.length} questions loaded`}
                </span>
              </div>
              <button 
                onClick={() => setSelectedTabType(null)} 
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--text-secondary)" }}
              >
                <X size={22} />
              </button>
            </div>

            {loadingQuestions && (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                <div style={{ border: "3px solid rgba(255,255,255,0.1)", borderLeft: "3px solid #6366f1", borderRadius: "50%", width: "30px", height: "30px", animation: "spin 1s linear infinite" }}></div>
              </div>
            )}

            {!loadingQuestions && questionsList.length === 0 && (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                No questions recorded under this metric profile yet. Complete mock tests to gather analytics metrics!
              </div>
            )}

            {/* List */}
            {!loadingQuestions && questionsList.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {questionsList.map((q, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleOpenReview(idx)}
                    style={{ 
                      padding: "14px 18px", 
                      backgroundColor: "var(--bg-tertiary)", 
                      borderRadius: "6px", 
                      border: "1px solid var(--border-color)", 
                      cursor: "pointer", 
                      display: "flex", 
                      justifyContent: "space-between", 
                      alignItems: "center" 
                    }}
                    className="hover-bg"
                  >
                    <div style={{ flex: "1", paddingRight: "16px", overflow: "hidden" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: "600", display: "block" }}>
                        Q ID: {q.id} • Subject: {q.tags?.subject || "General"}
                      </span>
                      <p style={{ 
                        fontSize: "0.88rem", 
                        color: "var(--text-primary)", 
                        margin: "4px 0 0 0", 
                        whiteSpace: "nowrap", 
                        overflow: "hidden", 
                        textOverflow: "ellipsis" 
                      }}>
                        {q.raw_content}
                      </p>
                    </div>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: "6px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}
                    >
                      Review Card
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Modal: Interactive Flashcard / CBT Solve Review Overlay */}
      {activeReviewIndex !== null && activeReviewQuestion && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
          backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", zIndex: 1000, 
          display: "flex", justifyContent: "center", alignItems: "center", padding: "24px"
        }}>
          <div className="glass-panel animate-scale" style={{ 
            width: "100%", maxWidth: "600px", maxHeight: "88vh", overflowY: "auto", 
            padding: "32px", display: "flex", flexDirection: "column", gap: "20px", position: "relative"
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: "700" }}>
                  {isCbtMode ? "CBT Attempt Mode" : "Flashcard Flip Mode"}
                </h3>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Question {activeReviewIndex + 1} of {questionsList.length} • ID: {activeReviewQuestion.id}
                </span>
              </div>
              <button 
                onClick={() => setActiveReviewIndex(null)} 
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--text-secondary)" }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Main Interactive Container */}
            <div style={{ minHeight: "260px", display: "flex", flexDirection: "column" }}>
              {isCbtMode ? (
                /* ======================== CBT SOLVE MODE ======================== */
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  
                  {/* Countdown Timer and Attempt Stats */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(255,255,255,0.02)", padding: "10px 14px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      Last Attempt: <strong style={{ color: "var(--primary)" }}>{activeReviewQuestion.last_attempt_time ? `${activeReviewQuestion.last_attempt_time}s` : "No attempts"}</strong>
                    </div>
                    <div style={{ 
                      fontSize: "0.85rem", 
                      fontWeight: "700", 
                      color: cbtTimeLeft <= 15 ? "var(--danger)" : cbtTimeLeft <= 30 ? "var(--warning)" : "var(--success)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}>
                      <Clock size={14} /> Time Left: {cbtTimeLeft}s
                    </div>
                  </div>

                  <div style={{ fontSize: "1.02rem", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
                    {activeReviewQuestion.raw_content}
                  </div>

                  {activeReviewQuestion.options && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {JSON.parse(activeReviewQuestion.options).map((opt: string, idx: number) => {
                        const optChar = String.fromCharCode(65 + idx);
                        const isSelected = cbtSelectedAnswer === optChar;
                        
                        let borderStyle = isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)";
                        let bgStyle = isSelected ? "var(--bg-accent)" : "rgba(255,255,255,0.02)";
                        
                        if (isCbtChecked) {
                          const isCorrectOpt = optChar === activeReviewQuestion.correct_answer;
                          if (isCorrectOpt) {
                            borderStyle = "2px solid var(--success)";
                            bgStyle = "rgba(16,185,129,0.06)";
                          } else if (isSelected) {
                            borderStyle = "2px solid var(--danger)";
                            bgStyle = "rgba(244,63,94,0.06)";
                          }
                        }

                        return (
                          <label 
                            key={idx}
                            onClick={() => !isCbtChecked && setCbtSelectedAnswer(optChar)}
                            style={{
                              display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px",
                              border: borderStyle, borderRadius: "6px", cursor: isCbtChecked ? "default" : "pointer",
                              backgroundColor: bgStyle, transition: "all 0.15s ease"
                            }}
                          >
                            <input 
                              type="radio" 
                              name={`cbt-solve-${activeReviewQuestion.id}`}
                              checked={isSelected}
                              onChange={() => {}}
                              disabled={isCbtChecked}
                              style={{ accentColor: "var(--primary)", width: "16px", height: "16px" }}
                            />
                            <span style={{ fontSize: "0.92rem" }}>{opt}</span>
                            {isCbtChecked && optChar === activeReviewQuestion.correct_answer && (
                              <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--success)", fontWeight: "700" }}>Correct Option</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {!isCbtChecked ? (
                    <button 
                      onClick={handleCbtSubmitManual}
                      className="btn btn-primary"
                      disabled={!cbtSelectedAnswer}
                      style={{ width: "100%", padding: "12px", marginTop: "8px" }}
                    >
                      Submit Answer
                    </button>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          {cbtSelectedAnswer === activeReviewQuestion.correct_answer ? (
                            <>
                              <span style={{ display: "inline-flex", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "var(--success)", alignItems: "center", justifyContent: "center" }}><Check size={12} color="#fff" /></span>
                              <strong style={{ color: "var(--success)", fontSize: "0.95rem" }}>Correct Answer (+4 pts)</strong>
                            </>
                          ) : (
                            <>
                              <span style={{ display: "inline-flex", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "var(--danger)", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold", fontSize: "0.75rem" }}>X</span>
                              <strong style={{ color: "var(--danger)", fontSize: "0.95rem" }}>Incorrect Answer (-1 pt)</strong>
                            </>
                          )}
                        </span>
                        <span style={{ fontSize: "0.9rem", color: "var(--success)" }}>
                          Correct Option: <strong>{activeReviewQuestion.correct_answer}</strong>
                        </span>
                      </div>
                      
                      <div className="glass-panel" style={{ padding: "14px 18px", backgroundColor: "rgba(255,255,255,0.01)" }}>
                        <h4 style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: "700", display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
                          <BookOpen size={12} /> EXPLANATION
                        </h4>
                        <p style={{ fontSize: "0.9rem", lineHeight: "1.4", color: "var(--text-secondary)", whiteSpace: "pre-wrap", margin: "0" }}>
                          {activeReviewQuestion.explanation || "No explanation solutions registered for this item."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ======================== FLASHCARD MODE (FLIP) ======================== */
                <div 
                  onClick={() => setIsCardFlipped(!isCardFlipped)}
                  style={{
                    perspective: "1000px", cursor: "pointer", width: "100%", height: "280px",
                    position: "relative", transformStyle: "preserve-3d"
                  }}
                >
                  {/* Card Front */}
                  <div 
                    className="glass-panel" 
                    style={{
                      position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
                      display: "flex", flexDirection: "column", gap: "12px", padding: "20px", overflowY: "auto",
                      transform: isCardFlipped ? "rotateY(180deg)" : "rotateY(0deg)", border: "1px solid var(--border-color)",
                      transition: "transform 0.4s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px" }}>
                      <span className="badge badge-hard" style={{ fontSize: "0.75rem" }}>Review Front</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Last Attempt: <strong style={{ color: "var(--primary)" }}>{activeReviewQuestion.last_attempt_time ? `${activeReviewQuestion.last_attempt_time}s` : "No attempts"}</strong>
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: "600" }}>{activeReviewQuestion.tags?.subject || "General"}</span>
                    </div>
                    
                    <div style={{ flexGrow: "1", fontSize: "1rem", whiteSpace: "pre-wrap", lineHeight: "1.4" }}>
                      {activeReviewQuestion.raw_content}
                    </div>
                    
                    {activeReviewQuestion.options && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        {JSON.parse(activeReviewQuestion.options).map((o: string, i: number) => (
                          <div key={i} style={{ padding: "5px 8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px" }}>{o}</div>
                        ))}
                      </div>
                    )}
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>Click card to Flip & Reveal Solutions</span>
                  </div>

                  {/* Card Back */}
                  <div 
                    className="glass-panel" 
                    style={{
                      position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
                      display: "flex", flexDirection: "column", gap: "12px", padding: "20px", overflowY: "auto",
                      transform: isCardFlipped ? "rotateY(0deg)" : "rotateY(-180deg)", border: "1px solid var(--success)",
                      backgroundColor: "rgba(16,185,129,0.02)", transition: "transform 0.4s"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--success-bg)", paddingBottom: "8px" }}>
                      <span className="badge badge-easy" style={{ fontSize: "0.75rem" }}>Answer Back</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Last Attempt: <strong style={{ color: "var(--primary)" }}>{activeReviewQuestion.last_attempt_time ? `${activeReviewQuestion.last_attempt_time}s` : "No attempts"}</strong>
                      </span>
                      <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--success)" }}>
                        Correct Option: {activeReviewQuestion.correct_answer}
                      </span>
                    </div>

                    <div style={{ flexGrow: "1" }}>
                      <div style={{ fontWeight: "700", fontSize: "0.8rem", color: "var(--success)", marginBottom: "4px" }}>EXPLANATION / SOLUTIONS</div>
                      <div style={{ fontSize: "0.9rem", lineHeight: "1.4", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                        {activeReviewQuestion.explanation || "No explanation solutions registered for this item."}
                      </div>
                    </div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>Click to flip back to question</span>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Arrow Navigation Tray with Center Play Toggle */}
            <div style={{ 
              display: "flex", justifyContent: "space-between", alignItems: "center", 
              borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginTop: "8px" 
            }}>
              <button 
                onClick={handlePrevQuestion}
                disabled={activeReviewIndex === 0}
                className="btn btn-secondary"
                style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}
              >
                <ArrowLeft size={16} /> Prev
              </button>

              {/* Play Toggle Button */}
              <button 
                onClick={toggleCbtMode}
                className="btn btn-primary"
                style={{ 
                  borderRadius: "50px", 
                  padding: "10px 24px", 
                  fontSize: "0.85rem", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px",
                  backgroundColor: isCbtMode ? "#e11d48" : "var(--primary)",
                  boxShadow: isCbtMode ? "0 4px 14px rgba(225,29,72,0.3)" : "0 4px 14px rgba(99,102,241,0.3)"
                }}
              >
                <Play size={14} fill="#fff" />
                {isCbtMode ? "Flashcard Mode" : "CBT Attempt"}
              </button>

              <button 
                onClick={handleNextQuestion}
                disabled={activeReviewIndex === questionsList.length - 1}
                className="btn btn-secondary"
                style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem" }}
              >
                Next <ArrowRight size={16} />
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
