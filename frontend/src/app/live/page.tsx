"use client";

import { useState, FormEvent, useEffect, useRef } from "react";
import "./live.css";
import {
  Broadcast, MagnifyingGlass, User, Spinner, Timer, Cpu, 
  PaperPlaneRight, ChatCircleDots, ArrowsClockwise, WarningCircle
} from "@phosphor-icons/react";

interface DetectedIssue {
  sentence: string;
  phrase: string;
  phrases?: string[];
  keyword_sentiment?: string;
  keyword_weight?: number;
  emotion: string;
  sentiment_category: string;
  confidence: number;
  window_messages?: string[];
  dropped_message?: string | null;
  combined_context?: string;
  role: "Agent" | "Caller";
}

interface ChatMessage {
  role: "Agent" | "Caller";
  text: string;
}

export default function LiveMonitor() {
  // Chat Interface State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState<string>("");
  const [currentRole, setCurrentRole] = useState<"Agent" | "Caller">("Caller");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Gateway Processing State
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Layout & Resizing State
  const [leftColWidth, setLeftColWidth] = useState<number>(65); 
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Restore session state from sessionStorage on mount
  useEffect(() => {
    try {
      const savedHistory = sessionStorage.getItem("chat_history");
      const savedIssues = sessionStorage.getItem("detected_issues");
      if (savedHistory) setChatHistory(JSON.parse(savedHistory));
      if (savedIssues) setIssues(JSON.parse(savedIssues));
    } catch (e) {
      console.error("Error loading sessionStorage:", e);
    }
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [issues, isLoading]);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentInput.trim() || isLoading) return;

    const inputMsg = currentInput.trim();
    const msgRole = currentRole;

    const newMsg: ChatMessage = { role: msgRole, text: inputMsg };
    const updatedHistory = [...chatHistory, newMsg];

    setChatHistory(updatedHistory);
    setCurrentInput("");
    // Automatically toggle role for rapid testing
    setCurrentRole(currentRole === "Agent" ? "Caller" : "Agent");

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:8000/api/v1/process-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputMsg, session_id: "live_session" }),
      });
      const data = await res.json();
      if (data.status === "success") {
        const newIssue: DetectedIssue = {
          sentence: data.sentence || inputMsg,
          phrase: data.phrase || "N/A",
          phrases: data.phrases || [],
          keyword_sentiment: data.keyword_sentiment || "neutral",
          keyword_weight: data.keyword_weight || 0,
          emotion: data.emotion || "neutral",
          sentiment_category: data.sentiment_category || "neutral",
          confidence: data.confidence || 0,
          window_messages: data.window_messages || [],
          dropped_message: data.dropped_message || null,
          combined_context: data.combined_context || "",
          role: msgRole
        };

        const updatedIssues = [...issues, newIssue];
        setIssues(updatedIssues);
        setProcessingTimeMs(data.processing_time_ms || 0);

        // Save into sessionStorage
        sessionStorage.setItem("chat_history", JSON.stringify(updatedHistory));
        sessionStorage.setItem("detected_issues", JSON.stringify(updatedIssues));
      } else {
        setError(data.detail || "Error processing text input");
      }
    } catch (err) {
      setError("Failed to connect to API Gateway at http://localhost:8000");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSession = async () => {
    try {
      await fetch("http://localhost:8000/api/v1/reset-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: "live_session" }),
      });
    } catch (e) {
      console.error("Failed to reset gateway session:", e);
    }

    setChatHistory([]);
    setIssues([]);
    setProcessingTimeMs(null);
    setError(null);
    setCurrentInput("");
    
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
  };

  // ================= CALCULATION LOGIC FROM REAL DATA ================= //
  const negativeItems = issues.filter((i) => (i.keyword_sentiment || i.sentiment_category) === "negative");
  const positiveItems = issues.filter((i) => (i.keyword_sentiment || i.sentiment_category) === "positive");

  // Calculate Real Overall Score (-100 to +100)
  let realOverallScore = 0;
  if (issues.length > 0) {
    if (negativeItems.length > 0) {
      const negRatio = negativeItems.length / issues.length;
      realOverallScore = Math.round(-30 - negRatio * 60);
    } else if (positiveItems.length > 0) {
      const posRatio = positiveItems.length / issues.length;
      realOverallScore = Math.round(30 + posRatio * 60);
    } else {
      realOverallScore = 0;
    }
  }

  const pointerLeftPercent = Math.min(95, Math.max(5, ((realOverallScore + 100) / 200) * 100));

  const renderSentenceWithHighlight = (
    sentence: string, phrase: string, phrases?: string[], itemKeywordSentiment?: string, itemSentenceSentiment?: string
  ) => {
    const targetPhrases = phrases && phrases.length > 0
      ? phrases.filter(p => p && p !== "N/A")
      : (phrase && phrase !== "N/A" ? phrase.split(",").map(s => s.trim()).filter(Boolean) : []);

    if (targetPhrases.length === 0) return <span>{sentence}</span>;

    const sortedPhrases = [...targetPhrases].sort((a, b) => b.length - a.length);
    const pattern = sortedPhrases.map(p => p.replace(/[-[\]{}()*+?.:\\^$|#\s]/g, '\\$&')).join('|');
    if (!pattern) return <span>{sentence}</span>;

    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = sentence.split(regex);
    const wordSentiment = itemKeywordSentiment || itemSentenceSentiment || "neutral";
    const highlightClass = wordSentiment === "negative" ? "kw-highlight-red" : wordSentiment === "positive" ? "kw-highlight-green" : "kw-highlight-grey";

    return (
      <span>
        {parts.map((part, idx) => {
          const isMatch = sortedPhrases.some(p => p.toLowerCase() === part.toLowerCase());
          return isMatch ? <span key={idx} className={highlightClass}>{part}</span> : <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  const filteredIssues = issues.filter(
    (item) =>
      item.sentence.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.phrase.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const lastIssue = issues.length > 0 ? issues[issues.length - 1] : null;
  const currentWindowSize = lastIssue?.window_messages ? lastIssue.window_messages.length : 0;

  return (
    <div className="live-page-root">
      {/* HEADER */}
      <header className="live-header">
        <div className="live-header-left">
          <div className="live-title-group">
            <div className="live-logo-icon">
              <Broadcast size={20} className="animate-pulse" weight="bold" />
            </div>
            <h1 className="live-title">Live Chat & Sentiment Analysis</h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleResetSession}
            style={{
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#475569',
              padding: '0.4rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
            title="Reset Redis Sliding Window and Session Storage"
          >
            <ArrowsClockwise size={14} /> Clear Session
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="live-main-container">
        
        {/* LEFT COLUMN: CHAT INTERFACE */}
        <div className="left-column-panel" style={{ width: `${leftColWidth}%`, display: 'flex', flexDirection: 'column' }}>
          
          <div className="transcript-search-header" style={{ marginBottom: '1rem' }}>
            <div className="transcript-search-input-wrap">
              <MagnifyingGlass size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Analyzed Chat History..."
                className="transcript-search-input"
              />
            </div>
          </div>

          {/* CHAT FEED AREA */}
          <div className="transcript-feed-area" style={{ flexGrow: 1, paddingBottom: '2rem' }}>
            {error && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.85rem', borderRadius: '10px', fontSize: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <WarningCircle size={18} /> {error}
              </div>
            )}

            {issues.length === 0 && !isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', margin: 'auto' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                  <ChatCircleDots size={28} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>Start the Conversation</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '340px' }}>
                  Type a message below to test the 4-message Redis sliding window and sentiment pipeline.
                </p>
              </div>
            )}

            {filteredIssues.map((item, idx) => {
              const isAgent = item.role === "Agent";
              const badgeClass = item.sentiment_category === "negative" ? "badge-pill-neg" : item.sentiment_category === "positive" ? "badge-pill-pos" : "badge-pill-neu";
              const confidenceDisplay = (item.confidence * 100).toFixed(0);

              return (
                <div key={idx} className="chat-msg-row chat-msg-caller" style={{ marginBottom: '1.25rem' }}>
                  <div className="chat-avatar avatar-caller" style={{ backgroundColor: isAgent ? '#e0f2fe' : '#f3e8ff', color: isAgent ? '#0284c7' : '#9333ea' }}>
                    <User size={16} />
                  </div>
                  <div className="chat-content-wrap" style={{ width: '100%' }}>
                    <div className="chat-msg-header-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.8rem' }}>{item.role} Segment #{idx + 1}</span>
                        {item.phrase && item.phrase !== "N/A" && (
                          <span style={{ fontSize: '0.68rem', backgroundColor: '#fef3c7', color: '#b45309', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
                            KW: {item.phrase} (Weight: {item.keyword_weight})
                          </span>
                        )}
                      </div>
                      <span className={`badge-pill ${badgeClass}`}>
                        {item.sentiment_category.toUpperCase()} - {confidenceDisplay}%
                      </span>
                    </div>

                    <div className="chat-bubble bubble-caller" style={{ backgroundColor: isAgent ? '#f0f9ff' : '#faf5ff', border: isAgent ? '1px solid #bae6fd' : '1px solid #e9d5ff' }}>
                      {renderSentenceWithHighlight(
                        item.sentence,
                        item.phrase, item.phrases, item.keyword_sentiment, item.sentiment_category
                      )}
                    </div>

                    {item.dropped_message && (
                      <div style={{ fontSize: '0.65rem', color: '#ef4444', marginTop: '0.3rem', fontStyle: 'italic' }}>
                        ⚠️ Top message dropped from Redis sliding window: "{item.dropped_message}"
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {isLoading && (
              <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                 <Spinner size={16} className="animate-spin" style={{ color: '#ff5722' }} /> Analyzing message context with Redis window...
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* CHAT INPUT BAR (Sticky Bottom) */}
          <div style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '1rem', position: 'sticky', bottom: 0, zIndex: 10 }}>
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value as "Agent" | "Caller")}
                style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8rem', outline: 'none', backgroundColor: '#f8fafc', fontWeight: 600, color: '#334155' }}
              >
                <option value="Caller">Caller</option>
                <option value="Agent">Agent</option>
              </select>
              <input
                type="text"
                value={currentInput}
                onChange={(e) => setCurrentInput(e.target.value)}
                placeholder="Type the next message..."
                style={{ flexGrow: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.82rem', outline: 'none' }}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !currentInput.trim()}
                style={{ backgroundColor: isLoading || !currentInput.trim() ? '#94a3b8' : '#ff5722', color: 'white', border: 'none', borderRadius: '8px', padding: '0 1.25rem', cursor: isLoading || !currentInput.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
              >
                <PaperPlaneRight weight="bold" /> Send
              </button>
            </form>
          </div>
        </div>

        {/* RESIZER HANDLE */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftColWidth;
            const onMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              setLeftColWidth(Math.min(80, Math.max(40, startWidth + (deltaX / window.innerWidth) * 100)));
            };
            const onMouseUp = () => {
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
            };
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          }}
          className="resizer-bar"
        >
          <div className="resizer-line"></div>
        </div>

        {/* RIGHT COLUMN: SCORING & PIPELINE STATS */}
        <div className="right-column-panel">
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            
            {/* 1. Score Card */}
            <div className="scalable-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 className="card-title-sm" style={{ marginBottom: '1.25rem', textAlign: 'center', width: '100%' }}>Weighted Sentiment Score</h2>
              <div style={{ width: '100%', position: 'relative', padding: '0 0.5rem', marginBottom: '0.75rem' }}>
                <div className="gauge-gradient-track"></div>
                <div className="gauge-pointer" style={{ left: `${pointerLeftPercent}%`, borderColor: realOverallScore < 0 ? '#dc2626' : realOverallScore > 0 ? '#10b981' : '#64748b' }}></div>
              </div>
              <div className="big-score-display" style={{ color: realOverallScore < 0 ? '#dc2626' : realOverallScore > 0 ? '#059669' : '#475569' }}>
                {realOverallScore > 0 ? `+${realOverallScore}%` : `${realOverallScore}%`}
              </div>
            </div>

            {/* 2. Redis Sliding Window Dashboard Card */}
            <div className="scalable-card" style={{ backgroundColor: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Timer size={16} style={{ color: '#ff5722' }} />
                  <h2 className="card-title-sm" style={{ margin: 0 }}>Redis Sliding Window Context</h2>
                </div>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, backgroundColor: '#ffedd5', color: '#c2410c', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                  {currentWindowSize} / 4 Msgs Max
                </span>
              </div>

              {processingTimeMs !== null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{processingTimeMs}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff5722', fontFamily: 'monospace' }}>ms</span>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: 'auto' }}>Latency</span>
                  </div>

                  {lastIssue && lastIssue.window_messages && lastIssue.window_messages.length > 0 && (
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.6rem', fontSize: '0.7rem' }}>
                      <div style={{ fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>Active Redis Messages:</div>
                      <ol style={{ paddingLeft: '1rem', margin: 0, color: '#475569' }}>
                        {lastIssue.window_messages.map((m, i) => (
                          <li key={i} style={{ marginBottom: '0.2rem', wordBreak: 'break-word' }}>
                            "{m}"
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.72rem', fontStyle: 'italic' }}>
                  <Cpu size={16} /> Send a message to inspect Redis sliding window context...
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}