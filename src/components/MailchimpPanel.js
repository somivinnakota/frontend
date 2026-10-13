import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import { MONTH_NAMES, compactTick } from '../utils/social';

// Email engagement from Mailchimp campaign reports, in the same style as the social media tabs.
// Engagement rate = unique subscribers who clicked ÷ emails delivered. Opens are shown too, but
// Apple Mail Privacy Protection inflates them, so clicks are the more reliable engagement measure.

const DAY = 86400000;
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const sectionLabel = { fontSize: 10, color: 'var(--muted-foreground)', margin: '22px 0 10px', fontWeight: 600, letterSpacing: '0.1em' };
const smallNote = { fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 };
const selectStyle = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
};

const pct = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
const count = v => Math.round(v).toLocaleString('en-IE');
const ratio = (a, b) => (b > 0 ? a / b : null);
const shortDate = iso => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

function summarise(campaigns) {
  const total = key => campaigns.reduce((t, c) => t + c[key], 0);
  const delivered = total('delivered');
  const opens = total('uniqueOpens');
  const clicks = total('uniqueClicks');
  return {
    campaigns: campaigns.length,
    delivered,
    openRate: ratio(opens, delivered),
    engagementRate: ratio(clicks, delivered),
    clickToOpen: ratio(clicks, opens),
    unsubscribeRate: ratio(total('unsubscribed'), delivered),
  };
}

const rates = c => ({
  openRate: ratio(c.uniqueOpens, c.delivered),
  engagementRate: ratio(c.uniqueClicks, c.delivered),
});

function Card({ label, value, current, previous, isRate, lowerIsBetter, note }) {
  let delta = null;
  if (previous !== null && previous !== undefined && current !== null && previous > 0) {
    const diff = isRate ? (current - previous) * 100 : ((current - previous) / previous) * 100;
    const good = lowerIsBetter ? diff <= 0 : diff >= 0;
    delta = (
      <div className={`kpi-delta ${good ? 'up' : 'down'}`}>
        {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}{isRate ? ' pts' : '%'} vs previous 12 months
      </div>
    );
  }
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta || <div className="kpi-delta neutral">No earlier campaigns to compare</div>}
      {note && <div style={smallNote}>{note}</div>}
    </div>
  );
}

export default function MailchimpPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('recent');

  const load = useCallback((refresh = false) => {
    setLoading(true);
    axios.get(`${API_BASE}/api/mailchimp${refresh ? '?refresh=1' : ''}`)
      .then(r => { setData(r.data); setError(''); })
      .catch(e => setError(errorMessage(e, 'Could not load Mailchimp data. Make sure the backend is running.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const age = c => now - Date.parse(c.sentAt);
    const recent = data.campaigns.filter(c => age(c) <= 365 * DAY);
    const earlier = data.campaigns.filter(c => age(c) > 365 * DAY && age(c) <= 730 * DAY);

    // The last 12 calendar months, oldest first.
    const today = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - 11 + i, 1);
      return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` };
    });
    const monthly = months.map(m => {
      const inMonth = data.campaigns.filter(c => c.sentAt.slice(0, 7) === m.key);
      const s = summarise(inMonth);
      return {
        month: m.label,
        delivered: s.delivered,
        'Open rate': s.openRate,
        'Engagement rate': s.engagementRate,
      };
    });
    return { now: summarise(recent), before: earlier.length ? summarise(earlier) : null, monthly, total: data.campaigns.length };
  }, [data]);

  const tableRows = useMemo(() => {
    if (!data) return [];
    const withRates = data.campaigns.map(c => ({ ...c, ...rates(c) }));
    const sorters = {
      recent: (a, b) => b.sentAt.localeCompare(a.sentAt),
      engagement: (a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1),
      opens: (a, b) => (b.openRate ?? -1) - (a.openRate ?? -1),
    };
    return withRates.sort(sorters[sortBy]).slice(0, 15);
  }, [data, sortBy]);

  if (error) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">Mailchimp isn't connected</div>
          <div className="empty-state-sub">{error}</div>
        </div>
      </div>
    );
  }
  if (!data) return <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>Loading Mailchimp data...</div>;
  if (!data.campaigns.length) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-title">No sent campaigns yet</div>
          <div className="empty-state-sub">Campaigns appear here once they've been sent from Mailchimp.</div>
        </div>
      </div>
    );
  }

  const { now, before } = view;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          Live from Mailchimp · last 12 months compared with the 12 months before · updated {new Date(data.fetchedAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <button className="btn-secondary" style={{ fontSize: 11 }} disabled={loading} onClick={() => load(true)}>
          {loading ? 'Refreshing...' : 'Refresh from Mailchimp'}
        </button>
      </div>

      <div className="kpi-row" style={{ flexWrap: 'wrap' }}>
        <Card label="Engagement rate" value={pct(now.engagementRate)} current={now.engagementRate} previous={before?.engagementRate} isRate
          note="Subscribers who clicked ÷ emails delivered" />
        <Card label="Open rate" value={pct(now.openRate)} current={now.openRate} previous={before?.openRate} isRate
          note="Can be inflated by Apple Mail privacy" />
        <Card label="Click-to-open rate" value={pct(now.clickToOpen)} current={now.clickToOpen} previous={before?.clickToOpen} isRate
          note="Of those who opened, how many clicked" />
        <Card label="Unsubscribe rate" value={pct(now.unsubscribeRate)} current={now.unsubscribeRate} previous={before?.unsubscribeRate} isRate lowerIsBetter />
      </div>
      <div className="kpi-row" style={{ flexWrap: 'wrap' }}>
        <Card label="Campaigns sent" value={count(now.campaigns)} current={now.campaigns} previous={before?.campaigns} />
        <Card label="Emails delivered" value={count(now.delivered)} current={now.delivered} previous={before?.delivered} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Open and engagement rate — last 12 months</div>
          <div className="card-sub">All campaigns sent each month combined</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={view.monthly} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${Math.round(v * 100)}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [pct(v), name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Open rate" stroke="#0891b2" strokeWidth={2} connectNulls dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Engagement rate" stroke="#53266a" strokeWidth={2} connectNulls dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-title">Emails delivered — last 12 months</div>
          <div className="card-sub">Monthly total</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={view.monthly} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={compactTick} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => [count(v), 'Emails delivered']} />
              <Bar dataKey="delivered" fill="#d97706" radius={[3, 3, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={sectionLabel}>CAMPAIGNS</div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <div className="card-title">{sortBy === 'recent' ? 'Latest campaigns' : 'Top campaigns'}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{view.total} campaigns sent in total</div>
          </div>
          <select aria-label="Sort campaigns" value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
            <option value="recent">Most recent</option>
            <option value="engagement">Highest engagement rate</option>
            <option value="opens">Highest open rate</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Sent</th>
                <th>Campaign</th>
                <th style={{ textAlign: 'right' }}>Delivered</th>
                <th style={{ textAlign: 'right' }}>Open rate</th>
                <th style={{ textAlign: 'right' }}>Engagement rate</th>
                <th style={{ textAlign: 'right' }}>Unsubscribes</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(c => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{shortDate(c.sentAt)}</td>
                  <td style={{ maxWidth: 380 }}>
                    <div style={{ fontWeight: 500 }}>{c.title}</div>
                    {c.subject && c.subject !== c.title && <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{c.subject}</div>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{count(c.delivered)}</td>
                  <td style={{ textAlign: 'right' }}>{pct(c.openRate)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{pct(c.engagementRate)}</td>
                  <td style={{ textAlign: 'right' }}>{count(c.unsubscribed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}