"use client";

import { useState, ChangeEvent } from "react";
import { Broadcast, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";

interface DetectedIssue {
  phrase: string;
  isolated_sentence: string;
  emotion: string;
  sentiment_category: string;
  confidence: number;
}

export default function LiveMonitor() {
  const [transcript, setTranscript] = useState<string>("");
  const [issues, setIssues] = useState<DetectedIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Simplified STT Upload matching your constraint: "keep as voice upload and single transcribe"
  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const b64 = (event.target?.result as string).split(",")[1];
      try {
        const res = await fetch("http://localhost:8000/api/v1/process-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio_data: b64 }),
        });
        const data = await res.json();
        setTranscript(data.transcript);
        setIssues(data.detected_issues || []);
      } catch (err) {
        alert("Gateway Connection Failed");
      }
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Compute total sentiment impact for UI
  const negativeHits = issues.filter(i => i.sentiment_category === "negative");
  const baseScore = 100;
  const calculatedScore = negativeHits.length > 0 ? (baseScore - (negativeHits.length * 45)) : baseScore;

  return (
    <div className="bg-slate-50 h-screen flex flex-col font-sans text-slate-800 overflow-hidden">
      <header className="bg-white border-b px-6 py-3.5 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
            <Broadcast weight="bold" />
          </div>
          <h1 className="text-xl font-bold">Live Call Sentiment</h1>
        </div>
        <input type="file" accept="audio/*" onChange={handleFileUpload} className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer" />
      </header>

      <main className="flex-1 flex overflow-hidden p-5 gap-4 max-w-[1600px] mx-auto w-full">
        {/* Left Column: Transcript */}
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 w-2/3 overflow-hidden">
          <div className="p-3.5 border-b bg-slate-50 relative">
             <MagnifyingGlass className="absolute left-6 top-6 text-slate-400" />
             <input type="text" placeholder="Search Transcript..." className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm" />
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {isLoading ? (
               <div className="flex items-center gap-2 text-orange-500 font-bold"><Sparkle className="animate-spin" /> Processing Audio Engine...</div>
            ) : (
               <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm leading-relaxed whitespace-pre-wrap">
                  {transcript || "Upload an audio file to begin analysis..."}
               </div>
            )}
          </div>
        </div>

        {/* Right Column: Dynamic Assessment */}
        <div className="w-1/3 flex flex-col gap-4 overflow-y-auto">
          {/* Sentiment Score Card */}
          <div className="bg-white p-5 rounded-xl border text-center shadow-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Algorithm Sentiment Score</h2>
            <div className={`text-5xl font-extrabold tracking-tight ${calculatedScore < 50 ? 'text-red-600' : 'text-emerald-500'}`}>
              {transcript ? `${calculatedScore}%` : '--'}
            </div>
          </div>

          {/* Keyword Alertness Card */}
          <div className="bg-white p-5 rounded-xl border shadow-sm">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Detected Keywords</h2>
            <div className="flex flex-col gap-2">
              {issues.length > 0 ? issues.map((issue, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${issue.sentiment_category === 'negative' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                  <div className="font-bold flex justify-between items-center text-sm mb-1">
                    <span className="capitalize">"{issue.phrase}"</span>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-white border">{issue.emotion} ({(issue.confidence * 100).toFixed(0)}%)</span>
                  </div>
                  <p className="text-xs italic text-slate-600">"{issue.isolated_sentence}"</p>
                </div>
              )) : (
                <p className="text-sm text-slate-500">No configured keywords detected.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}