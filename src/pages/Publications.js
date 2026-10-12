import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';

const PUBMED_SEARCH_URL = 'https://pubmed.ncbi.nlm.nih.gov/?term=%22INFANT+research+centre%22%5BAffiliation%5D&sort=date';
const fieldStyle = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--foreground)', background: 'var(--card)',
};

export default function Publications() {
  const [papers, setPapers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/api/publications?size=200`)
      .then(r => {
        setPapers(r.data.publications || []);
        setTotal(r.data.total || 0);
      })
      .catch(e => setError(errorMessage(e, 'Could not load publications. Make sure the backend is running.')))
      .finally(() => setLoading(false));
  }, []);

  const yearCounts = useMemo(() => {
    const counts = {};
    papers.forEach(p => {
      if (p.year && p.year !== '—') counts[p.year] = (counts[p.year] || 0) + 1;
    });
    return counts;
  }, [papers]);

  const yearChartData = Object.entries(yearCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, count]) => ({ year, count }));

  const years = Object.keys(yearCounts).sort().reverse();
  const currentYear = new Date().getFullYear();
  const oldestLoadedYear = yearChartData[0]?.year;

  const term = search.trim().toLowerCase();
  const filtered = papers.filter(p => {
    const matchSearch = !term ||
      p.title.toLowerCase().includes(term) ||
      p.authors.toLowerCase().includes(term) ||
      p.journal.toLowerCase().includes(term);
    const matchYear = yearFilter === 'all' || p.year === yearFilter;
    const matchType = typeFilter === 'all' ||
      (typeFilter === 'openaccess' && p.isOpenAccess) ||
      (typeFilter === 'other' && !p.isOpenAccess);
    return matchSearch && matchYear && matchType;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Research</div>
          <div className="page-title">Publications</div>
          <div className="page-sub">PubMed · INFANT Research Centre · Live data</div>
        </div>
        <div className="btn-row">
          <a href={PUBMED_SEARCH_URL} target="_blank" rel="noreferrer" className="btn-secondary">
            View on PubMed
          </a>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">Total publications</div>
          <div className="kpi-value">{total.toLocaleString()}</div>
          <div className="kpi-delta neutral"><span className="status-dot live"></span>Live from PubMed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Loaded for browsing</div>
          <div className="kpi-value">{papers.length}</div>
          <div className="kpi-delta neutral">Most recent {papers.length}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">This year ({currentYear})</div>
          <div className="kpi-value">{yearCounts[String(currentYear)] || 0}</div>
          <div className="kpi-delta neutral">Publications in {currentYear}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Last year ({currentYear - 1})</div>
          <div className="kpi-value">{yearCounts[String(currentYear - 1)] || 0}</div>
          <div className="kpi-delta neutral">Publications in {currentYear - 1}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-title">Publications per year</div>
        <div className="card-sub">
          Based on the {papers.length} most recent publications
          {oldestLoadedYear && papers.length < total ? ` · ${oldestLoadedYear} may be incomplete` : ''}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={yearChartData} margin={{ left: 0, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }}
              formatter={v => [v, 'Publications']} />
            <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          aria-label="Search publications"
          placeholder="Search by title, author or journal..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...fieldStyle, flex: 1, minWidth: 200, outline: 'none' }}
        />
        <select aria-label="Filter by year" value={yearFilter} onChange={e => setYearFilter(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
          <option value="all">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select aria-label="Filter by access type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...fieldStyle, cursor: 'pointer' }}>
          <option value="all">All types</option>
          <option value="openaccess">Open access (PubMed Central)</option>
          <option value="other">Other</option>
        </select>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          {filtered.length} results
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">Loading publications from PubMed...</div>
            <div className="empty-state-sub">Fetching the most recent INFANT Research Centre publications.</div>
          </div>
        </div>
      ) : error ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-title">Publications could not be loaded</div>
            <div className="empty-state-sub">{error}</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-title">No results found</div>
              <div className="empty-state-sub">Try adjusting your search or filters.</div>
            </div>
          )}
          {filtered.map((paper, i) => {
            const isOpen = expanded === paper.pmid;
            const authors = paper.authors ? paper.authors.split(',').map(a => a.trim()) : [];
            return (
              <div key={paper.pmid}
                onClick={() => setExpanded(isOpen ? null : paper.pmid)}
                style={{
                  padding: '16px 22px',
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                  background: isOpen ? 'hsl(40 27% 89% / .3)' : 'transparent',
                  transition: 'background 0.1s'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.5, marginBottom: 4 }}>
                      {paper.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                      {paper.journal && <span>{paper.journal} · </span>}
                      {authors.slice(0, 3).join(', ')}
                      {authors.length > 3 ? ' et al.' : ''}
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                        <a href={paper.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}
                          onClick={e => e.stopPropagation()}>
                          View on PubMed →
                        </a>
                        {paper.doi && (
                          <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"
                            style={{ fontSize: 11, color: 'var(--muted-foreground)', textDecoration: 'none' }}
                            onClick={e => e.stopPropagation()}>
                            Full paper (DOI)
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="badge badge-blue">{paper.year}</span>
                    {paper.isOpenAccess && <span className="badge badge-green">Open access</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}