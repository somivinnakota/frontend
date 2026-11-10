import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import LoadWarning, { useLoadFailures } from '../components/LoadWarning';
import SocialUpload from '../components/SocialUpload';
import MetricInfo from '../components/MetricInfo';
import MailchimpPanel from '../components/MailchimpPanel';
import {
  MONTH_NAMES, withLabels, forYear, upToDay, sumValues, peakValue,
  aggregateByMonth, formatDayMonth, compactTick,
} from '../utils/social';

const tooltipStyle = { fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 6 };
const axisTick = { fontSize: 10, fill: '#9ca3af' };

const INSTAGRAM_CARDS = [
  ['ig-reach', 'Total reach'], ['ig-views', 'Total views'], ['ig-interactions', 'Total interactions'], ['ig-visits', 'Profile visits'],
  ['ig-follows', 'New followers'], ['ig-clicks', 'Link clicks'],
];
const INSTAGRAM_CHARTS = [
  ['ig-reach', 'Reach', 'Daily reach added up by month', '#53266a'],
  ['ig-views', 'Views', 'Monthly content views', '#0891b2'],
  ['ig-interactions', 'Interactions', 'Likes, comments and saves', '#7c3aed'],
  ['ig-visits', 'Profile visits', 'Visits to the INFANT Instagram profile', '#059669'],
  ['ig-follows', 'New followers', 'Follower growth', '#d97706'],
  ['ig-clicks', 'Link clicks', 'Bio link clicks', '#dc2626'],
];
const FACEBOOK_CARDS = [
  ['fb-views', 'Total views'], ['fb-visits', 'Total visits'], ['fb-interactions', 'Total interactions'], ['fb-clicks', 'Link clicks'],
  ['fb-follows', 'New followers'],
];
const FACEBOOK_CHARTS = [
  ['fb-views', 'Views', 'Monthly content views', '#53266a'],
  ['fb-visits', 'Page visits', 'Monthly page visits', '#059669'],
  ['fb-interactions', 'Interactions', 'Likes, comments and shares', '#7c3aed'],
  ['fb-clicks', 'Link clicks', 'Clicks on links in posts', '#dc2626'],
  ['fb-follows', 'New followers', 'Follower growth', '#d97706'],
];

// The glossary entry (eye-icon tooltip) for each series' card.
const GLOSSARY_IDS = {
  'ig-reach': 'reach', 'ig-views': 'views', 'ig-interactions': 'interactions', 'ig-visits': 'profile_visits',
  'ig-follows': 'follower_growth', 'ig-clicks': 'link_clicks',
  'fb-views': 'views', 'fb-visits': 'profile_visits', 'fb-interactions': 'interactions', 'fb-clicks': 'link_clicks', 'fb-follows': 'follower_growth',
};

// Small "connected" pill shown at the top of each API-fed tab.
function ApiBadge({ name, ok, detail }) {
  return (
    <div style={{ margin: '4px 0 12px' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '3px 10px',
        color: ok ? '#15803d' : '#b91c1c', background: ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444' }} />
        {name} API {ok ? 'connected' : 'not connected'}{detail ? ` · ${detail}` : ''}
      </span>
    </div>
  );
}

function pctChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous * 100).toFixed(1);
}

function CompareCard({ label, current, previous, prevYear, glossaryId }) {
  const pct = pctChange(current, previous);
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}<MetricInfo id={glossaryId} /></div>
      <div className="kpi-value">{current.toLocaleString()}</div>
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        {pct !== null
          ? (
            <span className={`kpi-delta ${parseFloat(pct) >= 0 ? 'up' : 'down'}`}>
              {parseFloat(pct) >= 0 ? '▲' : '▼'} {Math.abs(pct)}% vs {prevYear}
            </span>
          )
          : <span className="kpi-delta neutral">{previous === null ? `Incomplete ${prevYear} data · no comparison` : `No ${prevYear} data`}</span>}
      </div>
      {previous > 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
          {prevYear}: {previous.toLocaleString()}
        </div>
      )}
    </div>
  );
}

function MetricChart({ current, previous, year, prevYear, color, label, view }) {
  if (!current.length) return (
    <div style={{ color: '#9ca3af', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
      No data available
    </div>
  );

  if (view === 'compare') {
    const monthlyCurrent = aggregateByMonth(current);
    const monthlyPrevious = aggregateByMonth(previous);
    const valueFor = (monthly, i) => monthly.find(d => d.monthKey.endsWith(`-${String(i + 1).padStart(2, '0')}`))?.value || 0;
    const data = MONTH_NAMES.map((month, i) => ({
      month,
      [prevYear]: valueFor(monthlyPrevious, i),
      [year]: valueFor(monthlyCurrent, i),
    }));
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={35} tickFormatter={compactTick} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey={String(prevYear)} fill="#e5e7eb" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Bar dataKey={String(year)} fill={color} radius={[3, 3, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (view === 'monthly') {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={aggregateByMonth(current)} margin={{ left: 0, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={35} tickFormatter={compactTick} />
          <Tooltip contentStyle={tooltipStyle} formatter={v => [v.toLocaleString(), label]} />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={current.slice(-90)} margin={{ left: 0, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
        <XAxis dataKey="dayLabel" tick={axisTick} axisLine={false} tickLine={false} interval={13} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={35} />
        <Tooltip contentStyle={tooltipStyle} formatter={v => [v.toLocaleString(), label]} />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartGrid({ charts, series, year, prevYear, view }) {
  charts = charts.filter(([name]) => series[name]?.current.length || series[name]?.previous.length);
  const rows = [];
  for (let i = 0; i < charts.length; i += 2) rows.push(charts.slice(i, i + 2));
  return rows.map(row => (
    <div className="grid-2" key={row[0][0]}>
      {row.map(([name, label, sub, color]) => (
        <div className="card" key={name}>
          <div className="card-title">{label} — {year} vs {prevYear}</div>
          <div className="card-sub">{sub} · year on year</div>
          <MetricChart
            current={series[name]?.current || []} previous={series[name]?.previous || []}
            year={year} prevYear={prevYear} color={color} label={label} view={view}
          />
        </div>
      ))}
    </div>
  ));
}

export default function SocialMedia() {
  const [activeTab, setActiveTab] = useState('instagram');
  const [view, setView] = useState('compare');
  const [fbStats, setFbStats] = useState(null);
  const [igStats, setIgStats] = useState(null);
  const [social, setSocial] = useState(null);
  const [metaStatus, setMetaStatus] = useState(null);
  const [error, setError] = useState('');
  const [failed, failedToLoad] = useLoadFailures();

  const loadSocial = useCallback(() => {
    axios.get(`${API_BASE}/api/social-data`)
      .then(r => { setSocial(r.data); setError(''); })
      .catch(e => setError(errorMessage(e, 'Could not load social media data. Make sure the backend is running.')));
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/api/facebook`).then(r => setFbStats(r.data)).catch(failedToLoad('live Facebook figures'));
    axios.get(`${API_BASE}/api/instagram`).then(r => setIgStats(r.data)).catch(failedToLoad('live Instagram figures'));
    axios.get(`${API_BASE}/api/meta-status`).then(r => setMetaStatus(r.data)).catch(failedToLoad('Meta connection status'));
    loadSocial();
  }, [loadSocial, failedToLoad]);

  // Split every series into this year and last year, both with chart labels.
  const prepared = useMemo(() => {
    // Latest day per platform, from the Instagram and Facebook data only.
    const latestFor = prefix => Object.entries(social?.series || {})
      .filter(([key, rows]) => key.startsWith(prefix) && rows.length)
      .map(([, rows]) => rows[rows.length - 1].date)
      .sort()
      .pop() || null;
    const latest = { instagram: latestFor('ig-'), facebook: latestFor('fb-') };
    const newest = [latest.instagram, latest.facebook].filter(Boolean).sort().pop();
    if (!newest) return null;
    const year = Number(newest.slice(0, 4));
    const prevYear = year - 1;
    const series = {};
    for (const [name, rows] of Object.entries(social.series)) {
      series[name] = {
        current: withLabels(forYear(rows, year)),
        previous: withLabels(forYear(rows, prevYear)),
      };
    }
    // Like-for-like: each metric compares 1 January to its own latest uploaded day
    // with the same days last year, so an older upload isn't compared unfairly.
    const sameDaysLastYear = name => {
      const current = series[name]?.current || [];
      const last = current[current.length - 1];
      return { current, previous: last ? upToDay(series[name].previous, last.date.slice(5)) : [] };
    };
    // Only compare when last year's data starts in early January, otherwise the % is meaningless.
    const covered = name => (series[name]?.previous[0]?.date || '9999') <= `${prevYear}-01-07`;
    const toDate = name => {
      const { current, previous } = sameDaysLastYear(name);
      return { current: sumValues(current), previous: covered(name) ? sumValues(previous) : null };
    };
    const peakToDate = name => {
      const { current, previous } = sameDaysLastYear(name);
      return { current: peakValue(current), previous: covered(name) ? peakValue(previous) : null };
    };
    const hasData = name => (social.series[name] || []).length > 0;
    return { year, prevYear, series, toDate, peakToDate, latest, hasData };
  }, [social]);

  const engagementRate = fbStats?.followers_count > 0
    ? `${((fbStats.talking_about_count / fbStats.followers_count) * 100).toFixed(2)}%`
    : '—';

  const comparisonNote = platform => {
    const latest = prepared?.latest[platform];
    return prepared && (
      <div className="info-note">
        {latest
          ? <><strong>Data up to {formatDayMonth(latest)} {latest.slice(0, 4)}.</strong>{' '}</>
          : null}
        Each figure compares 1 Jan {prepared.year} up to its latest day with the same days in {prepared.prevYear}, for a fair like-for-like comparison.
      </div>
    );
  };

  const cards = list => list.filter(([name]) => prepared.hasData(name)).map(([name, label]) => {
    const totals = prepared.toDate(name);
    return <CompareCard key={name} label={label} current={totals.current} previous={totals.previous} prevYear={prepared.prevYear} glossaryId={GLOSSARY_IDS[name]} />;
  });

  const apiConnected = metaStatus?.instagram && metaStatus?.facebook;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Data sources</div>
          <div className="page-title">Social media</div>
          <div className="page-sub">
            Instagram · Facebook · LinkedIn{prepared ? ` · ${prepared.year} vs ${prepared.prevYear} comparison` : ''}
          </div>
        </div>
        {(activeTab === 'instagram' || activeTab === 'facebook') && (
        <div className="btn-row">
          <button className={`btn-secondary${view === 'compare' ? ' active-toggle' : ''}`} onClick={() => setView('compare')}>
            {prepared ? `${prepared.year} vs ${prepared.prevYear}` : 'Compare'}
          </button>
          <button className={`btn-secondary${view === 'monthly' ? ' active-toggle' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
          <button className={`btn-secondary${view === 'daily' ? ' active-toggle' : ''}`} onClick={() => setView('daily')}>Daily</button>
        </div>
        )}
      </div>

      <div className="tab-row">
        {['instagram', 'facebook', 'linkedin', 'mailchimp'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`tab-btn${activeTab === t ? ' active' : ''}`}
            style={{ textTransform: 'capitalize' }}>
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ color: 'var(--destructive)', fontSize: 13, padding: '20px 0' }}>{error}</div>
      )}
      {!error && <LoadWarning failed={failed} />}
      {!error && !social && (
        <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>Loading social media data...</div>
      )}
      {social && !prepared && activeTab !== 'linkedin' && (
        <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>
          {apiConnected
            ? 'Loading live data from the Meta API… the first load fetches your history and can take a minute.'
            : `Meta API not connected${metaStatus?.error ? ` (${metaStatus.error})` : ''}. Check FACEBOOK_PAGE_ID and FACEBOOK_ACCESS_TOKEN in the server .env file.`}
        </div>
      )}

      {prepared && activeTab === 'instagram' && (
        <>
          <ApiBadge name="Meta" ok={metaStatus?.instagram} detail="Instagram · updates every 30 min" />
          {comparisonNote('instagram')}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Followers (live)<MetricInfo id="followers" /></div>
              <div className="kpi-value">{igStats?.followers_count?.toLocaleString() ?? '—'}</div>
              <div className="kpi-delta neutral"><span className="status-dot live"></span>Live</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Interactions (live)</div>
              <div className="kpi-value">{igStats?.interactions_7d?.toLocaleString() ?? '—'}</div>
              <div className="kpi-delta neutral"><span className="status-dot live"></span>Last 7 days</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Engagement rate (7-day)</div>
              <div className="kpi-value">
                {igStats?.followers_count > 0 && igStats?.interactions_7d != null
                  ? `${((igStats.interactions_7d / igStats.followers_count) * 100).toFixed(2)}%` : '—'}
              </div>
              <div className="kpi-delta neutral">Interactions ÷ followers</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Platform</div>
              <div className="kpi-value" style={{ fontSize: 16, paddingTop: 4 }}>Instagram</div>
              <div className="kpi-delta neutral">
                <span className={`status-dot${igStats ? ' live' : ''}`}></span>
                {igStats ? `@${igStats.username} · ${igStats.media_count?.toLocaleString()} posts` : 'Not responding'}
              </div>
            </div>
          </div>
          <div className="kpi-row">{cards(INSTAGRAM_CARDS.slice(0, 4))}
          </div>
          <div className="kpi-row">
            {cards(INSTAGRAM_CARDS.slice(4))}
            {['ig-reach', 'ig-views'].filter(name => prepared.hasData(name)).map(name => {
              const peak = prepared.peakToDate(name);
              return (
                <CompareCard key={`peak-${name}`} label={name === 'ig-reach' ? 'Peak daily reach' : 'Peak daily views'}
                  current={peak.current} previous={peak.previous} prevYear={prepared.prevYear} glossaryId={GLOSSARY_IDS[name]} />
              );
            })}
          </div>
          <ChartGrid charts={INSTAGRAM_CHARTS} series={prepared.series} year={prepared.year} prevYear={prepared.prevYear} view={view} />
        </>
      )}

      {prepared && activeTab === 'facebook' && (
        <>
          <ApiBadge name="Meta" ok={metaStatus?.facebook} detail="Facebook · updates every 30 min" />
          {comparisonNote('facebook')}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Followers (live)<MetricInfo id="followers" /></div>
              <div className="kpi-value">{fbStats?.followers_count?.toLocaleString() ?? '—'}</div>
              <div className="kpi-delta neutral"><span className="status-dot live"></span>Live</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Talking about (live)</div>
              <div className="kpi-value">{fbStats?.talking_about_count?.toLocaleString() ?? '—'}</div>
              <div className="kpi-delta neutral"><span className="status-dot live"></span>Last 7 days</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Engagement rate (7-day)<MetricInfo id="engagement_rate" /></div>
              <div className="kpi-value">{engagementRate}</div>
              <div className="kpi-delta neutral">Talking about ÷ followers</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Platform</div>
              <div className="kpi-value" style={{ fontSize: 16, paddingTop: 4 }}>Facebook</div>
              <div className="kpi-delta neutral">
                <span className={`status-dot${fbStats ? ' live' : ''}`}></span>{fbStats ? 'Connected' : 'Not responding'}
              </div>
            </div>
          </div>
          <div className="kpi-row">{cards(FACEBOOK_CARDS.slice(0, 4))}</div>
          <div className="kpi-row">{cards(FACEBOOK_CARDS.slice(4))}</div>
          <ChartGrid charts={FACEBOOK_CHARTS} series={prepared.series} year={prepared.year} prevYear={prepared.prevYear} view={view} />
        </>
      )}

      {activeTab === 'linkedin' && <LinkedInLive />}

      {activeTab === 'mailchimp' && <MailchimpPanel />}

      {/* The API keeps the dashboard current. Uploads are only needed once, for older months
          Meta's API no longer returns (e.g. Instagram views and interactions before mid-2025). */}
      {metaStatus && (activeTab === 'instagram' || activeTab === 'facebook') && (
        <div style={{ marginTop: 24 }}>
          {apiConnected && (
            <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>
              Missing older months? Meta's API doesn't return every metric that far back. Upload your old
              Meta Business Suite exports once to fill the gaps — they're kept permanently, and the API covers everything from then on.
            </p>
          )}
          <SocialUpload onUploaded={loadSocial} startOpen={!apiConnected && Boolean(social && !social.latestDate)} />
        </div>
      )}
    </div>
  );
}

/* =========================================================
   LinkedIn — live data from GET /api/linkedin
   ========================================================= */

// Live LinkedIn page analytics from GET /api/linkedin (backend: linkedin.js).

const LI_C = { purple: '#53266a', teal: '#0891b2', violet: '#7c3aed', green: '#059669', amber: '#d97706', red: '#dc2626' };
const liTooltip = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const liAxis = { fontSize: 10, fill: 'var(--muted-foreground)' };
const liSection = { fontSize: 10, color: 'var(--muted-foreground)', margin: '22px 0 10px', fontWeight: 600, letterSpacing: '0.1em' };
const liClamp = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };
const LI_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LI_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const liNum = v => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-IE'));
const liPct = v => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(2)}%`);
const liEngRate = d => (d.impressions ? (d.clicks + d.likes + d.comments + d.shares) / d.impressions : 0);

function liGroup(daily, keyFn, labelFn) {
  const out = {};
  for (const d of daily) {
    const k = keyFn(d.date);
    const g = (out[k] ||= { key: k, label: labelFn(d.date), impressions: 0, clicks: 0, likes: 0, comments: 0, shares: 0, followerGain: 0, pageViews: 0 });
    for (const f of ['impressions', 'clicks', 'likes', 'comments', 'shares', 'followerGain', 'pageViews']) g[f] += d[f];
  }
  return Object.values(out).sort((a, b) => a.key.localeCompare(b.key)).map(g => ({ ...g, engagementRate: liEngRate(g) * 100 }));
}

function liAvgBy(posts, keyFn, order) {
  const acc = {};
  for (const p of posts) {
    const k = keyFn(p);
    (acc[k] ||= { name: k, total: 0, n: 0 });
    acc[k].total += p.engagementRate; acc[k].n += 1;
  }
  const rows = Object.values(acc).map(a => ({ name: a.name, rate: +(a.total / a.n * 100).toFixed(2), posts: a.n }));
  return order ? order.map(o => rows.find(r => r.name === o)).filter(Boolean) : rows.sort((a, b) => b.rate - a.rate);
}

function LiKpi({ label, value, note, glossaryId }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}<MetricInfo id={glossaryId} /></div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-delta neutral">{note}</div>
    </div>
  );
}

function LiChart({ title, sub, children, glossaryId }) {
  return (
    <div className="card">
      <div className="card-title">{title}<MetricInfo id={glossaryId} /></div>
      <div className="card-sub">{sub}</div>
      <ResponsiveContainer width="100%" height={220}>{children}</ResponsiveContainer>
    </div>
  );
}

function LiAudience({ title, rows, color }) {
  if (!rows?.length) return null;
  return (
    <div className="card">
      <div className="card-title">{title}<MetricInfo id="audience_demographics" /></div>
      <div className="card-sub">Top {rows.length} · current followers</div>
      <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 26)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" tick={liAxis} tickFormatter={compactTick} />
          <YAxis type="category" dataKey="name" tick={liAxis} width={150} />
          <Tooltip contentStyle={liTooltip} formatter={v => liNum(v)} />
          <Bar dataKey="value" name="Followers" fill={color} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LinkedInLive() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState('monthly');
  const [sortBy, setSortBy] = useState('impressions');

  const load = useCallback(async (refresh = false) => {
    setLoading(true); setError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/linkedin${refresh ? '?refresh=1' : ''}`);
      setData(data);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const series = useMemo(() => {
    if (!data?.daily) return [];
    if (range === 'monthly') {
      return liGroup(data.daily, d => d.slice(0, 7), d => `${LI_MONTHS[+d.slice(5, 7) - 1]} ${d.slice(2, 4)}`);
    }
    return liGroup(data.daily.slice(-90), d => d, d => `${+d.slice(8)} ${LI_MONTHS[+d.slice(5, 7) - 1]}`);
  }, [data, range]);

  const postInsights = useMemo(() => {
    const posts = (data?.posts || []).filter(p => p.impressions > 0);
    return {
      byWeekday: liAvgBy(posts, p => LI_WEEKDAYS[(new Date(`${p.date}T12:00:00Z`).getUTCDay() + 6) % 7], LI_WEEKDAYS),
      byType: liAvgBy(posts, p => p.type),
    };
  }, [data]);

  const topPosts = useMemo(
    () => [...(data?.posts || [])].sort((a, b) => b[sortBy] - a[sortBy]).slice(0, 10),
    [data, sortBy],
  );

  if (error) return <><ApiBadge name="LinkedIn" ok={false} /><div style={{ color: 'var(--destructive)', fontSize: 13 }}>{error}</div></>;
  if (!data) return <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>Loading live LinkedIn data…</div>;
  if (!data.connected) return <><ApiBadge name="LinkedIn" ok={false} /><div className="info-note">{data.message}</div></>;

  const t = data.totals12m;
  const d = data.demographics;
  const rangeSub = range === 'monthly' ? 'Last 12 months, by month' : 'Last 90 days, by day';

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '6px 0 14px' }}>
        <ApiBadge name="LinkedIn" ok detail={`updated ${new Date(data.fetchedAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}`} />
        <div className="btn-row">
          <button className={`btn-secondary${range === 'monthly' ? ' active-toggle' : ''}`} onClick={() => setRange('monthly')}>Monthly</button>
          <button className={`btn-secondary${range === 'daily' ? ' active-toggle' : ''}`} onClick={() => setRange('daily')}>Daily</button>
          <button className="btn-secondary" onClick={() => load(true)} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {data.errors?.length > 0 && (
        <div className="info-note" style={{ marginBottom: 12, fontSize: 12 }}>
          Some LinkedIn data couldn't load: {data.errors.map(e => `${e.source} (${e.status || 'error'}: ${e.message})`).join(' · ')}
        </div>
      )}

      <div className="kpi-row">
        <LiKpi label="Followers" glossaryId="followers" value={liNum(data.followers)} note={<><span className="status-dot live" />Live</>} />
        <LiKpi label="New followers" glossaryId="follower_growth" value={liNum(t.followerGain)} note="Last 12 months" />
        <LiKpi label="Impressions" glossaryId="impressions" value={liNum(t.impressions)} note="Last 12 months · organic" />
        <LiKpi label="Engagement rate" glossaryId="engagement_rate" value={liPct(t.engagementRate)} note="(Clicks + reactions + comments + reposts) ÷ impressions" />
      </div>
      <div className="kpi-row">
        <LiKpi label="Clicks" glossaryId="link_clicks" value={liNum(t.clicks)} note="Last 12 months" />
        <LiKpi label="Reactions" glossaryId="interactions" value={liNum(t.likes)} note="Last 12 months" />
        <LiKpi label="Comments" glossaryId="interactions" value={liNum(t.comments)} note="Last 12 months" />
        <LiKpi label="Reposts" glossaryId="interactions" value={liNum(t.shares)} note="Last 12 months" />
        <LiKpi label="Page views" glossaryId="profile_visits" value={liNum(t.pageViews)} note="Last 12 months" />
      </div>

      <div style={liSection}>REACH & ENGAGEMENT</div>
      <div className="grid-2">
        <LiChart title="Impressions" glossaryId="impressions" sub={`${rangeSub} · how often posts were seen`}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={liAxis} minTickGap={12} />
            <YAxis tick={liAxis} tickFormatter={compactTick} />
            <Tooltip contentStyle={liTooltip} formatter={v => liNum(v)} />
            <Bar dataKey="impressions" name="Impressions" fill={LI_C.purple} radius={[3, 3, 0, 0]} />
          </BarChart>
        </LiChart>
        <LiChart title="Engagement rate" glossaryId="engagement_rate" sub={`${rangeSub} · % of impressions that led to an action`}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={liAxis} minTickGap={12} />
            <YAxis tick={liAxis} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={liTooltip} formatter={v => `${v.toFixed(2)}%`} />
            <Line dataKey="engagementRate" name="Engagement rate" stroke={LI_C.teal} strokeWidth={2} dot={false} />
          </LineChart>
        </LiChart>
      </div>
      <div className="grid-2">
        <LiChart title="Engagement breakdown" glossaryId="interactions" sub={`${rangeSub} · what people did`}>
          <BarChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={liAxis} minTickGap={12} />
            <YAxis tick={liAxis} tickFormatter={compactTick} />
            <Tooltip contentStyle={liTooltip} formatter={v => liNum(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="clicks" name="Clicks" stackId="e" fill={LI_C.purple} />
            <Bar dataKey="likes" name="Reactions" stackId="e" fill={LI_C.violet} />
            <Bar dataKey="comments" name="Comments" stackId="e" fill={LI_C.green} />
            <Bar dataKey="shares" name="Reposts" stackId="e" fill={LI_C.amber} />
          </BarChart>
        </LiChart>
        <LiChart title="Follower growth & page views" glossaryId="follower_growth" sub={rangeSub}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={liAxis} minTickGap={12} />
            <YAxis tick={liAxis} tickFormatter={compactTick} />
            <Tooltip contentStyle={liTooltip} formatter={v => liNum(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="followerGain" name="New followers" stroke={LI_C.green} strokeWidth={2} dot={false} />
            <Line dataKey="pageViews" name="Page views" stroke={LI_C.red} strokeWidth={2} dot={false} />
          </LineChart>
        </LiChart>
      </div>

      {(d.function.length > 0 || d.seniority.length > 0) && (
        <>
          <div style={liSection}>WHO FOLLOWS US</div>
          <div className="grid-2">
            <LiAudience title="Job function" rows={d.function} color={LI_C.purple} />
            <LiAudience title="Seniority" rows={d.seniority} color={LI_C.teal} />
          </div>
          <div className="grid-2">
            <LiAudience title="Industry" rows={d.industry} color={LI_C.violet} />
            <LiAudience title="Country" rows={d.country} color={LI_C.green} />
          </div>
        </>
      )}

      {postInsights.byWeekday.length > 0 && (
        <>
          <div style={liSection}>WHAT WORKS · LAST {data.posts.length} POSTS</div>
          <div className="grid-2">
            <LiChart title="Engagement rate by day posted" glossaryId="engagement_rate" sub="Average per post">
              <BarChart data={postInsights.byWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={liAxis} />
                <YAxis tick={liAxis} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={liTooltip} formatter={(v, n, p) => [`${v}% (${p.payload.posts} posts)`, 'Avg engagement']} />
                <Bar dataKey="rate" fill={LI_C.amber} radius={[3, 3, 0, 0]} />
              </BarChart>
            </LiChart>
            <LiChart title="Engagement rate by post type" glossaryId="engagement_rate" sub="Average per post">
              <BarChart data={postInsights.byType}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={liAxis} />
                <YAxis tick={liAxis} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={liTooltip} formatter={(v, n, p) => [`${v}% (${p.payload.posts} posts)`, 'Avg engagement']} />
                <Bar dataKey="rate" fill={LI_C.violet} radius={[3, 3, 0, 0]} />
              </BarChart>
            </LiChart>
          </div>
        </>
      )}

      {topPosts.length > 0 && (
        <>
          <div style={liSection}>TOP POSTS</div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
              <div className="card-title">Top 10 of the last {data.posts.length} posts</div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort posts by"
                style={{ padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--card)', color: 'var(--foreground)' }}>
                <option value="impressions">Sort by impressions</option>
                <option value="engagementRate">Sort by engagement rate</option>
                <option value="clicks">Sort by clicks</option>
                <option value="likes">Sort by reactions</option>
                <option value="comments">Sort by comments</option>
              </select>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Post</th><th>Type</th>
                    <th style={{ textAlign: 'right' }}>Impressions<MetricInfo id="impressions" /></th><th style={{ textAlign: 'right' }}>Clicks<MetricInfo id="link_clicks" /></th>
                    <th style={{ textAlign: 'right' }}>Reactions<MetricInfo id="interactions" /></th><th style={{ textAlign: 'right' }}>Comments<MetricInfo id="interactions" /></th>
                    <th style={{ textAlign: 'right' }}>Reposts<MetricInfo id="interactions" /></th><th style={{ textAlign: 'right' }}>Eng. rate<MetricInfo id="engagement_rate" /></th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map(p => (
                    <tr key={p.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.date}</td>
                      <td style={{ maxWidth: 380 }}>
                        <a href={p.url} target="_blank" rel="noreferrer" style={{ ...liClamp, color: 'var(--foreground)', textDecoration: 'none' }} title={p.text}>
                          {p.text || 'View post'}
                        </a>
                      </td>
                      <td>{p.type}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{liNum(p.impressions)}</td>
                      <td style={{ textAlign: 'right' }}>{liNum(p.clicks)}</td>
                      <td style={{ textAlign: 'right' }}>{liNum(p.likes)}</td>
                      <td style={{ textAlign: 'right' }}>{liNum(p.comments)}</td>
                      <td style={{ textAlign: 'right' }}>{liNum(p.shares)}</td>
                      <td style={{ textAlign: 'right' }}>{liPct(p.engagementRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

    </>
  );
}