import { useEffect, useState } from "react";
import { api, API_BASE_URL } from "../api";
import type { Question, QuizSessionAttempt } from "../api";
import { 
  Layers, 
  CheckCircle2, 
  Bookmark, 
  Clock, 
  History as HistoryIcon, 
  X, 
  Check, 
  Eye, 
  BookOpen 
} from "lucide-react";
import FormattedQuestion from "../components/FormattedQuestion";

export default function InAppReview() {
  const [activeTab, setActiveTab] = useState<"flashcards" | "skipped" | "history">("flashcards");
  
  // Flashcards state
  const [flashcards, setFlashcards] = useState<Question[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Skipped list state
  const [skippedList, setSkippedList] = useState<Question[]>([]);
  const [loadingSkipped, setLoadingSkipped] = useState(false);

  // Solve Modal state for skipped questions
  const [selectedSkipped, setSelectedSkipped] = useState<Question | null>(null);
  const [solveTimeLeft, setSolveTimeLeft] = useState(300);
  const [solveSelectedAnswer, setSolveSelectedAnswer] = useState<string | null>(null);
  const [isSolveSubmitted, setIsSolveSubmitted] = useState(false);
  const [isSolveTimerRunning, setIsSolveTimerRunning] = useState(false);

  // History state
  const [historyList, setHistoryList] = useState<QuizSessionAttempt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedSession, setSelectedSession] = useState<QuizSessionAttempt | null>(null);

  const fetchFlashcards = () => {
    setLoadingCards(true);
    api.getFlashcards()
      .then((data) => {
        setFlashcards(data);
        setCardIndex(0);
        setIsFlipped(false);
        setLoadingCards(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingCards(false);
      });
  };

  const fetchSkipped = () => {
    setLoadingSkipped(true);
    api.getSkipped()
      .then((data) => {
        setSkippedList(data);
        setLoadingSkipped(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingSkipped(false);
      });
  };

  const fetchHistory = () => {
    setLoadingHistory(true);
    api.getAttemptsHistory()
      .then((data) => {
        setHistoryList(data);
        setLoadingHistory(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadingHistory(false);
      });
  };

  useEffect(() => {
    if (activeTab === "flashcards") {
      fetchFlashcards();
    } else if (activeTab === "skipped") {
      fetchSkipped();
    } else {
      fetchHistory();
    }
  }, [activeTab]);

  // 5-Minute Timer Effect for Skipped Solve Mode
  useEffect(() => {
    let timer: any;
    if (selectedSkipped && solveTimeLeft > 0 && isSolveTimerRunning) {
      timer = setInterval(() => {
        setSolveTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsSolveTimerRunning(false);
            setIsSolveSubmitted(true); // Automatically reveal answer and solutions
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [selectedSkipped, solveTimeLeft, isSolveTimerRunning]);

  const handleFlashcardGrade = (grade: "easy" | "hard") => {
    const currentCard = flashcards[cardIndex];
    if (!currentCard) return;

    if (grade === "easy") {
      api.submitTest([{
        question_id: currentCard.id,
        selected_answer: currentCard.correct_answer,
        time_spent: 10
      }]).then(() => {
        setFlashcards((prev) => prev.filter((_, idx) => idx !== cardIndex));
        setIsFlipped(false);
      }).catch(console.error);
    } else {
      setIsFlipped(false);
      if (cardIndex + 1 < flashcards.length) {
        setCardIndex(cardIndex + 1);
      } else {
        setCardIndex(0);
      }
    }
  };

  const handleOpenSolveModal = (q: Question) => {
    setSelectedSkipped(q);
    setSolveTimeLeft(300);
    setSolveSelectedAnswer(null);
    setIsSolveSubmitted(false);
    setIsSolveTimerRunning(true);
  };

  const handleSolveSubmit = () => {
    setIsSolveTimerRunning(false);
    setIsSolveSubmitted(true);
  };

  const formatSolveTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const renderFlashcardsTab = () => {
    if (loadingCards) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <div style={{ border: "3px solid rgba(255,255,255,0.1)", borderLeft: "3px solid #6366f1", borderRadius: "50%", width: "30px", height: "30px", animation: "spin 1s linear infinite" }}></div>
        </div>
      );
    }

    if (flashcards.length === 0) {
      return (
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", color: "var(--text-muted)", textAlign: "center" }}>
          <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: "16px" }} />
          <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>Flashcard Review Complete!</h3>
          <p style={{ fontSize: "0.9rem", maxWidth: "400px" }}>
            You have no wrong answers in your pool. Complete mock tests to register wrong questions for spaced repetition.
          </p>
        </div>
      );
    }

    const currentCard = flashcards[cardIndex];

    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
        <div style={{ width: "100%", maxWidth: "500px", display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          <span>Deck Size: {flashcards.length} wrong answers</span>
          <span>Card {cardIndex + 1} of {flashcards.length}</span>
        </div>

        <div 
          onClick={() => setIsFlipped(!isFlipped)}
          style={{
            perspective: "1000px", cursor: "pointer", width: "100%", maxWidth: "500px", height: "340px",
            position: "relative", transition: "transform 0.6s", transformStyle: "preserve-3d"
          }}
        >
          {/* Card Front */}
          <div 
            className="glass-panel" 
            style={{
              position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
              display: "flex", flexDirection: "column", gap: "16px", padding: "24px", overflowY: "auto",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)", border: "1px solid var(--border-color)",
              transition: "transform 0.5s"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>
              <span className="badge badge-hard" style={{ fontSize: "0.75rem" }}>Review Front</span>
              {currentCard.tags?.subject && (
                <span style={{ fontSize: "0.8rem", color: "var(--primary)", fontWeight: "600" }}>{currentCard.tags.subject}</span>
              )}
            </div>
            
            <div style={{ flexGrow: "1", fontSize: "1.02rem", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
              {currentCard.raw_content}
            </div>
            
            {currentCard.options && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {JSON.parse(currentCard.options).map((o: string, i: number) => (
                  <div key={i} style={{ padding: "6px 10px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px" }}>{o}</div>
                ))}
              </div>
            )}

            {/* Extracted Diagram/Images */}
            {currentCard.images_list && currentCard.images_list.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "12px" }}>
                {currentCard.images_list.map((imgName, imgIdx) => (
                  <img 
                    key={imgIdx} 
                    src={`${API_BASE_URL}/images/paper_${currentCard.paper_id}/${imgName}`}
                    alt={`Question ${currentCard.question_number} Diagram ${imgIdx + 1}`}
                    style={{ 
                      maxWidth: "100%", 
                      maxHeight: "150px", 
                      objectFit: "contain",
                      borderRadius: "4px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "rgba(255, 255, 255, 0.03)",
                      padding: "4px"
                    }} 
                  />
                ))}
              </div>
            )}
            
            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "10px" }}>
              Click card to reveal correct answer & explanation
            </div>
          </div>

          {/* Card Back */}
          <div 
            className="glass-panel" 
            style={{
              position: "absolute", width: "100%", height: "100%", backfaceVisibility: "hidden",
              display: "flex", flexDirection: "column", gap: "16px", padding: "24px", overflowY: "auto",
              transform: isFlipped ? "rotateY(0deg)" : "rotateY(-180deg)", border: "1px solid var(--success)",
              backgroundColor: "rgba(16,185,129,0.02)", transition: "transform 0.5s"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--success-bg)", paddingBottom: "10px" }}>
              <span className="badge badge-easy" style={{ fontSize: "0.75rem" }}>Answer Back</span>
              <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--success)" }}>
                Correct Option: {currentCard.correct_answer}
              </span>
            </div>

            <div style={{ flexGrow: "1" }}>
              <div style={{ fontWeight: "700", fontSize: "0.85rem", color: "var(--success)", marginBottom: "6px" }}>EXPLANATION / SOLUTIONS</div>
              <div style={{ fontSize: "0.95rem", lineHeight: "1.5", color: "var(--text-primary)" }}>
                {currentCard.explanation || "No step-by-step solution provided for this question bank item."}
              </div>
            </div>

            <div style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "10px" }}>
              Click to flip back to question
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "16px", width: "100%", maxWidth: "500px" }}>
          <button 
            className="btn btn-secondary" 
            onClick={() => handleFlashcardGrade("hard")}
            style={{ flex: "1", padding: "12px" }}
          >
            Hard (Review Later)
          </button>
          
          <button 
            className="btn btn-primary" 
            onClick={() => handleFlashcardGrade("easy")}
            style={{ flex: "1", padding: "12px", backgroundColor: "var(--success)", boxShadow: "0 4px 14px rgba(16,185,129,0.2)" }}
          >
            Easy (Remove from Deck)
          </button>
        </div>
      </div>
    );
  };

  const renderSkippedTab = () => {
    if (loadingSkipped) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <div style={{ border: "3px solid rgba(255,255,255,0.1)", borderLeft: "3px solid #6366f1", borderRadius: "50%", width: "30px", height: "30px", animation: "spin 1s linear infinite" }}></div>
        </div>
      );
    }

    if (skippedList.length === 0) {
      return (
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", color: "var(--text-muted)", textAlign: "center" }}>
          <Bookmark size={48} color="var(--primary)" style={{ marginBottom: "16px" }} />
          <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>No Skipped Questions</h3>
          <p style={{ fontSize: "0.9rem", maxWidth: "400px" }}>
            You haven't skipped questions in recent mock test sessions.
          </p>
        </div>
      );
    }

    return (
      <div className="glass-panel" style={{ padding: "0" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: "1.1rem", fontWeight: "600" }}>In-App Skipped Pool ({skippedList.length} items)</h3>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Pushed to Notion dashboard databases</span>
        </div>
        
        <div style={{ display: "flex", flexDirection: "column" }}>
          {skippedList.map((item, idx) => (
            <div 
              key={idx} 
              onClick={() => handleOpenSolveModal(item)}
              style={{ 
                padding: "20px 24px", 
                borderBottom: idx + 1 === skippedList.length ? "none" : "1px solid var(--border-color)", 
                display: "flex", 
                flexDirection: "column", 
                gap: "8px",
                cursor: "pointer",
                transition: "background-color 0.15s ease"
              }}
              className="hover-bg"
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: "600", color: "var(--primary)" }}>Question ID: {item.id}</span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}><Eye size={12} /> Click to Solve</span>
                  {item.tags?.subject && <span className="badge badge-easy" style={{ fontSize: "0.75rem" }}>{item.tags.subject}</span>}
                  {item.tags?.difficulty && <span className={`badge badge-${item.tags.difficulty}`} style={{ fontSize: "0.75rem" }}>{item.tags.difficulty}</span>}
                </div>
              </div>
              <div style={{ fontSize: "0.92rem", lineHeight: "1.4", color: "var(--text-primary)" }}>{item.raw_content}</div>
              {item.correct_answer && (
                <div style={{ fontSize: "0.8rem", color: "var(--success)", fontWeight: "500", marginTop: "4px" }}>
                  Correct Answer: Option {item.correct_answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderHistoryTab = () => {
    if (loadingHistory) {
      return (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <div style={{ border: "3px solid rgba(255,255,255,0.1)", borderLeft: "3px solid #6366f1", borderRadius: "50%", width: "30px", height: "30px", animation: "spin 1s linear infinite" }}></div>
        </div>
      );
    }

    if (historyList.length === 0) {
      return (
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 24px", color: "var(--text-muted)", textAlign: "center" }}>
          <HistoryIcon size={48} color="var(--primary)" style={{ marginBottom: "16px" }} />
          <h3 style={{ color: "var(--text-primary)", marginBottom: "8px" }}>No Attempt History</h3>
          <p style={{ fontSize: "0.9rem", maxWidth: "400px" }}>
            You haven't completed any quiz mock sessions yet. Complete a CBT Mock Exam to see history results!
          </p>
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
        {historyList.map((session, idx) => {
          const formattedDate = new Date(session.timestamp).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short"
          });
          
          return (
            <div key={idx} className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: "700" }}>CBT Quiz Session #{historyList.length - idx}</h3>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Attempted on {formattedDate}</span>
                </div>
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Score</span>
                    <span style={{ fontSize: "1.3rem", fontWeight: "800", color: session.score >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {session.score >= 0 ? `+${session.score}` : session.score} pts
                    </span>
                  </div>
                  <button 
                    onClick={() => setSelectedSession(session)}
                    className="btn btn-secondary" 
                    style={{ padding: "8px 14px", display: "flex", gap: "6px", alignItems: "center", fontSize: "0.85rem" }}
                  >
                    <Eye size={14} /> Review Attempted Paper
                  </button>
                </div>
              </div>

              {/* Stats breakout */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", padding: "12px 18px", backgroundColor: "var(--bg-tertiary)", borderRadius: "6px", fontSize: "0.85rem", textAlign: "center" }}>
                <div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "4px" }}>Total Questions</div>
                  <strong style={{ fontSize: "1.1rem" }}>{session.total_questions}</strong>
                </div>
                <div>
                  <div style={{ color: "var(--success)", fontSize: "0.75rem", marginBottom: "4px" }}>Correct</div>
                  <strong style={{ fontSize: "1.1rem", color: "var(--success)" }}>{session.correct}</strong>
                </div>
                <div>
                  <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginBottom: "4px" }}>Wrong</div>
                  <strong style={{ fontSize: "1.1rem", color: "var(--danger)" }}>{session.wrong}</strong>
                </div>
                <div>
                  <div style={{ color: "var(--warning)", fontSize: "0.75rem", marginBottom: "4px" }}>Accuracy</div>
                  <strong style={{ fontSize: "1.1rem", color: "var(--primary)" }}>{session.accuracy.toFixed(0)}%</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "28px" }}>
      
      {/* Page header */}
      <div>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "700", marginBottom: "8px" }}>Review Modules</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Access in-app spaced repetition flashcards for wrong answers, examine skipped logs, and review detailed quiz history.
        </p>
      </div>

      {/* Tabs selectors */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "1px" }}>
        <button 
          onClick={() => setActiveTab("flashcards")}
          className={`nav-btn ${activeTab === "flashcards" ? "active" : ""}`}
          style={{ paddingBottom: "12px", borderRadius: "0", display: "flex", gap: "8px" }}
        >
          <Layers size={16} /> Flashcard SR Pool
        </button>
        <button 
          onClick={() => setActiveTab("skipped")}
          className={`nav-btn ${activeTab === "skipped" ? "active" : ""}`}
          style={{ paddingBottom: "12px", borderRadius: "0", display: "flex", gap: "8px" }}
        >
          <Bookmark size={16} /> Skipped Registry
        </button>
        <button 
          onClick={() => setActiveTab("history")}
          className={`nav-btn ${activeTab === "history" ? "active" : ""}`}
          style={{ paddingBottom: "12px", borderRadius: "0", display: "flex", gap: "8px" }}
        >
          <HistoryIcon size={16} /> Attempt History
        </button>
      </div>

      {/* Main Tab content */}
      <div style={{ marginTop: "8px" }}>
        {activeTab === "flashcards" ? renderFlashcardsTab() : activeTab === "skipped" ? renderSkippedTab() : renderHistoryTab()}
      </div>

      {/* Skipped Details / Solve Mode Modal */}
      {selectedSkipped && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
          backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 1000, 
          display: "flex", justifyContent: "center", alignItems: "center", padding: "24px"
        }}>
          <div className="glass-panel animate-scale" style={{ 
            width: "100%", maxWidth: "600px", maxHeight: "85vh", overflowY: "auto", 
            padding: "32px", display: "flex", flexDirection: "column", gap: "20px", position: "relative"
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <span className="badge badge-medium" style={{ fontSize: "0.8rem" }}>Skipped Question details</span>
              <button 
                onClick={() => setSelectedSkipped(null)} 
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Timer Banner */}
            <div style={{ 
              display: "flex", justifyContent: "space-between", alignItems: "center", 
              padding: "12px 18px", borderRadius: "6px", 
              backgroundColor: isSolveSubmitted ? "rgba(16,185,129,0.06)" : solveTimeLeft <= 60 ? "rgba(244,63,94,0.08)" : "rgba(99,102,241,0.08)",
              border: isSolveSubmitted ? "1px solid rgba(16,185,129,0.15)" : solveTimeLeft <= 60 ? "1px solid rgba(244,63,94,0.15)" : "1px solid rgba(99,102,241,0.15)"
            }}>
              <span style={{ fontSize: "0.85rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                <Clock size={16} className={!isSolveSubmitted && solveTimeLeft <= 60 ? "pulse" : ""} color={isSolveSubmitted ? "var(--success)" : solveTimeLeft <= 60 ? "var(--danger)" : "var(--primary)"} />
                {isSolveSubmitted ? "Solution Revealed" : solveTimeLeft <= 60 ? "Hurry! Time Running Out" : "Solve Mode Timer"}
              </span>
              <span style={{ fontSize: "1.15rem", fontWeight: "700", fontFamily: "var(--font-mono)", color: isSolveSubmitted ? "var(--success)" : solveTimeLeft <= 60 ? "var(--danger)" : "var(--primary)" }}>
                {isSolveSubmitted ? "00:00" : formatSolveTime(solveTimeLeft)}
              </span>
            </div>

            {/* Question body */}
            <div style={{ fontSize: "1.05rem", whiteSpace: "pre-wrap", lineHeight: "1.5" }}>
              {selectedSkipped.raw_content}
            </div>

            {/* Options display */}
            {selectedSkipped.options && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                {JSON.parse(selectedSkipped.options).map((opt: string, idx: number) => {
                  const optChar = String.fromCharCode(65 + idx);
                  const isSelected = solveSelectedAnswer === optChar;
                  
                  // Style configurations post-submission
                  let borderStyle = isSelected ? "2px solid var(--primary)" : "1px solid var(--border-color)";
                  let bgStyle = isSelected ? "var(--bg-accent)" : "rgba(255,255,255,0.02)";
                  
                  if (isSolveSubmitted) {
                    const isCorrectOpt = optChar === selectedSkipped.correct_answer;
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
                      onClick={() => !isSolveSubmitted && setSolveSelectedAnswer(optChar)}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px",
                        border: borderStyle, borderRadius: "6px", cursor: isSolveSubmitted ? "default" : "pointer",
                        backgroundColor: bgStyle, transition: "all 0.15s ease"
                      }}
                    >
                      <input 
                        type="radio" 
                        name={`solve-q-${selectedSkipped.id}`}
                        checked={isSelected}
                        onChange={() => {}}
                        disabled={isSolveSubmitted}
                        style={{ accentColor: "var(--primary)", width: "16px", height: "16px" }}
                      />
                      <span style={{ fontSize: "0.95rem" }}>{opt}</span>
                      {isSolveSubmitted && optChar === selectedSkipped.correct_answer && (
                        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--success)", fontWeight: "700" }}>Correct Option</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Extracted Diagram/Images */}
            {selectedSkipped.images_list && selectedSkipped.images_list.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
                {selectedSkipped.images_list.map((imgName, imgIdx) => (
                  <img 
                    key={imgIdx} 
                    src={`${API_BASE_URL}/images/paper_${selectedSkipped.paper_id}/${imgName}`}
                    alt={`Question ${selectedSkipped.question_number} Diagram ${imgIdx + 1}`}
                    style={{ 
                      maxWidth: "100%", 
                      maxHeight: "220px", 
                      objectFit: "contain",
                      borderRadius: "6px",
                      border: "1px solid var(--border-color)",
                      backgroundColor: "rgba(255, 255, 255, 0.03)",
                      padding: "6px"
                    }} 
                  />
                ))}
              </div>
            )}

            {/* Modal Actions */}
            {!isSolveSubmitted && (
              <div style={{ display: "flex", gap: "12px", width: "100%", marginTop: "8px" }}>
                <button 
                  onClick={() => setSelectedSkipped(null)} 
                  className="btn btn-secondary" 
                  style={{ flex: "1", padding: "12px" }}
                >
                  Give Up
                </button>
                <button 
                  onClick={handleSolveSubmit}
                  className="btn btn-primary" 
                  disabled={!solveSelectedAnswer}
                  style={{ flex: "1", padding: "12px" }}
                >
                  Submit Answer
                </button>
              </div>
            )}

            {/* Answer and Explanation display */}
            {isSolveSubmitted && (
              <div style={{ 
                display: "flex", flexDirection: "column", gap: "14px", 
                borderTop: "1px solid var(--border-color)", paddingTop: "20px", marginTop: "8px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {solveSelectedAnswer === selectedSkipped.correct_answer ? (
                      <>
                        <span style={{ display: "inline-flex", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "var(--success)", alignItems: "center", justifyContent: "center" }}><Check size={12} color="#fff" /></span>
                        <strong style={{ color: "var(--success)", fontSize: "0.95rem" }}>Correct Answer!</strong>
                      </>
                    ) : solveSelectedAnswer ? (
                      <>
                        <span style={{ display: "inline-flex", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "var(--danger)", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold", fontSize: "0.75rem" }}>X</span>
                        <strong style={{ color: "var(--danger)", fontSize: "0.95rem" }}>Incorrect Answer</strong>
                      </>
                    ) : (
                      <>
                        <span style={{ display: "inline-flex", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "var(--warning)", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold", fontSize: "0.75rem" }}>!</span>
                        <strong style={{ color: "var(--warning)", fontSize: "0.95rem" }}>Timer Expired / Answer Revealed</strong>
                      </>
                    )}
                  </span>
                  <span style={{ fontSize: "0.9rem", color: "var(--success)" }}>
                    Correct Option: <strong>{selectedSkipped.correct_answer}</strong>
                  </span>
                </div>

                <div className="glass-panel" style={{ padding: "16px 20px", backgroundColor: "rgba(255,255,255,0.01)" }}>
                  <h4 style={{ fontSize: "0.85rem", color: "var(--primary)", fontWeight: "700", display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
                    <BookOpen size={14} /> STEP-BY-STEP EXPLANATION
                  </h4>
                  <p style={{ fontSize: "0.95rem", lineHeight: "1.5", color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                    {selectedSkipped.explanation || "No step-by-step solution provided for this item."}
                  </p>
                </div>

                <button 
                  onClick={() => setSelectedSkipped(null)} 
                  className="btn btn-secondary" 
                  style={{ width: "100%", padding: "12px", marginTop: "8px" }}
                >
                  Close Solve Panel
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Review Attempted Paper Modal */}
      {selectedSession && (
        <div style={{
          position: "fixed", top: 0, left: 0, width: "100%", height: "100%", 
          backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", zIndex: 1000, 
          display: "flex", justifyContent: "center", alignItems: "center", padding: "24px"
        }}>
          <div className="glass-panel animate-scale" style={{ 
            width: "100%", maxWidth: "800px", maxHeight: "90vh", overflowY: "auto", 
            padding: "32px", display: "flex", flexDirection: "column", gap: "24px", position: "relative"
          }}>
            {/* Modal header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", fontWeight: "700" }}>Mock Exam Attempt Review</h2>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Attempted on {new Date(selectedSession.timestamp).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
              <button 
                onClick={() => setSelectedSession(null)} 
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", color: "var(--text-secondary)" }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Score Stats Breakout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", padding: "16px 20px", backgroundColor: "var(--bg-tertiary)", borderRadius: "6px", textAlign: "center" }}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Total Score</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: selectedSession.score >= 0 ? "var(--success)" : "var(--danger)" }}>
                  {selectedSession.score >= 0 ? `+${selectedSession.score}` : selectedSession.score} pts
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Correct</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--success)" }}>{selectedSession.correct}</div>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Wrong</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--danger)" }}>{selectedSession.wrong}</div>
              </div>
              <div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Accuracy</span>
                <div style={{ fontSize: "1.4rem", fontWeight: "800", color: "var(--primary)" }}>{selectedSession.accuracy.toFixed(0)}%</div>
              </div>
            </div>

            {/* Questions List */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {selectedSession.submissions.map((sub, sIdx) => {
                let borderStyle = "1px solid var(--border-color)";
                let bgStyle = "rgba(255,255,255,0.01)";
                let badgeText = "Correct";
                let badgeClass = "badge-easy";

                if (sub.result === "wrong") {
                  borderStyle = "1px solid rgba(244,63,94,0.3)";
                  bgStyle = "rgba(244,63,94,0.02)";
                  badgeText = `Wrong (Selected: ${sub.selected_answer})`;
                  badgeClass = "badge-hard";
                } else if (sub.result === "skipped") {
                  borderStyle = "1px solid rgba(245,158,11,0.3)";
                  bgStyle = "rgba(245,158,11,0.02)";
                  badgeText = "Skipped";
                  badgeClass = "badge-medium";
                }

                return (
                  <div 
                    key={sIdx} 
                    className="glass-panel" 
                    style={{ padding: "20px 24px", border: borderStyle, backgroundColor: bgStyle, display: "flex", flexDirection: "column", gap: "12px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: "600", color: "var(--text-secondary)" }}>
                        Question {sIdx + 1} ({sub.subject})
                      </span>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Time Spent: {sub.time_spent}s</span>
                        <span className={`badge ${badgeClass}`} style={{ fontSize: "0.75rem" }}>{badgeText}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: "0.95rem", whiteSpace: "pre-wrap", lineHeight: "1.5", color: "var(--text-primary)" }}>
                      {sub.raw_content}
                    </div>

                    {/* Options list */}
                    {sub.options && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem", color: "var(--text-secondary)", margin: "8px 0" }}>
                        {sub.options.map((opt: string, oIdx: number) => {
                          const optChar = String.fromCharCode(65 + oIdx);
                          const isSelected = sub.selected_answer === optChar;
                          const isCorrect = optChar === sub.correct_answer;
                          
                          let optBg = "var(--bg-tertiary)";
                          let optBorder = "1px solid transparent";
                          if (isSelected) {
                            optBg = sub.result === "correct" ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.08)";
                            optBorder = sub.result === "correct" ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(244,63,94,0.2)";
                          } else if (isCorrect && sub.result === "wrong") {
                            optBg = "rgba(16,185,129,0.08)";
                            optBorder = "1px solid rgba(16,185,129,0.2)";
                          }

                          return (
                            <div 
                              key={oIdx} 
                              style={{ 
                                padding: "8px 12px", 
                                backgroundColor: optBg, 
                                border: optBorder,
                                borderRadius: "4px", 
                                display: "flex", 
                                justifyContent: "space-between" 
                              }}
                            >
                              <span>{opt}</span>
                              {isCorrect && <strong style={{ color: "var(--success)" }}>Correct Option</strong>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Extracted Diagram/Images */}
                  {sub.images_list && sub.images_list.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "12px" }}>
                      {sub.images_list.map((imgName, imgIdx) => (
                        <img 
                          key={imgIdx} 
                          src={`${API_BASE_URL}/images/paper_${sub.paper_id}/${imgName}`}
                          alt={`Question ${sub.question_number} Diagram ${imgIdx + 1}`}
                          style={{ 
                            maxWidth: "100%", 
                            maxHeight: "150px", 
                            objectFit: "contain",
                            borderRadius: "4px",
                            border: "1px solid var(--border-color)",
                            backgroundColor: "rgba(255, 255, 255, 0.03)",
                            padding: "4px"
                          }} 
                        />
                      ))}
                    </div>
                  )}

                  {/* Step by step solutions */}
                    <div style={{ 
                      marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "12px",
                      display: "flex", flexDirection: "column", gap: "6px" 
                    }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: "700", display: "flex", gap: "4px", alignItems: "center" }}>
                        <BookOpen size={12} /> STEP-BY-STEP EXPLANATION:
                      </div>
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4", whiteSpace: "pre-wrap" }}>
                        {sub.explanation || "No explanation text available."}
                      </p>
                    </div>

                  </div>
                );
              })}
            </div>

            <button 
              onClick={() => setSelectedSession(null)} 
              className="btn btn-secondary" 
              style={{ width: "100%", padding: "12px", marginTop: "12px" }}
            >
              Close Review
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
