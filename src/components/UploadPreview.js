import React from 'react';

// Shows what an upload would change before anything is saved, with Apply and Cancel.
// `preview` is the server's answer (backend sheets.js); nothing is saved until Apply.
export default function UploadPreview({ fileName, preview, mode, onModeChange, onApply, onCancel, busy }) {
  const { summary, hasSaved, previousRows } = preview;
  const replacing = mode === 'replace';
  const newColumns = summary.sheets.flatMap(s => s.newColumns || []);
  const newSheets = summary.sheets.filter(s => s.newSheet).map(s => s.name);
  const nothingNew = hasSaved && !replacing && !summary.added && !summary.corrected && !newColumns.length;
  const corrections = summary.sheets.flatMap(s => (s.corrected || []).map(c => ({ ...c, sheet: s.name })));
  const correctedCount = summary.sheets.reduce((n, s) => n + (s.correctedCount ?? (s.corrected || []).length), 0);
  const added = summary.sheets.flatMap(s => s.added && Array.isArray(s.added) ? s.added : []);
  const multipleSheets = summary.sheets.length > 1;

  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
      <div className="card-title">Check before saving: {fileName}</div>

      {!hasSaved || replacing ? (
        <div className="card-sub">
          This will save the {summary.added.toLocaleString('en-IE')} rows in this file
          {replacing && previousRows ? `, replacing the ${previousRows.toLocaleString('en-IE')} rows saved now` : ''}.
        </div>
      ) : nothingNew ? (
        <div className="card-sub">Everything in this file is already saved. There is nothing to update.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0 12px' }}>
            <span className="badge badge-green">{summary.added} new {summary.added === 1 ? 'row' : 'rows'}</span>
            <span className={`badge ${correctedCount ? 'badge-orange' : 'badge-gray'}`}>{correctedCount} {correctedCount === 1 ? 'value' : 'values'} corrected</span>
            <span className="badge badge-gray">{summary.unchanged} unchanged</span>
            {summary.kept > 0 && <span className="badge badge-gray">{summary.kept} saved {summary.kept === 1 ? 'row' : 'rows'} not in this file (kept)</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 10 }}>
            Rows are matched by {summary.sheets.filter(s => s.matchedBy).map(s => (multipleSheets ? `${s.matchedBy} (${s.name})` : s.matchedBy)).join('; ')}.
            {' '}Blank cells in this file keep the saved value.
            {newColumns.length > 0 && ` New columns: ${newColumns.join(', ')}.`}
            {newSheets.length > 0 && ` New sheets: ${newSheets.join(', ')}.`}
          </div>

          {corrections.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6 }}>
              <table>
                <thead>
                  <tr><th>Row</th><th>Column</th><th>Saved now</th><th>In this file</th></tr>
                </thead>
                <tbody>
                  {corrections.map((c, i) => (
                    <tr key={i}>
                      <td>{multipleSheets ? `${c.sheet}: ` : ''}{c.row}</td>
                      <td>{c.column}</td>
                      <td style={{ color: 'var(--muted-foreground)', textDecoration: 'line-through' }}>{c.from}</td>
                      <td style={{ fontWeight: 500 }}>{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {correctedCount > corrections.length && (
                <div style={{ padding: 8, fontSize: 11, color: 'var(--muted-foreground)' }}>…and {correctedCount - corrections.length} more.</div>
              )}
            </div>
          )}

          {added.length > 0 && (
            <details style={{ fontSize: 12, marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer' }}>See the new rows</summary>
              <ul style={{ margin: '6px 0 0 18px', color: 'var(--muted-foreground)' }}>
                {added.map((name, i) => <li key={i}>{name}</li>)}
                {summary.added > added.length && <li>…and {summary.added - added.length} more</li>}
              </ul>
            </details>
          )}
        </>
      )}

      {hasSaved && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={replacing} disabled={busy} onChange={e => onModeChange(e.target.checked ? 'replace' : 'merge')} />
          Replace everything with this file instead (use this to start again, or to remove values)
        </label>
      )}

      <div className="btn-row">
        {!nothingNew && (
          <button type="button" className="btn-primary" onClick={onApply} disabled={busy}>
            {busy ? 'Saving…' : replacing ? 'Replace and save' : 'Apply changes'}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          {nothingNew ? 'Close' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}