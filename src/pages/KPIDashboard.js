import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import SmartSheet from '../components/SmartSheet';

// Reads a KPI tracker laid out as: one row per KPI, grouped under goal rows, with columns for
// each quarter's result and each year's target and result. Columns are recognised from the words
// in the header rows ("1Q22 Result", "2022", "Target", "Result"), not from fixed names or positions.

const text = v => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
const ID = /^\d+(\.\d+)*$/; // 1, 1.1, 1.1.1, 4.3.1.1 …
const QUARTER = /\b([1-4])\s*Q\s*'?(\d{2,4})\b|\bQ\s*([1-4])\s*'?(\d{2,4})\b/i;
const YEAR = /(?:^|\D)((?:19|20)\d{2})(?!\d)/;
const fullYear = y => (y.length === 2 ? 2000 + Number(y) : Number(y));
const isError = v => /^#[A-Z/0!?]+[!?]?$/i.test(text(v)); // Excel errors: #VALUE!, #DIV/0!, #N/A, #REF!
const number = v => {
  const t = text(v).replace(/[€$£%,\s]/g, '').replace(/m$/i, '');
  return t !== '' && !Number.isNaN(Number(t)) ? Number(t) : null;
};
const whole = v => (v === null ? '–' : Number(v).toLocaleString('en-IE', { maximumFractionDigits: Math.abs(v) < 10 && v % 1 ? 2 : 0 }));

function analyse(sheet) {
  const { headers, rows } = sheet;
  if (!rows.length) return null;
  const values = h => rows.map(r => text(r[h])).filter(Boolean);
  // The KPI number column ("#": 1, 1.1, 1.2 …) and the KPI name column (the longest text).
  const idCol = headers.find(h => { const v = values(h); return v.length >= 3 && v.filter(x => ID.test(x)).length / v.length >= 0.8; });
  const avgLength = h => { const v = values(h); return v.length ? v.join('').length / v.length : 0; };
  const nameCol = [...headers].filter(h => h !== idCol).sort((a, b) => avgLength(b) - avgLength(a))[0];
  if (!idCol || !nameCol) return null;

  // Everything above the first KPI row is header text, e.g. "2022" on one row and "Target" under it.
  const firstKpi = rows.findIndex(r => ID.test(text(r[idCol])));
  const headerText = h => [h, ...rows.slice(0, firstKpi).map(r => text(r[h]))].join(' ');

  // What each column holds. Years carry along to the right, so "Target"/"Result" under "2022" belong to 2022.
  const columns = [];
  let year, quarterYear;
  for (const h of headers) {
    if (h === idCol || h === nameCol) continue;
    const t = headerText(h);
    const q = t.match(QUARTER);
    // Quarter labels ("1Q26") are the most specific, so a year header that disagrees with the
    // quarters just before it (e.g. a "2025" left over a 2026 block) doesn't override them.
    if (q) year = quarterYear = fullYear(q[2] || q[4]);
    else if (t.match(YEAR)) { const y = Number(t.match(YEAR)[1]); year = quarterYear && y < quarterYear ? quarterYear : y; }
    if (!year) continue;
    if (/target/i.test(t)) { if (!q) columns.push({ h, year, kind: 'target' }); }
    else if (q) columns.push({ h, year, kind: 'quarter', quarter: Number(q[1] || q[3]) });
    else if (/result|actual|achieved/i.test(t)) columns.push({ h, year, kind: 'result' });
  }
  if (columns.length < 2) return null;

  const goals = [];
  // Walk the sheet in order: an unnumbered goal heading is a one-cell row, which the sheet keeps as a note.
  const layout = sheet.layout ?? rows.map((_, index) => ({ type: 'row', index }));
  const start = layout.findIndex(item => item.type === 'row' && item.index === firstKpi);
  for (const item of layout.slice(start)) {
    const row = item.type === 'row' ? rows[item.index] : { [nameCol]: item.text };
    const id = text(row[idCol]);
    const name = text(row[nameCol]);
    if (!name) continue;
    // Goals are numbered 1, 2, 3 (or not numbered); KPIs and sub-KPIs have dots: 1.1, 1.1.1.
    if (!id.includes('.')) { goals.push({ id, name, kpis: [] }); continue; }
    if (!goals.length) goals.push({ id: '', name: 'KPIs', kpis: [] });
    const cell = c => number(row[c.h]);
    goals[goals.length - 1].kpis.push({
      id, name,
      quarters: columns.filter(c => c.kind === 'quarter').map(c => ({ year: c.year, quarter: c.quarter, value: cell(c) })),
      target: Object.fromEntries(columns.filter(c => c.kind === 'target').map(c => [c.year, cell(c)])),
      result: Object.fromEntries(columns.filter(c => c.kind === 'result').map(c => [c.year, cell(c)])),
    });
  }
  const kpis = goals.flatMap(g => g.kpis);
  const errors = rows.slice(firstKpi).reduce((n, r) => n + columns.filter(c => isError(r[c.h])).length, 0);
  if (!kpis.length) return null;
  const years = [...new Set(columns.map(c => c.year))].sort();
  const hasData = (k, y) => k.result[y] != null || k.target[y] != null || k.quarters.some(q => q.year === y && q.value != null);
  return { goals: goals.filter(g => g.kpis.length), kpis, years, errors, hasData };
}

const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const cell = { padding: '8px 10px', fontSize: 12, verticalAlign: 'middle' };
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

function Progress({ result, target }) {
  if (result == null || !target) return <span style={{ color: 'var(--muted-foreground)' }}>–</span>;
  const share = result / target;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 140 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--secondary)' }}>
        <div style={{ width: `${Math.min(share, 1) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--accent)' }} />
      </div>
      <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{share >= 1 ? 'Met' : `${Math.round(share * 100)}%`}</span>
    </div>
  );
}

function KPISummary({ workbook, fallback }) {
  const sheets = useMemo(() => workbook.sheets.map(analyse), [workbook]);
  const data = sheets.find(Boolean);
  // Open on the latest year with a real (non-zero) figure; placeholder 0s for a future year don't count.
  const filled = (k, y) => [k.result[y], ...k.quarters.filter(q => q.year === y).map(q => q.value)].some(v => v);
  const latest = data && ([...data.years].reverse().find(y => data.kpis.some(k => filled(k, y))) ?? data.years[data.years.length - 1]);
  const [year, setYear] = useState(latest);
  const withData = data ? data.kpis.filter(k => data.years.some(y => data.hasData(k, y))) : [];
  const [kpiId, setKpiId] = useState(withData[0]?.id);
  if (!data) return fallback; // not a KPI tracker: show the normal charts

  const scored = data.kpis.filter(k => k.result[year] != null && k.target[year]);
  const kpi = data.kpis.find(k => k.id === kpiId);
  const cards = [
    ['KPIs tracked', data.kpis.length],
    [`KPIs with ${year} figures`, data.kpis.filter(k => data.hasData(k, year)).length],
    [`Targets met in ${year}`, scored.length ? `${scored.filter(k => k.result[year] >= k.target[year]).length} of ${scored.length}` : 'None set'],
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {data.years.map(y => (
          <button key={y} type="button" className={`tab-btn${y === year ? ' active' : ''}`} aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        {cards.map(([label, value]) => (
          <div key={label} className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div></div>
        ))}
      </div>

      {withData.length === 0 && (
        <div className="card" style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted-foreground)' }}>
          The KPIs and periods were recognised, but no results are filled in yet. Charts appear once figures are added.
        </div>
      )}

      {kpi && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="card-title">{kpi.name}</div>
              <div className="card-sub">Each quarter's result, and each year's result against its target</div>
            </div>
            <select aria-label="KPI" value={kpiId} onChange={e => setKpiId(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--foreground)', maxWidth: 360 }}>
              {data.goals.map(g => (
                <optgroup key={g.id} label={`${g.id} ${g.name}`.slice(0, 70)}>
                  {g.kpis.filter(k => withData.includes(k)).map(k => <option key={k.id} value={k.id}>{'\u00a0\u00a0'.repeat(k.id.split('.').length - 2)}{k.id} {k.name}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={kpi.quarters.map(q => ({ name: `Q${q.quarter} ${String(q.year).slice(2)}`, Result: q.value }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={44} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--secondary)' }} formatter={v => whole(v)} />
                <Bar dataKey="Result" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.years.map(y => ({ name: String(y), Result: kpi.result[y], Target: kpi.target[y] }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--secondary)' }} formatter={v => whole(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Result" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Target" fill="var(--muted-foreground)" fillOpacity={0.45} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th scope="col">KPI</th>
              {[1, 2, 3, 4].map(q => <th key={q} scope="col" style={{ textAlign: 'right' }}>Q{q}</th>)}
              <th scope="col" style={{ textAlign: 'right' }}>Result</th>
              <th scope="col" style={{ textAlign: 'right' }}>Target</th>
              <th scope="col">Progress, {year}</th>
            </tr>
          </thead>
          <tbody>
            {data.goals.map(g => (
              <React.Fragment key={g.id}>
                <tr><td colSpan={8} style={{ ...cell, fontWeight: 600, background: 'var(--secondary)', whiteSpace: 'normal' }}>{g.id} {g.name}</td></tr>
                {g.kpis.map(k => (
                  <tr key={k.id} onClick={() => withData.includes(k) && setKpiId(k.id)} style={{ cursor: withData.includes(k) ? 'pointer' : 'default' }}>
                    <td style={{ ...cell, minWidth: 260, whiteSpace: 'normal', paddingLeft: 10 + 16 * (k.id.split('.').length - 2),
                      color: k.id.split('.').length > 2 ? 'var(--muted-foreground)' : undefined }}>{k.id} {k.name}</td>
                    {[1, 2, 3, 4].map(q => <td key={q} style={num}>{whole(k.quarters.find(x => x.year === year && x.quarter === q)?.value ?? null)}</td>)}
                    <td style={num}>{whole(k.result[year] ?? null)}</td>
                    <td style={num}>{whole(k.target[year] ?? null)}</td>
                    <td style={cell}><Progress result={k.result[year]} target={k.target[year]} /></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {data.errors > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted-foreground)' }}>
          {data.errors} cell{data.errors === 1 ? '' : 's'} contain a spreadsheet error (such as #VALUE!) and {data.errors === 1 ? 'was' : 'were'} left out. Fix the formula in the spreadsheet and upload again.
        </div>
      )}
    </div>
  );
}

export default function KPIDashboard() {
  return <SmartSheet eyebrow="Evidence" title="KPI tracker" subtitle="Upload CSV or Excel to visualise your key performance indicators" summary={KPISummary} />;
}