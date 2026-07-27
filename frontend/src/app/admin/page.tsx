"use client";

import { useState, useEffect } from "react";
import "./admin.css";
import {
  Sliders,
  User,
  Users,
  PlusCircle,
  MagnifyingGlass,
  PencilSimple,
  Trash,
  TextAa,
  Plus,
  BellRinging,
  Desktop,
  Browser,
  EnvelopeSimple,
  FloppyDisk,
  UserPlus,
  Tag,
  X
} from "@phosphor-icons/react";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwwudCW1hW9TbEV3btIXJl9rYi3GYU2E1jQ55mAXj9LAniuG8i0SLPMmrRrgWgsdHAQWA/exec";

interface TeamMember {
  id: string;
  name: string;
  extension: string;
  supervisor: string;
}

interface KeywordData {
  keyword: string;
  sentiment: string;
  weight: number;
}

export default function AdminDashboard() {
  // 1. Team Directory State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { id: "1", name: "David Miller", extension: "x1042", supervisor: "Sarah Jenkins" },
    { id: "2", name: "Elena Rodriguez", extension: "x1045", supervisor: "Sarah Jenkins" },
    { id: "3", name: "Marcus Johnson", extension: "x1051", supervisor: "Sarah Jenkins" },
  ]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentExt, setNewAgentExt] = useState("");

  // 2. Keyword Analysis Weights State
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeywordModal, setShowKeywordModal] = useState(false);
  const [newKwWord, setNewKwWord] = useState("");
  const [newKwSentiment, setNewKwSentiment] = useState("negative");
  const [newKwWeight, setNewKwWeight] = useState(50);

  // 3. Alert Protocol State
  const [alertThreshold, setAlertThreshold] = useState(-45);
  const [notifyDashboard, setNotifyDashboard] = useState(true);
  const [notifyPush, setNotifyPush] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Load initial keywords from Google Apps Script
  useEffect(() => {
    fetch(APPS_SCRIPT_URL)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setKeywords(data);
        } else {
          setKeywords([
            { keyword: "refund", sentiment: "negative", weight: 85 },
            { keyword: "manager", sentiment: "negative", weight: 70 },
            { keyword: "complaint", sentiment: "negative", weight: 90 },
            { keyword: "excellent", sentiment: "positive", weight: 60 },
          ]);
        }
      })
      .catch((err) => {
        console.error("Failed to load keywords, using defaults:", err);
        setKeywords([
          { keyword: "refund", sentiment: "negative", weight: 85 },
          { keyword: "manager", sentiment: "negative", weight: 70 },
          { keyword: "complaint", sentiment: "negative", weight: 90 },
          { keyword: "excellent", sentiment: "positive", weight: 60 },
        ]);
      });
  }, []);

  // Team Member Actions
  const handleAddMember = () => {
    if (!newAgentName.trim()) return;
    const newMember: TeamMember = {
      id: Date.now().toString(),
      name: newAgentName.trim(),
      extension: newAgentExt.trim() || `x${Math.floor(1000 + Math.random() * 9000)}`,
      supervisor: "Sarah Jenkins",
    };
    setTeamMembers([...teamMembers, newMember]);
    setNewAgentName("");
    setNewAgentExt("");
    setShowUserModal(false);
  };

  const handleDeleteMember = (id: string) => {
    setTeamMembers(teamMembers.filter((m) => m.id !== id));
  };

  const filteredMembers = teamMembers.filter(
    (m) =>
      m.name.toLowerCase().includes(memberSearch.toLowerCase()) ||
      m.extension.toLowerCase().includes(memberSearch.toLowerCase())
  );

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

  // Helper for alert threshold text & badge color
  const getAlertVisuals = (val: number) => {
    if (val < -60) return { text: "Severe Negative", colorClass: "#b91c1c" };
    if (val < -20) return { text: "Moderate Negative", colorClass: "#ef4444" };
    if (val <= 20) return { text: "Neutral Zone", colorClass: "#64748b" };
    if (val <= 60) return { text: "Moderate Positive", colorClass: "#10b981" };
    return { text: "Highly Positive", colorClass: "#047857" };
  };

  const alertVisuals = getAlertVisuals(alertThreshold);

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
                Manage team members, analyze weights, and set alert protocols.
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

        {/* 1. TEAM DIRECTORY SECTION */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              <Users size={20} style={{ color: '#64748b' }} /> Team Directory
            </h2>
            <button onClick={() => setShowUserModal(true)} className="btn-primary">
              <PlusCircle size={18} weight="bold" /> Add Team Member
            </button>
          </div>

          <div className="admin-section-body">
            {/* Search */}
            <div className="search-wrapper">
              <MagnifyingGlass size={16} className="search-icon" />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search team members by name or extension..."
                className="search-input"
              />
            </div>

            {/* Table */}
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Agent Name</th>
                    <th>Extension</th>
                    <th>Supervisor</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => {
                    const initials = member.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase();
                    return (
                      <tr key={member.id}>
                        <td>
                          <div className="agent-name-cell">
                            <div className="agent-avatar-circle">{initials}</div>
                            {member.name}
                          </div>
                        </td>
                        <td className="font-mono">{member.extension}</td>
                        <td>{member.supervisor}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="action-icon-btn edit">
                            <PencilSimple size={16} />
                          </button>
                          <button onClick={() => handleDeleteMember(member.id)} className="action-icon-btn delete">
                            <Trash size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                        No team members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 2. KEYWORD ANALYSIS WEIGHTS SECTION */}
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
                      <button className="action-icon-btn edit">
                        <PencilSimple size={14} />
                      </button>
                      <button onClick={() => handleRemoveKeyword(idx)} className="action-icon-btn delete">
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

        {/* 3. ALERT PROTOCOL SETTINGS SECTION */}
        <section className="admin-section">
          <div className="admin-section-header">
            <h2 className="admin-section-title">
              <BellRinging size={20} style={{ color: '#64748b' }} /> Alert Protocol Settings
            </h2>
          </div>

          <div className="admin-section-body">
            <div className="alert-grid">
              {/* Left: Alert Threshold */}
              <div>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#0f172a', marginBottom: '0.35rem' }}>
                  Sentiment Alert Threshold
                </h3>
                <p style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '1.5rem', fontWeight: 500 }}>
                  Select the sentiment score level that should trigger a supervisor alert. Scores falling below this threshold (into the red) will initiate the notification protocol.
                </p>

                <div className="alert-threshold-box">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <div>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', display: 'block', marginBottom: '0.25rem' }}>
                        Trigger Level
                      </span>
                      <span className="alert-value-display" style={{ color: alertVisuals.colorClass }}>
                        {alertThreshold > 0 ? `+${alertThreshold}%` : `${alertThreshold}%`}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>
                      <span style={{ padding: '0.25rem 0.6rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        {alertVisuals.text}
                      </span>
                    </div>
                  </div>

                  <div style={{ position: 'relative', paddingTop: '0.5rem', paddingBottom: '1.5rem' }}>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(parseInt(e.target.value))}
                      className="accent-range"
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginTop: '0.5rem' }}>
                      <span>-100% (High Neg)</span>
                      <span>0% (Neutral)</span>
                      <span>+100% (High Pos)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Notification Methods */}
              <div>
                <h3 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#0f172a', marginBottom: '0.35rem' }}>
                  Notification Methods
                </h3>
                <p style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '1.5rem', fontWeight: 500 }}>
                  How would you like to be notified when a live call breaches the established sentiment threshold?
                </p>

                <label className="notification-option">
                  <input
                    type="checkbox"
                    checked={notifyDashboard}
                    onChange={(e) => setNotifyDashboard(e.target.checked)}
                    style={{ marginTop: '0.2rem', accentColor: '#ff5722' }}
                  />
                  <div>
                    <div className="option-title">
                      <Desktop size={18} style={{ color: '#ff5722' }} /> In-App Dashboard Alert
                    </div>
                    <p className="option-desc">Displays a prominent notification card within the live monitor interface.</p>
                  </div>
                </label>

                <label className="notification-option">
                  <input
                    type="checkbox"
                    checked={notifyPush}
                    onChange={(e) => setNotifyPush(e.target.checked)}
                    style={{ marginTop: '0.2rem', accentColor: '#ff5722' }}
                  />
                  <div>
                    <div className="option-title">
                      <Browser size={18} style={{ color: '#ff5722' }} /> Browser Push Notification
                    </div>
                    <p className="option-desc">Sends a native OS notification even if the dashboard is in the background.</p>
                  </div>
                </label>

                <label className="notification-option">
                  <input
                    type="checkbox"
                    checked={notifyEmail}
                    onChange={(e) => setNotifyEmail(e.target.checked)}
                    style={{ marginTop: '0.2rem', accentColor: '#ff5722' }}
                  />
                  <div>
                    <div className="option-title">
                      <EnvelopeSimple size={18} style={{ color: '#94a3b8' }} /> Email Notification
                    </div>
                    <p className="option-desc">Sends an alert to s.jenkins@company.com with call details.</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setSaveSuccessMessage("Alert settings saved successfully!");
                setTimeout(() => setSaveSuccessMessage(null), 3000);
              }}
              className="btn-primary"
            >
              <FloppyDisk size={16} weight="bold" /> Save Configuration
            </button>
          </div>
        </section>
      </main>

      {/* Add User Modal */}
      {showUserModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UserPlus size={18} style={{ color: '#ff5722' }} /> Add Team Member
              </h3>
              <button onClick={() => setShowUserModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Agent Name</label>
                <input
                  type="text"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Extension Number</label>
                <input
                  type="text"
                  value={newAgentExt}
                  onChange={(e) => setNewAgentExt(e.target.value)}
                  placeholder="e.g. x1055"
                  className="form-control font-mono"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowUserModal(false)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleAddMember} className="btn-primary">
                Add Member
              </button>
            </div>
          </div>
        </div>
      )}

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