import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { withLabels, formatDayMonth, compactTick } from '../utils/social';

// Shows any platform's uploaded data: headline metrics, trends, audience breakdowns and top posts.
// Nothing here is specific to one platform's columns; it displays whatever the files contained.

const PERIODS = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
];
// Metrics whose names contain these words are shown first; everything else follows alphabetically.
const PREFERRED_ORDER = ['impression', 'reach', 'view', 'visitor', 'click', 'reaction', 'like', 'comment', 'repost', 'share', 'engagement', 'follower', 'follow'];

const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const sectionLabel = { fontSize: 10, color: 'var(--muted-foreground)', margin: '22px 0 10px', fontWeight: 600, letterSpacing: '0.1em' };
// Long post texts are cut to two lines; the full text shows on hover.
const clampStyle = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const selectStyle = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
};

const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

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

function monthly(rows, aggregation) {
  const groups = new Map();
  for (const row of withLabels(rows)) {
    const group = groups.get(row.monthKey) || { monthKey: row.monthKey, month: row.monthLabel, rows: [] };
    group.rows.push(row);
    groups.set(row.monthKey, group);
  }
  return [...groups.values()]
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))
    .map(g => ({ month: g.month, value: combine(g.rows, aggregation) }));
}

function MetricCard({ label, current, previous, meta, previousLabel }) {
  const change = current !== null && previous ? ((current - previous) / previous) * 100 : null;
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{formatValue(current, meta)}</div>
      {change !== null
        ? <div className={`kpi-delta ${change >= 0 ? 'up' : 'down'}`}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs {previousLabel}</div>
        : <div className="kpi-delta neutral">No earlier data to compare</div>}
      {meta?.aggregation === 'mean' && <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>Daily average</div>}
    </div>
  );
}

export default function PlatformPanel({ code, name, social, note }) {
  const [period, setPeriod] = useState(90);
  const [showAll, setShowAll] = useState(false);
  const [chosenMetric, setChosenMetric] = useState(null);
  const [chosenBreakdown, setChosenBreakdown] = useState(null);
  const [chosenList, setChosenList] = useState(null);
  const [sortMeasure, setSortMeasure] = useState(null);

  const data = useMemo(() => {
    const prefix = `${code}-`;
    const names = Object.keys(social?.series || {}).filter(k => k.startsWith(prefix) && social.series[k].length);
    const metrics = names
      .map(key => ({ key, rows: social.series[key], meta: social.meta[key] || {}, label: shortLabel(social.meta[key]?.label || key, name) }))
      .sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
    const latest = metrics.reduce((max, m) => (m.rows[m.rows.length - 1].date > max ? m.rows[m.rows.length - 1].date : max), '');
    const breakdowns = Object.entries(social?.breakdowns || {}).filter(([k]) => k.startsWith(prefix)).map(([key, b]) => ({ key, ...b }));
    const lists = Object.entries(social?.items || {}).filter(([k]) => k.startsWith(prefix)).map(([key, l]) => ({ key, ...l }));
    return { metrics, headline: metrics.filter(m => m.meta.primary !== false), latest, breakdowns, lists };
  }, [code, name, social]);

  if (!data.metrics.length && !data.breakdowns.length && !data.lists.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">No {name} data yet</div>
          <div className="empty-state-sub">
            Click "Upload analytics files" above and drop the {name} exports into the {name} box.
            {note ? ` ${note}` : ''}
          </div>
        </div>
      </div>
    );
  }

  // Current period ends on the latest day in the data; the previous period is the same length just before it.
  const end = data.latest;
  const startCurrent = end ? addDays(end, -(period - 1)) : null;
  const startPrevious = end ? addDays(startCurrent, -period) : null;
  const cards = (showAll ? data.metrics : data.headline).map(m => {
    const current = m.rows.filter(r => r.date >= startCurrent && r.date <= end);
    const previous = m.rows.filter(r => r.date >= startPrevious && r.date < startCurrent);
    return {
      ...m,
      current: combine(current, m.meta.aggregation),
      // Only compare when the earlier period is mostly covered by data.
      previous: previous.length >= period * 0.8 ? combine(previous, m.meta.aggregation) : null,
    };
  });

  const metric = data.metrics.find(m => m.key === chosenMetric) || data.headline[0] || data.metrics[0];
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
  const percentTick = v => (metric?.meta.format === 'percent' ? `${Math.round(v * 100)}%` : compactTick(v));

  return (
    <div>
      {note && (
        <div style={{ background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--muted-foreground)' }}>
          {note}{end ? ` Latest data: ${formatDayMonth(end)} ${end.slice(0, 4)}.` : ''}
        </div>
      )}

      {data.metrics.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {PERIODS.map(p => (
              <button key={p.days} className={`btn-secondary${period === p.days ? ' active-toggle' : ''}`} aria-pressed={period === p.days} onClick={() => setPeriod(p.days)}>
                {p.label}
              </button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
              Compared with the {period} days before
            </span>
          </div>

          <div className="kpi-row" style={{ flexWrap: 'wrap' }}>
            {cards.map(c => (
              <MetricCard key={c.key} label={c.label} current={c.current} previous={c.previous} meta={c.meta} previousLabel={`previous ${period} days`} />
            ))}
          </div>
          {data.metrics.length > data.headline.length && (
            <button className="btn-secondary" style={{ fontSize: 11, marginBottom: 16 }} onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show headline metrics only' : `Show all ${data.metrics.length} metrics`}
            </button>
          )}

          <div style={sectionLabel}>TRENDS</div>
          <div style={{ marginBottom: 12 }}>
            <select aria-label="Metric to chart" value={metric.key} onChange={e => setChosenMetric(e.target.value)} style={selectStyle}>
              {data.metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">{metric.label} by month</div>
              <div className="card-sub">{metric.meta.aggregation === 'mean' ? 'Monthly average' : metric.meta.aggregation === 'last' ? 'Latest value each month' : 'Monthly total'}</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={monthly(metric.rows, metric.meta.aggregation)} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={percentTick} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [formatValue(v, metric.meta), metric.label]} />
                  <Bar dataKey="value" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-title">{metric.label}, daily</div>
              <div className="card-sub">Last 90 days of data</div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={withLabels(metric.rows.slice(-90))} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="dayLabel" tick={axisTick} axisLine={false} tickLine={false} interval={13} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={percentTick} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [formatValue(v, metric.meta), metric.label]} />
                  <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
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
                      <td style={{ whiteSpace: 'nowrap' }}>{item.date ? `${formatDayMonth(item.date)} ${item.date.slice(0, 4)}` : '—'}</td>
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