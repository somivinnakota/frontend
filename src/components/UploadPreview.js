import React from 'react';

// The file's tabs, to tick the ones this page should use. Shown only for files with several tabs.
function TabPicker({ tabs, onChange, busy }) {
  if (!tabs || tabs.length < 2) return null;
  const picked = tabs.filter(t => t.picked).map(t => t.name);
  const toggle = name => onChange(picked.includes(name) ? picked.filter(n => n !== name) : [...picked, name]);
  return (
    <div style={{ margin: '8px 0 12px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Tabs to use on this page</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabs.map(t => {
          const only = t.picked && picked.length === 1; // at least one tab has to stay
          return (
            <label key={t.name} className={`tab-btn${t.picked ? ' active' : ''}`}
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: busy || only ? 'default' : 'pointer' }}
              title={only ? 'At least one tab has to be kept' : undefined}>
              <input type="checkbox" checked={t.picked} disabled={busy || only} onChange={() => toggle(t.name)} />
              {t.name}
              <span style={{ fontSize: 10, opacity: 0.7 }}>{t.rows ? `${t.rows} rows` : 'empty'}</span>
            </label>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6 }}>
        Unticked tabs aren't saved or charted here, and are left out of later uploads of this file too. Instructions, chart and empty tabs start unticked.
      </div>
    </div>
  );
}

// Shows what an upload would change before anything is saved, with Apply and Cancel.
// `preview` is the server's answer (backend sheets.js); nothing is saved until Apply.
// `tabs`: the file's tabs, with which are picked; `onTabsChange` gets the new list of picked names.
export default function UploadPreview({ fileName, preview, mode, onModeChange, onApply, onCancel, busy, tabs, onTabsChange }) {
  const { summary, hasSaved, previousRows } = preview;
  const replacing = mode === 'replace';
  const newColumns = summary.sheets.flatMap(s => s.newColumns || []);
  const newSheets = summary.sheets.filter(s => s.newSheet).map(s => s.name);
  const removedSheets = summary.removedSheets || [];
  const newlyExcluded = summary.newlyExcluded || [];
  // Removing a tab, leaving one out for the first time, or bringing back an empty tab are changes too.
  const nothingNew = hasSaved && !replacing && !summary.added && !summary.corrected && !newColumns.length
    && !removedSheets.length && !newlyExcluded.length && !newSheets.length;
  const corrections = summary.sheets.flatMap(s => (s.corrected || []).map(c => ({ ...c, sheet: s.name })));
  const correctedCount = summary.sheets.reduce((n, s) => n + (s.correctedCount ?? (s.corrected || []).length), 0);
  const added = summary.sheets.flatMap(s => s.added && Array.isArray(s.added) ? s.added : []);
  const multipleSheets = summary.sheets.length > 1;

  return (
    <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
      <div className="card-title">Check before saving: {fileName}</div>
      <TabPicker tabs={tabs} onChange={onTabsChange} busy={busy} />

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
            {removedSheets.length > 0 && ` Removed from this page: ${removedSheets.join(', ')}.`}
            {newlyExcluded.length > 0 && ` Left out from now on: ${newlyExcluded.join(', ')}.`}
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