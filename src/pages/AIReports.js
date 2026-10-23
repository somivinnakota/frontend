import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import { downloadReportPdf } from '../utils/pdf';
import { storageKeyFor, loadWorkbook } from '../components/SmartSheet';

const REPORT_TYPES = [
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'six-month', label: 'Six-month' },
  { id: 'annual', label: 'Annual' },
];

// Spreadsheets uploaded on other pages, sent so the server can include them.
const UPLOADS = { media: 'Press and media', kpis: 'KPI tracker', events_calendar: 'Calendar of events', conferences: 'Conference list' };

const SECTIONS = [
  ['social', 'Social media'], ['email', 'Email (Mailchimp)'], ['content', 'Content'], ['website', 'Website'], ['media', 'Media coverage'],
  ['publications', 'Publications'], ['events', 'Events'], ['conferences', 'Conferences'], ['kpis', 'KPIs'],
];

const SUGGESTED_QUESTIONS = [
  'Which platform performed best?',
  'What changed compared with the previous period?',
  'What are the biggest risks?',
  'What was our best-performing content?',
  'Give me a summary for senior management.',
];

const AVAILABILITY_WORDS = {
  available: 'Included', not_connected: 'Not connected', not_uploaded: 'Not uploaded', no_dataset: 'No data recorded',
  no_data_for_period: 'No data for this period', no_dates: 'No date column', headline_figure_only: 'Headline figure only', not_available: 'Not available',
};

const LEVEL_STYLE = {
  high: { background: 'hsl(142 60% 35% / .12)', color: 'hsl(142, 60%, 26%)' },
  medium: { background: 'hsl(43 81% 50% / .15)', color: 'hsl(32, 70%, 32%)' },
  low: { background: 'var(--secondary)', color: 'var(--muted-foreground)' },
};

const formatDate = iso => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

function collectUploads() {
  const uploads = {};
  for (const [key, title] of Object.entries(UPLOADS)) {
    const workbook = loadWorkbook(storageKeyFor(title));
    if (!workbook) continue;
    uploads[key] = {
      fileName: workbook.fileName,
      sheets: workbook.sheets.map(s => ({ name: s.name, headers: s.headers, rows: s.rows.slice(0, 3000) })),
    };
  }
  return uploads;
}

// Turns an evidence id into the figure or item it refers to, for hover text.
function evidenceLookup(pkg) {
  const map = {};
  if (!pkg) return map;
  pkg.facts.forEach(f => {
    const prev = f.vs?.previous_period;
    map[f.id] = `${f.label}: ${f.current.display}${prev ? ` (${prev.change_pct_display} vs ${pkg.report.comparisons[0].label})` : ''}`;
  });
  pkg.context.forEach(c => { map[c.id] = `${c.label}: ${c.display}`; });
  pkg.audience.forEach(a => { map[a.id] = `${a.platform} ${a.label}`; });
  Object.values(pkg.content).forEach(l => [...l.top, ...l.bottom].forEach(p => { map[p.id] = `${l.platform} post, ${p.date}: ${p.title}`; }));
  (pkg.publications?.in_period || []).forEach(p => { map[p.id] = `Publication, ${p.date}: ${p.title}`; });
  (pkg.events?.in_period || []).forEach(e => { map[e.id] = `Event, ${e.date}: ${e.name}`; });
  Object.values(pkg.uploads || {}).forEach(u => (u.in_period || []).forEach(r => { map[r.id] = `Uploaded entry, ${r.date}`; }));
  (pkg.email?.in_period || []).forEach(c => { map[c.id] = `Email campaign, ${c.date}: ${c.title}`; });
  return map;
}

// Plain-text version for Copy and PDF.
function reportToText(record) {
  const r = record.report;
  const lines = [];
  const findings = list => list.forEach(f => lines.push(`- ${f.statement}`));
  lines.push('EXECUTIVE SUMMARY', r.executive_summary.text, '');
  if (r.key_findings.length) { lines.push('KEY FINDINGS'); findings(r.key_findings); lines.push(''); }
  SECTIONS.forEach(([key, title]) => {
    const s = r.sections[key];
    if (!s) return;
    lines.push(title.toUpperCase(), s.summary);
    findings(s.findings);
    lines.push('');
  });
  [['TRENDS', r.trends], ['RELATIONSHIPS BETWEEN AREAS', r.cross_dataset], ['RISKS', r.risks], ['OPPORTUNITIES', r.opportunities], ['BEST PERFORMING', r.best_performing]]
    .forEach(([title, list]) => { if (list.length) { lines.push(title); findings(list); lines.push(''); } });
  if (r.recommendations.length) {
    lines.push('RECOMMENDATIONS');
    r.recommendations.forEach((rec, i) => lines.push(`${i + 1}. ${rec.recommendation} (${rec.priority} priority)`, `   Evidence: ${rec.reasoning}`, `   Expected benefit: ${rec.expected_benefit}`));
    lines.push('');
  }
  if (r.annual_summary) lines.push('ANNUAL SUMMARY', r.annual_summary, '');
  if (r.data_gaps.length) { lines.push('DATA NOT AVAILABLE'); r.data_gaps.forEach(g => lines.push(`- ${g}`)); }
  return lines.join('\n');
}

/* ── Small display pieces ────────────────────────────────────── */

function Chips({ ids, lookup }) {
  if (!ids?.length) return null;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, marginLeft: 6, verticalAlign: 'middle' }}>
      {ids.map(id => (
        <span key={id} title={lookup[id] || id} className="badge badge-gray" style={{ fontSize: 10, cursor: 'help' }}>
          {(lookup[id] || id).split(':')[0].slice(0, 28)}
        </span>
      ))}
    </span>
  );
}

function Finding({ item, lookup }) {
  return (
    <li style={{ marginBottom: 10, lineHeight: 1.65 }}>
      {item.statement}
      <span className="badge" style={{ ...LEVEL_STYLE[item.evidence_level], marginLeft: 8, fontSize: 10, textTransform: 'capitalize' }}>
        {item.evidence_level} · {item.type}
      </span>
      <Chips ids={item.evidence} lookup={lookup} />
    </li>
  );
}

function FindingList({ title, items, lookup }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>{title}</div>
      <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
        {items.map((f, i) => <Finding key={i} item={f} lookup={lookup} />)}
      </ul>
    </div>
  );
}

function ReportView({ record, onRegenerate, busy }) {
  const r = record.report;
  const pkg = record.package;
  const lookup = useMemo(() => evidenceLookup(pkg), [pkg]);
  const factById = useMemo(() => Object.fromEntries((pkg?.facts || []).map(f => [f.id, f])), [pkg]);
  const [notice, setNotice] = useState('');
  const title = `${record.period.label} ${REPORT_TYPES.find(t => t.id === record.type)?.label || ''} Executive Report`;
  const compared = record.comparisons.map(c => c.label).join(' and ');

  const copy = async () => {
    try { await navigator.clipboard.writeText(`${title}\n\n${reportToText(record)}`); setNotice('Copied.'); }
    catch { setNotice('Could not copy. Select the text and copy it instead.'); }
  };
  const pdf = async () => {
    try { await downloadReportPdf({ title, subtitle: `Compared with ${compared}`, report: reportToText(record), glossaryIds: record.glossary_ids }); }
    catch { setNotice('The PDF could not be created. Make sure the backend is running.'); }
  };

  return (
    <div className="card executive-report">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div className="page-eyebrow">Executive report</div>
          <div style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 26, fontWeight: 500 }}>{title}</div>
          <div className="card-sub" style={{ marginBottom: 0 }}>
            Compared with {compared} · Generated {formatDate(record.generated_at)} · {record.model} · data {record.data_snapshot}
          </div>
        </div>
        <div className="btn-row no-print" style={{ alignItems: 'flex-start' }}>
          <button className="btn-secondary" onClick={onRegenerate} disabled={busy}>Regenerate</button>
          <button className="btn-secondary" onClick={copy}>Copy</button>
          <button className="btn-secondary" onClick={pdf}>PDF</button>
          <button className="btn-secondary" onClick={() => window.print()}>Print</button>
        </div>
      </div>
      {notice && <div className="info-note no-print">{notice}</div>}

      {record.validation.ok
        ? <div className="badge badge-green" style={{ marginBottom: 18 }}>All checks passed: every figure and source matches the dashboard data</div>
        : (
          <div style={{ background: 'hsl(43 81% 50% / .12)', border: '1px solid hsl(43 81% 50% / .4)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12 }}>
            <strong>{record.validation.issues.length} item(s) flagged by the checks.</strong> Review these before sharing the report:
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {record.validation.issues.slice(0, 10).map((i, n) => <li key={n}>{i.problem} <span style={{ color: 'var(--muted-foreground)' }}>({i.path.replace('$.', '')})</span></li>)}
            </ul>
          </div>
        )}

      <div style={{ marginBottom: 22 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>Executive summary</div>
        <p style={{ fontSize: 14, lineHeight: 1.75, margin: 0 }}>{r.executive_summary.text}</p>
        <Chips ids={r.executive_summary.evidence} lookup={lookup} />
      </div>

      <FindingList title="Key findings" items={r.key_findings} lookup={lookup} />

      {r.kpi_analysis.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>KPI analysis</div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Measure</th><th>This period</th><th>{record.comparisons[0].label}</th><th>Change</th><th>Interpretation</th></tr>
              </thead>
              <tbody>
                {r.kpi_analysis.map(k => {
                  const f = factById[k.fact_id];
                  const prev = f?.vs?.previous_period;
                  return (
                    <tr key={k.fact_id}>
                      <td style={{ fontWeight: k.significance === 'major' ? 600 : 400 }}>{f?.label || k.fact_id}</td>
                      <td>{f?.current.display ?? '—'}</td>
                      <td>{prev?.display ?? '—'}</td>
                      <td style={{ color: prev?.direction === 'up' ? 'hsl(142, 60%, 32%)' : prev?.direction === 'down' ? 'var(--destructive)' : 'inherit' }}>
                        {prev ? prev.change_pct_display : 'No comparison'}
                      </td>
                      <td style={{ whiteSpace: 'normal', minWidth: 220 }}>{k.interpretation}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 6 }}>Figures are calculated by the dashboard; the AI only writes the interpretation.</div>
        </div>
      )}

      {SECTIONS.map(([key, label]) => {
        const s = r.sections[key];
        if (!s) return null;
        const off = s.status === 'not_available';
        return (
          <div key={key} style={{ marginBottom: 20, opacity: off ? 0.6 : 1 }}>
            <div className="card-title" style={{ marginBottom: 6 }}>{label}{off && <span className="badge badge-gray" style={{ marginLeft: 8 }}>Not available</span>}</div>
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>{s.summary}</p>
            {s.findings.length > 0 && <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>{s.findings.map((f, i) => <Finding key={i} item={f} lookup={lookup} />)}</ul>}
          </div>
        );
      })}

      <FindingList title="Trends" items={r.trends} lookup={lookup} />
      <FindingList title="Relationships between areas" items={r.cross_dataset} lookup={lookup} />
      <FindingList title="Best performing" items={r.best_performing} lookup={lookup} />
      <FindingList title="Risks" items={r.risks} lookup={lookup} />
      <FindingList title="Opportunities" items={r.opportunities} lookup={lookup} />

      {r.recommendations.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Recommendations</div>
          {r.recommendations.map((rec, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 8, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600 }}>
                {i + 1}. {rec.recommendation}
                <span className={`badge ${rec.priority === 'high' ? 'badge-orange' : 'badge-gray'}`} style={{ marginLeft: 8, textTransform: 'capitalize' }}>{rec.priority} priority</span>
              </div>
              <div><strong>Evidence:</strong> <Chips ids={rec.evidence} lookup={lookup} /></div>
              <div><strong>Reasoning:</strong> {rec.reasoning}</div>
              <div><strong>Expected benefit:</strong> {rec.expected_benefit}</div>
            </div>
          ))}
        </div>
      )}

      {r.annual_summary && (
        <div style={{ marginBottom: 22 }}>
          <div className="card-title" style={{ marginBottom: 8 }}>Annual summary</div>
          <p style={{ fontSize: 14, lineHeight: 1.8, margin: 0 }}>{r.annual_summary}</p>
        </div>
      )}

      {r.data_gaps.length > 0 && (
        <div className="info-note" style={{ marginBottom: 0 }}>
          <strong>Not covered by this report:</strong> {r.data_gaps.join(' ')}
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function AIReports() {
  const [periods, setPeriods] = useState(null);
  const [aiInfo, setAiInfo] = useState(null);
  const [type, setType] = useState('quarterly');
  const [periodKey, setPeriodKey] = useState('');
  const [readiness, setReadiness] = useState(null);
  const [record, setRecord] = useState(null);
  const [saved, setSaved] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);

  const loadSaved = () => axios.get(`${API_BASE}/api/executive/reports`).then(r => setSaved(r.data.reports)).catch(() => {});

  useEffect(() => {
    axios.get(`${API_BASE}/api/executive/periods`)
      .then(r => { setPeriods(r.data.periods); setAiInfo(r.data.ai); })
      .catch(e => setError(errorMessage(e, 'Could not load the reporting periods. Make sure the backend is running.')));
    loadSaved();
  }, []);

  // Default to the most recent complete period of the chosen type.
  useEffect(() => {
    const list = periods?.[type] || [];
    setPeriodKey((list.find(p => !p.in_progress) || list[0])?.key || '');
  }, [periods, type]);

  useEffect(() => {
    if (!periodKey) return;
    setReadiness(null);
    axios.post(`${API_BASE}/api/executive/readiness`, { type, period: periodKey, uploads: collectUploads() })
      .then(r => setReadiness(r.data))
      .catch(() => {});
  }, [type, periodKey]);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await axios.post(`${API_BASE}/api/executive/report`, { type, period: periodKey, uploads: collectUploads() });
      setRecord(r.data);
      loadSaved();
    } catch (e) {
      setError(errorMessage(e, 'The report could not be generated. Make sure the backend is running.'));
    }
    setBusy(false);
  };

  const openSaved = async id => {
    setError('');
    try { setRecord((await axios.get(`${API_BASE}/api/executive/reports/${id}`)).data); window.scrollTo(0, 0); }
    catch (e) { setError(errorMessage(e, 'That report could not be opened.')); }
  };

  const ask = async q => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setAsking(true);
    setAnswer(null);
    try {
      const r = await axios.post(`${API_BASE}/api/executive/ask`, { type, period: periodKey, question: text, uploads: collectUploads() });
      setAnswer(r.data);
    } catch (e) {
      setAnswer({ answer: errorMessage(e, 'The question could not be answered.'), insufficient_data: true, evidence: [] });
    }
    setAsking(false);
  };

  const periodList = periods?.[type] || [];
  const selected = periodList.find(p => p.key === periodKey);
  const fieldStyle = { padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--foreground)' };

  return (
    <div className="page">
      <style>{`@media print { .sidebar, .topbar, .no-print { display: none !important; } .shell { display: block; height: auto; } .main { overflow: visible; } .page { padding: 0; } .executive-report { border: none; box-shadow: none; } }`}</style>

      <div className="page-header no-print">
        <div>
          <div className="page-eyebrow">Reports</div>
          <div className="page-title">Executive reports</div>
          <div className="page-sub">The dashboard calculates the figures; the AI interprets them; every claim is checked against the data.</div>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Report type</div>
            <div className="btn-row">
              {REPORT_TYPES.map(t => (
                <button key={t.id} className={type === t.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setType(t.id)} aria-pressed={type === t.id}>{t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Period</div>
            <select aria-label="Period" value={periodKey} onChange={e => setPeriodKey(e.target.value)} style={fieldStyle}>
              {periodList.map(p => <option key={p.key} value={p.key}>{p.label}{p.in_progress ? ' (in progress)' : ''}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={generate} disabled={busy || !periodKey} style={{ marginLeft: 'auto', padding: '10px 24px' }}>
            {busy ? `Analysing data… (up to ${aiInfo?.plan === 'free' ? '2 minutes' : 'a minute'})` : 'Generate executive report'}
          </button>
        </div>

        {readiness && (
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.8 }}>
            <div>
              {readiness.period.label} compared with {readiness.comparisons.map(c => c.label).join(' and ')} · {readiness.facts} calculated figures
              {aiInfo ? ` · AI: ${aiInfo.model}${aiInfo.plan === 'free' ? ' (free-plan mode: compact reports)' : ''}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              {Object.entries(readiness.availability).map(([k, v]) => (
                <span key={k}>{v === 'available' ? '✅' : '—'} {k.replace(/_/g, ' ')}: {AVAILABILITY_WORDS[v] || v}</span>
              ))}
            </div>
            {selected?.in_progress && <div style={{ color: 'var(--destructive)' }}>This period is still in progress, so comparisons use the same number of days in each period.</div>}
            {readiness.coverage_notes.map(n => <div key={n}>{n}</div>)}
          </div>
        )}
      </div>

      {error && <div role="alert" className="info-note" style={{ color: 'var(--destructive)' }}>{error}</div>}

      {record && <ReportView record={record} onRegenerate={generate} busy={busy} />}

      <div className="grid-2 no-print" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="card-title">Ask the data</div>
          <div className="card-sub">Answers come only from the dashboard data for {selected?.label || 'the selected period'}.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()}
              placeholder="e.g. Which platform performed best?" aria-label="Question" style={{ ...fieldStyle, flex: 1 }} />
            <button className="btn-primary" onClick={() => ask()} disabled={asking || !periodKey}>{asking ? 'Thinking…' : 'Ask'}</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {SUGGESTED_QUESTIONS.map(q => <button key={q} className="tab-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => ask(q)}>{q}</button>)}
          </div>
          {answer && (
            <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {answer.answer}
              {!answer.insufficient_data && answer.evidence_level && (
                <span className="badge" style={{ ...LEVEL_STYLE[answer.evidence_level], marginLeft: 8, fontSize: 10 }}>{answer.evidence_level} evidence</span>
              )}
              {answer.validation && !answer.validation.ok && (
                <div style={{ fontSize: 11, color: 'hsl(32, 70%, 32%)', marginTop: 6 }}>Flagged by the checks: {answer.validation.issues.map(i => i.problem).join('; ')}</div>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Saved reports</div>
          <div className="card-sub">Every report is saved with the data it was written from.</div>
          {saved.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>No reports yet.</div>
            : (
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {saved.map(s => (
                  <div key={s.id} onClick={() => openSaved(s.id)} role="button" tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && openSaved(s.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                    <span><strong>{s.period.label}</strong> {REPORT_TYPES.find(t => t.id === s.type)?.label}</span>
                    <span style={{ color: 'var(--muted-foreground)' }}>{formatDate(s.generated_at)} {s.validation_ok ? '✅' : `⚠️ ${s.flagged}`}</span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
}