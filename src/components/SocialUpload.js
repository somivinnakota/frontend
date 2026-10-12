import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { API_BASE } from '../config';
import { errorMessage } from '../utils/errors';
import { formatDayMonth } from '../utils/social';

// One drop box per platform. The exported files don't say which platform they came from,
// so the box tells the dashboard; everything else is read from inside the files.
const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', hint: 'Meta Business Suite → Insights → export daily CSVs' },
  { id: 'facebook', label: 'Facebook', hint: 'Meta Business Suite → Insights → export daily CSVs' },
  { id: 'linkedin', label: 'LinkedIn', hint: 'Page Analytics → Content, Followers, Visitors → Export' },
];
const ACCEPT = '.csv,.xls,.xlsx';

// Hidden but still focusable, so keyboard users can reach the file inputs.
const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const pad = n => String(n).padStart(2, '0');
const cellValue = v => (v instanceof Date
  ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  : (v === undefined ? null : v));

// CSV files go to the server as they are (Meta's are UTF-16, which the server handles).
// Excel files are read into rows here, one list per sheet.
async function prepareFile(file) {
  const buffer = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) return { name: file.name, data: toBase64(buffer) };
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  return {
    name: file.name,
    sheets: workbook.SheetNames.map(name => ({
      name,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null, raw: true, blankrows: false })
        .map(row => row.map(cellValue)),
    })),
  };
}

const formatRange = (from, to) => {
  if (!from || !to) return '—';
  const year = d => d.slice(0, 4);
  return year(from) === year(to)
    ? `${formatDayMonth(from)} – ${formatDayMonth(to)} ${year(to)}`
    : `${formatDayMonth(from)} ${year(from)} – ${formatDayMonth(to)} ${year(to)}`;
};

function DropZone({ platform, busy, onFiles }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className="upload-area"
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files?.length) onFiles(platform.id, e.dataTransfer.files);
      }}
      style={{
        position: 'relative', flex: 1, minWidth: 200, cursor: busy ? 'wait' : 'pointer',
        outline: over ? '2px solid var(--accent)' : 'none', outlineOffset: -2,
      }}>
      <div className="upload-title">{busy ? `Reading ${platform.label} files...` : `${platform.label} exports`}</div>
      <div className="upload-sub">{platform.hint}</div>
      <div className="upload-sub">Drop files here or click to choose · any names · several at once</div>
      <input type="file" accept={ACCEPT} multiple disabled={busy} style={visuallyHidden}
        onChange={e => {
          const files = e.target.files;
          if (files?.length) onFiles(platform.id, files);
          e.target.value = '';
        }} />
    </label>
  );
}

function PlatformData({ platform, onRemoveSeries, onRemoveAll }) {
  const headline = platform.series.filter(s => s.primary);
  const detail = platform.series.length - headline.length;
  const extras = [
    detail ? `${detail} more detailed metrics` : '',
    platform.breakdowns ? `${platform.breakdowns} audience breakdowns` : '',
    platform.posts ? `${platform.posts} posts` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
          {platform.name}{extras ? <span style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}> · {extras}</span> : null}
        </div>
        <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onRemoveAll(platform)}>
          Remove all {platform.name} data
        </button>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 6 }}>
        <table>
          <thead>
            <tr><th>Metric</th><th>Dates covered</th><th>Days</th><th></th></tr>
          </thead>
          <tbody>
            {headline.map(s => (
              <tr key={s.name}>
                <td>{s.label}</td>
                <td>{formatRange(s.from, s.to)}</td>
                <td>{s.days.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onRemoveSeries(s)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SocialUpload({ onUploaded, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const loadStatus = useCallback(() => {
    axios.get(`${API_BASE}/api/social-status`).then(r => setStatus(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { if (startOpen) setOpen(true); }, [startOpen]);

  const refresh = () => { loadStatus(); onUploaded?.(); };

  const upload = async (platform, fileList) => {
    setBusy(platform);
    setError('');
    setResults([]);
    try {
      const files = [];
      const unreadable = [];
      for (const file of fileList) {
        try {
          files.push(await prepareFile(file));
        } catch {
          unreadable.push({ fileName: file.name, ok: false, message: 'This file could not be opened. Is it a CSV or Excel file?' });
        }
      }
      const r = files.length ? await axios.post(`${API_BASE}/api/social-upload`, { platform, files }) : { data: { results: [] } };
      setResults([...(r.data.results || []), ...unreadable]);
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'The files could not be uploaded. Make sure the backend is running.'));
    }
    setBusy(null);
  };

  const removeSeries = async series => {
    if (!window.confirm(`Remove ${series.label} (${formatRange(series.from, series.to)})? You can upload it again afterwards.`)) return;
    try {
      await axios.delete(`${API_BASE}/api/social-series/${encodeURIComponent(series.name)}`);
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'The data could not be removed.'));
    }
  };

  const removeAll = async platform => {
    if (!window.confirm(`Remove all ${platform.name} data, including breakdowns and posts? You can upload the files again afterwards.`)) return;
    try {
      await axios.delete(`${API_BASE}/api/social-platform/${platform.id}`);
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'The data could not be removed.'));
    }
  };

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)} style={{ marginBottom: 16 }}>
        Upload analytics files
      </button>
    );
  }

  const withData = (status?.platforms || []).filter(p => p.series.length || p.breakdowns || p.posts);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div className="card-title">Upload analytics files</div>
          <div className="card-sub">
            Download the exports from each platform's analytics and drop them into the matching box, as they are.
            The dashboard works out what each file contains. Uploading a newer export adds the new days.
          </div>
        </div>
        <button className="btn-secondary" onClick={() => setOpen(false)}>Close</button>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
        {PLATFORMS.map(p => <DropZone key={p.id} platform={p} busy={busy === p.id} onFiles={upload} />)}
      </div>

      {error && <div role="alert" style={{ marginTop: 12, fontSize: 12, color: 'var(--destructive)' }}>{error}</div>}

      {results.length > 0 && (
        <div role="status" style={{ marginTop: 14, fontSize: 12, lineHeight: 1.8 }}>
          {results.map((r, i) => (
            <div key={`${r.fileName}-${i}`} style={{ color: r.ok ? 'var(--foreground)' : 'var(--destructive)' }}>
              {r.ok ? '✅' : '⚠️'} <strong>{r.fileName}</strong>: {r.ok ? r.summary : r.message}
              {r.notes?.map(note => (
                <div key={note} style={{ marginLeft: 22, color: 'var(--muted-foreground)' }}>{note}</div>
              ))}
            </div>
          ))}
        </div>
      )}

      {withData.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>Data on file</summary>
          {withData.map(p => <PlatformData key={p.code} platform={p} onRemoveSeries={removeSeries} onRemoveAll={removeAll} />)}
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted-foreground)' }}>
            If files went under the wrong platform, remove them here and upload them again under the right one.
          </div>
        </details>
      )}
    </div>
  );
}