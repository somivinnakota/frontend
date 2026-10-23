import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import { MONTH_NAMES } from '../utils/social';
import MetricInfo from './MetricInfo';

// Newsletter performance from Mailchimp. A filter picks which campaigns count as newsletters
// (by audience, folder and/or a word in the name), and every figure below uses only those.
// Averages are per newsletter: each newsletter's rate is worked out, then averaged.

const STORAGE_KEY = 'mailchimp-newsletter-filter';
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const sectionLabel = { fontSize: 10, color: 'var(--muted-foreground)', margin: '22px 0 10px', fontWeight: 600, letterSpacing: '0.1em' };
const smallNote = { fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 };
const fieldStyle = {
  padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
};
const labelStyle = { fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 4 };

const pct = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);
const count = v => Math.round(v).toLocaleString('en-IE');
const ratio = (a, b) => (b > 0 ? a / b : null);
const average = list => { const v = list.filter(x => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const shortDate = iso => new Date(iso).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
const monthLabel = key => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} '${key.slice(2, 4)}`;

const withRates = c => ({
  ...c,
  openRate: ratio(c.uniqueOpens, c.delivered),
  clickRate: ratio(c.uniqueClicks, c.delivered),
  unsubscribeRate: ratio(c.unsubscribed, c.delivered),
});

function loadFilter() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}
function saveFilter(filter) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(filter)); } catch { /* storage unavailable */ }
}

// First visit: use a folder or campaign name that mentions newsletters, if there is one.
function suggestedFilter(campaigns) {
  const folder = campaigns.map(c => c.folder).find(f => /newsletter/i.test(f || ''));
  if (folder) return { audience: 'all', folder, keyword: '' };
  const named = campaigns.some(c => /newsletter/i.test(`${c.title} ${c.subject}`));
  return { audience: 'all', folder: 'all', keyword: named ? 'newsletter' : '' };
}

function matches(c, filter) {
  const word = filter.keyword.trim().toLowerCase();
    return !word || `${c.title} ${c.subject}`.toLowerCase().includes(word);
}

function Card({ label, value, note, glossaryId }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}<MetricInfo id={glossaryId} /></div>
      <div className="kpi-value">{value}</div>
      {note && <div style={smallNote}>{note}</div>}
    </div>
  );
}

export default function MailchimpPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(loadFilter);

  const load = useCallback((refresh = false) => {
    setLoading(true);
    axios.get(`${API_BASE}/api/mailchimp${refresh ? '?refresh=1' : ''}`)
      .then(r => { setData(r.data); setError(''); })
      .catch(e => setError(errorMessage(e, 'Could not load Mailchimp data. Make sure the backend is running.')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data && !filter) setFilter(suggestedFilter(data.campaigns)); }, [data, filter]);

  const update = change => setFilter(f => { const next = { ...f, ...change }; saveFilter(next); return next; });

  const view = useMemo(() => {
    if (!data || !filter) return null;
    const newsletters = data.campaigns.filter(c => matches(c, filter)).map(withRates);
    const audiences = data.audiences || [];
   
    // Subscribers: the chosen audience, or every audience these newsletters were sent to.
    const audienceIds = filter.audience !== 'all' ? [filter.audience] : [...new Set(newsletters.map(c => c.audienceId))];
    const used = audiences.filter(a => audienceIds.includes(a.id));
    // Start at the first newsletter, and only where every audience counted has a figure for that month.
    const start = [newsletters[0]?.sentAt.slice(0, 7), ...used.map(a => a.history[0]?.month)].filter(Boolean).sort().pop();
    const months = [...new Set(used.flatMap(a => a.history.map(h => h.month)))].sort()
      .filter(m => !start || m >= start);
    const growth = months.map(m => ({
      month: monthLabel(m),
      Subscribers: used.reduce((t, a) => {
        const upTo = a.history.filter(h => h.month <= m);
        return t + (upTo.length ? upTo[upTo.length - 1].subscribers : 0);
      }, 0),
    }));
    const subscribers = used.reduce((t, a) => t + a.subscribers, 0);

    return {
      newsletters,
      openRate: average(newsletters.map(c => c.openRate)),
      clickRate: average(newsletters.map(c => c.clickRate)),
      unsubscribeRate: average(newsletters.map(c => c.unsubscribeRate)),
      subscribers: used.length ? subscribers : null,
      growthSince: growth.length ? { from: growth[0].month, change: subscribers - growth[0].Subscribers } : null,
      growth,
      perNewsletter: newsletters.map(c => ({
        name: new Date(c.sentAt).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }),
        title: c.title, 'Open rate': c.openRate, 'Click rate': c.clickRate,
      })),
      audienceCount: audienceIds.length,
    };
  }, [data, filter]);

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
  if (!data || !view) return <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>Loading Mailchimp data...</div>;

  const { newsletters } = view;
  const growthNote = view.growthSince
    ? `${view.growthSince.change >= 0 ? '+' : ''}${count(view.growthSince.change)} since ${view.growthSince.from}`
    : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          Live from Mailchimp · updated {new Date(data.fetchedAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <button className="btn-secondary" style={{ fontSize: 11 }} disabled={loading} onClick={() => load(true)}>
          {loading ? 'Refreshing...' : 'Refresh from Mailchimp'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-title">Which campaigns are you looking for?</div>
        <div className="card-sub">Every figure on this tab uses only the campaigns that match. Your choice is remembered on this computer.</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={labelStyle}>NAME OR SUBJECT CONTAINS</div>
            <input type="search" aria-label="Name or subject contains" placeholder="e.g. newsletter" value={filter.keyword}
              onChange={e => update({ keyword: e.target.value })} style={{ ...fieldStyle, width: 200 }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', paddingBottom: 6 }}>
            {newsletters.length} of {data.campaigns.length} campaigns match
          </div>
        </div>
      </div>

      <div className="kpi-row" style={{ flexWrap: 'wrap' }}>
        <Card label="Average open rate" value={pct(view.openRate)} glossaryId="open_rate"/>
        <Card label="Average click rate" value={pct(view.clickRate)} glossaryId="click_through_rate"
          note="Subscribers who clicked ÷ emails delivered" />
        <Card label="Average unsubscribe rate" value={pct(view.unsubscribeRate)} glossaryId="unsubscribe_rate"
          note="Unsubscribes ÷ emails delivered" />
        <Card label="Total subscribers" value={view.subscribers === null ? '—' : count(view.subscribers)}
          note={[growthNote, view.audienceCount > 1 ? `${view.audienceCount} audiences added together` : null].filter(Boolean).join(' · ')} />
      </div>
      <div style={{ ...smallNote, marginBottom: 14 }}>
        Averages are across {newsletters.length} newsletter{newsletters.length === 1 ? '' : 's'}: each newsletter's rate, averaged.
      </div>

      {newsletters.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">No campaigns match</div>
            <div className="empty-state-sub">Change the audience, folder or word above to pick your newsletters.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">Open and click rate for each newsletter</div>
              <div className="card-sub">By send date · unsubscribe rates are in the table below</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={view.perNewsletter} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={v => `${Math.round(v * 100)}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [pct(v), name]}
                    labelFormatter={(label, items) => items?.[0]?.payload?.title || label} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Open rate" stroke="#0891b2" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Click rate" stroke="#53266a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="card-title">Subscriber growth</div>
              <div className="card-sub">Subscribers at the end of each month</div>
              {view.growth.length ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={view.growth} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                    <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={count} domain={['auto', 'auto']} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={v => [count(v), 'Subscribers']} />
                    <Line type="monotone" dataKey="Subscribers" stroke="#53266a" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', padding: '40px 0', textAlign: 'center' }}>
                  Mailchimp hasn't returned a subscriber history for this audience yet.
                </div>
              )}
            </div>
          </div>

          <div style={sectionLabel}>NEWSLETTERS</div>
          <div className="card">
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Newsletter</th>
                    <th style={{ textAlign: 'right' }}>Delivered</th>
                    <th style={{ textAlign: 'right' }}>Open rate</th>
                    <th style={{ textAlign: 'right' }}>Click rate</th>
                    <th style={{ textAlign: 'right' }}>Unsubscribe rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...newsletters].reverse().map(c => (
                    <tr key={c.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{shortDate(c.sentAt)}</td>
                      <td style={{ maxWidth: 380 }}>
                        <div style={{ fontWeight: 500 }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                          {[c.subject !== c.title && c.subject, c.audience, c.folder].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{count(c.delivered)}</td>
                      <td style={{ textAlign: 'right' }}>{pct(c.openRate)}</td>
                      <td style={{ textAlign: 'right' }}>{pct(c.clickRate)}</td>
                      <td style={{ textAlign: 'right' }}>{pct(c.unsubscribeRate)}</td>
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