"use client";

import { useState, useRef, useCallback, ChangeEvent } from "react";
import "./model.css";

interface DetectedIssue {
  phrase: string;
  isolated_sentence: string;
  emotion: string;
  sentiment_category: string;
  confidence: number;
}

export default function EmotionMatrixPage() {
  const [base64String, setBase64String] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webSocketRef = useRef<WebSocket | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const resetState = useCallback(() => {
    setBase64String("");
    setTranscript("");
    setProcessingTime(null);
    setIssues([]);
    setError(null);
  }, []);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    resetState();

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const b64 = result.split(",")[1];
      setBase64String(b64);
    };
    reader.readAsDataURL(selectedFile);
  }, [resetState]);

  const roundToTwo = useCallback((num: number) => Math.round(num * 100) / 100, []);

  const startRecording = useCallback(async () => {
    try {
      resetState();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const ws = new WebSocket("ws://localhost:8000/api/v1/live-stream");
      webSocketRef.current = ws;
      startTimeRef.current = performance.now();

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
          if (data.type === "partial") {
            setTranscript(data.transcript);
            if (startTimeRef.current) {
              setProcessingTime(roundToTwo((performance.now() - startTimeRef.current) / 1000));
            }
          } else if (data.type === "analyzed") {
            setTranscript(data.transcript);
            if (data.detected_issues) {
              setIssues((prev) => {
                const existingKeys = new Set(prev.map((i) => `${i.phrase}-${i.isolated_sentence}`));
                const uniqueNew = data.detected_issues.filter(
                  (i: DetectedIssue) => !existingKeys.has(`${i.phrase}-${i.isolated_sentence}`)
                );
                return [...prev, ...uniqueNew];
              });
            }
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      ws.onerror = () => {
        setError("Realtime WebSocket connection failed.");
      };

      ws.onclose = () => {
        setIsRecording(false);
      };

    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  }, [resetState, roundToTwo]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (webSocketRef.current) {
      webSocketRef.current.close();
    }
    setIsRecording(false);
  }, [isRecording]);

  const handleSend = useCallback(async () => {
    if (!base64String) {
      setError("Please select a file or record audio first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("http://localhost:8000/api/v1/process-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_data: base64String }),
      });

      const data = await response.json();

      if (data.status === "success") {
        setTranscript(data.transcript);
        setProcessingTime(data.processing_time_ms / 1000);
        setIssues(data.detected_issues || []);
      } else {
        setError(data.detail || "An error occurred during processing.");
      }
    } catch (err) {
      setError("Failed to connect to the API Gateway.");
    } finally {
      setIsLoading(false);
    }
  }, [base64String]);

  return (
    <main className="rest-page">
      <div className="rest-container">
        <h1 className="rest-title">Emotion Matrix: Microservices UI</h1>

        <section className="rest-section">
          <h2 className="rest-section-title">1. Input Audio</h2>
          <div className="rest-input-group">
            <input type="file" accept="audio/*" onChange={handleFileChange} className="rest-file-input" />
            <span style={{ fontWeight: 600 }}>OR</span>
            <button 
              onClick={isRecording ? stopRecording : startRecording} 
              className="rest-button"
              style={isRecording ? { backgroundColor: "#ef4444", borderColor: "#ef4444", color: "#fff" } : {}}
            >
              {isRecording ? "🔴 Stop Mic (Live Streaming)" : "Start Mic"}
            </button>
          </div>
          
          <button onClick={handleSend} disabled={isLoading || !base64String || isRecording} className="rest-button">
            {isLoading ? "Processing through Gateway..." : "Analyze Audio File"}
          </button>
          {error && <p className="rest-error">{error}</p>}
        </section>

        <section className="rest-section">
          <h2 className="rest-section-title">
            2. Analysis Results {isRecording && <span style={{ color: "#ef4444", fontSize: "1rem", marginLeft: "1rem" }}>● REALTIME STREAMING ACTIVE</span>}
          </h2>
          
          <div className="rest-results-grid">
            <div className="rest-box">
              <h3>Pipeline Speed</h3>
              <p className="rest-stat">
                {processingTime !== null ? `${processingTime} seconds` : "--"}
              </p>
            </div>
            
            <div className="rest-box rest-transcript-box">
              <h3>Raw Transcript</h3>
              <p className="rest-transcript-text">
                {transcript || (isRecording ? "Listening & Transcribing live..." : "Waiting for audio...")}
              </p>
            </div>
          </div>

          <h3 style={{ marginTop: "1rem", fontSize: "1.25rem", fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid #000", paddingBottom: "0.5rem" }}>
            Detected Keyphrases & Emotions
          </h3>
          
          {issues.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {issues.map((issue, idx) => (
                <div key={idx} className="rest-box">
                  <p style={{ margin: "0 0 0.5rem 0" }}><strong>Phrase Match:</strong> "{issue.phrase}"</p>
                  <p style={{ margin: "0 0 1.25rem 0" }}><strong>Isolated Context:</strong> <i>"{issue.isolated_sentence}"</i></p>
                  
                  <div className="rest-sentiment-container">
                    <div className="rest-badge-group">
                      <span className={`rest-badge rest-badge-${issue.sentiment_category.toLowerCase()}`}>
                        {issue.sentiment_category}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rest-placeholder">
              {transcript ? "No critical support phrases detected yet." : "--"}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}