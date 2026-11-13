import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';

// INFANT's verified publication list, built on the backend (publications.js).
// Scopus and PubMed searches find candidate papers; each one is then checked individually:
// it is verified only if ONE author's address on it names INFANT (with Cork / UCC / Ireland),
// and that address is shown as the evidence. Only research articles and reviews are counted.
// A paper by a listed researcher (the roster in the backend's impact-data.json) is also verified when
// that researcher's own address on it names UCC, CUMH or INFANT. Their other papers are listed as
// "listed researcher's paper" and can be dragged into the counted collection by hand.

const PAGE_SIZE = 100;
const POOL_PAGE = 50;
const fieldStyle = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 13, fontFamily: 'DM Sans, sans-serif', color: 'var(--foreground)', background: 'var(--card)',
};
const linkStyle = { fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 };

// For searching: lower case, without accents, so "calderon" finds "Calderón".
const plain = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// A paper matches when every word typed appears somewhere in it, in any order
// ("juan trujillo" and "trujillo juan" both work). Searches every author, not just the ones shown.
const searchText = p => plain([p.title, p.authors, ...(p.authorNames || []), p.journal, p.doi, p.evidence].join(' '));
const matches = (p, words) => words.every(w => searchText(p).includes(w));

// The author a search found, when they aren't among the first three names shown.
function matchedAuthor(p, words) {
  if (!words.length) return null;
  const name = (p.authorNames || []).find(n => words.every(w => plain(n).includes(w)));
  return name && !plain(p.authors).includes(plain(name)) ? name : null;
}

const STATUS = {
  verified: { label: 'Verified INFANT', badge: 'badge-green' },
  other_output: { label: 'Other output (not counted)', badge: 'badge-blue' },
  needs_review: { label: 'Needs review', badge: 'badge-orange' },
  investigator: { label: "Listed researcher's paper", badge: 'badge-orange' },
  not_infant: { label: 'Not INFANT', badge: 'badge-gray' },
};
// The status filter: the collection is everything counted; the rest are the paper's own status.
const inFilter = (p, filter) => {
  if (filter === 'all') return true;
  if (filter === 'collection') return p.counted;
  if (filter === 'added' || filter === 'removed') return p.collection === filter;
  return p.status === filter;
};
const SOURCE_NAMES = {
  scopus: 'Scopus search',
  pubmed: 'PubMed search',
  researchers: 'Scopus (listed researchers)',
  researchersPubmed: 'PubMed (listed researchers without a Scopus ID)',
  openalex: 'OpenAlex address records',
  pubmedRecords: 'PubMed address records',
  crossref: 'Publisher records (Crossref)',
};

function downloadCsv(fileName, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map(r => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const paneTitleStyle = { fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 };
const paneSubStyle = { fontSize: 11, fontWeight: 400, color: 'var(--muted-foreground)', marginTop: 2 };
const textButtonStyle = { background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' };
const dropStyle = active => (active ? { outline: '2px dashed var(--accent)', outlineOffset: 2 } : {});

const formatDate = iso => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

// One paper in a list. It can be dragged between the two lists, and has a button that does the same.
function PaperRow({ paper, words, isOpen, onToggle, onAdd, onRemove, saving, last, names }) {
  // A paper added to the collection shows as counted, not as "Needs review" or "Other output".
  const status = paper.collection === 'added'
    ? { label: 'Counted', badge: 'badge-green' }
    : STATUS[paper.status] || { label: paper.status, badge: 'badge-gray' };
  const researchers = (paper.investigators || []).map(id => names[id]).filter(Boolean);
  const stop = fn => e => { e.stopPropagation(); fn(paper); };
  return (
    <div onClick={onToggle} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', paper.key); e.dataTransfer.effectAllowed = 'move'; }}
      style={{
        padding: '16px 22px', borderBottom: last ? 'none' : '1px solid var(--border)', cursor: 'pointer',
        background: isOpen ? 'hsl(40 27% 89% / .3)' : 'transparent', transition: 'background 0.1s', opacity: saving ? 0.5 : 1,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)', lineHeight: 1.5, marginBottom: 4 }}>{paper.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
            {paper.journal && <span>{paper.journal}{paper.authors ? ' · ' : ''}</span>}{paper.authors}
            {matchedAuthor(paper, words) && <span style={{ fontStyle: 'normal' }}> · includes {matchedAuthor(paper, words)}</span>}
          </div>
          {paper.evidence && (
            <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>
              ✓ <span style={{ color: 'var(--foreground)' }}>{paper.evidence}</span>{' '}
              <span>({paper.evidenceAuthor ? `${paper.evidenceAuthor}'s address, ` : ''}{paper.evidenceSource})</span>
            </div>
          )}
          {paper.status === 'needs_review' && (
            <div style={{ fontSize: 11, color: 'hsl(32, 70%, 32%)', marginTop: 4 }}>
              Found by an INFANT search, but its author addresses aren't available to check. Open the paper to confirm.
            </div>
          )}
          {paper.status === 'investigator' && (
            <div style={{ fontSize: 11, color: 'hsl(32, 70%, 32%)', marginTop: 4 }}>
              By {researchers.join(', ') || 'a listed researcher'}, but their own address on this paper doesn't name INFANT, UCC or CUMH (or couldn't be read).
            </div>
          )}
          {isOpen && (
            <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted-foreground)' }}>
              {paper.doi && <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" style={linkStyle} onClick={e => e.stopPropagation()}>Full paper (DOI) →</a>}
              {paper.pmid && <a href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`} target="_blank" rel="noreferrer" style={linkStyle} onClick={e => e.stopPropagation()}>PubMed</a>}
              {paper.eid && <a href={`https://www.scopus.com/record/display.uri?eid=${paper.eid}&origin=resultslist`} target="_blank" rel="noreferrer" style={linkStyle} onClick={e => e.stopPropagation()}>Scopus</a>}
              <span>{paper.type}</span>
              <span>First published {formatDate(paper.date)}</span>
              <span>Found by: {[paper.foundBy?.scopus && 'Scopus search', paper.foundBy?.pubmed && 'PubMed search', paper.foundBy?.researcher && 'listed researcher search'].filter(Boolean).join(', ')}</span>
              {researchers.length > 0 && <span>Listed researchers: {researchers.join(', ')}</span>}
              {paper.counted && <button type="button" style={textButtonStyle} disabled={saving} onClick={stop(onRemove)}>Remove from collection</button>}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {paper.year && <span className="badge badge-blue">{paper.year}</span>}
          <span className={`badge ${status.badge}`}>{status.label}</span>
          {paper.collection === 'removed' && <span className="badge badge-gray">Removed by hand</span>}
          {paper.status === 'other_output' && <span className="badge badge-gray">{paper.type}</span>}
          {paper.openAccess && <span className="badge badge-green">Open access</span>}
          {!paper.counted && <button type="button" style={textButtonStyle} disabled={saving} onClick={stop(onAdd)}>Add to collection</button>}
        </div>
      </div>
    </div>
  );
}

export default function Publications() {
  const [data, setData] = useState(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('collection');
  // Which listed researcher's papers to show. The Overview page links here with ?investigator=<id>.
  const [investigatorFilter, setInvestigatorFilter] = useState(() => new URLSearchParams(window.location.search).get('investigator') || 'all');
  const [organise, setOrganise] = useState(() => new URLSearchParams(window.location.search).has('investigator'));
  const [poolShown, setPoolShown] = useState(POOL_PAGE);
  const [dragOver, setDragOver] = useState(null);
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState('');
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
  const verifiedIn = y => byYear[y]?.counted ?? byYear[y]?.verified ?? 0;
  const totalCounted = data?.totalCounted ?? data?.totalVerified ?? 0;
  const investigators = useMemo(() => data?.investigators || [], [data]);
  const investigatorNames = useMemo(() => Object.fromEntries(investigators.map(i => [i.id, i.name || `Scopus ${i.scopusIds?.[0]}`])), [investigators]);

  // Add a paper to the counted collection, take one out, or undo an earlier decision. Saved on the server.
  const setCollection = useCallback((paper, action) => {
    setSaveError('');
    setSaving(paper.key);
    return axios.put(`${API_BASE}/api/publications/collection`, { key: paper.key, action })
      .then(r => setData(current => ({
        ...current,
        papers: current.papers.map(p => (p.key === paper.key ? r.data.paper : p)),
        byYear: r.data.byYear, totalCounted: r.data.totalCounted, manuallyAdded: r.data.manuallyAdded, manuallyRemoved: r.data.manuallyRemoved,
        // The cards and chart move with the paper: out of "needs review" or "other outputs", into the count.
        needsReview: r.data.needsReview ?? current.needsReview,
        otherOutputs: r.data.otherOutputs ?? current.otherOutputs,
      })))
      .catch(e => setSaveError(errorMessage(e, 'The change could not be saved.')))
      .finally(() => setSaving(null));
  }, []);
  // A paper removed by hand goes back with "undo" (null); anything else is added by hand.
  const addToCollection = paper => { if (!paper.counted) setCollection(paper, paper.collection === 'removed' ? null : 'include'); };
  const removeFromCollection = paper => { if (paper.counted) setCollection(paper, paper.collection === 'added' ? null : 'exclude'); };
  const dropZone = zone => ({
    onDragOver: e => { e.preventDefault(); setDragOver(zone); },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); },
    onDrop: e => {
      e.preventDefault();
      setDragOver(null);
      const paper = papers.find(p => p.key === e.dataTransfer.getData('text/plain'));
      if (paper) (zone === 'collection' ? addToCollection : removeFromCollection)(paper);
    },
  });

  const chartData = Object.entries(byYear)
    .filter(([y, v]) => Number(y) >= (data?.firstYear || 2013) && (v.counted || v.verified || v.otherOutputs || v.needsReview))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, v]) => ({ year, 'Counted': v.counted ?? v.verified, 'Other outputs': v.otherOutputs, 'Needs review': v.needsReview }));
  const years = [...new Set(papers.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);

  const words = plain(search).split(/\s+/).filter(Boolean);
  const otherFilters = p => {
    if (investigatorFilter !== 'all' && !p.investigators?.includes(investigatorFilter)) return false;
    if (yearFilter !== 'all' && String(p.year) !== yearFilter) return false;
    if (accessFilter === 'openaccess' && !p.openAccess) return false;
    if (accessFilter === 'other' && p.openAccess) return false;
    return matches(p, words);
  };
  // While organising, the right-hand list is always the collection and the left-hand one the papers to add.
  const filtered = papers.filter(p => inFilter(p, organise ? 'collection' : statusFilter) && otherFilters(p));
  const pool = organise ? papers.filter(p => p.status === 'investigator' && !p.counted && otherFilters(p)) : [];

  // If the latest update failed (e.g. Scopus refused the key), the last complete list is kept and
  // the failed attempt's results are shown here instead.
  const sourceLine = data && Object.entries(data.lastAttempt?.sources || data.sources).map(([key, s]) => (
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
          <div className="page-sub">INFANT publications · every paper checked against its author addresses</div>
        </div>
        <div className="btn-row">
          <button className="btn-secondary" disabled={!data} onClick={() => { setOrganise(!organise); setShown(PAGE_SIZE); setPoolShown(POOL_PAGE); }}>
            {organise ? 'Done adding papers' : "Add researchers' papers"}
          </button>
          <button className="btn-secondary" onClick={() => load(true).then(() => setBuilding(true))} disabled={building}>
            {building ? 'Updating…' : 'Refresh'}
          </button>
          <button className="btn-secondary" disabled={!data} onClick={() => downloadCsv('infant-publications.csv', [
            ['Year', 'First published', 'Title', 'Journal', 'Authors', 'Type', 'Counted', 'Status', 'Added or removed by hand', 'Listed researchers', 'Evidence (author address)', 'Evidence source', 'DOI', 'PubMed ID', 'Open access'],
            ...filtered.map(p => [p.year, p.date, p.title, p.journal, p.authorNames?.length ? p.authorNames.join('; ') : p.authors, p.type, p.counted ? 'Yes' : 'No', STATUS[p.status]?.label || p.status,
              p.collection === 'added' ? 'Added' : p.collection === 'removed' ? 'Removed' : '', (p.investigators || []).map(id => investigatorNames[id]).filter(Boolean).join('; '),
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
            {data.lastAttempt && (
              <div style={{ color: 'var(--destructive)' }}>
                The latest update ({new Date(data.lastAttempt.at).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}) couldn't reach every database, so the last complete list is shown. It updates again once the problem above is fixed.
              </div>
            )}
          </div>

          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Publications counted</div>
              <div className="kpi-value">{totalCounted.toLocaleString()}</div>
              <div className="kpi-delta neutral">
                Since {data.firstYear} · {(totalCounted - (data.manuallyAdded || 0)).toLocaleString()} verified automatically{data.manuallyAdded ? ` + ${data.manuallyAdded.toLocaleString()} added by hand` : ''}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">This year ({currentYear})</div>
              <div className="kpi-value">{verifiedIn(currentYear)}</div>
              <div className="kpi-delta neutral">Counted so far in {currentYear}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Last year ({currentYear - 1})</div>
              <div className="kpi-value">{verifiedIn(currentYear - 1)}</div>
              <div className="kpi-delta neutral">Counted in {currentYear - 1}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Needs review</div>
              <div className="kpi-value">{data.needsReview.toLocaleString()}</div>
              <div className="kpi-delta neutral">
                Addresses not available ·&nbsp;
                <button type="button" onClick={() => { setOrganise(false); setStatusFilter('needs_review'); setShown(PAGE_SIZE); }}
                  style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                  show them
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-title">Publications per year</div>
            <div className="card-sub">Counted articles and reviews (verified automatically or added by hand), plus other INFANT outputs and papers still needing review (not counted)</div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={chartData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Counted" stackId="p" fill="var(--accent)" maxBarSize={40} />
                <Bar dataKey="Other outputs" stackId="p" fill="#a8c3bb" maxBarSize={40} />
                <Bar dataKey="Needs review" stackId="p" fill="#e3b778" radius={[3, 3, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="search" aria-label="Search publications" placeholder="Search by title, author, journal, DOI or address..."
              value={search} onChange={e => { setSearch(e.target.value); setShown(PAGE_SIZE); }}
              style={{ ...fieldStyle, flex: 1, minWidth: 200, outline: 'none' }} />
            <select aria-label="Filter by status" value={organise ? 'collection' : statusFilter} disabled={organise} onChange={e => { setStatusFilter(e.target.value); setShown(PAGE_SIZE); }} style={{ ...fieldStyle, cursor: 'pointer' }}>
              <option value="collection">The collection (counted)</option>
              <option value="added">Added by hand</option>
              <option value="removed">Removed by hand</option>
              <option value="investigator">Listed researchers' papers (not counted)</option>
              <option value="other_output">Other outputs (not counted)</option>
              <option value="needs_review">Needs review</option>
              <option value="not_infant">Checked: not INFANT</option>
              <option value="all">All</option>
            </select>
            {investigators.length > 0 && (
              <select aria-label="Filter by listed researcher" value={investigatorFilter} onChange={e => { setInvestigatorFilter(e.target.value); setShown(PAGE_SIZE); setPoolShown(POOL_PAGE); }} style={{ ...fieldStyle, cursor: 'pointer', maxWidth: 200 }}>
                <option value="all">All researchers</option>
                {[...investigators].sort((a, b) => investigatorNames[a.id].localeCompare(investigatorNames[b.id])).map(i => <option key={i.id} value={i.id}>{investigatorNames[i.id]}</option>)}
              </select>
            )}
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

          {saveError && <div style={{ fontSize: 12, color: 'var(--destructive)', marginBottom: 10 }}>{saveError}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: organise ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
            {organise && (
              <div>
                <div style={paneTitleStyle}>
                  Listed researchers' papers not counted · {pool.length.toLocaleString()}
                  <div style={paneSubStyle}>Drag a paper into the collection, or use "Add to collection". Drag one back here to take it out.</div>
                </div>
                <div className="card" style={{ padding: 0, ...dropStyle(dragOver === 'pool') }} {...dropZone('pool')}>
                  {pool.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-title">Nothing to add</div>
                      <div className="empty-state-sub">No uncounted papers by the listed researchers match the search and filters.</div>
                    </div>
                  )}
                  {pool.slice(0, poolShown).map((paper, i, list) => (
                    <PaperRow key={paper.id} paper={paper} words={words} last={i === list.length - 1} names={investigatorNames}
                      isOpen={expanded === paper.id} onToggle={() => setExpanded(expanded === paper.id ? null : paper.id)}
                      onAdd={addToCollection} onRemove={removeFromCollection} saving={saving === paper.key} />
                  ))}
                </div>
                {pool.length > poolShown && (
                  <div style={{ textAlign: 'center', marginTop: 14 }}>
                    <button className="btn-secondary" onClick={() => setPoolShown(poolShown + POOL_PAGE)}>Show more ({(pool.length - poolShown).toLocaleString()} left)</button>
                  </div>
                )}
              </div>
            )}

            <div>
              {organise && (
                <div style={paneTitleStyle}>
                  The collection (counted) · {filtered.length.toLocaleString()}
                  <div style={paneSubStyle}>Verified automatically, plus papers added by hand.</div>
                </div>
              )}
              <div className="card" style={{ padding: 0, ...dropStyle(dragOver === 'collection') }} {...(organise ? dropZone('collection') : {})}>
                {filtered.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-state-title">No results found</div>
                    <div className="empty-state-sub">Try adjusting your search or filters.</div>
                  </div>
                )}
                {filtered.slice(0, shown).map((paper, i, list) => (
                  <PaperRow key={paper.id} paper={paper} words={words} last={i === list.length - 1} names={investigatorNames}
                    isOpen={expanded === paper.id} onToggle={() => setExpanded(expanded === paper.id ? null : paper.id)}
                    onAdd={addToCollection} onRemove={removeFromCollection} saving={saving === paper.key} />
                ))}
              </div>
            </div>
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