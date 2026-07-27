"use client";

import { useState, useEffect, useRef, ChangeEvent } from "react";
import "./live.css";
import {
  Broadcast,
  Users,
  CaretDown,
  MagnifyingGlass,
  Headset,
  User,
  Sparkle,
  ArrowsClockwise,
  UserFocus,
  WarningOctagon,
  Lightbulb,
  Copy,
  ArrowsOutLineHorizontal,
  WarningCircle,
  ShieldWarning,
  Headphones,
  Plugs,
  UserSound,
  X,
  PaperPlaneRight,
  Check,
  Microphone,
  UploadSimple,
  Spinner,
  CheckCircle
} from "@phosphor-icons/react";

interface DetectedIssue {
  phrase: string;
  isolated_sentence: string;
  emotion: string;
  sentiment_category: string;
  confidence: number;
}

export default function LiveMonitor() {
  // Audio & Gateway Processing State
  const [base64String, setBase64String] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Live Microphone Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);

  // Live Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState("David Miller (Active)");

  // Layout & Resizing State
  const [leftColWidth, setLeftColWidth] = useState<number>(65); // percentage
  const [cardScale, setCardScale] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);

  // Call Summary State
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState<boolean>(false);

  // Escalation Modal & Toast State
  const [showEscalateModal, setShowEscalateModal] = useState<boolean>(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState("Sarah Jenkins (Senior Supervisor • On Duty)");
  const [escalationAction, setEscalationAction] = useState("barge");
  const [escalationNote, setEscalationNote] = useState("");
  const [toastMessage, setToastMessage] = useState<{ title: string; body: string } | null>(null);

  // Run live call timer when recording or processing active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording || transcript) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, transcript]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60)
      .toString()
      .padStart(2, "0");
    const secs = (totalSecs % 60)
      .toString()
      .padStart(2, "0");
    return `${mins}:${secs}`;
  };

  // Audio File Upload Handler
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setTranscript("");
    setIssues([]);
    setTimerSeconds(0);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      const b64 = result.split(",")[1];
      setBase64String(b64);
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
        body: JSON.stringify({ audio_data: b64Data }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setTranscript(data.transcript);
        setIssues(data.detected_issues || []);
      } else {
        setError(data.detail || "Error processing audio");
      }
    } catch (err) {
      setError("Failed to connect to API Gateway at http://localhost:8000");
    } finally {
      setIsLoading(false);
    }
  };

  // Microphone Live Streaming (WebSocket + MediaRecorder)
  const startRecording = async () => {
    try {
      setError(null);
      setTranscript("");
      setIssues([]);
      setTimerSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ws = new WebSocket("ws://localhost:8000/api/v1/live-stream");
      webSocketRef.current = ws;

      ws.onopen = () => {
        setIsRecording(true);
        const options = MediaRecorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined;
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            const arrayBuffer = await event.data.arrayBuffer();
            ws.send(arrayBuffer);
          }
        };
        mediaRecorder.start(250);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "partial" || data.type === "analyzed") {
            setTranscript(data.transcript);
            if (data.detected_issues) {
              setIssues(data.detected_issues);
            }
          }
        } catch (err) {
          console.error("WS Parse error:", err);
        }
      };

      ws.onerror = () => setError("Realtime WebSocket connection failed.");
      ws.onclose = () => setIsRecording(false);
    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    if (webSocketRef.current) {
      webSocketRef.current.close();
    }
    setIsRecording(false);
  };

  // Toast Helper
  const triggerToast = (title: string, body: string) => {
    setToastMessage({ title, body });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ================= CALCULATION LOGIC FROM REAL DATA ================= //
  const negativeItems = issues.filter((i) => i.sentiment_category === "negative");
  const positiveItems = issues.filter((i) => i.sentiment_category === "positive");
  const neutralItems = issues.filter((i) => i.sentiment_category === "neutral");

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

  // Position on gauge track (5% to 95%)
  const pointerLeftPercent = Math.min(95, Math.max(5, ((realOverallScore + 100) / 200) * 100));

  // Extract Real Unique Matched Keywords (exclude "N/A")
  const realKeywordMap = new Map<string, { count: number; sentiment: string }>();
  issues.forEach((item) => {
    if (item.phrase && item.phrase !== "N/A") {
      const kw = item.phrase.toLowerCase();
      const existing = realKeywordMap.get(kw);
      if (existing) {
        existing.count += 1;
      } else {
        realKeywordMap.set(kw, { count: 1, sentiment: item.sentiment_category });
      }
    }
  });

  const realKeywords = Array.from(realKeywordMap.entries()).map(([kw, data]) => ({
    keyword: kw,
    count: data.count,
    sentiment: data.sentiment,
  }));

  // Escalation status boolean based on real data
  const isEscalationNeeded = realOverallScore < -20 || negativeItems.length > 0;

  // Keyword highlighting helper function
  const renderSentenceWithHighlight = (sentence: string, phrase: string, sentiment: string) => {
    if (!phrase || phrase === "N/A" || !sentence.toLowerCase().includes(phrase.toLowerCase())) {
      return <span>{sentence}</span>;
    }

    const regex = new RegExp(`(${phrase.replace(/[-[\]{}()*+?.:\\^$|#\s]/g, '\\$&')})`, "gi");
    const parts = sentence.split(regex);

    const highlightClass =
      sentiment === "negative"
        ? "kw-highlight-red"
        : sentiment === "positive"
        ? "kw-highlight-green"
        : "kw-highlight-grey";

    return (
      <span>
        {parts.map((part, idx) =>
          part.toLowerCase() === phrase.toLowerCase() ? (
            <span key={idx} className={highlightClass}>
              {part}
            </span>
          ) : (
            <span key={idx}>{part}</span>
          )
        )}
      </span>
    );
  };

  // Filtered issues based on search query
  const filteredIssues = issues.filter(
    (item) =>
      item.isolated_sentence.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.phrase.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="live-page-root">
      {/* TOP HEADER */}
      <header className="live-header">
        <div className="live-header-left">
          <div className="live-title-group">
            <div className="live-logo-icon">
              <Broadcast size={20} className="animate-pulse" weight="bold" />
            </div>
            <h1 className="live-title">Live Call Sentiment</h1>
          </div>

          <div className="agent-select-badge">
            <Users size={16} style={{ color: '#64748b' }} />
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              <option value="David Miller (Active)">David Miller (Active)</option>
              <option value="Sarah Jenkins">Sarah Jenkins</option>
              <option value="Michael Chang">Michael Chang</option>
              <option value="Emma Thompson">Emma Thompson</option>
            </select>
            <CaretDown size={12} style={{ color: '#94a3b8', position: 'absolute', right: '0.6rem', pointerEvents: 'none' }} />
          </div>

          <div className="header-meta-group">
            <div className="meta-item">
              <span className="meta-label">Agent</span>
              <span className="meta-val">{selectedAgent.split(" ")[0]} Miller</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Caller</span>
              <span className="meta-val">Live Stream Input</span>
            </div>
          </div>
        </div>

        <div className="live-header-right">
          {/* File Upload Controls */}
          <label className="btn-upload">
            <UploadSimple size={16} style={{ color: '#ff5722' }} />
            <span>Upload Audio</span>
            <input type="file" accept="audio/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>

          {/* Microphone Recording Controls */}
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`btn-mic ${isRecording ? "recording" : ""}`}
          >
            <Microphone size={16} weight="bold" />
            <span>{isRecording ? "Stop Mic" : "Start Mic"}</span>
          </button>

          {/* Status Indicator */}
          <div className="on-air-tag" style={isRecording ? { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#ef4444' } : { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0', color: '#64748b' }}>
            <span className="on-air-dot" style={isRecording ? {} : { backgroundColor: '#94a3b8', animation: 'none' }}></span>
            <span>{isRecording ? "LIVE RECORDING" : transcript ? "PROCESSED" : "STANDBY"}</span>
          </div>

          {/* Timer Clock */}
          <div className="timer-clock">
            {formatTimer(timerSeconds)}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="live-main-container">
        {/* ================= LEFT COLUMN: TRANSCRIPT & SEARCH ================= */}
        <div className="left-column-panel" style={{ width: `${leftColWidth}%` }}>
          {/* Search Bar */}
          <div className="transcript-search-header">
            <div className="transcript-search-input-wrap">
              <MagnifyingGlass size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Transcript for words or sentences..."
                className="transcript-search-input"
              />
            </div>
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#ff5722', marginLeft: '1rem' }}>
                <Spinner size={16} className="animate-spin" /> Processing ML Pipeline...
              </div>
            )}
          </div>

          {/* Transcript Feed */}
          <div className="transcript-feed-area">
            {error && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.85rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* EMPTY STATE - NO DUMMY DATA */}
            {!transcript && !isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyCenter: 'center', padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', margin: 'auto' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', color: '#cbd5e1' }}>
                  <Broadcast size={28} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>No Transcript Available</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
                  Upload an audio file above or click <strong>Start Mic</strong> to stream live speech and perform real-time sentiment analysis.
                </p>
              </div>
            )}

            {/* REAL TRANSCRIPT SENTENCE FEED WITH DYNAMIC HIGHLIGHTS */}
            {issues.length > 0 ? (
              filteredIssues.map((item, idx) => {
                const badgeClass =
                  item.sentiment_category === "negative"
                    ? "badge-pill-neg"
                    : item.sentiment_category === "positive"
                    ? "badge-pill-pos"
                    : "badge-pill-neu";

                return (
                  <div
                    key={idx}
                    id={`sentence-${idx}`}
                    className="chat-msg-row chat-msg-caller"
                    style={
                      highlightedIndex === idx
                        ? { backgroundColor: '#ffedd5', padding: '0.5rem', borderRadius: '12px', transition: 'all 0.3s' }
                        : {}
                    }
                  >
                    <div className="chat-avatar avatar-caller">
                      <User size={16} />
                    </div>
                    <div className="chat-content-wrap">
                      <div className="chat-msg-header-meta">
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>Audio Segment #{idx + 1}</span>
                        <span className={`badge-pill ${badgeClass}`}>
                          {item.sentiment_category.toUpperCase()}
                        </span>
                      </div>
                      <div className="chat-bubble bubble-caller">
                        {renderSentenceWithHighlight(item.isolated_sentence, item.phrase, item.sentiment_category)}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : transcript ? (
              <div className="chat-msg-row chat-msg-caller">
                <div className="chat-avatar avatar-caller">
                  <User size={16} />
                </div>
                <div className="chat-content-wrap">
                  <div className="chat-msg-header-meta">
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Full Audio Transcript</span>
                    <span className="badge-pill badge-pill-neu">NEUTRAL</span>
                  </div>
                  <div className="chat-bubble bubble-caller">
                    {transcript}
                  </div>
                </div>
              </div>
            ) : null}

            {/* AI Summary Section based on REAL DATA */}
            {transcript && (
              <div style={{ marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', width: '100%' }}>
                <button onClick={() => setShowSummary(!showSummary)} className="summary-trigger-btn">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'rgba(255,87,34,0.2)', border: '1px solid rgba(255,87,34,0.4)', color: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkle size={14} weight="bold" />
                    </div>
                    <span style={{ fontWeight: 700 }}>Get Live Call Summary</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: '#cbd5e1' }}>
                    <span>Real-time Summary</span>
                    <CaretDown size={12} style={{ transform: showSummary ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
                  </div>
                </button>

                {/* Expandable Summary Card */}
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #ffedd5' }}>
                              AI Live Summary
                            </span>
                            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#94a3b8' }}>
                              {formatTimer(timerSeconds)}
                            </span>
                          </div>
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
                              <UserFocus size={16} style={{ color: '#ff5722' }} /> Customer Issue & Intent
                            </div>
                            <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                              {issues.length > 0
                                ? `Analyzed ${issues.length} audio segments. Key phrase isolated: "${issues[0].phrase !== 'N/A' ? issues[0].phrase : issues[0].isolated_sentence.slice(0, 45) + '...'}"`
                                : "Audio stream transcribed cleanly without critical support keyphrases."}
                            </p>
                          </div>

                          <div className="summary-item-box">
                            <div className="summary-item-title">
                              <WarningOctagon size={16} style={{ color: isEscalationNeeded ? '#ef4444' : '#10b981' }} /> Sentiment Analysis
                            </div>
                            <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                              Overall sentiment score: <strong style={{ color: isEscalationNeeded ? '#dc2626' : '#059669' }}>({realOverallScore}%)</strong>. Total negative segments: {negativeItems.length}, positive: {positiveItems.length}.
                            </p>
                          </div>

                          <div className="summary-item-box" style={isEscalationNeeded ? { backgroundColor: '#fef2f2', borderColor: '#fecaca' } : { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}>
                            <div className="summary-item-title" style={{ color: isEscalationNeeded ? '#b91c1c' : '#065f46' }}>
                              <Lightbulb size={16} style={{ color: isEscalationNeeded ? '#ef4444' : '#059669' }} /> Recommended Next Action
                            </div>
                            <p style={{ margin: 0, color: isEscalationNeeded ? '#b91c1c' : '#047857', lineHeight: 1.5 }}>
                              {isEscalationNeeded
                                ? "Recommend notifying supervisor Sarah Jenkins using the Review & Escalate panel."
                                : "No supervisor escalation required. Continue normal support flow."}
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

        {/* ================= RIGHT COLUMN: REAL SITUATION SUMMARY ================= */}
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

          {/* SCALABLE CARDS CONTAINER WITH REAL DATA */}
          <div
            style={{ transform: `scale(${cardScale})`, transformOrigin: "top center", transition: 'transform 0.15s', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
          >
            {/* 1. Weighted Overall Sentiment Score */}
            <div className="scalable-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 className="card-title-sm" style={{ marginBottom: '1.25rem', textAlign: 'center', width: '100%' }}>
                Weighted Sentiment Score
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
                {issues.length > 0
                  ? `Calculated from ${issues.length} analyzed audio sentence segments`
                  : "Waiting for audio input to calculate score"}
              </p>
            </div>

            {/* 2. Keyword Alertness Card (REAL DETECTED KEYWORDS) */}
            <div className="scalable-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 className="card-title-sm">Keyword Alertness</h2>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500 }}>
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
                          const idx = issues.findIndex((iss) => iss.phrase.toLowerCase() === item.keyword);
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
                    {transcript ? "No target keyphrases detected in audio." : "Waiting for audio..."}
                  </span>
                )}
              </div>
            </div>

            {/* 3. Call Escalation Recommendation Card (REAL DATA DRIVEN) */}
            {isEscalationNeeded ? (
              <div className="escalate-banner-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="on-air-dot"></span>
                  <h2 className="card-title-sm" style={{ color: '#c2410c', margin: 0 }}>AI Alert • Escalation Recommended</h2>
                </div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ea4a16', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <WarningCircle size={18} />
                  <span>ESCALATE TO MANAGER</span>
                </div>
                <p style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '0.85rem', fontWeight: 500, margin: '0 auto 0.85rem auto', maxWidth: '260px' }}>
                  Triggered by negative sentiment <strong style={{ color: '#dc2626' }}>({realOverallScore}%)</strong> & negative phrase count ({negativeItems.length})
                </p>
                <button onClick={() => setShowEscalateModal(true)} className="btn-escalate">
                  <ShieldWarning size={16} weight="bold" />
                  <span>Review & Escalate Call</span>
                </button>
              </div>
            ) : (
              <div className="escalate-banner-card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, #ecfdf5 100%)', borderColor: '#a7f3d0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <CheckCircle size={16} style={{ color: '#059669' }} />
                  <h2 className="card-title-sm" style={{ color: '#047857', margin: 0 }}>Call Stable • No Escalation</h2>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#059669', marginBottom: '0.25rem' }}>
                  CUSTOMER SENTIMENT GOOD
                </div>
                <p style={{ fontSize: '0.72rem', color: '#047857', margin: 0, fontWeight: 500 }}>
                  Sentiment score is stable at <strong style={{ color: '#047857' }}>{realOverallScore > 0 ? `+${realOverallScore}%` : `${realOverallScore}%`}</strong>.
                </p>
              </div>
            )}

            {/* 4. Call Controls */}
            <div className="scalable-card">
              <h2 className="card-title-sm" style={{ marginBottom: '0.75rem' }}>Call Controls</h2>
              <button className="btn-control">
                Listen-in <Headphones size={16} style={{ color: '#94a3b8' }} />
              </button>
              <button className="btn-control">
                Barge-in <Plugs size={16} style={{ color: '#94a3b8' }} />
              </button>
              <button className="btn-control" style={{ marginBottom: 0 }}>
                Silent Whisper <UserSound size={16} style={{ color: '#94a3b8' }} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ESCALATE TO MANAGER MODAL */}
      {showEscalateModal && (
        <div className="modal-backdrop">
          <div className="modal-card" style={{ maxWidth: '500px' }}>
            <div className="modal-header" style={{ backgroundColor: '#0f172a', color: 'white' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,87,34,0.2)', border: '1px solid rgba(255,87,34,0.4)', color: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldWarning size={20} weight="bold" />
                </div>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'white' }}>Escalate Call to Manager</h3>
                  <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: 0 }}>Supervisor Notification & Action Dispatch</p>
                </div>
              </div>
              <button onClick={() => setShowEscalateModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Context Card */}
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      Audio Stream Input
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      Agent: {selectedAgent.split(" ")[0]} • Call Duration: {formatTimer(timerSeconds)}
                    </div>
                  </div>
                </div>
                <span className="badge-pill badge-pill-neg" style={{ fontSize: '0.7rem' }}>
                  Score: {realOverallScore}%
                </span>
              </div>

              {/* Escalation Options */}
              <div className="form-group">
                <label className="form-label">Select Supervisor / Manager</label>
                <select
                  value={selectedSupervisor}
                  onChange={(e) => setSelectedSupervisor(e.target.value)}
                  className="form-control"
                >
                  <option value="Sarah Jenkins (Senior Supervisor • On Duty)">Sarah Jenkins (Senior Supervisor • On Duty)</option>
                  <option value="Michael Chang (Floor Manager • Available)">Michael Chang (Floor Manager • Available)</option>
                  <option value="Emma Thompson (QA Lead • Available)">Emma Thompson (QA Lead • Available)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Escalation Protocol</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid #ffedd5', backgroundColor: '#fff7ed', borderRadius: '10px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="esc-action"
                      value="barge"
                      checked={escalationAction === "barge"}
                      onChange={() => setEscalationAction("barge")}
                      style={{ accentColor: '#ff5722' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.75rem' }}>Manager Barge-In</div>
                      <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Supervisor joins call</div>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', borderRadius: '10px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="esc-action"
                      value="transfer"
                      checked={escalationAction === "transfer"}
                      onChange={() => setEscalationAction("transfer")}
                      style={{ accentColor: '#ff5722' }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.75rem' }}>Warm Transfer</div>
                      <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Transfer to manager</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Escalation Summary / Note</label>
                <textarea
                  rows={2}
                  value={escalationNote}
                  onChange={(e) => setEscalationNote(e.target.value)}
                  placeholder="Escalating call due to detected negative sentiment in live stream..."
                  className="form-control"
                  style={{ resize: 'none' }}
                ></textarea>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setShowEscalateModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEscalateModal(false);
                  triggerToast(
                    "Escalation Request Sent",
                    `${selectedSupervisor.split("(")[0].trim()} notified. Manager joining stream...`
                  );
                }}
                className="btn-primary"
              >
                <PaperPlaneRight size={16} weight="bold" /> Send Alert & Escalate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="live-toast">
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={16} weight="bold" />
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