import { useState } from "react";
import { Save, RefreshCw, Type, Palette, Layout, Clock, Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  // 1. Font Style state
  const [fontStyle, setFontStyle] = useState(() => {
    return localStorage.getItem("cbt_font_style") || "Outfit";
  });

  // 2. Theming state
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("cbt_theme") || "Space Dark";
  });

  // 3. Dashboard Layout state
  const [dashboardLayout, setDashboardLayout] = useState(() => {
    return localStorage.getItem("cbt_dashboard_layout") || "Standard Grid";
  });

  // 4. Flashcard UI customisations
  const [flashcardUi, setFlashcardUi] = useState(() => {
    return localStorage.getItem("cbt_flashcard_ui") || "Interactive Flip Card";
  });

  // 5. Per Question default duration (seconds)
  const [defaultDuration, setDefaultDuration] = useState(() => {
    return Number(localStorage.getItem("cbt_default_duration") || "180");
  });

  // Subject-wise customized durations
  const [physicsDuration, setPhysicsDuration] = useState(() => {
    return Number(localStorage.getItem("cbt_duration_Physics") || "180");
  });
  const [chemistryDuration, setChemistryDuration] = useState(() => {
    return Number(localStorage.getItem("cbt_duration_Chemistry") || "180");
  });
  const [biologyDuration, setBiologyDuration] = useState(() => {
    return Number(localStorage.getItem("cbt_duration_Biology") || "180");
  });
  const [mathDuration, setMathDuration] = useState(() => {
    return Number(localStorage.getItem("cbt_duration_Mathematics") || "180");
  });

  const [savedMessage, setSavedMessage] = useState(false);

  // Apply Font Style dynamically
  const applyFont = (font: string) => {
    const root = document.documentElement;
    if (font === "Outfit") {
      root.style.setProperty("--font-sans", "'Outfit', sans-serif");
    } else if (font === "Inter") {
      root.style.setProperty("--font-sans", "'Inter', sans-serif");
    } else if (font === "Roboto") {
      root.style.setProperty("--font-sans", "'Roboto', sans-serif");
    } else if (font === "JetBrains Mono") {
      root.style.setProperty("--font-sans", "'JetBrains Mono', monospace");
    }
  };

  // Apply Theme dynamically
  const applyTheme = (t: string) => {
    const root = document.documentElement;
    if (t === "Space Dark") {
      root.style.setProperty("--bg-primary", "#030712");
      root.style.setProperty("--bg-secondary", "rgba(17, 24, 39, 0.65)");
      root.style.setProperty("--bg-tertiary", "rgba(31, 41, 55, 0.5)");
      root.style.setProperty("--primary", "#6366f1");
      root.style.setProperty("--primary-hover", "#4f46e5");
      root.style.setProperty("--accent-gradient", "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)");
      document.body.style.backgroundImage = "radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.05) 0px, transparent 50%)";
    } else if (t === "Ocean Dark") {
      root.style.setProperty("--bg-primary", "#022c22");
      root.style.setProperty("--bg-secondary", "rgba(6, 78, 59, 0.6)");
      root.style.setProperty("--bg-tertiary", "rgba(4, 120, 87, 0.3)");
      root.style.setProperty("--primary", "#0ea5e9");
      root.style.setProperty("--primary-hover", "#0284c7");
      root.style.setProperty("--accent-gradient", "linear-gradient(135deg, #0ea5e9 0%, #10b981 100%)");
      document.body.style.backgroundImage = "radial-gradient(at 0% 0%, rgba(14, 165, 233, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%)";
    } else if (t === "Classic Slate") {
      root.style.setProperty("--bg-primary", "#0f172a");
      root.style.setProperty("--bg-secondary", "rgba(30, 41, 59, 0.7)");
      root.style.setProperty("--bg-tertiary", "rgba(51, 65, 85, 0.5)");
      root.style.setProperty("--primary", "#3b82f6");
      root.style.setProperty("--primary-hover", "#2563eb");
      root.style.setProperty("--accent-gradient", "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)");
      document.body.style.backgroundImage = "radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.05) 0px, transparent 50%)";
    }
  };

  const handleSave = () => {
    localStorage.setItem("cbt_font_style", fontStyle);
    localStorage.setItem("cbt_theme", theme);
    localStorage.setItem("cbt_dashboard_layout", dashboardLayout);
    localStorage.setItem("cbt_flashcard_ui", flashcardUi);
    localStorage.setItem("cbt_default_duration", String(defaultDuration));
    localStorage.setItem("cbt_duration_Physics", String(physicsDuration));
    localStorage.setItem("cbt_duration_Chemistry", String(chemistryDuration));
    localStorage.setItem("cbt_duration_Biology", String(biologyDuration));
    localStorage.setItem("cbt_duration_Mathematics", String(mathDuration));

    applyFont(fontStyle);
    applyTheme(theme);

    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  };

  const handleReset = () => {
    setFontStyle("Outfit");
    setTheme("Space Dark");
    setDashboardLayout("Standard Grid");
    setFlashcardUi("Interactive Flip Card");
    setDefaultDuration(180);
    setPhysicsDuration(180);
    setChemistryDuration(180);
    setBiologyDuration(180);
    setMathDuration(180);
  };

  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "32px", maxWidth: "800px", margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "700", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "center" }}>
          <SettingsIcon size={28} /> System Settings
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>Customize font sizing, interface theming colors, flashcard solvers, and subject timer durations.</p>
      </div>

      {savedMessage && (
        <div className="glass-panel" style={{ borderColor: "var(--success)", padding: "14px", color: "var(--success)", fontWeight: "600", display: "flex", gap: "8px", alignItems: "center" }}>
          <CheckCircle size={16} /> Configurations saved and loaded successfully!
        </div>
      )}

      {/* Font & Style */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: "600", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
          <Type size={18} /> Typography Font Family
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {[
            { value: "Outfit", desc: "Outfit (Modern Squircle Geometric)" },
            { value: "Inter", desc: "Inter (Clean Technical Sans)" },
            { value: "Roboto", desc: "Roboto (NTA Official Standard)" },
            { value: "JetBrains Mono", desc: "JetBrains Mono (Developer Console)" }
          ].map((item) => (
            <label key={item.value} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "10px 14px", backgroundColor: "var(--bg-tertiary)", borderRadius: "6px" }}>
              <input 
                type="radio" 
                name="settings-font"
                checked={fontStyle === item.value}
                onChange={() => setFontStyle(item.value)}
                style={{ accentColor: "var(--primary)" }}
              />
              <span style={{ fontSize: "0.92rem", fontWeight: "500" }}>{item.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Colors & Themes */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: "600", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
          <Palette size={18} /> Color Schemes & Theming
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          {[
            { value: "Space Dark", color: "#6366f1", bg: "#030712", label: "Space Dark (Indigo)" },
            { value: "Ocean Dark", color: "#0ea5e9", bg: "#022c22", label: "Ocean Dark (Cyan)" },
            { value: "Classic Slate", color: "#3b82f6", bg: "#0f172a", label: "Classic Slate (Blue)" }
          ].map((themeOpt) => (
            <div 
              key={themeOpt.value}
              onClick={() => setTheme(themeOpt.value)}
              style={{ 
                cursor: "pointer", padding: "16px", borderRadius: "8px", 
                backgroundColor: themeOpt.bg, border: theme === themeOpt.value ? `2px solid ${themeOpt.color}` : "1.5px solid var(--border-color)",
                boxShadow: theme === themeOpt.value ? `0 0 10px ${themeOpt.color}40` : "none",
                display: "flex", flexDirection: "column", gap: "8px", transition: "all 0.15s ease"
              }}
            >
              <span style={{ fontWeight: "700", fontSize: "0.9rem", color: "#fff" }}>{themeOpt.label}</span>
              <div style={{ display: "flex", gap: "4px" }}>
                <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: themeOpt.color }}></span>
                <span style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.08)" }}></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layout & UI Mode Customisations */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: "600", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
          <Layout size={18} /> Layout & Deck Modes
        </h2>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Dashboard Layout */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "0.95rem", fontWeight: "600", display: "block" }}>Dashboard Layout Structure</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Change how analytics cards align on the welcome screen</span>
            </div>
            <select 
              value={dashboardLayout} 
              onChange={(e) => setDashboardLayout(e.target.value)}
              className="form-select"
              style={{ width: "180px", padding: "6px 12px" }}
            >
              <option value="Standard Grid">Standard Grid</option>
              <option value="Split View">Split View</option>
              <option value="Compact List">Compact List</option>
            </select>
          </div>

          {/* Flashcard Customisation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "14px" }}>
            <div>
              <span style={{ fontSize: "0.95rem", fontWeight: "600", display: "block" }}>Flashcard UI Mode</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Configure how explanations reveal themselves on decks</span>
            </div>
            <select 
              value={flashcardUi} 
              onChange={(e) => setFlashcardUi(e.target.value)}
              className="form-select"
              style={{ width: "180px", padding: "6px 12px" }}
            >
              <option value="Interactive Flip Card">Interactive Flip</option>
              <option value="Quick Grade Reveal">Simultaneous Reveal</option>
              <option value="Anki-style Review">Anki Grading Actions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Time limit & Durations */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: "600", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
          <Clock size={18} /> Question Durations & Timer Limits
        </h2>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Default Question Duration */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: "0.95rem", fontWeight: "600", display: "block" }}>Default CBT Time per Question</span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Overall default countdown seconds per question</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input 
                type="number" 
                min="30"
                max="600"
                value={defaultDuration} 
                onChange={(e) => setDefaultDuration(Number(e.target.value) || 180)}
                className="form-input"
                style={{ width: "90px", textAlign: "center", padding: "6px" }}
              />
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>sec</span>
            </div>
          </div>

          {/* Subject wise modification */}
          <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: "700", color: "var(--primary)" }}>Subject-Wise Default Time (Seconds)</span>
            
            {[
              { label: "Physics Limit", val: physicsDuration, setter: setPhysicsDuration },
              { label: "Chemistry Limit", val: chemistryDuration, setter: setChemistryDuration },
              { label: "Biology Limit", val: biologyDuration, setter: setBiologyDuration },
              { label: "Mathematics Limit", val: mathDuration, setter: setMathDuration }
            ].map((subItem, sIdx) => (
              <div key={sIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.88rem", fontWeight: "500" }}>{subItem.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input 
                    type="number" 
                    min="10"
                    max="600"
                    value={subItem.val} 
                    onChange={(e) => subItem.setter(Number(e.target.value) || 180)}
                    className="form-input"
                    style={{ width: "90px", textAlign: "center", padding: "6px", height: "32px" }}
                  />
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>sec</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <button onClick={handleReset} className="btn btn-secondary" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <RefreshCw size={16} /> Restore Defaults
        </button>
        <button onClick={handleSave} className="btn btn-primary" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <Save size={16} /> Save Configurations
        </button>
      </div>
    </div>
  );
}

// Helper icons
function CheckCircle({ size, color }: { size: number; color?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color || "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
