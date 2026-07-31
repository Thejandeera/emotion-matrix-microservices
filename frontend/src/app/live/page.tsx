"use client";

import { useState, ChangeEvent, KeyboardEvent } from "react";
import "./live.css";
import {
  Broadcast,
  MagnifyingGlass,
  User,
  Sparkle,
  ArrowsClockwise,
  UserFocus,
  WarningOctagon,
  Copy,
  ArrowsOutLineHorizontal,
  WarningCircle,
  UploadSimple,
  Spinner,
  Timer,
  Cpu,
  PaperPlaneRight
} from "@phosphor-icons/react";

interface DetectedKeyword {
  keyword: string;
  sentiment: string;
}

interface ChatMessage {
  id: string;
  speaker: "agent" | "caller";
  isolated_sentence: string;
  phrase: string;
  detected_keywords: DetectedKeyword[];
  emotion: string;
  sentiment_category: string;
  confidence: number;
  sentence_score: number; // confidence based (-100 to +100)
}

export default function LiveMonitor() {
  // Messages & Gateway Processing State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<string>("");
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Chat Input State
  const [activeRole, setActiveRole] = useState<"agent" | "caller">("caller");
  const [inputText, setInputText] = useState<string>("");

  // Layout & Resizing State
  const [leftColWidth, setLeftColWidth] = useState<number>(65); // percentage
  const [cardScale, setCardScale] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  // Call Summary State
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState<boolean>(false);

  // Toast State
  const [toastMessage, setToastMessage] = useState<{ title: string; body: string } | null>(null);

  // Helper to compute sentence score from RoBERTa confidence score
  const computeSentenceScore = (category: string, confidence: number): number => {
    if (category === "positive") {
      return Math.round(confidence * 100);
    } else if (category === "negative") {
      return Math.round(-confidence * 100);
    }
    return 0; // neutral
  };

  // Process message array returned from API Gateway
  const addGatewayIssuesToMessages = (newIssues: any[], fullTranscript: string = "") => {
    if (!newIssues || newIssues.length === 0) return;

    const formattedMessages: ChatMessage[] = newIssues.map((item, idx) => {
      const cat = item.sentiment_category || "neutral";
      const conf = item.confidence || 0.0;
      const score = computeSentenceScore(cat, conf);
      const kws = item.detected_keywords || (item.phrase && item.phrase !== "N/A" ? [{ keyword: item.phrase, sentiment: cat }] : []);

      return {
        id: `msg-${Date.now()}-${idx}`,
        speaker: (item.speaker === "agent" ? "agent" : "caller") as "agent" | "caller",
        isolated_sentence: item.isolated_sentence || item.text || "",
        phrase: item.phrase || (kws.length > 0 ? kws[0].keyword : "N/A"),
        detected_keywords: kws,
        emotion: item.emotion || "neutral",
        sentiment_category: cat,
        confidence: conf,
        sentence_score: score,
      };
    });

    setMessages((prev) => [...prev, ...formattedMessages]);
    if (fullTranscript) {
      setTranscript((prev) => (prev ? `${prev} ${fullTranscript}` : fullTranscript));
    } else {
      const addedText = formattedMessages.map((m) => m.isolated_sentence).join(" ");
      setTranscript((prev) => (prev ? `${prev} ${addedText}` : addedText));
    }
  };

  // Audio File Upload Handler
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      const b64 = result.split(",")[1];
      processAudioPayload(b64);
    };
    reader.readAsDataURL(selectedFile);
  };

  // Send Base64 payload to Gateway
  const processAudioPayload = async (b64Data: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/v1/process-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_data: b64Data, speaker: activeRole }),
      });
      const data = await res.json();
      if (data.status === "success") {
        addGatewayIssuesToMessages(data.detected_issues || [], data.transcript || "");
        setProcessingTimeMs(data.processing_time_ms || 0);
      } else {
        setError(data.detail || "Error processing audio");
      }
    } catch (err) {
      setError("Failed to connect to API Gateway at http://localhost:8000");
    } finally {
      setIsLoading(false);
    }
  };

  // Send Text Message to Gateway
  const handleSendTextMessage = async () => {
    if (!inputText.trim() || isLoading) return;
    const textToSend = inputText.trim();
    setInputText("");
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:8000/api/v1/process-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToSend, speaker: activeRole }),
      });
      const data = await res.json();
      if (data.status === "success") {
        addGatewayIssuesToMessages(data.detected_issues || []);
        setProcessingTimeMs(data.processing_time_ms || 0);
      } else {
        setError(data.detail || "Error processing message");
      }
    } catch (err) {
      setError("Failed to connect to API Gateway at http://localhost:8000");
    } finally {
      setIsLoading(false);
    }
  };

  // Toast Helper
  const triggerToast = (title: string, body: string) => {
    setToastMessage({ title, body });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ================= SCORE & KEYWORD AGGREGATION LOGIC ================= //
  const negativeMessages = messages.filter((m) => m.sentiment_category === "negative");
  const positiveMessages = messages.filter((m) => m.sentiment_category === "positive");

  // Calculate Cumulative Average Score (-100 to +100) across all sentences
  let realOverallScore = 0;
  if (messages.length > 0) {
    const totalSum = messages.reduce((acc, m) => acc + m.sentence_score, 0);
    realOverallScore = Math.round(totalSum / messages.length);
  }

  // Position on gauge track (5% to 95%)
  const pointerLeftPercent = Math.min(95, Math.max(5, ((realOverallScore + 100) / 200) * 100));

  // Extract Real Unique Matched Keywords across messages
  const realKeywordMap = new Map<string, { count: number; sentiment: string }>();
  messages.forEach((msg) => {
    if (msg.detected_keywords && msg.detected_keywords.length > 0) {
      msg.detected_keywords.forEach((kwObj) => {
        const kw = kwObj.keyword.toLowerCase();
        const existing = realKeywordMap.get(kw);
        if (existing) {
          existing.count += 1;
        } else {
          realKeywordMap.set(kw, { count: 1, sentiment: kwObj.sentiment || msg.sentiment_category });
        }
      });
    } else if (msg.phrase && msg.phrase !== "N/A") {
      const kw = msg.phrase.toLowerCase();
      const existing = realKeywordMap.get(kw);
      if (existing) {
        existing.count += 1;
      } else {
        realKeywordMap.set(kw, { count: 1, sentiment: msg.sentiment_category });
      }
    }
  });

  const realKeywords = Array.from(realKeywordMap.entries()).map(([kw, data]) => ({
    keyword: kw,
    count: data.count,
    sentiment: data.sentiment,
  }));

  // Render sentence with highlighted keywords
  const renderSentenceWithHighlight = (msg: ChatMessage) => {
    const sentence = msg.isolated_sentence;
    const kws = msg.detected_keywords || [];
    
    if (kws.length === 0 && (!msg.phrase || msg.phrase === "N/A")) {
      return <span>{sentence}</span>;
    }

    const targetWords = kws.map((k) => k.keyword).concat(msg.phrase && msg.phrase !== "N/A" ? [msg.phrase] : []);
    const validWords = targetWords.filter((w) => w && sentence.toLowerCase().includes(w.toLowerCase()));

    if (validWords.length === 0) {
      return <span>{sentence}</span>;
    }

    const pattern = validWords.map((w) => w.replace(/[-[\]{}()*+?.:\\^$|#\s]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = sentence.split(regex);

    return (
      <span>
        {parts.map((part, idx) => {
          const matchKw = kws.find((k) => k.keyword.toLowerCase() === part.toLowerCase());
          if (matchKw || validWords.some((w) => w.toLowerCase() === part.toLowerCase())) {
            const wordSent = matchKw ? matchKw.sentiment : msg.sentiment_category;
            const highlightClass =
              wordSent === "negative"
                ? "kw-highlight-red"
                : wordSent === "positive"
                ? "kw-highlight-green"
                : "kw-highlight-grey";

            return (
              <span key={idx} className={highlightClass}>
                {part}
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  // Filtered messages based on search query
  const filteredMessages = messages.filter(
    (msg) =>
      msg.isolated_sentence.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.phrase.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (msg.detected_keywords && msg.detected_keywords.some((k) => k.keyword.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="live-page-root">
      {/* STICKY TOP HEADER */}
      <header className="live-header">
        <div className="live-header-left">
          <div className="live-title-group">
            <div className="live-logo-icon">
              <Broadcast size={20} className="animate-pulse" weight="bold" />
            </div>
            <h1 className="live-title">Live Call Sentiment</h1>
          </div>
        </div>

        <div className="live-header-right">
          {/* Audio Upload Button */}
          <label className="btn-upload">
            <UploadSimple size={16} style={{ color: '#ff5722' }} />
            <span>Upload Audio ({activeRole.toUpperCase()})</span>
            <input type="file" accept="audio/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="live-main-container">
        {/* ================= LEFT COLUMN: CHAT TRANSCRIPT & INPUT ================= */}
        <div className="left-column-panel" style={{ width: `${leftColWidth}%` }}>
          {/* Top Bar: Search & Role Selector */}
          <div className="transcript-search-header">
            <div className="transcript-search-input-wrap">
              <MagnifyingGlass size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Transcript..."
                className="transcript-search-input"
              />
            </div>

            {/* Speaker Role Selector Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
              <button
                onClick={() => setActiveRole("caller")}
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activeRole === "caller" ? '#1e293b' : 'transparent',
                  color: activeRole === "caller" ? '#ffffff' : '#64748b',
                  transition: 'all 0.15s'
                }}
              >
                Caller (Left)
              </button>
              <button
                onClick={() => setActiveRole("agent")}
                style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: activeRole === "agent" ? '#ff5722' : 'transparent',
                  color: activeRole === "agent" ? '#ffffff' : '#64748b',
                  transition: 'all 0.15s'
                }}
              >
                Agent (Right)
              </button>
            </div>
          </div>

          {/* Transcript Feed */}
          <div className="transcript-feed-area">
            {error && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.85rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* Skeleton Loading State */}
            {isLoading && messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', width: '100%' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} className="skeleton-pulse"></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '70%' }}>
                    <div style={{ width: '140px', height: '14px' }} className="skeleton-pulse"></div>
                    <div style={{ width: '100%', height: '48px', borderRadius: '12px' }} className="skeleton-pulse"></div>
                  </div>
                </div>
              </div>
            )}

            {/* EMPTY STATE */}
            {messages.length === 0 && !isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', margin: 'auto' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', color: '#cbd5e1' }}>
                  <Broadcast size={28} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>No Transcript or Chat Messages</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
                  Enter a sentence below or upload an audio file to view real-time chat alignment, keyword detection, and RoBERTa confidence scores.
                </p>
              </div>
            )}

            {/* CHAT MESSAGES FEED - AGENT ON RIGHT, CALLER ON LEFT */}
            {filteredMessages.map((msg, idx) => {
              const isAgent = msg.speaker === "agent";
              const badgeClass =
                msg.sentiment_category === "negative"
                  ? "badge-pill-neg"
                  : msg.sentiment_category === "positive"
                  ? "badge-pill-pos"
                  : "badge-pill-neu";

              const confidenceDisplay = (msg.confidence * 100).toFixed(0);

              return (
                <div
                  key={msg.id || idx}
                  id={`sentence-${idx}`}
                  className={`chat-msg-row ${isAgent ? "chat-msg-agent" : "chat-msg-caller"}`}
                  style={
                    highlightedIndex === idx
                      ? { backgroundColor: '#ffedd5', padding: '0.5rem', borderRadius: '12px', transition: 'all 0.3s' }
                      : {}
                  }
                >
                  <div className={`chat-avatar ${isAgent ? "avatar-agent" : "avatar-caller"}`}>
                    <User size={16} />
                  </div>
                  <div className="chat-content-wrap">
                    <div className="chat-msg-header-meta">
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>
                        {isAgent ? "Agent" : "Caller"} • Segment #{idx + 1}
                      </span>
                      <span className={`badge-pill ${badgeClass}`}>
                        {msg.sentiment_category.toUpperCase()} ({confidenceDisplay}%)
                      </span>
                    </div>
                    <div className={`chat-bubble ${isAgent ? "bubble-agent" : "bubble-caller"}`}>
                      {renderSentenceWithHighlight(msg)}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI Summary Section */}
            {messages.length > 0 && (
              <div style={{ marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', width: '100%' }}>
                <button onClick={() => setShowSummary(!showSummary)} className="summary-trigger-btn">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'rgba(255,87,34,0.2)', border: '1px solid rgba(255,87,34,0.4)', color: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkle size={14} weight="bold" />
                    </div>
                    <span style={{ fontWeight: 700 }}>Get Live Call Summary</span>
                  </div>
                </button>

                {showSummary && (
                  <div className="summary-card-body">
                    {isRefreshingSummary ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', gap: '0.5rem', color: '#64748b' }}>
                        <Spinner size={20} className="animate-spin" style={{ color: '#ff5722' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Analyzing conversation transcript...</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                          <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #ffedd5' }}>
                            AI Live Summary
                          </span>
                          <button
                            onClick={() => {
                              setIsRefreshingSummary(true);
                              setTimeout(() => setIsRefreshingSummary(false), 750);
                            }}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <ArrowsClockwise size={12} /> Refresh
                          </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div className="summary-item-box">
                            <div className="summary-item-title">
                              <UserFocus size={16} style={{ color: '#ff5722' }} /> Conversation Overview
                            </div>
                            <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                              Analyzed {messages.length} total messages ({messages.filter(m => m.speaker === 'agent').length} Agent, {messages.filter(m => m.speaker === 'caller').length} Caller).
                            </p>
                          </div>

                          <div className="summary-item-box">
                            <div className="summary-item-title">
                              <WarningOctagon size={16} style={{ color: realOverallScore < 0 ? '#ef4444' : '#10b981' }} /> RoBERTa Sentiment Score
                            </div>
                            <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                              Cumulative Average Score: <strong style={{ color: realOverallScore < 0 ? '#dc2626' : '#059669' }}>({realOverallScore}%)</strong>. Negative segments: {negativeMessages.length}, Positive: {positiveMessages.length}.
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`AI Live Call Summary: ${transcript.slice(0, 150)}...`);
                              triggerToast("Summary Copied", "Call summary copied to clipboard!");
                            }}
                            style={{ fontSize: '0.7rem', fontWeight: 600, color: '#475569', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Copy size={12} /> Copy Summary
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CHAT INPUT BAR AT BOTTOM OF TRANSCRIPT PANEL */}
          <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--live-border)', backgroundColor: '#ffffff', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") handleSendTextMessage();
              }}
              placeholder={`Type a message as ${activeRole.toUpperCase()}...`}
              style={{
                flex: 1,
                padding: '0.55rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSendTextMessage}
              disabled={isLoading || !inputText.trim()}
              style={{
                padding: '0.55rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: activeRole === 'agent' ? '#ff5722' : '#1e293b',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: isLoading || !inputText.trim() ? 0.6 : 1
              }}
            >
              {isLoading ? <Spinner size={16} className="animate-spin" /> : <PaperPlaneRight size={16} weight="bold" />}
              <span>Send</span>
            </button>
          </div>
        </div>

        {/* ================= RESIZER HANDLE ================= */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = leftColWidth;

            const onMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX;
              const newWidth = Math.min(80, Math.max(40, startWidth + (deltaX / window.innerWidth) * 100));
              setLeftColWidth(newWidth);
            };

            const onMouseUp = () => {
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          }}
          className="resizer-bar"
          title="Drag to resize columns"
        >
          <div className="resizer-line"></div>
        </div>

        {/* ================= RIGHT COLUMN: SITUATION SUMMARY ================= */}
        <div className="right-column-panel">
          {/* CARD SCALE CONTROLS TOOLBAR */}
          <div className="scale-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: '#334155' }}>
              <ArrowsOutLineHorizontal size={16} style={{ color: '#ff5722' }} />
              <span>Card Scale</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="scale-btn-group">
                <button
                  onClick={() => setCardScale(0.82)}
                  className={`scale-btn ${cardScale === 0.82 ? "active" : ""}`}
                >
                  Compact
                </button>
                <button
                  onClick={() => setCardScale(1.0)}
                  className={`scale-btn ${cardScale === 1.0 ? "active" : ""}`}
                >
                  Default
                </button>
                <button
                  onClick={() => setCardScale(1.15)}
                  className={`scale-btn ${cardScale === 1.15 ? "active" : ""}`}
                >
                  Large
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderLeft: '1px solid #e2e8f0', paddingLeft: '0.5rem' }}>
                <input
                  type="range"
                  min="75"
                  max="130"
                  value={Math.round(cardScale * 100)}
                  onChange={(e) => setCardScale(parseInt(e.target.value) / 100)}
                  style={{ width: '60px', accentColor: '#ff5722', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, color: '#64748b' }}>
                  {Math.round(cardScale * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* SCALABLE CARDS CONTAINER */}
          <div
            style={{ transform: `scale(${cardScale})`, transformOrigin: "top center", transition: 'transform 0.15s', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {/* 1. RoBERTa Cumulative Average Sentiment Score */}
            <div className="scalable-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 className="card-title-sm" style={{ marginBottom: '1.25rem', textAlign: 'center', width: '100%' }}>
                Cumulative RoBERTa Sentiment Score
              </h2>

              <div style={{ width: '100%', position: 'relative', padding: '0 0.5rem', marginBottom: '0.75rem' }}>
                <div className="gauge-gradient-track"></div>
                <div
                  className="gauge-pointer"
                  style={{ left: `${pointerLeftPercent}%`, borderColor: realOverallScore < 0 ? '#dc2626' : realOverallScore > 0 ? '#10b981' : '#64748b' }}
                ></div>
              </div>

              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                <span>High Neg</span>
                <span>Neutral</span>
                <span>High Pos</span>
              </div>

              <div className="big-score-display" style={{ color: realOverallScore < 0 ? '#dc2626' : realOverallScore > 0 ? '#059669' : '#475569' }}>
                {realOverallScore > 0 ? `+${realOverallScore}%` : `${realOverallScore}%`}
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', fontWeight: 500, margin: 0, maxWidth: '220px' }}>
                {messages.length > 0
                  ? `Average score over ${messages.length} sentences calculated from RoBERTa confidence`
                  : "Waiting for chat or audio input to calculate score"}
              </p>
            </div>

            {/* 2. Keyword Alertness Card */}
            <div className="scalable-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 className="card-title-sm">Keyword Alertness</h2>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontStyle: 'normal' }}>
                  {realKeywords.length > 0 ? "Click word to jump" : "Real-time"}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {realKeywords.length > 0 ? (
                  realKeywords.map((item, i) => {
                    const pillBg =
                      item.sentiment === "negative"
                        ? "#fef2f2"
                        : item.sentiment === "positive"
                        ? "#ecfdf5"
                        : "#f8fafc";

                    const pillBorder =
                      item.sentiment === "negative"
                        ? "#fecaca"
                        : item.sentiment === "positive"
                        ? "#a7f3d0"
                        : "#e2e8f0";

                    const pillColor =
                      item.sentiment === "negative"
                        ? "#b91c1c"
                        : item.sentiment === "positive"
                        ? "#047857"
                        : "#334155";

                    return (
                      <button
                        key={i}
                        onClick={() => {
                          const idx = messages.findIndex(
                            (msg) =>
                              (msg.phrase && msg.phrase.toLowerCase() === item.keyword) ||
                              (msg.detected_keywords && msg.detected_keywords.some((k) => k.keyword.toLowerCase() === item.keyword))
                          );
                          if (idx !== -1) {
                            setHighlightedIndex(idx);
                            const elem = document.getElementById(`sentence-${idx}`);
                            if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => setHighlightedIndex(null), 2500);
                          }
                        }}
                        className="keyword-pill-btn"
                        style={{ backgroundColor: pillBg, borderColor: pillBorder, color: pillColor }}
                      >
                        {item.sentiment === "negative" && <WarningCircle size={14} style={{ color: '#ff5722' }} />}
                        <span>{item.keyword}</span>
                        <span className="pill-count-badge" style={{ backgroundColor: '#ffffff', color: pillColor, border: `1px solid ${pillBorder}` }}>
                          {item.count}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    {messages.length > 0 ? "No target keyphrases detected." : "Waiting for messages..."}
                  </span>
                )}
              </div>
            </div>

            {/* 3. Pipeline Execution Time Card */}
            <div className="scalable-card" style={{ backgroundColor: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Timer size={16} style={{ color: '#ff5722' }} />
                  <h2 className="card-title-sm" style={{ margin: 0 }}>Pipeline Latency</h2>
                </div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700, color: '#94a3b8', padding: '0.15rem 0.4rem', backgroundColor: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  Latency
                </span>
              </div>

              {processingTimeMs !== null ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                      {processingTimeMs}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ff5722', fontFamily: 'monospace' }}>
                      ms
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 'auto', fontWeight: 600 }}>
                      ({(processingTimeMs / 1000).toFixed(2)}s total)
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Gateway</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginTop: '0.1rem' }}>~10%</div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Phrase</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginTop: '0.1rem' }}>~15%</div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Sentiment</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginTop: '0.1rem' }}>~75%</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.72rem', fontStyle: 'italic' }}>
                  <Cpu size={16} /> Awaiting pipeline execution stats...
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="live-toast">
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkle size={16} weight="bold" />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'white' }}>{toastMessage.title}</div>
            <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>{toastMessage.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}