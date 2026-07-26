import { useState, useEffect } from "react";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import CBTPlayer from "./components/CBTPlayer";
import InAppReview from "./pages/InAppReview";
import Settings from "./pages/Settings";
import { GraduationCap, BarChart2, FolderHeart, Zap, ClipboardList } from "lucide-react";

type Tab = "dashboard" | "library" | "cbt" | "review" | "settings";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // Load and apply font/theme settings on startup
  useEffect(() => {
    const font = localStorage.getItem("cbt_font_style") || "Outfit";
    const theme = localStorage.getItem("cbt_theme") || "Space Dark";
    
    // Apply font
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
    
    // Apply theme
    if (theme === "Space Dark") {
      root.style.setProperty("--bg-primary", "#030712");
      root.style.setProperty("--bg-secondary", "rgba(17, 24, 39, 0.65)");
      root.style.setProperty("--bg-tertiary", "rgba(31, 41, 55, 0.5)");
      root.style.setProperty("--primary", "#6366f1");
      root.style.setProperty("--primary-hover", "#4f46e5");
      root.style.setProperty("--accent-gradient", "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)");
      document.body.style.backgroundImage = "radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(168, 85, 247, 0.05) 0px, transparent 50%)";
    } else if (theme === "Ocean Dark") {
      root.style.setProperty("--bg-primary", "#022c22");
      root.style.setProperty("--bg-secondary", "rgba(6, 78, 59, 0.6)");
      root.style.setProperty("--bg-tertiary", "rgba(4, 120, 87, 0.3)");
      root.style.setProperty("--primary", "#0ea5e9");
      root.style.setProperty("--primary-hover", "#0284c7");
      root.style.setProperty("--accent-gradient", "linear-gradient(135deg, #0ea5e9 0%, #10b981 100%)");
      document.body.style.backgroundImage = "radial-gradient(at 0% 0%, rgba(14, 165, 233, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.05) 0px, transparent 50%)";
    } else if (theme === "Classic Slate") {
      root.style.setProperty("--bg-primary", "#0f172a");
      root.style.setProperty("--bg-secondary", "rgba(30, 41, 59, 0.7)");
      root.style.setProperty("--bg-tertiary", "rgba(51, 65, 85, 0.5)");
      root.style.setProperty("--primary", "#3b82f6");
      root.style.setProperty("--primary-hover", "#2563eb");
      root.style.setProperty("--accent-gradient", "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)");
      document.body.style.backgroundImage = "radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.08) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(6, 182, 212, 0.05) 0px, transparent 50%)";
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* App Header */}
      <header className="app-header">
        <div className="brand" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button 
            onClick={() => setActiveTab("settings")} 
            style={{ 
              background: "none", border: "none", cursor: "pointer", padding: "4px", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "50%", transition: "background-color 0.2s"
            }}
            title="Open System Settings"
          >
            <GraduationCap size={28} color={activeTab === "settings" ? "#a855f7" : "#6366f1"} style={{ transition: "color 0.2s" }} />
          </button>
          <span 
            onClick={() => setActiveTab("dashboard")} 
            style={{ cursor: "pointer" }}
            title="Go to Dashboard"
          >
            NCERT Tagged CBT
          </span>
        </div>

        <nav className="nav-links">
          <button 
            className={`nav-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <BarChart2 size={16} /> Dashboard
          </button>
          
          <button 
            className={`nav-btn ${activeTab === "library" ? "active" : ""}`}
            onClick={() => setActiveTab("library")}
          >
            <FolderHeart size={16} /> Library & Ingestion
          </button>
          
          <button 
            className={`nav-btn ${activeTab === "cbt" ? "active" : ""}`}
            onClick={() => setActiveTab("cbt")}
          >
            <ClipboardList size={16} /> Mock CBT Exam
          </button>
          
          <button 
            className={`nav-btn ${activeTab === "review" ? "active" : ""}`}
            onClick={() => setActiveTab("review")}
          >
            <Zap size={16} /> Review Modules
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={{ flexGrow: 1, overflowY: "auto", position: "relative" }}>
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "library" && <Library />}
        {activeTab === "cbt" && <CBTPlayer />}
        {activeTab === "review" && <InAppReview />}
        {activeTab === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default App;
