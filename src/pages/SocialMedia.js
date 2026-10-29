import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import SocialUpload from '../components/SocialUpload';
import PlatformPanel from '../components/PlatformPanel';
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
];
const FACEBOOK_CHARTS = [
  ['fb-views', 'Views', 'Monthly content views', '#53266a'],
  ['fb-visits', 'Page visits', 'Monthly page visits', '#059669'],
  ['fb-interactions', 'Interactions', 'Likes, comments and shares', '#7c3aed'],
  ['fb-clicks', 'Link clicks', 'Clicks on page links', '#dc2626'],
];

// The glossary entry (eye-icon tooltip) for each series' card.
const GLOSSARY_IDS = {
  'ig-reach': 'reach', 'ig-views': 'views', 'ig-interactions': 'interactions', 'ig-visits': 'profile_visits',
  'ig-follows': 'follower_growth', 'ig-clicks': 'link_clicks',
  'fb-views': 'views', 'fb-visits': 'profile_visits', 'fb-interactions': 'interactions', 'fb-clicks': 'link_clicks',
};

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
          : <span className="kpi-delta neutral">No {prevYear} data</span>}
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
  const [social, setSocial] = useState(null);
  const [error, setError] = useState('');

  const loadSocial = useCallback(() => {
    axios.get(`${API_BASE}/api/social-data`)
      .then(r => { setSocial(r.data); setError(''); })
      .catch(e => setError(errorMessage(e, 'Could not load social media data. Make sure the backend is running.')));
  }, []);

  useEffect(() => {
    axios.get(`${API_BASE}/api/facebook`).then(r => setFbStats(r.data)).catch(() => {});
    loadSocial();
  }, [loadSocial]);

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
      if (!/^(ig|fb)-/.test(name)) continue;
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
    const toDate = name => {
      const { current, previous } = sameDaysLastYear(name);
      return { current: sumValues(current), previous: sumValues(previous) };
    };
    const peakToDate = name => {
      const { current, previous } = sameDaysLastYear(name);
      return { current: peakValue(current), previous: peakValue(previous) };
    };
    return { year, prevYear, series, toDate, peakToDate, latest };
  }, [social]);

  const engagementRate = fbStats?.followers_count > 0
    ? `${((fbStats.talking_about_count / fbStats.followers_count) * 100).toFixed(2)}%`
    : '—';

  const comparisonNote = platform => {
    const latest = prepared?.latest[platform];
    return prepared && (
      <div className="info-note">
        {latest
          ? <><strong>Data up to {formatDayMonth(latest)} {latest.slice(0, 4)}.</strong> </>
          : null}
        Each figure compares 1 Jan {prepared.year} up to its latest uploaded day with the same days in {prepared.prevYear}, for a fair like-for-like comparison.
      </div>
    );
  };

  const cards = list => list.map(([name, label]) => {
    const totals = prepared.toDate(name);
    return <CompareCard key={name} label={label} current={totals.current} previous={totals.previous} prevYear={prepared.prevYear} glossaryId={GLOSSARY_IDS[name]} />;
  });

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
        <div className="btn-row">
          <button className={`btn-secondary${view === 'compare' ? ' active-toggle' : ''}`} onClick={() => setView('compare')}>
            {prepared ? `${prepared.year} vs ${prepared.prevYear}` : 'Compare'}
          </button>
          <button className={`btn-secondary${view === 'monthly' ? ' active-toggle' : ''}`} onClick={() => setView('monthly')}>Monthly</button>
          <button className={`btn-secondary${view === 'daily' ? ' active-toggle' : ''}`} onClick={() => setView('daily')}>Daily</button>
        </div>
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
      {!error && !social && (
        <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>Loading social media data...</div>
      )}
      {social && !prepared && activeTab !== 'linkedin' && (
        <div style={{ color: 'var(--muted-foreground)', fontSize: 13, padding: '20px 0' }}>
          No social media data yet. Click "Upload analytics files" below and add the Meta Business Suite exports.
        </div>
      )}

      {prepared && activeTab === 'instagram' && (
        <>
          {comparisonNote('instagram')}
          <div className="kpi-row">{cards(INSTAGRAM_CARDS.slice(0, 4))}</div>
          <div className="kpi-row">
            {cards(INSTAGRAM_CARDS.slice(4))}
            {['ig-reach', 'ig-views'].map(name => {
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
          {comparisonNote('facebook')}
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Followers (live)</div>
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
          <div className="kpi-row">{cards(FACEBOOK_CARDS)}</div>
          <ChartGrid charts={FACEBOOK_CHARTS} series={prepared.series} year={prepared.year} prevYear={prepared.prevYear} view={view} />
        </>
      )}

            {social && activeTab === 'linkedin' && (
        <PlatformPanel code="li" name="LinkedIn" social={social} view={view} />
      )}

      {activeTab === 'mailchimp' && <MailchimpPanel />}

      <div style={{ marginTop: 24 }}>
        <SocialUpload onUploaded={loadSocial} startOpen={Boolean(social && !social.latestDate)} />
      </div>
    </div>
  );
}