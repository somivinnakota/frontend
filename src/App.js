import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import Overview from './pages/Overview';
import SocialMedia from './pages/SocialMedia';
import KPIDashboard from './pages/KPIDashboard';
import PressTracker from './pages/PressTracker';
import Events from './pages/Events';
import Conferences from './pages/Conferences';
import AIReports from './pages/AIReports';
import QuarterlyReport from './pages/QuarterlyReport';
import Publications from './pages/Publications';
import './App.css';

const Icons = {
  overview:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  social:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>,
  kpi:       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>,
  press:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>,
  events:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  conf:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  quarterly: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,
  reports:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>,
  pubs:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 6.25278V19.2528M12 6.25278C10.8321 5.47686 9.24649 5 7.5 5C5.75351 5 4.16789 5.47686 3 6.25278V19.2528C4.16789 18.4769 5.75351 18 7.5 18C9.24649 18 10.8321 18.4769 12 19.2528M12 6.25278C13.1679 5.47686 14.7535 5 16.5 5C18.2465 5 19.8321 5.47686 21 6.25278V19.2528C19.8321 18.4769 18.2465 18 16.5 18C14.7535 18 13.1679 18.4769 12 19.2528"/></svg>,
  hint:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:14,height:14,flexShrink:0,color:'var(--sidebar-primary)'}}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
  menu:      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg>,
};

// The sidebar links, in order. "section" starts a new group with that heading.
const NAV = [
  { section: 'Workspace' },
  { to: '/', label: 'Overview', icon: Icons.overview, end: true },
  { section: 'Data' },
  { to: '/social', label: 'Social media', icon: Icons.social },
  { to: '/kpi', label: 'KPI tracker', icon: Icons.kpi },
  { to: '/press', label: 'Press and media', icon: Icons.press },
  { to: '/events', label: 'Calendar of events', icon: Icons.events },
  { to: '/conferences', label: 'Conference list', icon: Icons.conf },
  { to: '/publications', label: 'Publications', icon: Icons.pubs },
  { section: 'Reports', divider: true },
  { to: '/quarterly', label: 'Quarterly reports', icon: Icons.quarterly },
  { to: '/reports', label: 'AI reports', icon: Icons.reports },
];

const PAGE_NAMES = Object.fromEntries(NAV.filter(item => item.to).map(item => [item.to, item.label]));

// Remembers whether the sidebar was left open or closed.
const SIDEBAR_KEY = 'sidebar-collapsed';
function savedCollapsed() {
  try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
}

function TopBar({ collapsed, onToggle }) {
  const location = useLocation();
  const name = PAGE_NAMES[location.pathname] || 'Overview';
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Open the sidebar' : 'Close the sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Open the sidebar' : 'Close the sidebar'}
        >
          {Icons.menu}
        </button>
        <div className="topbar-label">{name}</div>
      </div>
      <div className="topbar-avatar">IA</div>
    </header>
  );
}

function AppInner() {
  const [collapsed, setCollapsed] = useState(savedCollapsed);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [collapsed]);

  return (
    <div className="shell">
      <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
        <div className="logo">
          <div className="logo-icon">i</div>
          <div className="logo-text">
            <div className="logo-mark">Impact</div>
            <div className="logo-sub">Analytics</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map(item => (item.section ? (
            <React.Fragment key={item.section}>
              {item.divider && <div className="nav-divider" />}
              <div className="nav-section">{item.section}</div>
            </React.Fragment>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              {item.icon} <span className="nav-label">{item.label}</span>
            </NavLink>
          )))}

          <div className="nav-divider" />
          <div className="nav-hint">
            <div className="nav-hint-title">
              {Icons.hint} Evidence first
            </div>
            <div className="nav-hint-text">
              Impact only shows values from real connected data. No inferred metrics are added.
            </div>
          </div>
        </nav>
      </aside>

      <div className="main">
        <TopBar collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/social" element={<SocialMedia />} />
          <Route path="/kpi" element={<KPIDashboard />} />
          <Route path="/press" element={<PressTracker />} />
          <Route path="/events" element={<Events />} />
          <Route path="/conferences" element={<Conferences />} />
          <Route path="/publications" element={<Publications />} />
          <Route path="/quarterly" element={<QuarterlyReport />} />
          <Route path="/reports" element={<AIReports />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppInner />
    </Router>
  );
}