"use client";

import { useState, useEffect } from "react";
import { Sliders, Users, TextAa, Trash, FloppyDisk, Plus } from "@phosphor-icons/react";

// ⚠️ PASTE YOUR GOOGLE APPS SCRIPT URL HERE
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwudCW1hW9TbEV3btIXJl9rYi3GYU2E1jQ55mAXj9LAniuG8i0SLPMmrRrgWgsdHAQWA/exec";

interface KeywordData {
  keyword: string;
  sentiment: string;
  weight: number;
}

export default function AdminDashboard() {
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [newSentiment, setNewSentiment] = useState("negative");
  const [newWeight, setNewWeight] = useState(50);

  useEffect(() => {
    fetch(APPS_SCRIPT_URL)
      .then((res) => res.json())
      .then((data) => setKeywords(data))
      .catch((err) => console.error("Failed to load keywords", err));
  }, []);

  const handleAddKeyword = () => {
    if (!newWord) return;
    setKeywords([...keywords, { keyword: newWord, sentiment: newSentiment, weight: newWeight }]);
    setNewWord("");
  };

  const handleRemove = (index: number) => {
    const updated = [...keywords];
    updated.splice(index, 1);
    setKeywords(updated);
  };

  const handleWeightChange = (index: number, val: number) => {
    const updated = [...keywords];
    updated[index].weight = val;
    setKeywords(updated);
  };

  const saveConfiguration = async () => {
    setIsSaving(true);
    try {
      const payload = encodeURIComponent(JSON.stringify(keywords));
      await fetch(`${APPS_SCRIPT_URL}?action=save&data=${payload}`);
      alert("Configuration saved directly to Google Sheets!");
    } catch (error) {
      alert("Failed to save.");
    }
    setIsSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <header className="bg-white border-b border-slate-200 px-8 py-4 shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
              <Sliders size={24} weight="bold" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Supervisor Configuration Dashboard</h1>
              <p className="text-slate-500 text-xs mt-0.5">Manage semantic weights and protocols.</p>
            </div>
          </div>
        </div>
      </header>

      <main className="p-8 max-w-6xl mx-auto flex flex-col gap-8 pb-20">
        <section className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-bold flex items-center gap-2"><TextAa size={20} /> Keyword Analysis Weights</h2>
          </div>

          <div className="p-6">
            {/* Add New Keyword Panel */}
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6 flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block">New Keyword</label>
                <input type="text" value={newWord} onChange={(e) => setNewWord(e.target.value)} className="w-full border p-2 rounded-lg text-sm" placeholder="e.g. refund" />
              </div>
              <div className="w-32">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block">Sentiment</label>
                <select value={newSentiment} onChange={(e) => setNewSentiment(e.target.value)} className="w-full border p-2 rounded-lg text-sm">
                  <option value="negative">Negative</option>
                  <option value="positive">Positive</option>
                </select>
              </div>
              <div className="w-32">
                <label className="text-[10px] font-bold uppercase tracking-wider mb-1 block">Weight: {newWeight}</label>
                <input type="range" min="0" max="100" value={newWeight} onChange={(e) => setNewWeight(parseInt(e.target.value))} className="w-full accent-orange-500" />
              </div>
              <button onClick={handleAddKeyword} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 text-sm hover:bg-orange-600">
                <Plus weight="bold" /> Add
              </button>
            </div>

            {/* Keyword Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {keywords.map((kw, idx) => (
                <div key={idx} className="border rounded-xl p-4 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${kw.sentiment === 'negative' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'} border`}>
                      {kw.keyword}
                    </span>
                    <button onClick={() => handleRemove(idx)} className="text-slate-400 hover:text-red-500"><Trash size={16} /></button>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 mb-2">
                    <span>Impact Weight</span>
                    <span className="font-bold">{kw.weight}</span>
                  </div>
                  <input type="range" min="0" max="100" value={kw.weight} onChange={(e) => handleWeightChange(idx, parseInt(e.target.value))} className="w-full accent-orange-500" />
                </div>
              ))}
            </div>
          </div>
          
          <div className="px-6 py-4 border-t bg-slate-50 flex justify-end">
            <button onClick={saveConfiguration} disabled={isSaving} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800">
              <FloppyDisk weight="bold" /> {isSaving ? "Saving..." : "Sync to Google Sheets"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}