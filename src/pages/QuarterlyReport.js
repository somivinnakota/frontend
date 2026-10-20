import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import { downloadReportPdf } from '../utils/pdf';

const THIS_YEAR = new Date().getFullYear();
const YEARS = [THIS_YEAR - 1, THIS_YEAR];
const CURRENT_QUARTER = `Q${Math.floor(new Date().getMonth() / 3) + 1}`;

function pct(curr, prev) {
  if (!prev) return null;
  return ((curr - prev) / prev * 100).toFixed(1);
}

function CompareCard({ label, current, previous }) {
  const p = pct(current, previous);
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof current === 'number' ? current.toLocaleString() : current}</div>
      {p !== null
        ? (
          <div className={`kpi-delta ${parseFloat(p) >= 0 ? 'up' : 'down'}`}>
            {parseFloat(p) >= 0 ? '▲' : '▼'} {Math.abs(p)}% vs same quarter last year
          </div>
        )
        : <div className="kpi-delta neutral">No data for last year</div>}
      {previous > 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          Last year: {previous.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// A figure that arrives already formatted from the server, e.g. LinkedIn "8.7%" with change "-8.0%".
function FigureCard({ label, value, change, previous, versus }) {
  const down = change && change.startsWith('-');
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {change
        ? <div className={`kpi-delta ${down ? 'down' : 'up'}`}>{down ? '▼' : '▲'} {change.replace(/^[+-]/, '')} vs {versus}</div>
        : <div className="kpi-delta neutral">No data for {versus}</div>}
      {previous && change && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          {versus}: {previous}
        </div>
      )}
    </div>
  );
}

// An email rate (0.234 → 23.4%), compared in percentage points with the same quarter last year.
function RateCard({ label, current, previous, note }) {
  const show = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
  const diff = current !== null && current !== undefined && previous !== null && previous !== undefined ? (current - previous) * 100 : null;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{show(current)}</div>
      {diff !== null
        ? <div className={`kpi-delta ${diff >= 0 ? 'up' : 'down'}`}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)} pts vs same quarter last year</div>
        : <div className="kpi-delta neutral">No data for last year</div>}
      {diff !== null && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          Last year: {show(previous)}
        </div>
      )}
      {note && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function LiveCard({ label, value, note = 'Live' }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="kpi-delta neutral"><span className="status-dot live"></span>{note}</div>
    </div>
  );
}

export default function QuarterlyReport() {
  const [quarter, setQuarter] = useState(CURRENT_QUARTER);
  const [year, setYear] = useState(THIS_YEAR);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const r = await axios.get(`${API_BASE}/api/quarterly-report`, { params: { quarter, year } });
      setResult(r.data);
    } catch (e) {
      setError(errorMessage(e, 'Failed to generate report. Make sure the backend is running.'));
    }
    setLoading(false);
  };

  const copyReport = async () => {
    if (!result?.report) return;
    try {
      await navigator.clipboard.writeText(result.report);
    } catch {
      setError('Could not copy to the clipboard. Select the report text and copy it instead.');
    }
  };

  const downloadPDF = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      await downloadReportPdf({
        title: `${result.quarter} ${result.year} Quarterly Engagement Report`,
        subtitle: `Compared with ${result.quarter} ${result.prevYear}`,
        report: result.report,
      });
    } catch (e) {
      setError('The PDF could not be created. Make sure the backend is running.');
    }
    setDownloading(false);
  };

  const ig = result?.data.instagram;
  const fb = result?.data.facebook;
  const others = result?.data.others || [];
  const otherPlatforms = [...new Set(others.map(o => o.platform))];
  const mc = result?.data.mailchimp;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Reports</div>
          <div className="page-title">Quarterly report</div>
          <div className="page-sub">AI-written comparison with the same quarter last year, using real data</div>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Generate quarterly report</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>QUARTER</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
                <button key={q} onClick={() => setQuarter(q)} aria-pressed={quarter === q}
                  className={quarter === q ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 14px' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 5, fontWeight: 500 }}>YEAR</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {YEARS.map(y => (
                <button key={y} onClick={() => setYear(y)} aria-pressed={year === y}
                  className={year === y ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '6px 14px' }}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn-primary" onClick={generate} disabled={loading}
              style={{ padding: '10px 28px', fontSize: 13 }}>
              {loading ? 'Generating...' : `Generate ${quarter} ${year} report`}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
          Compares {quarter} {year} against {quarter} {year - 1} using Instagram, Facebook and Mailchimp data, and against the previous quarter for LinkedIn.
        </div>
      </div>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      {result && (
        <>
          {result.periodNote && (
            <div style={{ background: '#f0f5ff', border: '1px solid #dbeafe', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1e40af' }}>
              {result.periodNote}
            </div>
          )}

          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontWeight: 500 }}>
            INSTAGRAM — {result.quarter} {result.year} vs {result.quarter} {result.prevYear}
          </div>
          <div className="kpi-row" style={{ marginBottom: 10 }}>
            <CompareCard label="Reach" current={ig.current.reach} previous={ig.previous.reach} />
            <CompareCard label="Views" current={ig.current.views} previous={ig.previous.views} />
            <CompareCard label="Interactions" current={ig.current.interactions} previous={ig.previous.interactions} />
            <CompareCard label="Profile visits" current={ig.current.visits} previous={ig.previous.visits} />
          </div>
          <div className="kpi-row" style={{ marginBottom: 18 }}>
            <CompareCard label="New followers" current={ig.current.follows} previous={ig.previous.follows} />
            <CompareCard label="Peak daily reach" current={ig.current.peakReach} previous={ig.previous.peakReach} />
            <LiveCard label="Facebook followers" value={fb.live.followers} />
            <LiveCard label="FB engagement rate (7-day)" value={fb.live.engagementRate} note="Live · talking about ÷ followers" />
          </div>

          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontWeight: 500 }}>
            FACEBOOK — {result.quarter} {result.year} vs {result.quarter} {result.prevYear}
          </div>
          <div className="kpi-row" style={{ marginBottom: 18 }}>
            <CompareCard label="Page views" current={fb.current.views} previous={fb.previous.views} />
            <CompareCard label="Page visits" current={fb.current.visits} previous={fb.previous.visits} />
            <CompareCard label="Interactions" current={fb.current.interactions} previous={fb.previous.interactions} />
            <LiveCard label="Talking about" value={fb.live.talkingAbout} note="Live · last 7 days" />
          </div>

          {others.length > 0 && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontWeight: 500 }}>
                {otherPlatforms.join(' & ').toUpperCase()} — {result.quarter} {result.year} vs {result.data.othersComparedWith}
              </div>
              <div className="kpi-row" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
                {others.slice(0, 8).map(o => (
                  <FigureCard key={`${o.platform}-${o.label}`}
                    label={otherPlatforms.length > 1 ? o.label.replace(/\s*\(total\)$/i, '') : o.label.replace(new RegExp(`^${o.platform}\\s+`, 'i'), '').replace(/\s*\(total\)$/i, '')}
                    value={o.display} change={o.change} previous={o.previousDisplay} versus={result.data.othersComparedWith} />
                ))}
              </div>
            </>
          )}

          {mc?.connected && (
            <>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, fontWeight: 500 }}>
                EMAIL (MAILCHIMP) — {result.quarter} {result.year} vs {result.quarter} {result.prevYear}
              </div>
              <div className="kpi-row" style={{ marginBottom: 18 }}>
                <CompareCard label="Campaigns sent" current={mc.current.campaigns} previous={mc.previous.campaigns} />
                <CompareCard label="Emails delivered" current={mc.current.delivered} previous={mc.previous.delivered} />
                <RateCard label="Engagement rate" current={mc.current.engagementRate} previous={mc.previous.engagementRate} note="Subscribers who clicked ÷ emails delivered" />
                <RateCard label="Open rate" current={mc.current.openRate} previous={mc.previous.openRate} note="Can be inflated by Apple Mail privacy" />
              </div>
            </>
          )}

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div className="card-title">{result.quarter} {result.year} Quarterly Engagement Report</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>
                  AI-generated · {new Date().toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })} · INFANT Research Centre
                </div>
              </div>
              <div className="btn-row">
                <button className="btn-secondary" onClick={copyReport}>Copy</button>
                <button className="btn-primary" onClick={downloadPDF} disabled={downloading}>
                  {downloading ? 'Creating PDF...' : 'Download PDF'}
                </button>
              </div>
            </div>
            <div className="report-output">{result.report}</div>
          </div>
        </>
      )}
    </div>
  );
}