import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend
} from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import { withLabels, forYear, aggregateByMonth, sumValues, compactTick } from '../utils/social';

const ELSEVIER_KEY = '4c22960291ad9b6a7a871ec1ab076640';
const COLLAB_COLORS = ['#1d4ed8', '#059669', '#7c3aed', '#d97706'];
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const sectionLabelStyle = { fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 10, fontWeight: 600, letterSpacing: '0.1em' };

/* ── Elsevier (Scopus) researcher metrics ───────────────────── */

// Combines per-researcher metrics into centre-wide totals.
// FWCI is averaged only over researchers who published in that year,
// so years with no papers don't drag the average down.
function aggregateElsevier(results) {
  const years = [...new Set(results.flatMap(r => Object.keys(r.metric?.valueByYear || {})))].sort();
  const researchers = new Map();
  const outputByAuthor = {};

  results.forEach(r => {
    const id = r.author?.id;
    if (!id) return;
    if (!researchers.has(id)) researchers.set(id, { id, name: r.author.name });
    if (r.metric?.metricType === 'ScholarlyOutput') outputByAuthor[id] = r.metric.valueByYear || {};
  });

  const scholarlyOutput = {};
  const citationCount = {};
  const fwciSum = {};
  const fwciCount = {};
  years.forEach(y => { scholarlyOutput[y] = 0; citationCount[y] = 0; fwciSum[y] = 0; fwciCount[y] = 0; });

  results.forEach(r => {
    const id = r.author?.id;
    const type = r.metric?.metricType;
    const values = r.metric?.valueByYear || {};
    years.forEach(y => {
      const value = Number(values[y]) || 0;
      if (type === 'ScholarlyOutput') scholarlyOutput[y] += value;
      if (type === 'CitationCount') citationCount[y] += value;
      if (type === 'FieldWeightedCitationImpact' && (Number(outputByAuthor[id]?.[y]) || 0) > 0) {
        fwciSum[y] += value;
        fwciCount[y] += 1;
      }
    });
  });

  const fwci = {};
  years.forEach(y => { fwci[y] = fwciCount[y] ? Number((fwciSum[y] / fwciCount[y]).toFixed(2)) : 0; });
  const fwciYears = years.filter(y => fwciCount[y] > 0);
  const avgFwci = fwciYears.length
    ? Number((fwciYears.reduce((sum, y) => sum + fwci[y], 0) / fwciYears.length).toFixed(2))
    : 0;

  const totalFor = id => Object.values(outputByAuthor[id] || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  const researcherList = [...researchers.values()].sort((a, b) => totalFor(b.id) - totalFor(a.id));

  return {
    years,
    scholarlyOutput,
    citationCount,
    fwci,
    avgFwci,
    researchers: researcherList,
    totalOutput: years.reduce((sum, y) => sum + scholarlyOutput[y], 0),
    totalCitations: years.reduce((sum, y) => sum + citationCount[y], 0),
  };
}

async function fetchElsevierMetrics(researcherIds) {
  if (!ELSEVIER_KEY || !researcherIds?.length) return null;
  // Called from the browser, as Elsevier's terms require for this key.
  const url = 'https://api.elsevier.com/metrics'
    + '?metrics=ScholarlyOutput,FieldWeightedCitationImpact,CitationCount'
    + `&authors=${researcherIds.join(',')}&yearRange=5yrs&byYear=true`
    + `&apiKey=${ELSEVIER_KEY}&httpAccept=application/json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Elsevier returned ${response.status}`);
  const data = await response.json();
  return aggregateElsevier(data.results || []);
}

/* ── Small components ───────────────────────────────────────── */

function RingChart({ score, maxScore = 5, color, label, summary }) {
  const [hovered, setHovered] = useState(false);
  const pct = (score / maxScore) * 100;
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '20px 16px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        cursor: 'default', transition: 'box-shadow 0.2s',
        boxShadow: hovered ? '0 8px 32px hsl(211 43% 17% / .12)' : '0 2px 8px hsl(211 43% 17% / .05)',
        position: 'relative', flex: 1, minWidth: 160
      }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--secondary)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -62%)', textAlign: 'center' }}>
        <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 22, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 2 }}>/ {maxScore}</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', textAlign: 'center', marginTop: 8, lineHeight: 1.3 }}>{label}</div>
      {hovered && summary && (
        <div style={{
          position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--primary)', color: 'white', borderRadius: 8,
          padding: '10px 14px', fontSize: 11, lineHeight: 1.6,
          width: 220, zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
        }}>
          {summary}
        </div>
      )}
    </div>
  );
}

function SDGCard({ sdg }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 18px',
      borderLeft: `4px solid ${sdg.color}`, flex: 1
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: sdg.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontFamily: 'DM Mono, monospace', fontSize: 14, fontWeight: 700, flexShrink: 0
        }}>{sdg.number}</div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>SDG {sdg.number}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3 }}>{sdg.title}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>{sdg.description}</div>
    </div>
  );
}

function HeadlineStat({ value, label, sublabel }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '20px 14px',
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, boxShadow: '0 2px 8px hsl(211 43% 17% / .05)'
    }}>
      <div style={{
        fontFamily: 'Newsreader, Georgia, serif',
        fontSize: 32, fontWeight: 600, color: 'var(--primary)',
        letterSpacing: '-0.02em', lineHeight: 1
      }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginTop: 8 }}>{label}</div>
      {sublabel && <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 3 }}>{sublabel}</div>}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */

export default function Overview() {
  const [impactData, setImpactData] = useState(null);
  const [impactError, setImpactError] = useState('');
  const [pubCount, setPubCount] = useState(null);
  const [pubByYear, setPubByYear] = useState(null); // verified INFANT papers per year, each counted once
  const [narrative, setNarrative] = useState('');
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [infantMetrics, setInfantMetrics] = useState(null);
  const [fbStats, setFbStats] = useState(null);
  const [ebData, setEbData] = useState(null);
  const [social, setSocial] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/publications/count`).then(r => { setPubCount(r.data.total); setPubByYear(r.data.byYear || null); }).catch(() => {});
    axios.get(`${API_BASE}/api/facebook`).then(r => setFbStats(r.data)).catch(() => {});
    axios.get(`${API_BASE}/api/eventbrite`).then(r => setEbData(r.data)).catch(() => {});
    axios.get(`${API_BASE}/api/social-data`).then(r => setSocial(r.data)).catch(() => {});

    // One request for impact data, then the Elsevier metrics that depend on it.
    axios.get(`${API_BASE}/api/impact-data`)
      .then(r => {
        setImpactData(r.data);
        return fetchElsevierMetrics(r.data.researcherIds);
      })
      .then(metrics => { if (metrics) setInfantMetrics(metrics); })
      .catch(error => {
        if (error.response || error.request) {
          setImpactError(errorMessage(error, 'Could not load impact data. Make sure the backend is running.'));
        } else {
          console.warn('Elsevier metrics unavailable:', error.message);
        }
      });
  }, []);

  const generateNarrative = async () => {
    setLoadingNarrative(true);
    setNarrative('');
    try {
      const r = await axios.post(`${API_BASE}/api/impact-narrative`, {});
      setNarrative(r.data.narrative);
    } catch (e) {
      setNarrative(errorMessage(e, 'Unable to generate narrative. Check the backend is running.'));
    }
    setLoadingNarrative(false);
  };

  if (impactError) return (
    <div className="page">
      <div style={{ color: 'var(--destructive)', fontSize: 13 }}>{impactError}</div>
    </div>
  );

  if (!impactData) return (
    <div className="page">
      <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Loading impact data...</div>
    </div>
  );

  const impactScoreData = [
    { label: 'Commercialisation', score: impactData.impactScores.commercialisation, color: '#1d4ed8', summary: impactData.impactSummaries.commercialisation },
    { label: 'Scholarly Outputs', score: impactData.impactScores.scholarlyOutputs, color: '#059669', summary: impactData.impactSummaries.scholarlyOutputs },
    { label: 'Policy & Influence', score: impactData.impactScores.policyAndInfluence, color: '#7c3aed', summary: impactData.impactSummaries.policyAndInfluence },
    { label: 'Lives Changed', score: impactData.impactScores.livesChanged, color: '#dc2626', summary: impactData.impactSummaries.livesChanged },
    { label: 'Sustainability', score: impactData.impactScores.sustainabilityAndDevelopment, color: '#d97706', summary: impactData.impactSummaries.sustainabilityAndDevelopment },
  ];

  const rm = impactData.researchMetrics;
  const collabData = rm ? [
    { type: 'International', percentage: rm.internationalCollaboration.percentage, papers: rm.internationalCollaboration.papers, fwci: rm.internationalCollaboration.fieldWeightedCitationImpact },
    { type: 'National only', percentage: rm.nationalCollaboration.percentage, papers: rm.nationalCollaboration.papers, fwci: rm.nationalCollaboration.fieldWeightedCitationImpact },
    { type: 'Institutional only', percentage: rm.institutionalCollaboration.percentage, papers: rm.institutionalCollaboration.papers, fwci: rm.institutionalCollaboration.fieldWeightedCitationImpact },
    { type: 'Single authorship', percentage: rm.singleAuthorship.percentage, papers: rm.singleAuthorship.papers, fwci: rm.singleAuthorship.fieldWeightedCitationImpact },
  ] : [];

  // Social reach for the latest year in the CSV data
  const socialYear = social?.latestDate ? Number(social.latestDate.slice(0, 4)) : new Date().getFullYear();
  const igReach = withLabels(forYear(social?.series?.['ig-reach'], socialYear));
  const fbViews = withLabels(forYear(social?.series?.['fb-views'], socialYear));
  const igMonthly = aggregateByMonth(igReach);
  const fbMonthly = aggregateByMonth(fbViews);
  const monthKeys = [...new Set([...igMonthly, ...fbMonthly].map(d => d.monthKey))].sort();
  const combinedChart = monthKeys.map(key => {
    const ig = igMonthly.find(d => d.monthKey === key);
    const fb = fbMonthly.find(d => d.monthKey === key);
    return { month: (ig || fb).month, Instagram: ig?.value || 0, Facebook: fb?.value || 0 };
  });

  const researcherCount = infantMetrics?.researchers.length || 0;
  const firstYear = infantMetrics?.years[0];
  const lastYear = infantMetrics?.years[infantMetrics.years.length - 1];
  // Publications and citations over the same years, from the verified list: each INFANT paper once.
  // (Elsevier's per-researcher figures count a paper once per INFANT co-author, and include papers
  // researchers wrote without an INFANT address, so they're not added up for these totals.)
  const verifiedYears = (infantMetrics?.years || []).map(year => ({ year, ...(pubByYear?.[year] || { publications: 0, citations: 0, withCitationCount: 0 }) }));
  const verifiedPublications = verifiedYears.reduce((sum, y) => sum + y.publications, 0);
  const verifiedCitations = verifiedYears.reduce((sum, y) => sum + y.citations, 0);
  const papersWithCitations = verifiedYears.reduce((sum, y) => sum + y.withCitationCount, 0);

  return (
    <div className="page">

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Workspace</div>
          <div className="page-title">Research impact</div>
          <div className="page-sub">
            INFANT Research Centre · University College Cork · Impact scores use the {impactData.assessedBy} · Updated {impactData.lastUpdated}
          </div>
        </div>
        <button className="btn-primary" onClick={generateNarrative} disabled={loadingNarrative}>
          {loadingNarrative ? 'Generating...' : 'Generate impact narrative'}
        </button>
      </div>

      {/* AI Narrative banner */}
      <div className="ai-banner" style={{ marginBottom: 24 }}>
        <div className="ai-banner-left">
          <div className="ai-banner-eyebrow">AI impact narrative · generated from live data</div>
          {narrative ? (
            <div className="ai-banner-headline">{narrative}</div>
          ) : (
            <div className="ai-banner-empty">
              Click "Generate impact narrative" to produce an AI-written summary of INFANT's research impact across all five categories.
            </div>
          )}
        </div>
      </div>

      {/* Headline stats */}
      <div style={sectionLabelStyle}>HEADLINE IMPACT</div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <HeadlineStat value={impactData.headlines.infantsImpacted} label="Infants impacted globally" sublabel="Across all research programmes" />
        <HeadlineStat value={impactData.headlines.fundingSecured} label="Research funding secured" sublabel="Enterprise Ireland, EU & international" />
        <HeadlineStat value={impactData.headlines.teamMembers} label="Team members" sublabel="Researchers, clinicians and staff" />
        <HeadlineStat value={impactData.headlines.spinouts} label="Spin-out companies" sublabel="Commercial ventures from research" />
        <HeadlineStat value={`${impactData.headlines.partnershipCountries}`} label="Countries" sublabel={`${impactData.headlines.partnerships}+ active partnerships`} />
      </div>

      {/* Impact scores */}
      <div style={sectionLabelStyle}>IMPACT SCORES — UNSW SCIENCE FRAMEWORK · HOVER FOR DETAIL</div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        {impactScoreData.map(item => (
          <RingChart key={item.label} score={item.score} color={item.color} label={item.label} summary={item.summary} />
        ))}
      </div>

      {/* SDGs */}
      <div style={sectionLabelStyle}>UN SUSTAINABLE DEVELOPMENT GOALS</div>
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        {impactData.sdgs.map(sdg => <SDGCard key={sdg.number} sdg={sdg} />)}
      </div>

      {/* Societal themes */}
      <div style={sectionLabelStyle}>SOCIETAL CHALLENGE THEMES</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {impactData.societalThemes.map(theme => (
          <div key={theme} style={{
            background: 'var(--primary)', color: 'var(--primary-foreground)',
            borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 500
          }}>
            {theme}
          </div>
        ))}
      </div>

      {/* SciVal collaboration (entered by hand from SciVal) */}
      {collabData.length > 0 && (
        <>
          <div style={sectionLabelStyle}>
            RESEARCH COLLABORATION — SCIVAL · SCOPUS · {rm.lastUpdated.toUpperCase()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '-6px 0 12px' }}>
            Entered from SciVal. Covers everything INFANT's researchers published, including work without an INFANT
            address and letters or editorials, so it is higher than the verified INFANT publication count
            {pubCount !== null ? ` (${pubCount.toLocaleString()})` : ''}.
          </div>

          <div className="kpi-row" style={{ marginBottom: 16 }}>
            <div className="kpi-card">
              <div className="kpi-label">Scholarly output (SciVal)</div>
              <div className="kpi-value">{rm.totalScholarlyOutput.toLocaleString()}</div>
              <div className="kpi-delta neutral">All papers by INFANT's SciVal researcher group</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Citations (SciVal)</div>
              <div className="kpi-value">{rm.totalCitations.toLocaleString()}</div>
              <div className="kpi-delta neutral">Of those papers</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">International FWCI</div>
              <div className="kpi-value">{rm.internationalCollaboration.fieldWeightedCitationImpact}</div>
              <div className="kpi-delta up">▲ {rm.internationalCollaboration.fieldWeightedCitationImpact}x world average</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">International collaboration</div>
              <div className="kpi-value">{rm.internationalCollaboration.percentage}%</div>
              <div className="kpi-delta neutral">of all publications</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="card-title">Collaboration breakdown</div>
              <div className="card-sub">Publication share by collaboration type · Scopus</div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={collabData} dataKey="percentage" nameKey="type"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {collabData.map((entry, index) => (
                      <Cell key={entry.type} fill={COLLAB_COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [`${value}%`, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
                {collabData.map((item, i) => (
                  <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted-foreground)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLLAB_COLORS[i], flexShrink: 0 }} />
                    {item.type} ({item.percentage}%)
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Field-Weighted Citation Impact by collaboration type</div>
              <div className="card-sub">FWCI above 1.0 = above world average · Scopus</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={collabData} layout="vertical" margin={{ left: 0, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} domain={[0, 3]} />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={120} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [v, 'FWCI']} />
                  <Bar dataKey="fwci" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {collabData.map((entry, index) => (
                      <Cell key={entry.type} fill={COLLAB_COLORS[index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                World average FWCI = 1.0 · INFANT's international papers score {collabData[0].fwci}x world average
              </div>
            </div>
          </div>

          {/* Academic-corporate highlight banner */}
          <div style={{ background: 'var(--primary)', borderRadius: 12, padding: '18px 22px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 6 }}>
                ACADEMIC-CORPORATE COLLABORATION IMPACT
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
                INFANT's {rm.academicCorporateCollaboration.percentage}% academic-corporate collaborative papers achieve a Field-Weighted Citation Impact of{' '}
                <strong style={{ color: 'hsl(43,81%,63%)' }}>{rm.academicCorporateCollaboration.fieldWeightedCitationImpact}</strong> — with an average of{' '}
                <strong style={{ color: 'hsl(43,81%,63%)' }}>{rm.academicCorporateCollaboration.citationsPerPaper} citations per paper</strong>,
                demonstrating the outsized impact of industry collaboration on research quality.
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>citations per paper</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 38, fontWeight: 600, color: 'white', lineHeight: 1, letterSpacing: '-0.03em' }}>
                {rm.academicCorporateCollaboration.citationsPerPaper}
              </div>
            </div>
          </div>
        </>
      )}

      {/* INFANT-specific live research metrics */}
      {infantMetrics && (
        <>
          <div style={sectionLabelStyle}>
            INFANT RESEARCHER METRICS — LIVE FROM ELSEVIER · {researcherCount} RESEARCHERS · {firstYear}–{lastYear}
          </div>

          <div className="kpi-row" style={{ marginBottom: 16 }}>
            <div className="kpi-card">
              <div className="kpi-label">Publications ({firstYear}–{lastYear})</div>
              <div className="kpi-value">{pubByYear ? verifiedPublications.toLocaleString() : '—'}</div>
              <div className="kpi-delta neutral"><span className="status-dot live"></span>Verified INFANT papers · each counted once</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Citations ({firstYear}–{lastYear} papers)</div>
              <div className="kpi-value">{pubByYear && papersWithCitations ? verifiedCitations.toLocaleString() : '—'}</div>
              <div className="kpi-delta neutral">
                {papersWithCitations
                  ? `Scopus citations of ${papersWithCitations.toLocaleString()} of these ${verifiedPublications.toLocaleString()} papers`
                  : 'Shown after the next publication list update'}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Avg FWCI per researcher</div>
              <div className="kpi-value">{infantMetrics.avgFwci}</div>
              <div className="kpi-delta neutral">Simple average · world average = 1.0</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Researchers tracked</div>
              <div className="kpi-value">{researcherCount}</div>
              <div className="kpi-delta neutral">On Scopus</div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="card">
              <div className="card-title">INFANT publications by year</div>
              <div className="card-sub">Verified INFANT papers (articles and reviews) · Scopus + PubMed · each paper counted once</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={verifiedYears} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={35} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [v, 'Publications']} />
                  <Bar dataKey="publications" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                Same list as the Publications page: a paper is counted once, however many INFANT authors it has.
              </div>
            </div>

            <div className="card">
              <div className="card-title">Average FWCI by year</div>
              <div className="card-sub">
                Field-Weighted Citation Impact · above 1.0 = above world average ·{' '}
                <a href="https://www.scival.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                  Powered by SciVal ↗
                </a>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={infantMetrics.years.map(year => ({ year, fwci: infantMetrics.fwci[year] }))} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={35} domain={[0, 4]} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [v, 'FWCI']} />
                  <Bar dataKey="fwci" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 8, fontSize: 10, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                World average FWCI = 1.0 · averaged across researchers who published in each year
              </div>
            </div>
          </div>
        </>
      )}

      {/* INFANT researcher list */}
      {researcherCount > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">INFANT researchers on Scopus</div>
          <div className="card-sub">{researcherCount} researchers · publication output {firstYear}–{lastYear} · Live from Elsevier</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 4 }}>
            {infantMetrics.researchers.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', background: 'var(--secondary)', borderRadius: 6, fontSize: 12
              }}>
                <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>{r.name}</span>
                <a href={`https://www.scopus.com/authid/detail.url?authorId=${r.id}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', marginLeft: 8, flexShrink: 0 }}>
                  Scopus ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Communications reach */}
      <div style={sectionLabelStyle}>COMMUNICATIONS REACH — {socialYear}</div>
      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Combined reach by platform</div>
          <div className="card-sub">Instagram reach · Facebook views · monthly {socialYear}</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={combinedChart} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={35} tickFormatter={compactTick} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Instagram" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Facebook" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Instagram reach trend</div>
          <div className="card-sub">Daily reach added up by month · {socialYear}</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={igMonthly} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={35} tickFormatter={compactTick} />
              <Tooltip contentStyle={tooltipStyle} formatter={v => [v.toLocaleString(), 'Reach']} />
              <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data sources toggle */}
      <div style={{ marginBottom: 24 }}>
        <button className="btn-secondary" onClick={() => setShowSources(!showSources)} style={{ fontSize: 12 }}>
          {showSources ? 'Hide data sources' : 'Show data sources'}
        </button>
        {showSources && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title">Data sources</div>
            <div className="card-sub">Connection status and current values across all platforms</div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Source</th><th>Metric</th><th>Status</th><th>Value</th></tr>
                </thead>
                <tbody>
                  <tr><td>Scopus + PubMed</td><td>Verified INFANT publications</td><td><span className="badge badge-green">Live</span></td><td>{pubCount !== null ? pubCount.toLocaleString() : '—'}</td></tr>
                  <tr><td>Eventbrite</td><td>Total events</td><td><span className="badge badge-green">Live</span></td><td>{ebData ? ebData.total.toLocaleString() : '—'}</td></tr>
                  <tr><td>Facebook</td><td>Followers</td><td><span className="badge badge-green">Live</span></td><td>{fbStats?.followers_count != null ? fbStats.followers_count.toLocaleString() : '—'}</td></tr>
                  <tr>
                    <td>Elsevier / Scopus</td><td>Researcher metrics</td>
                    <td>{infantMetrics
                      ? <span className="badge badge-green">Live</span>
                      : <span className="badge badge-orange">{ELSEVIER_KEY ? 'Not responding' : 'Key not set'}</span>}
                    </td>
                    <td>{infantMetrics ? `${researcherCount} researchers` : '—'}</td>
                  </tr>
                  <tr><td>Instagram</td><td>Daily reach added up ({socialYear})</td><td><span className="badge badge-blue">CSV</span></td><td>{igReach.length ? sumValues(igReach).toLocaleString() : '—'}</td></tr>
                  <tr><td>UNSW framework</td><td>Impact scores</td><td><span className="badge badge-blue">Manual · {impactData.lastUpdated}</span></td><td>5 categories scored</td></tr>
                  <tr><td>SciVal</td><td>Collaboration metrics</td><td><span className="badge badge-blue">Manual · {rm?.lastUpdated || '—'}</span></td><td>{collabData.length > 0 ? 'Available' : '—'}</td></tr>
                  <tr><td>LinkedIn</td><td>All metrics</td><td><span className="badge badge-orange">Pending API</span></td><td>—</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}