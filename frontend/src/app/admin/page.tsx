"use client";

import { useState, useEffect } from "react";
import "./admin.css";
import {
  Sliders,
  User,
  TextAa,
  Plus,
  FloppyDisk,
  Tag,
  X,
  PencilSimple,
  Trash
} from "@phosphor-icons/react";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwudCW1hW9TbEV3btIXJl9rYi3GYU2E1jQ55mAXj9LAniuG8i0SLPMmrRrgWgsdHAQWA/exec";

interface KeywordData {
  keyword: string;
  sentiment: string;
  weight: number;
}

export default function AdminDashboard() {
  // Keyword Analysis Weights State
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [newKwWord, setNewKwWord] = useState("");
  const [newKwSentiment, setNewKwSentiment] = useState("negative");
  const [newKwWeight, setNewKwWeight] = useState(50);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const defaultKeywords: KeywordData[] = [
    { keyword: "refund", sentiment: "negative", weight: 85 },
    { keyword: "manager", sentiment: "negative", weight: 70 },
    { keyword: "complaint", sentiment: "negative", weight: 90 },
    { keyword: "excellent", sentiment: "positive", weight: 60 },
  ];

  // Load initial keywords from Google Apps Script with safe error handling
  useEffect(() => {
    let isMounted = true;
    const loadKeywords = async () => {
      try {
        const res = await fetch(APPS_SCRIPT_URL, { method: "GET" });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data) && data.length > 0) {
            setKeywords(data);
            return;
          }
        }
      } catch (err) {
        console.warn("Could not fetch remote Google Sheets keywords, using defaults:", err);
      }
      if (isMounted) {
        setKeywords(defaultKeywords);
      }
    };
    loadKeywords();
    return () => {
      isMounted = false;
    };
  }, []);

  // Keyword Actions
  const handleAddKeyword = () => {
    if (!newKwWord.trim()) return;
    const kwObj: KeywordData = {
      keyword: newKwWord.trim().toLowerCase(),
      sentiment: newKwSentiment,
      weight: newKwWeight,
    };
    setKeywords([...keywords, kwObj]);
    setNewKwWord("");
    setNewKwWeight(50);
    setShowKeywordModal(false);
  };

  const handleRemoveKeyword = (index: number) => {
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
      setSaveSuccessMessage("Configuration successfully synced to Google Sheets!");
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (error) {
      alert("Failed to save to Google Sheets.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-container">
      {/* TOP HEADER */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <div className="admin-brand-icon">
              <Sliders size={22} weight="bold" />
            </div>
            <div>
              <h1 className="admin-title">Supervisor Configuration Dashboard</h1>
              <p className="admin-subtitle">
                Manage keyword analysis weights and impact scores.
              </p>
            </div>
          </div>
          <div className="admin-user-profile">
            <div className="admin-user-info">
              <div className="admin-user-name">Sarah Jenkins</div>
              <div className="admin-user-role">Supervisor • Team Alpha</div>
            </div>
            <div className="admin-avatar-badge">
              <User size={18} weight="bold" />
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="admin-main">
        {/* Toast / Success Notification */}
        {saveSuccessMessage && (
          <div style={{ backgroundColor: '#10b981', color: '#fff', padding: '0.85rem 1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 700 }}>
            <span>{saveSuccessMessage}</span>
            <button onClick={() => setSaveSuccessMessage(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* KEYWORD ANALYSIS WEIGHTS SECTION */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              <TextAa size={20} style={{ color: '#64748b' }} /> Keyword Analysis Weights
            </h2>
            <button onClick={() => setShowKeywordModal(true)} className="btn-secondary">
              <Plus size={16} style={{ color: '#ff5722' }} /> Add Keyword
            </button>
          </div>

          <div className="admin-section-body">
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1.5rem', fontWeight: 500 }}>
              Assign a weight (0-100) to specific words. A higher weight means the word will have a stronger impact on the overall automated sentiment calculation.
            </p>

            <div className="keywords-grid">
              {keywords.map((kw, idx) => (
                <div key={idx} className="keyword-card">
                  <div className="keyword-card-top">
                    <span className={`keyword-badge ${kw.sentiment === 'negative' ? 'badge-neg' : 'badge-pos'}`}>
                      {kw.keyword}
                    </span>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => handleRemoveKeyword(idx)} className="action-icon-btn delete" title="Delete Keyword">
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="keyword-weight-row">
                    <span>Impact Weight</span>
                    <span className="weight-val-badge">{kw.weight}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={kw.weight}
                    onChange={(e) => handleWeightChange(idx, parseInt(e.target.value))}
                    className="accent-range"
                  />
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={saveConfiguration} disabled={isSaving} className="btn-primary">
              <FloppyDisk size={16} weight="bold" /> {isSaving ? "Saving..." : "Sync to Google Sheets"}
            </button>
          </div>
        </section>
      </main>

      {/* Add Keyword Modal */}
      {showKeywordModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Tag size={18} style={{ color: '#ff5722' }} /> Add Monitored Keyword
              </h3>
              <button onClick={() => setShowKeywordModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Keyword or Phrase</label>
                <input
                  type="text"
                  value={newKwWord}
                  onChange={(e) => setNewKwWord(e.target.value)}
                  placeholder="e.g. cancel account"
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Sentiment Category</label>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="sentiment"
                      value="positive"
                      checked={newKwSentiment === "positive"}
                      onChange={() => setNewKwSentiment("positive")}
                      style={{ accentColor: '#10b981' }}
                    />
                    Positive (Green)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="sentiment"
                      value="negative"
                      checked={newKwSentiment === "negative"}
                      onChange={() => setNewKwSentiment("negative")}
                      style={{ accentColor: '#ef4444' }}
                    />
                    Negative (Red)
                  </label>
                </div>
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Initial Impact Weight</label>
                  <span className="weight-val-badge">{newKwWeight}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newKwWeight}
                  onChange={(e) => setNewKwWeight(parseInt(e.target.value))}
                  className="accent-range"
                  style={{ marginTop: '0.5rem' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowKeywordModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleAddKeyword} className="btn-primary">
                Add Keyword
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}