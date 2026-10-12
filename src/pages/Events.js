import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SmartSheet from '../components/SmartSheet';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';

const statusColour = status => ({ live: 'badge-green', completed: 'badge-gray', draft: 'badge-orange' }[status] || 'badge-gray');

function formatEventDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

function EventbriteSection() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/api/eventbrite`)
      .then(r => setEvents(r.data.events || []))
      .catch(e => setError(errorMessage(e, 'Could not load Eventbrite events.')))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: '20px 0', color: 'var(--muted-foreground)', fontSize: 13 }}>
      Loading Eventbrite events...
    </div>
  );

  if (error) return (
    <div style={{ padding: '20px 0', color: 'var(--destructive)', fontSize: 13 }}>{error}</div>
  );

  const totalCapacity = events.reduce((sum, e) => sum + (e.capacity || 0), 0);

  return (
    <div>
      {/* Live KPI cards */}
      <div className="kpi-row" style={{ marginBottom: 18 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total events</div>
          <div className="kpi-value">{events.length}</div>
          <div className="kpi-delta neutral"><span className="status-dot live"></span>Live from Eventbrite</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Completed</div>
          <div className="kpi-value">{events.filter(e => e.status === 'completed').length}</div>
          <div className="kpi-delta neutral">Past events</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total capacity</div>
          <div className="kpi-value">{totalCapacity.toLocaleString()}</div>
          <div className="kpi-delta neutral">Places available, not attendance</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Free events</div>
          <div className="kpi-value">{events.filter(e => e.is_free).length}</div>
          <div className="kpi-delta neutral">No ticket cost</div>
        </div>
      </div>

      {/* Live event cards */}
      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.1em' }}>
        EVENTBRITE — LIVE
      </div>
      <div className="card" style={{ padding: 0, marginBottom: 28 }}>
        {events.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">No Eventbrite events found</div>
          </div>
        )}
        {events.map((event, i) => (
          <div key={event.id} style={{
            padding: '16px 22px',
            borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                {event.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 6 }}>
                {event.venue && <span>{event.venue} · </span>}
                {formatEventDate(event.start)}
              </div>
              {event.description && (
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                  {event.description}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span className={`badge ${statusColour(event.status)}`} style={{ textTransform: 'capitalize' }}>
                {event.status}
              </span>
              {event.capacity && (
                <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                  Capacity: {event.capacity.toLocaleString()}
                </div>
              )}
              {event.url && (
                <a href={event.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
                  View on Eventbrite →
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Events() {
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="page-header">
          <div>
            <div className="page-eyebrow">Evidence</div>
            <div className="page-title">Calendar of events</div>
            <div className="page-sub">Live Eventbrite data · Internal events calendar</div>
          </div>
        </div>
        <EventbriteSection />
      </div>

      <div style={{ paddingLeft: 36, paddingRight: 36, paddingBottom: 36 }}>
        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.1em' }}>
          INTERNAL EVENTS CALENDAR — CSV
        </div>
        <SmartSheet
          eyebrow="Evidence"
          title="Calendar of events"
          subtitle="Upload CSV or Excel to visualise your full internal events calendar"
        />
      </div>
    </div>
  );
}