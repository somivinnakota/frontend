import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';

// A small eye icon beside a metric's name. Hovering over it (or tabbing to it) shows what the
// metric means and why it matters for INFANT. The wording comes from the central engagement
// glossary on the backend (glossary/engagement_glossary.json), so it only needs updating there.

let glossaryRequest = null;
function loadGlossary() {
  if (!glossaryRequest) {
    glossaryRequest = axios.get(`${API_BASE}/api/glossary`)
      .then(r => Object.fromEntries((r.data.metrics || []).map(m => [m.id, m])))
      .catch(() => { glossaryRequest = null; return {}; });
  }
  return glossaryRequest;
}

// Which glossary entry describes a metric shown under a given name (used where names come from
// uploaded files, e.g. LinkedIn). Returns null when the glossary has no matching entry.
export function glossaryIdForLabel(label) {
  const text = String(label || '');
  if (/unique visitors/i.test(text)) return null;
  if (/engagement rate/i.test(text)) return 'engagement_rate';
  if (/unique impressions|reach|viewers/i.test(text)) return 'reach';
  if (/impressions/i.test(text)) return 'impressions';
  if (/page views|visits/i.test(text)) return 'profile_visits';
  if (/views/i.test(text)) return 'views';
  if (/interactions|reactions|comments|reposts/i.test(text)) return 'interactions';
  if (/new followers/i.test(text)) return 'follower_growth';
  if (/clicks/i.test(text)) return 'link_clicks';
  return null;
}

const WIDTH = 260;

function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function MetricInfo({ id }) {
  const [entry, setEntry] = useState(null);
  const [position, setPosition] = useState(null);
  const iconRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (id) loadGlossary().then(map => { if (active) setEntry(map[id] || null); });
    return () => { active = false; };
  }, [id]);

  if (!entry) return null;

  const show = () => {
    const box = iconRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(box.left - 12, window.innerWidth - WIDTH - 8));
    const below = box.bottom + 8;
    setPosition(below + 160 > window.innerHeight ? { left, bottom: window.innerHeight - box.top + 8 } : { left, top: below });
  };
  const hide = () => setPosition(null);

  return (
    <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 6 }}>
      <span ref={iconRef} role="button" tabIndex={0} aria-label={`What ${entry.term} means`}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        style={{ display: 'inline-flex', color: 'var(--muted-foreground)', cursor: 'help', opacity: 0.75 }}>
        <EyeIcon />
      </span>
      {position && (
        <span role="tooltip" style={{
          position: 'fixed', ...position, width: WIDTH, zIndex: 1000,
          background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(43, 22, 56, 0.16)', padding: '10px 12px',
          fontFamily: "'DM Sans', sans-serif", fontSize: 12, lineHeight: 1.5, fontWeight: 400,
          letterSpacing: 'normal', textTransform: 'none', textAlign: 'left', whiteSpace: 'normal', pointerEvents: 'none',
        }}>
          <span style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{entry.term}</span>
          <span style={{ display: 'block' }}>{entry.definition}</span>
          <span style={{ display: 'block', marginTop: 6, color: 'var(--muted-foreground)' }}>
            <strong style={{ fontWeight: 600 }}>Why it matters for INFANT:</strong> {entry.why_it_matters}
          </span>
        </span>
      )}
    </span>
  );
}