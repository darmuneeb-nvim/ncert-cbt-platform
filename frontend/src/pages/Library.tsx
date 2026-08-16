import { useEffect, useState, useCallback } from "react";
import { api, API_BASE_URL } from "../api";
import type { Question, Paper } from "../api";
import { Upload, HelpCircle, FileText, Check, Filter, AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { NCERT_TAXONOMY } from "../taxonomy";
import FormattedQuestion from "../components/FormattedQuestion";

export default function Library() {
  // Papers state
  const [papers, setPapers] = useState<Paper[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentUploadingIndex, setCurrentUploadingIndex] = useState(0);
  const [answerKeyInput, setAnswerKeyInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  
  // Questions list state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  
  // Filters
  const [filterSubject, setFilterSubject] = useState("");
  const [filterChapter, setFilterChapter] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterPaperId, setFilterPaperId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Bulk actions selection states
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkChapter, setBulkChapter] = useState("");
  const [bulkDifficulty, setBulkDifficulty] = useState("");
  
  // Selected question detail
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  
  // Editing tags
  const [editSubject, setEditSubject] = useState("");
  const [editChapter, setEditChapter] = useState("");
  const [editConcept, setEditConcept] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("");
  const [savingTags, setSavingTags] = useState(false);

  // Manual key matching
  const [matchingPaper, setMatchingPaper] = useState<Paper | null>(null);
  const [manualKeyText, setManualKeyText] = useState("");

  const refreshPapers = useCallback(() => {
    api.getPapers().then(setPapers).catch(console.error);
  }, []);

  const fetchQuestionsList = useCallback((pageToFetch: number = 1, append: boolean = false) => {
    setLoadingQuestions(true);
    api.getQuestions({
      subject: filterSubject || undefined,
      chapter: filterChapter || undefined,
      difficulty: filterDifficulty || undefined,
      tagging_status: filterStatus || undefined,
      question_type: filterType || undefined,
      paper_id: filterPaperId ? Number(filterPaperId) : undefined,
      page: pageToFetch,
      limit: 15
    }).then((data) => {
      if (append) {
        setQuestions((prev) => [...prev, ...data.questions]);
      } else {
        setQuestions(data.questions);
      }
      setTotalQuestions(data.total);
      setCurrentPage(pageToFetch);
      setLoadingQuestions(false);
    }).catch((err) => {
      console.error(err);
      setLoadingQuestions(false);
    });
  }, [filterSubject, filterChapter, filterDifficulty, filterStatus, filterType, filterPaperId]);

  useEffect(() => {
    refreshPapers();
  }, [refreshPapers]);

  useEffect(() => {
    fetchQuestionsList(1, false);
    setSelectedIds([]); // reset selection when filters change
  }, [filterSubject, filterChapter, filterDifficulty, filterStatus, filterType, filterPaperId, fetchQuestionsList]);

  const handleLoadMore = () => {
    fetchQuestionsList(currentPage + 1, true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files).filter(f => f.type === "application/pdf");
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
      setFiles(prev => [...prev, ...droppedFiles]);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;
    
    setUploading(true);
    setUploadStatus("Uploading files...");
    setProgressPercent(0);
    
    for (let i = 0; i < files.length; i++) {
      setCurrentUploadingIndex(i);
      const currentFile = files[i];
      setUploadStatus(`Uploading [${i + 1}/${files.length}] ${currentFile.name}...`);
      setProgressPercent(0);
      
      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        if (currentProgress < 90) {
          currentProgress += (90 - currentProgress) * 0.08;
          setProgressPercent(currentProgress);
        }
      }, 200);
      
      try {
        const key = i === 0 ? (answerKeyInput || undefined) : undefined;
        await api.uploadPaper(currentFile, key);
        
        clearInterval(progressInterval);
        setProgressPercent(100);
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (err: any) {
        clearInterval(progressInterval);
        setProgressPercent(0);
        setUploading(false);
        setUploadStatus(`Error uploading ${currentFile.name}: ${err.message || "Failed to process PDF."}`);
        return;
      }
    }
    
    setUploading(false);
    setProgressPercent(0);
    setUploadStatus(`Successfully processed all ${files.length} papers!`);
    setFiles([]);
    setAnswerKeyInput("");
    refreshPapers();
    fetchQuestionsList();
  };

  const handleQuestionSelect = (q: Question) => {
    setSelectedQuestion(q);
    setEditSubject(q.tags?.subject || "");
    setEditChapter(q.tags?.chapter || "");
    setEditConcept(q.tags?.concept || "");
    setEditDifficulty(q.tags?.difficulty || "medium");
  };

  const handleSaveTags = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQuestion) return;
    
    setSavingTags(true);
    api.updateQuestionTags(selectedQuestion.id, {
      subject: editSubject,
      chapter: editChapter,
      concept: editConcept,
      difficulty: editDifficulty
    }).then((updated) => {
      setSavingTags(false);
      setSelectedQuestion(updated);
      fetchQuestionsList();
    }).catch((err) => {
      setSavingTags(false);
      alert(`Failed to save tags: ${err.message}`);
    });
  };

  const triggerTaggerJob = () => {
    api.triggerTagger()
      .then(() => alert("AI tagging queue running in the background. Refresh in a few minutes."))
      .catch((err) => alert(err.message));
  };

  const handleDeletePaper = (paperId: number, filename: string) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This will delete all its questions, tags, and attempt history.`)) {
      return;
    }
    api.deletePaper(paperId)
      .then(() => {
        // If the selected question belongs to this paper, deselect it
        if (selectedQuestion && selectedQuestion.paper_id === paperId) {
          setSelectedQuestion(null);
        }
        refreshPapers();
        fetchQuestionsList(1, false);
      })
      .catch((err) => alert(err.message));
  };

  const handleBulkTag = () => {
    if (selectedIds.length === 0) return;
    if (!bulkSubject && !bulkChapter && !bulkDifficulty) {
      alert("Please select at least one tag to apply (Subject, Chapter, or Difficulty).");
      return;
    }
    
    api.bulkTagQuestions(selectedIds, {
      subject: bulkSubject || undefined,
      chapter: bulkChapter || undefined,
      difficulty: bulkDifficulty || undefined,
    }).then((res) => {
      alert(res.message || "Bulk tagging successful.");
      setSelectedIds([]);
      setBulkSubject("");
      setBulkChapter("");
      setBulkDifficulty("");
      fetchQuestionsList(1, false);
    }).catch((err) => alert(err.message));
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected questions? This action cannot be undone.`)) {
      return;
    }
    
    api.bulkDeleteQuestions(selectedIds)
      .then((res) => {
        alert(res.message || "Bulk delete successful.");
        setSelectedIds([]);
        if (selectedQuestion && selectedIds.includes(selectedQuestion.id)) {
          setSelectedQuestion(null);
        }
        fetchQuestionsList(1, false);
      }).catch((err) => alert(err.message));
  };

  const toggleSelectQuestion = (id: number) => {
    setSelectedIds((prev) => 
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleManualKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchingPaper) return;
    try {
      const parsed = JSON.parse(manualKeyText);
      api.submitAnswerKey(matchingPaper.id, parsed)
        .then(() => {
          alert("Answer key matched successfully!");
          setMatchingPaper(null);
          setManualKeyText("");
          refreshPapers();
          fetchQuestionsList();
        })
        .catch((err) => alert(err.message));
    } catch {
      alert("Invalid JSON format. Check template format: {\"1\": \"A\", \"2\": \"B\"}");
    }
  };

  // Get lists for select dropdowns based on hierarchical selections
  const subjectsList = Object.keys(NCERT_TAXONOMY);
  const chaptersList = editSubject ? Object.keys(NCERT_TAXONOMY[editSubject] || {}) : [];
  const conceptsList = (editSubject && editChapter) ? (NCERT_TAXONOMY[editSubject][editChapter] || []) : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "24px", padding: "32px", height: "calc(100vh - 80px)", overflow: "hidden" }}>
      
      {/* Sidebar: Uploads & Papers */}
      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "24px", paddingRight: "10px" }}>
        
        {/* PDF Upload panel */}
        <div className="glass-panel" style={{ padding: "20px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <Upload size={18} /> Ingest Question Bank
          </h2>
          
          <form onSubmit={handleFileUpload} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="form-group" style={{ marginBottom: "0" }}>
              <label className="form-label">Upload PDF mock paper(s)</label>
              <input 
                type="file" 
                accept="application/pdf"
                multiple
                onChange={handleFileChange}
                style={{ display: "none" }}
                id="file-upload"
                disabled={uploading}
              />
              <label 
                htmlFor="file-upload"
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  border: isDragging ? "2px dashed var(--primary)" : "2px dashed var(--border-color)", 
                  borderRadius: "var(--border-radius-sm)",
                  padding: "24px 20px", cursor: uploading ? "not-allowed" : "pointer",
                  backgroundColor: isDragging ? "rgba(99, 102, 241, 0.15)" : "rgba(0,0,0,0.2)",
                  boxShadow: isDragging ? "0 0 15px rgba(99, 102, 241, 0.2)" : "none",
                  transition: "all 0.2s ease"
                }}
              >
                <FileText size={24} color={(files.length > 0 || isDragging) ? "var(--primary)" : "var(--text-muted)"} style={{ marginBottom: "8px" }} />
                <span style={{ fontSize: "0.85rem", fontWeight: "600", textAlign: "center", color: isDragging ? "var(--primary)" : "inherit" }}>
                  {isDragging ? "Drop your PDFs here" : files.length > 0 ? `${files.length} file(s) selected` : "Select or Drag & Drop PDFs"}
                </span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "center" }}>
                  Supports multiple PDF uploads
                </span>
              </label>
            </div>

            {/* List of selected files with remove buttons */}
            {files.length > 0 && (
              <div style={{
                maxHeight: "120px",
                overflowY: "auto",
                padding: "8px",
                backgroundColor: "rgba(0,0,0,0.3)",
                borderRadius: "var(--border-radius-sm)",
                border: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                gap: "6px"
              }}>
                {files.map((f, idx) => (
                  <div key={idx} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)"
                  }}>
                    <span style={{
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      maxWidth: "230px"
                    }} title={f.name}>
                      📄 {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--danger)",
                        cursor: "pointer",
                        fontSize: "1.1rem",
                        lineHeight: "1",
                        padding: "0 4px"
                      }}
                      disabled={uploading}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: "6px" }}>
                <span>Answer Key JSON</span>
                <span title='Format: {"1": "A", "2": "C"}' style={{ display: "inline-flex", alignItems: "center" }}>
                  <HelpCircle size={14} color="var(--text-muted)" />
                </span>
              </label>
              <textarea 
                className="form-input"
                placeholder='e.g., {"1": "A", "2": "D", "3": "12.5"}'
                value={answerKeyInput}
                onChange={(e) => setAnswerKeyInput(e.target.value)}
                style={{ height: "60px", fontSize: "0.8rem", fontFamily: "var(--font-mono)", resize: "none" }}
                disabled={uploading}
              />
              {files.length > 1 && answerKeyInput && (
                <span style={{ fontSize: "0.7rem", color: "var(--warning)", marginTop: "4px" }}>
                  ⚠️ Note: Answer key will only apply to the first PDF file ({files[0]?.name}).
                </span>
              )}
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={files.length === 0 || uploading}
              style={{ 
                width: "100%",
                background: uploading 
                  ? `linear-gradient(to right, var(--primary) ${progressPercent}%, rgba(99, 102, 241, 0.2) ${progressPercent}%)`
                  : undefined,
                borderColor: uploading ? "transparent" : undefined,
                transition: uploading ? "none" : "all 0.2s ease"
              }}
            >
              {uploading ? `Ingesting [${currentUploadingIndex + 1}/${files.length}] (${Math.round(progressPercent)}%)...` : "Process Paper(s)"}
            </button>
          </form>

          {uploadStatus && (
            <div style={{ marginTop: "12px", padding: "10px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {uploadStatus}
            </div>
          )}
        </div>

        {/* Paper Library List */}
        <div className="glass-panel" style={{ padding: "20px", flexGrow: "1" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: "600", marginBottom: "16px" }}>Paper Registry</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {papers.map((p) => (
              <div key={p.id} style={{ padding: "10px 12px", border: "1px solid var(--border-color)", borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.1)", fontSize: "0.85rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ fontWeight: "600", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", flexGrow: 1 }} title={p.filename}>
                    {p.filename}
                  </div>
                  <button 
                    onClick={() => handleDeletePaper(p.id, p.filename)}
                    style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", padding: "0", display: "inline-flex" }}
                    title="Delete Paper"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  <span>{p.question_count} Questions</span>
                  {p.answer_key_status === "matched" ? (
                    <span style={{ color: "var(--success)", display: "flex", alignItems: "center", gap: "4px" }}><Check size={12} /> Active</span>
                  ) : (
                    <button 
                      onClick={() => { setMatchingPaper(p); setManualKeyText(""); }}
                      style={{ background: "transparent", border: "none", color: "var(--warning)", fontWeight: "600", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Pending Key
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Main Browse Panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "24px", overflow: "hidden" }}>
        
        {/* Left Column: Filter and Grid */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", overflow: "hidden" }}>
          
          {/* Filtering Header bar */}
          <div className="glass-panel" style={{ padding: "16px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.9rem", color: "var(--text-secondary)", marginRight: "10px" }}>
              <Filter size={16} /> Filters
            </div>
            
            <select className="form-select" style={{ padding: "6px 12px", fontSize: "0.85rem" }} value={filterSubject} onChange={(e) => { setFilterSubject(e.target.value); setFilterChapter(""); setCurrentPage(1); }}>
              <option value="">All Subjects</option>
              {subjectsList.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <select className="form-select" style={{ padding: "6px 12px", fontSize: "0.85rem", maxWidth: "150px" }} value={filterChapter} onChange={(e) => { setFilterChapter(e.target.value); setCurrentPage(1); }}>
              <option value="">All Chapters</option>
              {filterSubject && Object.keys(NCERT_TAXONOMY[filterSubject] || {}).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <select className="form-select" style={{ padding: "6px 12px", fontSize: "0.85rem" }} value={filterDifficulty} onChange={(e) => { setFilterDifficulty(e.target.value); setCurrentPage(1); }}>
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            <select className="form-select" style={{ padding: "6px 12px", fontSize: "0.85rem" }} value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
              <option value="">All Tag Statuses</option>
              <option value="untagged">Untagged</option>
              <option value="subject_tagged">Subject Tagged</option>
              <option value="fully_tagged">Fully Tagged</option>
              <option value="needs_review">Needs Review</option>
            </select>

            <select className="form-select" style={{ padding: "6px 12px", fontSize: "0.85rem" }} value={filterType} onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}>
              <option value="">All Types</option>
              <option value="MCQ">MCQ (Single Choice)</option>
              <option value="AR">Assertion-Reason</option>
              <option value="MATCH">Match the Columns</option>
              <option value="NUMERICAL">Numerical / Integer</option>
            </select>

            <select className="form-select" style={{ padding: "6px 12px", fontSize: "0.85rem", maxWidth: "180px" }} value={filterPaperId} onChange={(e) => { setFilterPaperId(e.target.value); setCurrentPage(1); }}>
              <option value="">All Source Papers</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>{p.filename}</option>
              ))}
            </select>

            <label style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "6px", 
              fontSize: "0.85rem", 
              cursor: "pointer", 
              userSelect: "none",
              marginLeft: "auto",
              color: "var(--text-secondary)"
            }}>
              <input 
                type="checkbox"
                checked={questions.length > 0 && questions.every(q => selectedIds.includes(q.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    const currentIds = questions.map(q => q.id);
                    setSelectedIds(prev => Array.from(new Set([...prev, ...currentIds])));
                  } else {
                    const currentIds = questions.map(q => q.id);
                    setSelectedIds(prev => prev.filter(id => !currentIds.includes(id)));
                  }
                }}
                style={{ cursor: "pointer" }}
              />
              <span>Select All</span>
            </label>

            <button 
              className="btn btn-secondary"
              onClick={triggerTaggerJob}
              style={{ padding: "6px 12px", fontSize: "0.8rem", display: "flex", gap: "6px" }}
            >
              <RefreshCw size={14} /> Run Tag Queue
            </button>
          </div>

          {/* Bulk actions bar if selection exists */}
          {selectedIds.length > 0 && (
            <div className="glass-panel" style={{ padding: "12px 20px", display: "flex", alignItems: "center", gap: "16px", backgroundColor: "rgba(99, 102, 241, 0.12)", borderColor: "var(--primary)", borderRadius: "8px" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--primary)" }}>{selectedIds.length} questions selected</span>
              
              <div style={{ display: "flex", gap: "10px", alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <select className="form-select" style={{ padding: "4px 8px", fontSize: "0.8rem" }} value={bulkSubject} onChange={(e) => { setBulkSubject(e.target.value); setBulkChapter(""); }}>
                  <option value="">Bulk Subject</option>
                  {subjectsList.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                
                <select className="form-select" style={{ padding: "4px 8px", fontSize: "0.8rem", maxWidth: "120px" }} value={bulkChapter} onChange={(e) => setBulkChapter(e.target.value)}>
                  <option value="">Bulk Chapter</option>
                  {bulkSubject && Object.keys(NCERT_TAXONOMY[bulkSubject] || {}).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                
                <select className="form-select" style={{ padding: "4px 8px", fontSize: "0.8rem" }} value={bulkDifficulty} onChange={(e) => setBulkDifficulty(e.target.value)}>
                  <option value="">Bulk Difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                
                <button className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={handleBulkTag}>
                  Apply Tags
                </button>
                
                <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: "0.8rem", backgroundColor: "rgba(239, 68, 68, 0.2)", color: "var(--danger)" }} onClick={handleBulkDelete}>
                  Delete Selected
                </button>

                <button className="btn btn-secondary" style={{ padding: "4px 10px", fontSize: "0.8rem" }} onClick={() => setSelectedIds([])}>
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* List of Questions */}
          <div className="glass-panel" style={{ flexGrow: "1", overflowY: "auto", padding: "0" }}>
            {loadingQuestions ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
                <div style={{ border: "3px solid rgba(255,255,255,0.1)", borderLeft: "3px solid #6366f1", borderRadius: "50%", width: "30px", height: "30px", animation: "spin 1s linear infinite" }}></div>
              </div>
            ) : questions.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", padding: "40px 10px" }}>
                <AlertCircle size={32} style={{ marginBottom: "10px" }} />
                <span>No questions found matching the selected criteria.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {questions.map((q) => (
                  <div 
                    key={q.id}
                    style={{
                      padding: "16px 20px", borderBottom: "1px solid var(--border-color)", cursor: "pointer",
                      backgroundColor: selectedQuestion?.id === q.id ? "rgba(99, 102, 241, 0.08)" : "transparent",
                      transition: "background-color 0.15s", display: "flex", gap: "12px", alignItems: "flex-start"
                    }}
                  >
                    <input 
                      type="checkbox"
                      checked={selectedIds.includes(q.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelectQuestion(q.id);
                      }}
                      style={{ marginTop: "4px", cursor: "pointer" }}
                    />
                    <div 
                      onClick={() => handleQuestionSelect(q)}
                      style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: "8px" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.8rem", fontWeight: "600", color: "var(--primary)" }}>
                          Q{q.question_number} &bull; ID: {q.id}
                        </span>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                            {q.question_type}
                          </span>
                          {q.tags?.subject && (
                            <span style={{ fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--bg-accent)", color: "var(--primary)" }}>
                              {q.tags.subject}
                            </span>
                          )}
                          {q.tags?.difficulty && (
                            <span className={`badge badge-${q.tags.difficulty}`} style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                              {q.tags.difficulty}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{
                        fontSize: "0.9rem", color: "var(--text-primary)", display: "-webkit-box",
                        WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: "1.4"
                      }}>
                        {q.raw_content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Load More pagination controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", padding: "16px 8px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Showing {questions.length} of {totalQuestions} questions
            </span>
            {questions.length < totalQuestions && (
              <button 
                className="btn btn-secondary" 
                onClick={handleLoadMore} 
                disabled={loadingQuestions}
                style={{ padding: "8px 24px", fontSize: "0.85rem", minWidth: "200px" }}
              >
                {loadingQuestions ? "Loading..." : "Load More Questions"}
              </button>
            )}
          </div>

        </div>

        {/* Right Column: Question Viewer & Tag Override Editor */}
        <div style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {selectedQuestion ? (
            <div className="glass-panel" style={{ minHeight: "100%", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: "700", marginBottom: "4px" }}>Question Details</h3>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Confirm or override automated tagging suggestions.</p>
              </div>

              {/* Question Text block */}
              <div style={{ border: "1px solid var(--border-color)", padding: "16px", borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.15)", fontSize: "0.95rem" }}>
                <div style={{ fontWeight: "600", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px" }}>QUESTION TEXT</div>
                <FormattedQuestion content={selectedQuestion.raw_content} fontSize="0.95rem" />
                
                {/* Options display */}
                {selectedQuestion.options && (
                  <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    {JSON.parse(selectedQuestion.options).map((opt: string, idx: number) => {
                      const optChar = String.fromCharCode(65 + idx);
                      return (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: 700, color: "var(--primary)", width: "20px" }}>{optChar}.</span>
                          <span>{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Extracted Diagram/Images */}
                {selectedQuestion.images_list && selectedQuestion.images_list.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
                    {selectedQuestion.images_list.map((imgName, imgIdx) => (
                      <img 
                        key={imgIdx} 
                        src={`${API_BASE_URL}/images/paper_${selectedQuestion.paper_id}/${imgName}`}
                        alt={`Question ${selectedQuestion.question_number} Diagram ${imgIdx + 1}`}
                        style={{ 
                          maxWidth: "100%", 
                          maxHeight: "200px", 
                          objectFit: "contain",
                          borderRadius: "4px",
                          border: "1px solid var(--border-color)",
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                          padding: "6px"
                        }} 
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Answer Key display */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", backgroundColor: "rgba(16,185,129,0.06)", border: "1px solid var(--success-bg)", borderRadius: "6px" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "600", color: "var(--success)" }}>CORRECT ANSWER:</span>
                <span style={{ fontSize: "1.1rem", fontWeight: "800", color: "var(--success)" }}>
                  {selectedQuestion.correct_answer || "N/A"}
                </span>
              </div>

              {/* Edit Tag form */}
              <form onSubmit={handleSaveTags} style={{ display: "flex", flexDirection: "column", gap: "16px", borderTop: "1px solid var(--border-color)", paddingTop: "20px" }}>
                <div style={{ fontWeight: "600", fontSize: "0.85rem", color: "var(--text-secondary)" }}>TAXONOMY METADATA</div>
                
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <select 
                    className="form-select"
                    value={editSubject}
                    onChange={(e) => { setEditSubject(e.target.value); setEditChapter(""); setEditConcept(""); }}
                    required
                  >
                    <option value="">Select Subject</option>
                    {subjectsList.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Chapter</label>
                  <select 
                    className="form-select"
                    value={editChapter}
                    onChange={(e) => { setEditChapter(e.target.value); setEditConcept(""); }}
                    disabled={!editSubject}
                    required
                  >
                    <option value="">Select Chapter</option>
                    {chaptersList.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Concept</label>
                  <select 
                    className="form-select"
                    value={editConcept}
                    onChange={(e) => setEditConcept(e.target.value)}
                    disabled={!editChapter}
                    required
                  >
                    <option value="">Select Concept</option>
                    {conceptsList.map((con) => <option key={con} value={con}>{con}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Difficulty</label>
                  <select 
                    className="form-select"
                    value={editDifficulty}
                    onChange={(e) => setEditDifficulty(e.target.value)}
                    required
                  >
                    <option value="easy">Easy (Direct Recall)</option>
                    <option value="medium">Medium (Formula / Direct Calc)</option>
                    <option value="hard">Hard (Multi-step Reasoning)</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    disabled={savingTags} 
                    style={{ flexGrow: "1" }}
                  >
                    {savingTags ? "Saving..." : "Verify & Save Tags"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="glass-panel" style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", padding: "30px", textAlign: "center" }}>
              <HelpCircle size={40} style={{ marginBottom: "12px" }} />
              <p>Select a question from the browser list to inspect details and edit taxonomy tags.</p>
            </div>
          )}
        </div>

      </div>

      {/* Manual Answer Key Modal */}
      {matchingPaper && (
        <div style={{ position: "fixed", top: "0", left: "0", right: "0", bottom: "0", backgroundColor: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: "200" }}>
          <div className="glass-panel" style={{ width: "450px", padding: "28px", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "6px" }}>Register Answer Key</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Paper: {matchingPaper.filename}</p>
            </div>
            
            <form onSubmit={handleManualKeySubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Key mappings (JSON formatted)</label>
                <textarea 
                  className="form-input"
                  placeholder='e.g., {"1": "A", "2": "C", "3": "12.5"}'
                  value={manualKeyText}
                  onChange={(e) => setManualKeyText(e.target.value)}
                  style={{ height: "150px", fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMatchingPaper(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Match Key</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
