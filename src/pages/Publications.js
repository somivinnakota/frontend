import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';

// INFANT's verified publication list, built on the backend (publications.js).
// Scopus and PubMed searches find candidate papers; each one is then checked individually:
// it is verified only if ONE author's address on it names INFANT (with Cork / UCC / Ireland),
// and that address is shown as the evidence. Only research articles and reviews are counted.

const PAGE_SIZE = 100;
const fieldStyle = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--foreground)', background: 'var(--card)',
};
const linkStyle = { fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 };

const STATUS = {
  verified: { label: 'Verified INFANT', badge: 'badge-green' },
  other_output: { label: 'Other output (not counted)', badge: 'badge-blue' },
  needs_review: { label: 'Needs review', badge: 'badge-orange' },
  not_infant: { label: 'Not INFANT', badge: 'badge-gray' },
};
const SOURCE_NAMES = {
  scopus: 'Scopus search',
  pubmed: 'PubMed search',
  researchers: 'Scopus (INFANT researchers)',
  pubmedRecords: 'PubMed address records',
  crossref: 'Publisher records (Crossref)',
};

function downloadCsv(fileName, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map(r => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const formatDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export default function Publications() {
  const [data, setData] = useState(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('verified');
  const [accessFilter, setAccessFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback((refresh = false) => {
    setError('');
    return axios.get(`${API_BASE}/api/publications/verified${refresh ? '?refresh=1' : ''}`, { timeout: 60000 })
      .then(r => {
        if (r.status === 202 || (r.data.building && !r.data.papers)) { setBuilding(true); return; }
        setData(r.data);
        setBuilding(Boolean(r.data.building));
      })
      .catch(e => setError(errorMessage(e, 'Could not load publications. Make sure the backend is running.')));
  }, []);

  useEffect(() => { load(); }, [load]);

  // While the list is being built on the server, check back every 10 seconds.
  useEffect(() => {
    if (!building) return undefined;
    const timer = setInterval(() => load(), 10000);
    return () => clearInterval(timer);
  }, [building, load]);

  const papers = useMemo(() => data?.papers || [], [data]);
  const currentYear = new Date().getFullYear();
  const byYear = data?.byYear || {};
  const verifiedIn = y => byYear[y]?.verified || 0;

  const chartData = Object.entries(byYear)
    .filter(([y, v]) => Number(y) >= (data?.firstYear || 2013) && (v.verified || v.otherOutputs || v.needsReview))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, v]) => ({ year, 'Verified (counted)': v.verified, 'Other outputs': v.otherOutputs, 'Needs review': v.needsReview }));
  const years = [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);

  const term = search.trim().toLowerCase();
  const filtered = papers.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (yearFilter !== 'all' && String(p.year) !== yearFilter) return false;
    if (accessFilter === 'openaccess' && !p.openAccess) return false;
    if (accessFilter === 'other' && p.openAccess) return false;
    return !term || [p.title, p.authors, p.journal, p.doi, p.evidence].some(v => String(v || '').toLowerCase().includes(term));
  });

  const sourceLine = data && Object.entries(data.sources).map(([key, s]) => (
    <span key={key} style={{ color: s.ok ? 'var(--muted-foreground)' : 'var(--destructive)', marginRight: 14, whiteSpace: 'nowrap' }}>
      {s.ok ? '✅' : '⚠️'} {SOURCE_NAMES[key] || key}: {s.ok ? `${(s.found ?? 0).toLocaleString()}` : s.error}
    </span>
  ));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Research</div>
          <div className="page-title">Publications</div>
          <div className="page-sub">Verified INFANT publications · every paper checked against its author addresses</div>
        </div>
        <div className="btn-row">
          <button className="btn-secondary" onClick={() => load(true).then(() => setBuilding(true))} disabled={building}>
            {building ? 'Updating…' : 'Refresh'}
          </button>
          <button className="btn-secondary" disabled={!data} onClick={() => downloadCsv('infant-publications.csv', [
            ['Year', 'First published', 'Title', 'Journal', 'Authors', 'Type', 'Status', 'Evidence (author address naming INFANT)', 'Evidence source', 'DOI', 'PubMed ID', 'Open access'],
            ...filtered.map(p => [p.year, p.date, p.title, p.journal, p.authors, p.type, STATUS[p.status]?.label || p.status,
              p.evidence, p.evidenceSource, p.doi, p.pmid, p.openAccess ? 'Yes' : 'No']),
          ])}>
            Download list (CSV)
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="empty-state">
            <div className="empty-state-title">Publications could not be loaded</div>
            <div className="empty-state-sub">{error}</div>
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">Building the verified publication list…</div>
            <div className="empty-state-sub">
              Searching Scopus and PubMed, then checking every paper's author addresses for INFANT.
              The first time takes a few minutes; after that the last list loads instantly. The page updates by itself.
            </div>
          </div>
        </div>
      )}

      {data && (
        <>
          <div style={{ fontSize: 11, marginBottom: 14, lineHeight: 1.8 }}>
            <div style={{ color: 'var(--muted-foreground)' }}>
              Updated {new Date(data.updatedAt).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div>{sourceLine}</div>
          </div>

          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Verified publications</div>
              <div className="kpi-value">{data.totalVerified.toLocaleString()}</div>
              <div className="kpi-delta neutral">Articles and reviews since {data.firstYear}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">This year ({currentYear})</div>
              <div className="kpi-value">{verifiedIn(currentYear)}</div>
              <div className="kpi-delta neutral">Verified so far in {currentYear}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Last year ({currentYear - 1})</div>
              <div className="kpi-value">{verifiedIn(currentYear - 1)}</div>
              <div className="kpi-delta neutral">Verified in {currentYear - 1}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Needs review</div>
              <div className="kpi-value">{data.needsReview.toLocaleString()}</div>
              <div className="kpi-delta neutral">
                Addresses not available ·&nbsp;
                <button type="button" onClick={() => { setStatusFilter('needs_review'); setShown(PAGE_SIZE); }}
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                  show them
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title">Publications per year</div>
            <div className="card-sub">Verified articles and reviews (counted), plus other INFANT outputs and papers still needing review (not counted)</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Verified (counted)" stackId="p" fill="var(--accent)" maxBarSize={40} />
                <Bar dataKey="Other outputs" stackId="p" fill="#a8c3bb" maxBarSize={40} />
                <Bar dataKey="Needs review" stackId="p" fill="#e3b778" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="search" aria-label="Search publications" placeholder="Search by title, author, journal, DOI or address..."
              value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE_SIZE); }}
              style={{ ...fieldStyle, flex: 1, minWidth: 200, outline: 'none' }} />
            <select aria-label="Filter by status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setShown(PAGE_SIZE); }} style={{ ...fieldStyle, cursor: 'pointer' }}>
              <option value="verified">Verified INFANT (counted)</option>
              <option value="other_output">Other outputs (not counted)</option>
              <option value="needs_review">Needs review</option>
              <option value="not_infant">Checked: not INFANT</option>
              <option value="all">All</option>
            </select>
            <select aria-label="Filter by year" value={yearFilter} onChange={e => { setYearFilter(e.target.value); setShown(PAGE_SIZE); }} style={{ ...fieldStyle, cursor: 'pointer' }}>
              <option value="all">All years</option>
              {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
            <select aria-label="Filter by access type" value={accessFilter} onChange={e => { setAccessFilter(e.target.value); setShown(PAGE_SIZE); }} style={{ ...fieldStyle, cursor: 'pointer' }}>
              <option value="all">All access</option>
              <option value="openaccess">Open access</option>
              <option value="other">Other</option>
            </select>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>{filtered.length.toLocaleString()} results</div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {filtered.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-title">No results found</div>
                <div className="empty-state-sub">Try adjusting your search or filters.</div>
              </div>
            )}
            {filtered.slice(0, shown).map((paper, i, list) => {
              const isOpen = expanded === paper.id;
              const status = STATUS[paper.status] || { label: paper.status, badge: 'badge-gray' };
              return (
                <div key={paper.id} onClick={() => setExpanded(isOpen ? null : paper.id)}
                  style={{
                    padding: '16px 22px', borderBottom: i < list.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer',
                    background: isOpen ? 'hsl(40 27% 89% / .3)' : 'transparent', transition: 'background 0.1s',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.5, marginBottom: 4 }}>{paper.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                        {paper.journal && <span>{paper.journal}{paper.authors ? ' · ' : ''}</span>}{paper.authors}
                      </div>
                      {paper.evidence && (
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>
                          ✓ <span style={{ color: 'var(--foreground)' }}>{paper.evidence}</span> <span>({paper.evidenceSource})</span>
                        </div>
                      )}
                      {paper.status === 'needs_review' && (
                        <div style={{ fontSize: 11, color: 'hsl(32, 70%, 32%)', marginTop: 4 }}>
                          Found by an INFANT search, but its author addresses aren't available to check. Open the paper to confirm.
                        </div>
                      )}
                      {isOpen && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted-foreground)' }}>
                          {paper.doi && <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" style={linkStyle} onClick={e => e.stopPropagation()}>Full paper (DOI) →</a>}
                          {paper.pmid && <a href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`} target="_blank" rel="noreferrer" style={linkStyle} onClick={e => e.stopPropagation()}>PubMed</a>}
                          {paper.eid && <a href={`https://www.scopus.com/record/display.uri?eid=${paper.eid}&origin=resultslist`} target="_blank" rel="noreferrer" style={linkStyle} onClick={e => e.stopPropagation()}>Scopus</a>}
                          <span>{paper.type}</span>
                          <span>First published {formatDate(paper.date)}</span>
                          <span>Found by: {[paper.foundBy?.scopus && 'Scopus search', paper.foundBy?.pubmed && 'PubMed search', paper.foundBy?.researcher && 'INFANT researcher search'].filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {paper.year && <span className="badge badge-blue">{paper.year}</span>}
                      <span className={`badge ${status.badge}`}>{status.label}</span>
                      {paper.status === 'other_output' && <span className="badge badge-gray">{paper.type}</span>}
                      {paper.openAccess && <span className="badge badge-green">Open access</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {filtered.length > shown && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button className="btn-secondary" onClick={() => setShown(shown + PAGE_SIZE)}>
                Show more ({(filtered.length - shown).toLocaleString()} left)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}