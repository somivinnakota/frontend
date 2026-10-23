import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { MONTH_NAMES, withLabels, formatDayMonth, compactTick } from '../utils/social';
import MetricInfo, { glossaryIdForLabel } from './MetricInfo';

// Shows any platform's uploaded data in the same style as the Instagram and Facebook tabs.
// The comparison is chosen from the data itself:
// - Year on year: when the files go back far enough to cover 1 Jan to the latest day of last year.
// - Last 12 months: otherwise. Cards show the 12-month total, and the % compares the most recent
//   6 months with the 6 months before. Charts show the last 12 months in order.

// Metrics whose names contain these words are shown first; everything else follows alphabetically.
const PREFERRED_ORDER = ['impression', 'reach', 'view', 'visitor', 'click', 'reaction', 'like', 'comment', 'repost', 'share', 'engagement', 'follower', 'follow'];
const COLORS = ['#53266a', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626'];
const HALF_YEAR_DAYS = 182;

// The headline metrics shown as cards and charts, in this order. Each is found by its column name,
// skipping the desktop/mobile, organic/sponsored and per-page splits. Everything else is listed
// under "Show all metrics". A metric that isn't in the uploads is simply left out.
const SPLITS = /desktop|mobile|organic|sponsored|auto-invited|overview|life|jobs|unique impressions/i;
const HEADLINE = [
  { label: 'Impressions', match: /impressions/i },
  { label: 'Clicks', match: /clicks/i },
  { label: 'Reactions', match: /reactions/i },
  { label: 'Comments', match: /comments/i },
  { label: 'Engagement rate', match: /engagement rate/i },
  { label: 'New followers', match: /follower/i },
  { label: 'Page views', match: /page views/i },
  { label: 'Unique visitors', match: /unique visitors/i },
];

function pickHeadline(totals) {
  const picked = [];
  for (const h of HEADLINE) {
    const candidates = totals.filter(m => h.match.test(m.label) && !SPLITS.test(m.label) && !picked.includes(m));
    const best = candidates.find(m => /total/i.test(m.label)) || candidates[0];
    if (best) picked.push({ ...best, label: h.label });
  }
  return picked;
}

const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const sectionLabel = { fontSize: 10, color: 'var(--muted-foreground)', margin: '22px 0 10px', fontWeight: 600, letterSpacing: '0.1em' };
const smallNote = { fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 };
// Long post texts are cut to two lines; the full text shows on hover.
const clampStyle = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const selectStyle = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
};

const pad = n => String(n).padStart(2, '0');
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const fullDate = iso => `${formatDayMonth(iso)} ${iso.slice(0, 4)}`;

function combine(rows, aggregation) {
  if (!rows.length) return null;
  if (aggregation === 'mean') return rows.reduce((t, r) => t + r.value, 0) / rows.length;
  if (aggregation === 'last') return rows[rows.length - 1].value;
  return rows.reduce((t, r) => t + r.value, 0);
}

function formatValue(value, meta) {
  if (value === null || value === undefined) return '—';
  if (meta?.format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (meta?.aggregation === 'mean') return value.toLocaleString('en-IE', { maximumFractionDigits: 2 });
  return Math.round(value).toLocaleString('en-IE');
}

const rank = label => {
  const lower = label.toLowerCase();
  const i = PREFERRED_ORDER.findIndex(word => lower.includes(word));
  return i === -1 ? PREFERRED_ORDER.length : i;
};

// Tidies labels for display: "LinkedIn Clicks (total)" → "Clicks".
const shortLabel = (label, name) => label.replace(new RegExp(`^${name}\\s+`, 'i'), '').replace(/\s*\(total\)$/i, '');

const between = (rows, from, to) => rows.filter(r => r.date >= from && r.date <= to);

// Like-for-like: 1 Jan up to this metric's latest day this year, against the same days last year.
function yearToDate(rows, aggregation, year, prevYear) {
  const current = rows.filter(r => r.date.startsWith(`${year}-`));
  if (!current.length) return { current: null, previous: null };
  const cutoff = current[current.length - 1].date.slice(5);
  const previous = rows.filter(r => r.date.startsWith(`${prevYear}-`) && r.date.slice(5) <= cutoff);
  return {
    current: combine(current, aggregation),
    // Only compare when last year's data covers most of the same days.
    previous: previous.length >= current.length * 0.8 ? combine(previous, aggregation) : null,
  };
}

// Last 12 months: the total for the year, plus the latest 6 months against the 6 months before.
function lastTwelveMonths(rows, aggregation, latest) {
  const recentStart = addDays(latest, -(HALF_YEAR_DAYS - 1));
  const earlierStart = addDays(recentStart, -HALF_YEAR_DAYS);
  const recent = between(rows, recentStart, latest);
  const earlier = between(rows, earlierStart, addDays(recentStart, -1));
  const enough = list => list.length >= HALF_YEAR_DAYS * 0.8;
  return {
    current: combine(between(rows, addDays(latest, -364), latest), aggregation),
    recent: enough(recent) ? combine(recent, aggregation) : null,
    earlier: enough(earlier) ? combine(earlier, aggregation) : null,
  };
}

const monthRows = (rows, year, monthIndex) => rows.filter(r => r.date.startsWith(`${year}-${pad(monthIndex + 1)}`));

// Every month from the start of the 12-month window to the latest month, in order.
function rollingMonths(latest) {
  const start = addDays(latest, -364);
  const months = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7)) - 1;
  const endKey = latest.slice(0, 7);
  for (;;) {
    const key = `${y}-${pad(m + 1)}`;
    months.push({ key, label: `${MONTH_NAMES[m]} '${String(y).slice(2)}`, from: key === start.slice(0, 7) ? start : `${key}-01` });
    if (key === endKey) break;
    m += 1;
    if (m === 12) { m = 0; y += 1; }
  }
  return months;
}

function subtitleFor(meta, view, year, rolling) {
  if (view === 'daily') return 'Daily · last 90 days of data';
  const kind = meta.aggregation === 'mean' ? 'Monthly average' : meta.aggregation === 'last' ? 'Latest value each month' : 'Monthly total';
  if (rolling) return `${kind} · last 12 months`;
  return view === 'compare' ? `${kind} · year on year` : `${kind} · ${year}`;
}

function MetricCard({ metric, rolling, prevYear }) {
  const { label, meta, current } = metric;
  const before = rolling ? metric.earlier : metric.previous;
  const after = rolling ? metric.recent : current;
  const change = after !== null && before ? ((after - before) / before) * 100 : null;
  const versus = rolling ? 'vs previous 6 months' : `vs ${prevYear}`;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}<MetricInfo id={glossaryIdForLabel(label)} /></div>
      <div className="kpi-value">{formatValue(current, meta)}</div>
      {change !== null
        ? <div className={`kpi-delta ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% {versus}</div>
        : <div className="kpi-delta neutral">{rolling ? 'Not enough data to compare' : `No ${prevYear} data to compare`}</div>}
      {rolling && change !== null && (
        <div style={smallNote}>Last 6 months: {formatValue(after, meta)} · before: {formatValue(before, meta)}</div>
      )}
      {!rolling && before > 0 && <div style={smallNote}>{prevYear}: {formatValue(before, meta)}</div>}
      {meta?.aggregation === 'mean' && <div style={smallNote}>Daily average</div>}
    </div>
  );
}

function MetricChart({ metric, year, prevYear, view, color, rolling, latest }) {
  const { rows, meta, label } = metric;
  const tick = v => (meta.format === 'percent' ? `${Math.round(v * 100)}%` : compactTick(v));

  if (view === 'daily') {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={withLabels(rows.slice(-90))} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="dayLabel" tick={axisTick} axisLine={false} tickLine={false} interval={13} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={tick} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => [formatValue(v, meta), label]} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (rolling || view === 'monthly') {
    const data = rolling
      ? rollingMonths(latest).map(mo => ({
        month: mo.label,
        value: combine(rows.filter(r => r.date.startsWith(mo.key) && r.date >= mo.from && r.date <= latest), meta.aggregation),
      }))
      : MONTH_NAMES.map((month, i) => ({ month, value: combine(monthRows(rows, year, i), meta.aggregation) }));
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data.filter(d => d.value !== null)} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} interval={rolling ? 1 : 0} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={tick} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => [formatValue(v, meta), label]} />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const data = MONTH_NAMES.map((month, i) => ({
    month,
    [prevYear]: combine(monthRows(rows, prevYear, i), meta.aggregation) ?? 0,
    [year]: combine(monthRows(rows, year, i), meta.aggregation) ?? 0,
  }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={tick} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v, series) => [formatValue(v, meta), series]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey={String(prevYear)} fill="#e5e7eb" radius={[3, 3, 0, 0]} maxBarSize={16} />
        <Bar dataKey={String(year)} fill={color} radius={[3, 3, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function PlatformPanel({ code, name, social, view = 'compare' }) {
  const [chosenBreakdown, setChosenBreakdown] = useState(null);
  const [chosenList, setChosenList] = useState(null);
  const [sortMeasure, setSortMeasure] = useState(null);
  const [showOthers, setShowOthers] = useState(false);

  const data = useMemo(() => {
    const prefix = `${code}-`;
    const names = Object.keys(social?.series || {}).filter(k => k.startsWith(prefix) && social.series[k].length);
    const metrics = names
      .map(key => ({ key, rows: social.series[key], meta: social.meta[key] || {}, label: shortLabel(social.meta[key]?.label || key, name) }))
      .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
    const latest = metrics.reduce((max, m) => (m.rows[m.rows.length - 1].date > max ? m.rows[m.rows.length - 1].date : max), '');
    const year = latest ? Number(latest.slice(0, 4)) : null;
    const prevYear = year ? year - 1 : null;
    const earliest = metrics.reduce((min, m) => (!min || m.rows[0].date < min ? m.rows[0].date : min), '');

    // Year on year only when the uploads reach back to the start of last year.
    const yearOnYear = metrics.map(m => ({ ...m, ...yearToDate(m.rows, m.meta.aggregation, year, prevYear) }));
    const rolling = latest !== '' && !yearOnYear.some(m => m.previous !== null);
    const totals = rolling
      ? metrics.map(m => ({ ...m, ...lastTwelveMonths(m.rows, m.meta.aggregation, latest) }))
      : yearOnYear;

    const picked = pickHeadline(totals);
    const shown = picked.length ? picked : totals.filter(m => m.meta.primary !== false).slice(0, 8);
    // The rest are available on request, without charts. Empty ones and copies of a headline
    // figure (e.g. organic followers when none are sponsored) are left out.
    const shownKeys = new Set(shown.map(m => m.key));
    const others = totals.filter(m => !shownKeys.has(m.key) && m.current
      && !shown.some(s => s.current === m.current));
    const breakdowns = Object.entries(social?.breakdowns || {}).filter(([k]) => k.startsWith(prefix)).map(([key, b]) => ({ key, ...b }));
    const lists = Object.entries(social?.items || {}).filter(([k]) => k.startsWith(prefix)).map(([key, l]) => ({ key, ...l }));
    const windowStart = latest ? (addDays(latest, -364) > earliest ? addDays(latest, -364) : earliest) : '';
    return { metrics, shown, others, latest, windowStart, year, prevYear, rolling, breakdowns, lists };
  }, [code, name, social]);

  if (!data.metrics.length && !data.breakdowns.length && !data.lists.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">No {name} data yet</div>
          <div className="empty-state-sub">
            Click "Upload analytics files" below and drop the {name} exports into the {name} box.
          </div>
        </div>
      </div>
    );
  }

  const breakdown = data.breakdowns.find(b => b.key === chosenBreakdown) || data.breakdowns[0];
  const list = data.lists.find(l => l.key === chosenList) || data.lists[0];
  const measure = list && (list.measures.find(m => m.header === sortMeasure)
    || list.measures.find(m => /impression|reach|view/i.test(m.header)) || list.measures[0]);
  // Extra columns: only measures most posts have a value for (e.g. video views are blank for other posts).
  const otherMeasures = list
    ? list.measures
      .filter(m => m !== measure && list.rows.filter(r => r.values[m.header] !== undefined).length >= list.rows.length * 0.5)
      .slice(0, 3)
    : [];
  const topItems = list && measure
    ? [...list.rows].filter(r => r.values[measure.header] !== undefined)
      .sort((a, b) => b.values[measure.header] - a.values[measure.header]).slice(0, 10)
    : [];

  const chartRows = [];
  for (let i = 0; i < data.shown.length; i += 2) chartRows.push(data.shown.slice(i, i + 2));
  const chartTitle = m => (data.rolling ? `${m.label} — last 12 months` : `${m.label} — ${data.year} vs ${data.prevYear}`);

  return (
    <div>
      {data.shown.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 14 }}>
            {data.rolling
              ? <>Last 12 months: {fullDate(data.windowStart)} – {fullDate(data.latest)} · each % compares the latest 6 months with the 6 months before. Year-on-year comparison will switch on automatically once the uploads go back to 1 Jan {data.prevYear}.</>
              : <>Data up to {fullDate(data.latest)} · each figure compares 1 Jan to that day with the same days in {data.prevYear}.</>}
          </div>
          <div className="kpi-row" style={{ flexWrap: 'wrap' }}>
            {data.shown.map(m => <MetricCard key={m.key} metric={m} rolling={data.rolling} prevYear={data.prevYear} />)}
          </div>
          {data.others.length > 0 && (
            <>
              <button className="btn-secondary" style={{ fontSize: 11, marginBottom: 16 }} onClick={() => setShowOthers(!showOthers)}>
                {showOthers ? 'Hide detailed metrics' : `Show ${data.others.length} more detailed metrics`}
              </button>
              {showOthers && (
                <div className="kpi-row" style={{ flexWrap: 'wrap' }}>
                  {data.others.map(m => <MetricCard key={m.key} metric={m} rolling={data.rolling} prevYear={data.prevYear} />)}
                </div>
              )}
            </>
          )}
          {chartRows.map(row => (
            <div className="grid-2" key={row[0].key}>
              {row.map(m => (
                <div className="card" key={m.key}>
                  <div className="card-title">{chartTitle(m)}</div>
                  <div className="card-sub">{subtitleFor(m.meta, view, data.year, data.rolling)}</div>
                  <MetricChart metric={m} year={data.year} prevYear={data.prevYear} view={view} rolling={data.rolling}
                    latest={data.latest} color={COLORS[data.shown.indexOf(m) % COLORS.length]} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {breakdown && (
        <>
          <div style={sectionLabel}>AUDIENCE</div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="card-title">{breakdown.label}</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>Top 10 · snapshot from the latest upload</div>
              </div>
              <select aria-label="Audience breakdown" value={breakdown.key} onChange={e => setChosenBreakdown(e.target.value)} style={selectStyle}>
                {data.breakdowns.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(160, Math.min(breakdown.rows.length, 10) * 30)}>
              <BarChart data={breakdown.rows.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} tickFormatter={compactTick} />
                <YAxis dataKey="name" type="category" tick={axisTick} width={240} axisLine={false} tickLine={false}
                  tickFormatter={v => (v.length > 38 ? `${v.slice(0, 37)}…` : v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [Number(v).toLocaleString('en-IE'), breakdown.measure]} />
                <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {list && measure && (
        <>
          <div style={sectionLabel}>TOP POSTS</div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div className="card-title">Top 10 by {measure.header.toLowerCase()}</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>{list.rows.length} posts uploaded</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {data.lists.length > 1 && (
                  <select aria-label="Post list" value={list.key} onChange={e => setChosenList(e.target.value)} style={selectStyle}>
                    {data.lists.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                )}
                <select aria-label="Sort posts by" value={measure.header} onChange={e => setSortMeasure(e.target.value)} style={selectStyle}>
                  {list.measures.map(m => <option key={m.header} value={m.header}>Sort by {m.header.toLowerCase()}</option>)}
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Post</th>
                    <th style={{ textAlign: 'right' }}>{measure.header}</th>
                    {otherMeasures.map(m => <th key={m.header} style={{ textAlign: 'right' }}>{m.header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {topItems.map(item => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{item.date ? fullDate(item.date) : '—'}</td>
                      <td style={{ maxWidth: 420 }}>
                        <span style={clampStyle} title={item.title}>
                          {item.url
                            ? <a href={item.url} target="_blank" rel="noreferrer" style={{ color: 'var(--foreground)', textDecoration: 'none' }}>{item.title || 'View post'}</a>
                            : item.title}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatValue(item.values[measure.header], measure)}</td>
                      {otherMeasures.map(m => <td key={m.header} style={{ textAlign: 'right' }}>{formatValue(item.values[m.header], m)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}