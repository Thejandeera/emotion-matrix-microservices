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
  Spinner
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
  const [timerSeconds, setTimerSeconds] = useState(134); // 02:14 initial clock
  const [selectedAgent, setSelectedAgent] = useState("David Miller (Active)");

  // Layout & Resizing State
  const [leftColWidth, setLeftColWidth] = useState<number>(65); // percentage
  const [cardScale, setCardScale] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  // Call Summary State
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState<boolean>(false);

  // Escalation Modal & Toast State
  const [showEscalateModal, setShowEscalateModal] = useState<boolean>(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState("Sarah Jenkins (Senior Supervisor • On Duty)");
  const [escalationAction, setEscalationAction] = useState("barge");
  const [escalationNote, setEscalationNote] = useState("");
  const [toastMessage, setToastMessage] = useState<{ title: string; body: string } | null>(null);

  // Run live call timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  // Calculate overall weighted score (-100% to +100%)
  const negativeIssues = issues.filter((i) => i.sentiment_category === "negative");
  const overallScoreValue =
    issues.length > 0
      ? Math.max(-100, Math.min(100, -85 + (issues.length - negativeIssues.length) * 20))
      : -85;

  // Pointer position on gradient line (0% to 100% left offset)
  const pointerLeftPercent = Math.min(95, Math.max(5, ((overallScoreValue + 100) / 200) * 100));

  // Keyword highlighting
  const scrollToKeyword = (msgId: string) => {
    setHighlightedMsgId(msgId);
    setTimeout(() => setHighlightedMsgId(null), 2500);
  };

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
              <span className="meta-val">Marcus Bell (Cellular)</span>
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
          <div className="on-air-tag">
            <span className="on-air-dot"></span>
            <span>{isRecording ? "RECORDING" : "ON AIR"}</span>
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
                placeholder="Search Transcript for words..."
                className="transcript-search-input"
              />
            </div>
            {isLoading && (
              <div style={{ display: 'flex', itemsCenter: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#ff5722', marginLeft: '1rem' }}>
                <Spinner size={16} className="animate-spin" /> Processing Audio...
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

            {/* Custom Transcribed Payload View if processing completed */}
            {transcript ? (
              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#0f172a' }}>
                    Audio Processing Transcript Result
                  </span>
                  <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#94a3b8' }}>Gateway Response</span>
                </div>
                <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: '#1e293b', fontWeight: 500, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {transcript}
                </p>

                {issues.length > 0 && (
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                      Detected Keyphrases & Sentence Contexts:
                    </span>
                    {issues.map((iss, i) => (
                      <div key={i} style={{ backgroundColor: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '8px', padding: '0.65rem', fontSize: '0.75rem' }}>
                        <div style={{ display: 'flex', justify: 'space-between', fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                          <span style={{ color: '#ea4a16' }}>Matched Phrase: "{iss.phrase}"</span>
                          <span className="badge-pill badge-pill-neu">{iss.sentiment_category}</span>
                        </div>
                        <p style={{ color: '#475569', fontStyle: 'italic', margin: 0 }}>"{iss.isolated_sentence}"</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Default Live Stream Feed UI (Pre-populated sample transcript) */}
            {!transcript && (
              <>
                {/* Agent Message 1 */}
                <div className="chat-msg-row chat-msg-agent">
                  <div className="chat-avatar avatar-agent">
                    <Headset size={16} />
                  </div>
                  <div className="chat-content-wrap">
                    <div className="chat-msg-header-meta">
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>10:02:15</span>
                      <span className="badge-pill badge-pill-pos">POSITIVE</span>
                      <span style={{ fontWeight: 700, color: '#ff5722' }}>David Miller (Agent)</span>
                    </div>
                    <div className="chat-bubble bubble-agent">
                      Hello, thank you for calling support. How can I help you today?
                    </div>
                  </div>
                </div>

                {/* Caller Message 1 (msg-1) */}
                <div
                  id="msg-1"
                  className="chat-msg-row chat-msg-caller"
                  style={highlightedMsgId === "msg-1" ? { backgroundColor: '#ffedd5', padding: '0.5rem', borderRadius: '12px' } : {}}
                >
                  <div className="chat-avatar avatar-caller">
                    <User size={16} />
                  </div>
                  <div className="chat-content-wrap">
                    <div className="chat-msg-header-meta">
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>Caller (Marcus Bell)</span>
                      <span className="badge-pill badge-pill-neg">NEGATIVE</span>
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>10:02:30</span>
                    </div>
                    <div className="chat-bubble bubble-caller">
                      I'm extremely <span className="kw-highlight-red">frustrated</span>! I need a <span className="kw-highlight-red">refund</span> immediately.
                    </div>
                  </div>
                </div>

                {/* Agent Message 2 */}
                <div className="chat-msg-row chat-msg-agent">
                  <div className="chat-avatar avatar-agent">
                    <Headset size={16} />
                  </div>
                  <div className="chat-content-wrap">
                    <div className="chat-msg-header-meta">
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>10:02:45</span>
                      <span className="badge-pill badge-pill-neu">NEUTRAL</span>
                      <span style={{ fontWeight: 700, color: '#ff5722' }}>David Miller (Agent)</span>
                    </div>
                    <div className="chat-bubble bubble-agent">
                      I understand your frustration. Let me look into your account. Can I have your order number?
                    </div>
                  </div>
                </div>

                {/* Caller Message 2 (msg-2) */}
                <div
                  id="msg-2"
                  className="chat-msg-row chat-msg-caller"
                  style={highlightedMsgId === "msg-2" ? { backgroundColor: '#ffedd5', padding: '0.5rem', borderRadius: '12px' } : {}}
                >
                  <div className="chat-avatar avatar-caller">
                    <User size={16} />
                  </div>
                  <div className="chat-content-wrap">
                    <div className="chat-msg-header-meta">
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>Caller (Marcus Bell)</span>
                      <span className="badge-pill badge-pill-neg">NEGATIVE</span>
                      <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>10:03:10</span>
                    </div>
                    <div className="chat-bubble bubble-caller">
                      The order number is 55621. This is a formal <span className="kw-highlight-red">complaint</span>. I want to speak to a <span className="kw-highlight-red">manager</span>.
                    </div>
                  </div>
                </div>

                {/* Active typing/analyzing indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '1rem auto 0 auto', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  <Sparkle size={14} className="animate-spin" style={{ color: '#ff5722' }} />
                  <span>Analyzing Stream</span>
                </div>
              </>
            )}

            {/* ================= CALL SUMMARY SECTION ================= */}
            <div style={{ marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', width: '100%' }}>
              <button onClick={() => setShowSummary(!showSummary)} className="summary-trigger-btn">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'rgba(255,87,34,0.2)', border: '1px solid rgba(255,87,34,0.4)', color: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkle size={14} weight="bold" />
                  </div>
                  <span style={{ fontWeight: 700 }}>Get Live Call Summary</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: '#cbd5e1' }}>
                  <span>Summary so far</span>
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
                          <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#94a3b8' }}>10:03:12</span>
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
                            Caller Marcus Bell is asking for an immediate full refund for order <strong style={{ color: '#0f172a' }}>#55621</strong> due to high frustration with delivery delays.
                          </p>
                        </div>

                        <div className="summary-item-box">
                          <div className="summary-item-title">
                            <WarningOctagon size={16} style={{ color: '#ef4444' }} /> Escalation Status
                          </div>
                          <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                            Overall sentiment is heavily negative <strong style={{ color: '#dc2626' }}>({overallScoreValue}%)</strong>. Customer formally logged a complaint and insisted on speaking with a manager.
                          </p>
                        </div>

                        <div className="summary-item-box" style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}>
                          <div className="summary-item-title" style={{ color: '#065f46' }}>
                            <Lightbulb size={16} style={{ color: '#059669' }} /> Recommended Next Action
                          </div>
                          <p style={{ margin: 0, color: '#047857', lineHeight: 1.5 }}>
                            Acknowledge order #55621 status or use the <strong>Review & Escalate Call</strong> panel on the right to notify Supervisor Sarah Jenkins.
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText("AI Live Call Summary: Marcus Bell requesting immediate refund for order #55621.");
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
            {/* 1. Weighted Overall Sentiment Score */}
            <div className="scalable-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h2 className="card-title-sm" style={{ marginBottom: '1.25rem', textAlign: 'center', width: '100%' }}>
                Weighted Sentiment Score
              </h2>

              <div style={{ width: '100%', position: 'relative', padding: '0 0.5rem', marginBottom: '0.75rem' }}>
                <div className="gauge-gradient-track"></div>
                <div className="gauge-pointer" style={{ left: `${pointerLeftPercent}%` }}></div>
              </div>

              <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                <span>High Neg</span>
                <span>Neutral</span>
                <span>High Pos</span>
              </div>

              <div className="big-score-display">
                {overallScoreValue}%
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', textAlign: 'center', fontWeight: 500, margin: 0, maxWidth: '220px' }}>
                Heavily Weighted by Negative Keyword Usage
              </p>
            </div>

            {/* 2. Keyword Alertness Card */}
            <div className="scalable-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 className="card-title-sm">Keyword Alertness</h2>
                <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500 }}>Click word to jump</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button onClick={() => scrollToKeyword("msg-1")} className="keyword-pill-btn">
                  <span>refund</span>
                  <span className="pill-count-badge" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>1</span>
                </button>

                <button onClick={() => scrollToKeyword("msg-2")} className="keyword-pill-btn" style={{ backgroundColor: '#fff7ed', borderColor: '#ffedd5' }}>
                  <WarningCircle size={14} style={{ color: '#ff5722' }} />
                  <span>manager</span>
                  <span className="pill-count-badge" style={{ backgroundColor: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}>2</span>
                </button>

                <button onClick={() => scrollToKeyword("msg-1")} className="keyword-pill-btn">
                  <span>frustrated</span>
                  <span className="pill-count-badge" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>1</span>
                </button>

                <button onClick={() => scrollToKeyword("msg-2")} className="keyword-pill-btn" style={{ backgroundColor: '#fff7ed', borderColor: '#ffedd5' }}>
                  <WarningCircle size={14} style={{ color: '#ff5722' }} />
                  <span>complaint</span>
                  <span className="pill-count-badge" style={{ backgroundColor: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}>2</span>
                </button>

                {issues.map((iss, i) => (
                  <button key={i} className="keyword-pill-btn" style={{ backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}>
                    <span>{iss.phrase}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Call Escalation Recommendation Card */}
            <div className="escalate-banner-card">
              <div style={{ display: 'flex', itemsCenter: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                <span className="on-air-dot"></span>
                <h2 className="card-title-sm" style={{ color: '#c2410c', margin: 0 }}>AI Alert • Escalation Recommended</h2>
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ea4a16', display: 'flex', alignItems: 'center', justifyCenter: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <WarningCircle size={18} />
                <span>ESCALATE TO MANAGER</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: '#475569', marginBottom: '0.85rem', fontWeight: 500, margin: '0 auto 0.85rem auto', maxWidth: '260px' }}>
                Triggered by negative sentiment <strong style={{ color: '#dc2626' }}>({overallScoreValue}%)</strong> & keyword density ('manager', 'complaint')
              </p>
              <button onClick={() => setShowEscalateModal(true)} className="btn-escalate">
                <ShieldWarning size={16} weight="bold" />
                <span>Review & Escalate Call</span>
              </button>
            </div>

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
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,87,34,0.2)', border: '1px solid rgba(255,87,34,0.4)', color: '#ff5722', display: 'flex', alignItems: 'center', justifyCenter: 'center' }}>
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
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#0f172a', color: 'white', display: 'flex', alignItems: 'center', justifyCenter: 'center' }}>
                    <User size={16} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      Marcus Bell <span style={{ color: '#94a3b8', fontWeight: 400 }}>#47849</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      Agent: {selectedAgent.split(" ")[0]} • Call Duration: {formatTimer(timerSeconds)}
                    </div>
                  </div>
                </div>
                <span className="badge-pill badge-pill-neg" style={{ fontSize: '0.7rem' }}>
                  Score: {overallScoreValue}%
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
                  placeholder="Customer requesting manager regarding refund & formal complaint..."
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
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981', display: 'flex', alignItems: 'center', justifyCenter: 'center' }}>
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