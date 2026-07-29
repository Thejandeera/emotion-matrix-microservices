"use client";

import { useState, ChangeEvent, FormEvent } from "react";
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
  PaperPlaneRight,
  Paragraph
} from "@phosphor-icons/react";

interface DetectedIssue {
  phrase: string;
  phrases?: string[];
  isolated_sentence: string;
  keyword_sentiment?: string;
  keyword_weight?: number;
  emotion: string;
  sentiment_category: string;
  confidence: number;
}

export default function LiveMonitor() {
  // Text Input & Gateway Processing State
  const [inputText, setInputText] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  // Send Text payload to Gateway (Direct to Phrase & Sentiment Microservices)
  const processTextPayload = async (textToProcess: string) => {
    if (!textToProcess || !textToProcess.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/v1/process-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToProcess.trim() }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setTranscript(data.transcript);
        setIssues(data.detected_issues || []);
        setProcessingTimeMs(data.processing_time_ms || 0);
      } else {
        setError(data.detail || "Error processing text input");
      }
    } catch (err) {
      setError("Failed to connect to API Gateway at http://localhost:8000");
    } finally {
      setIsLoading(false);
    }
  };

  // Audio File Upload Handler (Optional)
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setTranscript("");
    setIssues([]);
    setProcessingTimeMs(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      const b64 = result.split(",")[1];
      processAudioPayload(b64);
    };
    reader.readAsDataURL(selectedFile);
  };

  // Send Base64 Audio payload to Gateway (Whisper -> Phrase -> Sentiment)
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

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    processTextPayload(inputText);
  };

  const applyPreset = (presetText: string) => {
    setInputText(presetText);
    processTextPayload(presetText);
  };

  // Toast Helper
  const triggerToast = (title: string, body: string) => {
    setToastMessage({ title, body });
    setTimeout(() => setToastMessage(null), 4000);
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

  // Position on gauge track (5% to 95%)
  const pointerLeftPercent = Math.min(95, Math.max(5, ((realOverallScore + 100) / 200) * 100));

  // Extract Real Unique Matched Keywords (exclude "N/A")
  const realKeywordMap = new Map<string, { count: number; sentiment: string }>();
  issues.forEach((item) => {
    const rawPhrases = item.phrases && item.phrases.length > 0
      ? item.phrases
      : (item.phrase && item.phrase !== "N/A" ? item.phrase.split(",").map(s => s.trim()) : []);

    rawPhrases.forEach((p) => {
      if (p && p !== "N/A") {
        const kw = p.toLowerCase();
        const itemSent = item.keyword_sentiment || item.sentiment_category;
        const existing = realKeywordMap.get(kw);
        if (existing) {
          existing.count += 1;
        } else {
          realKeywordMap.set(kw, { count: 1, sentiment: itemSent });
        }
      }
    });
  });

  const realKeywords = Array.from(realKeywordMap.entries()).map(([kw, data]) => ({
    keyword: kw,
    count: data.count,
    sentiment: data.sentiment,
  }));

  // Keyword highlighting helper function
  const renderSentenceWithHighlight = (
    sentence: string,
    phrase: string,
    phrases?: string[],
    itemKeywordSentiment?: string,
    itemSentenceSentiment?: string
  ) => {
    const targetPhrases = phrases && phrases.length > 0
      ? phrases.filter(p => p && p !== "N/A")
      : (phrase && phrase !== "N/A" ? phrase.split(",").map(s => s.trim()).filter(Boolean) : []);

    if (targetPhrases.length === 0) {
      return <span>{sentence}</span>;
    }

    const sortedPhrases = [...targetPhrases].sort((a, b) => b.length - a.length);
    const pattern = sortedPhrases.map(p => p.replace(/[-[\]{}()*+?.:\\^$|#\s]/g, '\\$&')).join('|');
    if (!pattern) return <span>{sentence}</span>;

    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = sentence.split(regex);

    const wordSentiment = itemKeywordSentiment || itemSentenceSentiment || "neutral";
    const highlightClass =
      wordSentiment === "negative"
        ? "kw-highlight-red"
        : wordSentiment === "positive"
        ? "kw-highlight-green"
        : "kw-highlight-grey";

    return (
      <span>
        {parts.map((part, idx) => {
          const isMatch = sortedPhrases.some(p => p.toLowerCase() === part.toLowerCase());
          return isMatch ? (
            <span key={idx} className={highlightClass}>
              {part}
            </span>
          ) : (
            <span key={idx}>{part}</span>
          );
        })}
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
      {/* STICKY TOP HEADER */}
      <header className="live-header">
        <div className="live-header-left">
          <div className="live-title-group">
            <div className="live-logo-icon">
              <Broadcast size={20} className="animate-pulse" weight="bold" />
            </div>
            <h1 className="live-title">Live Text & Phrase Sentiment Analysis</h1>
          </div>
        </div>

        <div className="live-header-right">
          {/* Optional Audio File Upload Controls */}
          <label className="btn-upload" title="Upload Audio File for Speech-to-Text">
            <UploadSimple size={16} style={{ color: '#ff5722' }} />
            <span>Upload Audio</span>
            <input type="file" accept="audio/*" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="live-main-container">
        {/* ================= LEFT COLUMN: TEXT INPUT, TRANSCRIPT & SEARCH ================= */}
        <div className="left-column-panel" style={{ width: `${leftColWidth}%` }}>
          
          {/* DIRECT TEXT INPUT FORM */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                  <Paragraph size={18} style={{ color: '#ff5722' }} />
                  <span>Analyze Text Input (Direct API Gateway Route)</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                  Gateway &rarr; Phrase Service (8002) &rarr; Sentiment Service (8003)
                </div>
              </div>

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type or paste transcript / text here... (e.g. 'The customer expressed terrible service and requested a refund immediately. Overall experience was unacceptable.')"
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  padding: '0.75rem',
                  fontSize: '0.82rem',
                  fontFamily: 'inherit',
                  color: '#0f172a',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                {/* Sample Presets */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyPreset("The customer expressed terrible service and requested a refund immediately. Overall experience was unacceptable.")}
                    style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}
                  >
                    🚨 Complaint
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("Thank you so much for your fast delivery and great support! I really appreciate the help.")}
                    style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', color: '#047857', cursor: 'pointer' }}
                  >
                    ✨ Positive
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("The product quality is excellent and works great, but the delivery delay was terrible.")}
                    style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#334155', cursor: 'pointer' }}
                  >
                    ⚖️ Mixed
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !inputText.trim()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    backgroundColor: isLoading || !inputText.trim() ? '#94a3b8' : '#ff5722',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    padding: '0.45rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: isLoading || !inputText.trim() ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.15s'
                  }}
                >
                  {isLoading ? (
                    <>
                      <Spinner size={16} className="animate-spin" /> Processing...
                    </>
                  ) : (
                    <>
                      <PaperPlaneRight size={16} weight="bold" /> Analyze Text
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Search Bar */}
          <div className="transcript-search-header">
            <div className="transcript-search-input-wrap">
              <MagnifyingGlass size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Analyzed Sentences..."
                className="transcript-search-input"
              />
            </div>
            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 700, color: '#ff5722' }}>
                <Spinner size={16} className="animate-spin" /> Running Pipeline...
              </div>
            )}
          </div>

          {/* Transcript / Text Sentence Feed */}
          <div className="transcript-feed-area">
            {error && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '0.85rem', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* SKELETON LOADERS DURING PROCESSING */}
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', width: '100%' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} className="skeleton-pulse"></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '70%' }}>
                    <div style={{ width: '140px', height: '14px' }} className="skeleton-pulse"></div>
                    <div style={{ width: '100%', height: '48px', borderRadius: '12px' }} className="skeleton-pulse"></div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', width: '100%', justifyContent: 'flex-start' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0 }} className="skeleton-pulse"></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '85%' }}>
                    <div style={{ width: '160px', height: '14px' }} className="skeleton-pulse"></div>
                    <div style={{ width: '100%', height: '56px', borderRadius: '12px' }} className="skeleton-pulse"></div>
                  </div>
                </div>
              </div>
            )}

            {/* EMPTY STATE */}
            {!transcript && !isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8', margin: 'auto' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', color: '#cbd5e1' }}>
                  <Paragraph size={28} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>Ready for Text Input</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '340px', lineHeight: 1.5, margin: 0 }}>
                  Enter text or click a sample preset above to perform real-time phrase extraction and emotion analysis.
                </p>
              </div>
            )}

            {/* REAL TEXT SENTENCE FEED WITH DYNAMIC HIGHLIGHTS & CONFIDENCE SCORE */}
            {!isLoading && issues.length > 0 ? (
              filteredIssues.map((item, idx) => {
                const badgeClass =
                  item.sentiment_category === "negative"
                    ? "badge-pill-neg"
                    : item.sentiment_category === "positive"
                    ? "badge-pill-pos"
                    : "badge-pill-neu";

                const confidenceDisplay = (item.confidence * 100).toFixed(0);

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
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>Sentence Segment #{idx + 1}</span>
                        <span className={`badge-pill ${badgeClass}`}>
                          {item.sentiment_category.toUpperCase()} - {confidenceDisplay}%
                        </span>
                      </div>
                      <div className="chat-bubble bubble-caller">
                        {renderSentenceWithHighlight(
                          item.isolated_sentence,
                          item.phrase,
                          item.phrases,
                          item.keyword_sentiment,
                          item.sentiment_category
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : !isLoading && transcript ? (
              <div className="chat-msg-row chat-msg-caller">
                <div className="chat-avatar avatar-caller">
                  <User size={16} />
                </div>
                <div className="chat-content-wrap">
                  <div className="chat-msg-header-meta">
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>Input Text</span>
                    <span className="badge-pill badge-pill-neu">NEUTRAL</span>
                  </div>
                  <div className="chat-bubble bubble-caller">
                    {transcript}
                  </div>
                </div>
              </div>
            ) : null}

            {/* AI Summary Section */}
            {!isLoading && transcript && (
              <div style={{ marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', width: '100%' }}>
                <button onClick={() => setShowSummary(!showSummary)} className="summary-trigger-btn">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: 'rgba(255,87,34,0.2)', border: '1px solid rgba(255,87,34,0.4)', color: '#ff5722', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkle size={14} weight="bold" />
                    </div>
                    <span style={{ fontWeight: 700 }}>Get Live Text Summary</span>
                  </div>
                </button>

                {/* Expandable Summary Card */}
                {showSummary && (
                  <div className="summary-card-body">
                    {isRefreshingSummary ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', gap: '0.5rem', color: '#64748b' }}>
                        <Spinner size={20} className="animate-spin" style={{ color: '#ff5722' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Analyzing text transcript...</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#fff7ed', color: '#c2410c', fontWeight: 700, fontSize: '0.62rem', textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #ffedd5' }}>
                              AI Live Summary
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
                                ? `Analyzed ${issues.length} text segments. Key phrase isolated: "${issues[0].phrase !== 'N/A' ? issues[0].phrase : issues[0].isolated_sentence.slice(0, 45) + '...'}"`
                                : "Text processed cleanly without critical support keyphrases."}
                            </p>
                          </div>

                          <div className="summary-item-box">
                            <div className="summary-item-title">
                              <WarningOctagon size={16} style={{ color: negativeItems.length > 0 ? '#ef4444' : '#10b981' }} /> Sentiment Analysis
                            </div>
                            <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>
                              Overall sentiment score: <strong style={{ color: negativeItems.length > 0 ? '#dc2626' : '#059669' }}>({realOverallScore}%)</strong>. Total negative segments: {negativeItems.length}, positive: {positiveItems.length}.
                            </p>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`AI Live Call Summary: ${transcript.slice(0, 150)}...`);
                              triggerToast("Summary Copied", "Text summary copied to clipboard!");
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
                  ? `Calculated from ${issues.length} analyzed text sentence segments`
                  : "Waiting for text input to calculate score"}
              </p>
            </div>

            {/* 2. Keyword Alertness Card (REAL DETECTED KEYWORDS) */}
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
                          const idx = issues.findIndex((iss) => {
                            const pList = iss.phrases && iss.phrases.length > 0
                              ? iss.phrases
                              : (iss.phrase ? iss.phrase.split(",").map(s => s.trim()) : []);
                            return pList.some(p => p.toLowerCase() === item.keyword.toLowerCase());
                          });
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
                    {transcript ? "No target keyphrases detected in text." : "Waiting for text..."}
                  </span>
                )}
              </div>
            </div>

            {/* 3. PIPELINE EXECUTION TIME CARD (DIRECT TEXT PIPELINE) */}
            <div className="scalable-card" style={{ backgroundColor: '#ffffff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Timer size={16} style={{ color: '#ff5722' }} />
                  <h2 className="card-title-sm" style={{ margin: 0 }}>Pipeline Execution Time</h2>
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

                  {/* Microservices Breakdown badges */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Whisper STT</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginTop: '0.1rem' }}>0% (Bypassed)</div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Phrase</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginTop: '0.1rem' }}>~25%</div>
                    </div>
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Sentiment</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#334155', marginTop: '0.1rem' }}>~75%</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.72rem', fontStyle: 'italic' }}>
                  <Cpu size={16} /> Awaiting direct text pipeline stats...
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