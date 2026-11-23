import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import SmartSheet from '../components/SmartSheet';

// Reads a KPI tracker laid out as: one row per KPI, grouped under goal rows, with columns for
// each quarter's result and each year's target and result. Columns are recognised from the words
// in the header rows ("1Q22 Result", "2022", "Target", "Result", "Q1" under "2024"), not from fixed
// names or positions.
//
// Each subsheet is read on its own, so an "Aggregated" and a "Disaggregated" tab each get their own
// dashboard. Disaggregated sheets are handled in the ways they are usually laid out:
//   - sub-KPIs numbered 1.1.1, 1.1.1.1 …, or with a letter (1.1.1a)
//   - the number written in the same cell as the name ("1.1.1 Number of …", "KPI 1.1.1: …")
//   - a breakdown column (Sex, County, Age group, Disaggregation …), with the KPI number repeated
//     or left blank (e.g. merged cells) on the breakdown rows under it
//   - breakdown rows with no number at all ("Male", "Female") under the KPI they belong to

const text = v => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
// "1", "1.1", "1.1.1", "1.1.1.", "1.1.1a", "KPI 1.1.1", "1.1.1 Number of …", "1.1.1: Number of …"
const ID_CELL = /^(?:(?:kpi|indicator|ind|no)\.?\s*)?(\d{1,2}(?:\.\d+)*[a-z]?)\.?(?=$|[\s:)–—-])[\s:)–—-]*(.*)$/i;
const readId = v => { const m = text(v).match(ID_CELL); return m ? { id: m[1], rest: m[2] } : null; };
const QUARTER = /\b([1-4])\s*Q\s*'?(\d{2,4})\b|\bQ\s*([1-4])\s*'?(\d{2,4})\b/i;
const BARE_QUARTER = /\bQ\s*([1-4])\b|\b([1-4])\s*Q\b|\bquarter\s*([1-4])\b/i; // "Q1" under a "2024" heading
const YEAR = /(?:^|\D)((?:19|20)\d{2})(?!\d)/;
const NOT_A_RESULT = /baseline|budget|forecast|projected|plan(ned)?\b|variance|change|comment|note/i;
const fullYear = y => (y.length === 2 ? 2000 + Number(y) : Number(y));
const isError = v => /^#[A-Z/0!?]+[!?]?$/i.test(text(v)); // Excel errors: #VALUE!, #DIV/0!, #N/A, #REF!
const number = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = text(v).replace(/[€$£%,\s]/g, '').replace(/m$/i, '');
  return t !== '' && !Number.isNaN(Number(t)) ? Number(t) : null;
};
const whole = v => (v === null ? '–' : Number(v).toLocaleString('en-IE', { maximumFractionDigits: Math.abs(v) < 10 && v % 1 ? 2 : 0 }));
const depth = id => id.split('.').length;

// Columns that describe a KPI rather than name it or break it down.
const NAME_HINT = /\b(kpi|indicator|name|description|measure|metric|output|outcome|activity)\b/i;
const NOT_NAME = /comment|note|source|verification|evidence|definition|frequency|responsib|owner|lead\b|baseline|unit|status|rag\b|method|link/i;
const BREAKDOWN_HINT = /disaggregat|breakdown|category|sex|gender|group|county|region|area|site|location|cohort|age|ethnic|nationality|by\b|split|sub.?group/i;
const GOAL_HINT = /^(goal|objective|pillar|theme|outcome|strategic|priority|area|aim)\b/i;

export function analyseKpis(sheet) {
  const { headers, rows } = sheet || {};
  if (!rows?.length) return null;
  const values = (h, from = rows) => from.map(r => text(r[h])).filter(Boolean);

  // The KPI number column ("#": 1, 1.1, 1.1.1 …): the first column (from the left) that is mostly
  // numbers like that, with some dotted ones. Leftmost, so a column of decimal results isn't picked.
  const dotted = h => values(h).filter(v => readId(v)?.id.includes('.')).length;
  const idCol = headers.find(h => {
    if (QUARTER.test(h) || YEAR.test(h) || /target|result/i.test(h)) return false;
    const v = values(h);
    return v.length >= 2 && v.filter(x => readId(x)).length / v.length >= 0.6 && dotted(h) >= 2;
  });
  if (!idCol) return null;

  // Everything above the first KPI row is header text, e.g. "2022" on one row and "Target" under it.
  const firstKpi = rows.findIndex(r => readId(r[idCol]));
  const kpiRows = rows.slice(firstKpi);
  const headerText = h => [h, ...rows.slice(0, firstKpi).map(r => text(r[h]))].join(' ');
  const isPeriod = h => QUARTER.test(headerText(h)) || YEAR.test(headerText(h)) || /\b(target|result|actual|achieved)\b/i.test(headerText(h));

  // The name: in the number's own cell ("1.1.1 Number of …"), or the longest-text column, preferring one
  // headed "KPI"/"Indicator"/"Description" and avoiding comments, sources and the like.
  const ids = values(idCol, kpiRows).map(readId).filter(Boolean);
  const inIdCell = ids.length && ids.reduce((n, x) => n + x.rest.length, 0) / ids.length >= 8;
  const avgLength = h => { const v = values(h, kpiRows); return v.length ? v.join('').length / v.length : 0; };
  const wordy = h => { const v = values(h, kpiRows); return v.length > 0 && v.filter(x => number(x) === null).length / v.length >= 0.6; };
  const textCols = headers.filter(h => h !== idCol && !isPeriod(h) && wordy(h));
  const score = h => avgLength(h) * (NAME_HINT.test(headerText(h)) ? 2 : 1) * (NOT_NAME.test(headerText(h)) ? 0.3 : 1);
  const nameCol = inIdCell ? idCol : [...textCols].sort((a, b) => score(b) - score(a))[0];
  if (!nameCol) return null;

  // A breakdown column (Sex, County …): short repeated labels. Only looked for when the sheet is
  // headed that way, or when KPI numbers repeat or are missing on rows that have figures.
  const idValues = kpiRows.map(r => readId(r[idCol])?.id || '');
  const repeats = new Set(idValues.filter(Boolean)).size < idValues.filter(Boolean).length;
  const breakdownCol = (() => {
    const options = textCols.filter(h => h !== nameCol && !NOT_NAME.test(headerText(h)) && avgLength(h) <= 40);
    const hinted = options.find(h => BREAKDOWN_HINT.test(headerText(h)));
    if (hinted) return hinted;
    const reused = h => { const v = values(h, kpiRows); return v.length >= 2 && new Set(v).size < v.length; };
    const blankIds = kpiRows.some(r => !text(r[idCol]) && headers.some(h => number(r[h]) !== null));
    return repeats || blankIds ? options.find(reused) : undefined;
  })();

  // What each column holds. Years carry along to the right, so "Target"/"Result"/"Q1" under "2022" belong to 2022.
  const columns = [];
  let year, quarterYear;
  for (const h of headers) {
    if (h === idCol || h === nameCol || h === breakdownCol) continue;
    const t = headerText(h);
    const q = t.match(QUARTER);
    // Quarter labels ("1Q26") are the most specific, so a year header that disagrees with the
    // quarters just before it (e.g. a "2025" left over a 2026 block) doesn't override them.
    if (q) year = quarterYear = fullYear(q[2] || q[4]);
    else if (t.match(YEAR)) { const y = Number(t.match(YEAR)[1]); year = quarterYear && y < quarterYear && !BARE_QUARTER.test(t) ? quarterYear : y; }
    if (!year) continue;
    const bare = !q && t.match(BARE_QUARTER);
    if (/target/i.test(t)) { if (!q && !bare) columns.push({ h, year, kind: 'target' }); }
    else if (q) columns.push({ h, year, kind: 'quarter', quarter: Number(q[1] || q[3]) });
    else if (bare) columns.push({ h, year, kind: 'quarter', quarter: Number(bare[1] || bare[2] || bare[3]) });
    else if (/result|actual|achieved/i.test(t)) columns.push({ h, year, kind: 'result' });
    else if (/\btotal\b/i.test(t) && kpiRows.some(r => number(r[h]) !== null)) columns.push({ h, year, kind: 'result', plain: true });
    // A column headed only with a year ("2024") and figures under it is that year's result.
    else if (YEAR.test(t) && !NOT_A_RESULT.test(t) && kpiRows.some(r => number(r[h]) !== null)) columns.push({ h, year, kind: 'result', plain: true });
  }
  // A plain year column only counts when the sheet has no "Result" column for that year.
  const usable = columns.filter(c => !c.plain || !columns.some(o => o.kind === 'result' && !o.plain && o.year === c.year));
  if (usable.length < 2 && !(usable.length === 1 && usable[0].kind !== 'target')) return null;

  const goals = [];
  const kpis = [];
  const used = {};
  let lastKpi = null;
  const addGoal = (id, name) => { goals.push({ id, name, kpis: [] }); lastKpi = null; };
  const addKpi = (row, id, name, part, parent) => {
    if (!goals.length) goals.push({ id: '', name: 'KPIs', kpis: [] });
    const cell = c => (row ? number(row[c.h]) : null);
    const base = `${id}|${part}`;
    used[base] = (used[base] || 0) + 1;
    const kpi = {
      key: used[base] > 1 ? `${base}|${used[base]}` : base,
      id, name: part ? (name ? `${name} – ${part}` : part) : name, baseName: name, part, parent: parent?.key || null,
      quarters: usable.filter(c => c.kind === 'quarter').map(c => ({ year: c.year, quarter: c.quarter, value: cell(c) })),
      target: Object.fromEntries(usable.filter(c => c.kind === 'target').map(c => [c.year, cell(c)])),
      result: Object.fromEntries(usable.filter(c => c.kind === 'result').map(c => [c.year, cell(c)])),
    };
    goals[goals.length - 1].kpis.push(kpi);
    kpis.push(kpi);
    if (!part) lastKpi = kpi; else if (!lastKpi || lastKpi.id !== id) lastKpi = { ...kpi, part: '' };
    return kpi;
  };

  // Walk the sheet in order: an unnumbered goal heading is a one-cell row, which the sheet keeps as a section or note.
  const layout = sheet.layout ?? rows.map((_, index) => ({ type: 'row', index }));
  const start = layout.findIndex(item => item.type === 'row' && item.index === firstKpi);
  for (const item of layout.slice(start)) {
    if (item.type !== 'row') {
      // A one-cell row can also be a KPI with nothing filled in yet ("1.1.1 Number of …").
      const parsed = readId(item.text);
      if (parsed?.id.includes('.') && parsed.rest) addKpi(null, parsed.id, parsed.rest, '', null);
      else if (lastKpi && item.text.length <= 30 && !GOAL_HINT.test(item.text) && !parsed) addKpi(null, lastKpi.id, lastKpi.baseName, item.text, lastKpi);
      else addGoal(parsed?.id || '', parsed ? parsed.rest || item.text : item.text);
      continue;
    }
    const row = rows[item.index];
    const parsed = readId(row[idCol]);
    const id = parsed?.id || '';
    const name = inIdCell ? (parsed ? parsed.rest : text(row[idCol])) : text(row[nameCol]);
    const part = breakdownCol ? text(row[breakdownCol]) : '';
    const hasFigures = usable.some(c => number(row[c.h]) !== null);

    if (id.includes('.')) {
      // The same number again with a breakdown label is a breakdown of that KPI.
      const parent = part && lastKpi?.id === id ? lastKpi : null;
      addKpi(row, id, name || parent?.baseName || '', part, parent);
    } else if (id) {
      // Goals are numbered 1, 2, 3; KPIs and sub-KPIs have dots: 1.1, 1.1.1.
      if (name) addGoal(id, name);
    } else if (lastKpi && (hasFigures || part || (name && name.length <= 30 && !GOAL_HINT.test(name)))) {
      // No number: a breakdown row ("Male", "Female") of the KPI above it.
      addKpi(row, lastKpi.id, lastKpi.baseName, part || name || 'Unlabelled row', lastKpi);
    } else if (name) addGoal('', name);
  }

  if (!kpis.length) return null;
  const errors = kpiRows.reduce((n, r) => n + usable.filter(c => isError(r[c.h])).length, 0);
  const years = [...new Set(usable.map(c => c.year))].sort((a, b) => a - b);
  const hasData = (k, y) => k.result[y] != null || k.target[y] != null || k.quarters.some(q => q.year === y && q.value != null);
  return { goals: goals.filter(g => g.kpis.length), kpis, years, errors, hasData, disaggregated: kpis.some(k => k.part || depth(k.id) > 2) };
}

const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const cell = { padding: '8px 10px', fontSize: 12, verticalAlign: 'middle' };
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const label = k => `${k.id} ${k.name}`.trim();
const indent = k => depth(k.id) - 2 + (k.part ? 1 : 0);

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

// The KPIs one KPI is broken into: its breakdown rows (Male, Female …) or its sub-KPIs (1.1 → 1.1.1, 1.1.2).
// For a breakdown row itself, the other rows of the same breakdown.
function breakdownOf(kpi, kpis) {
  if (kpi.part) return kpis.filter(k => k.id === kpi.id && k.part);
  const parts = kpis.filter(k => k.parent === kpi.key);
  if (parts.length) return parts;
  return kpis.filter(k => !k.part && k.id.startsWith(`${kpi.id}.`) && depth(k.id) === depth(kpi.id) + 1);
}

// `sheet` is the subsheet picked in the tabs (e.g. Aggregated or Disaggregated); each gets its own dashboard.
function KPISummary({ sheet, fallback }) {
  const data = useMemo(() => analyseKpis(sheet), [sheet]);
  // Open on the latest year with a real (non-zero) figure; placeholder 0s for a future year don't count.
  const filled = (k, y) => [k.result[y], ...k.quarters.filter(q => q.year === y).map(q => q.value)].some(v => v);
  const latest = data && ([...data.years].reverse().find(y => data.kpis.some(k => filled(k, y))) ?? data.years[data.years.length - 1]);
  const [year, setYear] = useState(latest);
  const withData = data ? data.kpis.filter(k => data.years.some(y => data.hasData(k, y))) : [];
  const [kpiKey, setKpiKey] = useState((withData[0] || data?.kpis[0])?.key);
  if (!data) return fallback; // not a KPI tracker: show the normal charts for this subsheet

  const scored = data.kpis.filter(k => k.result[year] != null && k.target[year]);
  const kpi = data.kpis.find(k => k.key === kpiKey);
  const kpiHasData = kpi && withData.includes(kpi);
  const breakdown = kpi ? breakdownOf(kpi, data.kpis).filter(k => data.hasData(k, year)) : [];
  // The breakdown compares each part's yearly result; with no yearly results yet, its latest quarter that year.
  const latestQuarter = [4, 3, 2, 1].find(q => breakdown.some(k => k.quarters.some(x => x.year === year && x.quarter === q && x.value != null)));
  const useResult = breakdown.some(k => k.result[year] != null);
  const breakdownData = breakdown.map(k => ({
    name: k.part || k.id,
    Result: useResult ? k.result[year] : k.quarters.find(x => x.year === year && x.quarter === latestQuarter)?.value ?? null,
    Target: k.target[year] ?? null,
  }));
  const cards = [
    [data.disaggregated ? 'KPIs and breakdowns tracked' : 'KPIs tracked', data.kpis.length],
    [`With ${year} figures`, data.kpis.filter(k => data.hasData(k, year)).length],
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
        {cards.map(([name, value]) => (
          <div key={name} className="kpi-card"><div className="kpi-label">{name}</div><div className="kpi-value">{value}</div></div>
        ))}
      </div>

      {withData.length === 0 && (
        <div className="card" style={{ marginBottom: 16, fontSize: 13, color: 'var(--muted-foreground)' }}>
          The KPIs and periods on {sheet.name ? `"${sheet.name}"` : 'this sheet'} were recognised, but no results are filled in yet. Charts appear once figures are added.
        </div>
      )}

      {kpi && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div className="card-title">{label(kpi)}</div>
              <div className="card-sub">{kpiHasData ? "Each quarter's result, and each year's result against its target" : 'No figures are filled in for this KPI yet'}</div>
            </div>
            <select aria-label="KPI" value={kpiKey} onChange={e => setKpiKey(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--foreground)', maxWidth: 360 }}>
              {data.goals.map((g, i) => (
                <optgroup key={`${g.id}-${i}`} label={`${g.id} ${g.name}`.trim().slice(0, 70)}>
                  {g.kpis.map(k => (
                    <option key={k.key} value={k.key}>
                      {'\u00a0\u00a0'.repeat(Math.max(indent(k), 0))}{label(k).slice(0, 90)}{withData.includes(k) ? '' : ' (no figures)'}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {kpiHasData && (
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
              {kpi.quarters.length > 0 && (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={kpi.quarters.map(q => ({ name: `Q${q.quarter} ${String(q.year).slice(2)}`, Result: q.value }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} interval={0} angle={-35} textAnchor="end" height={44} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--secondary)' }} formatter={v => whole(v)} />
                    <Bar dataKey="Result" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
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
          )}
          {breakdown.length >= 2 && (
            <div style={{ marginTop: 14 }}>
              <div className="card-sub" style={{ marginBottom: 6 }}>
                Breakdown of {kpi.id}, {year} · {useResult ? 'yearly result' : latestQuarter ? `Q${latestQuarter} result` : 'target'}{breakdownData.some(d => d.Target != null) ? ' against target' : ''}
              </div>
              <ResponsiveContainer width="100%" height={Math.max(180, breakdown.length * 34 + 40)}>
                <BarChart data={breakdownData} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={axisTick} width={150} axisLine={false} tickLine={false}
                    tickFormatter={v => (String(v).length > 24 ? `${String(v).slice(0, 23)}…` : v)} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--secondary)' }} formatter={v => whole(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Result" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  {breakdownData.some(d => d.Target != null) && <Bar dataKey="Target" fill="var(--muted-foreground)" fillOpacity={0.45} radius={[0, 4, 4, 0]} maxBarSize={22} />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
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
            {data.goals.map((g, i) => (
              <React.Fragment key={`${g.id}-${i}`}>
                <tr><td colSpan={8} style={{ ...cell, fontWeight: 600, background: 'var(--secondary)', whiteSpace: 'normal' }}>{g.id} {g.name}</td></tr>
                {g.kpis.map(k => (
                  <tr key={k.key} onClick={() => setKpiKey(k.key)} aria-selected={k.key === kpiKey}
                    style={{ cursor: 'pointer', background: k.key === kpiKey ? 'var(--secondary)' : undefined }}>
                    <td style={{ ...cell, minWidth: 260, whiteSpace: 'normal', paddingLeft: 10 + 16 * Math.max(indent(k), 0),
                      color: indent(k) > 0 ? 'var(--muted-foreground)' : undefined }}>{k.part && k.parent ? `${k.id} – ${k.part}` : label(k)}</td>
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