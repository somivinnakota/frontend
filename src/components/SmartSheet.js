import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

/* =========================================================
   Config
   ========================================================= */

const SUPPORTED_EXTENSIONS = ['csv', 'xlsx', 'xls'];
const ACCEPT = '.csv,.xlsx,.xls';

// Column detection thresholds (share of non-empty values in a column)
const NUMERIC_THRESHOLD = 0.65;
const DATE_THRESHOLD = 0.6;
const HINTED_DATE_THRESHOLD = 0.3;   // lower bar when the header looks date-like
const MAX_CATEGORY_VALUES = 30;
const CATEGORY_UNIQUE_RATIO = 0.75;
const MIN_CATEGORY_CEILING = 5;

// Label rows: rows with only one filled cell, like "Q1" or an instruction line.
const LABEL_MIN_COLUMNS = 3;      // only look for labels in sheets this wide or wider
const LABEL_MAX_SHARE = 0.5;      // and only if labels are a minority of rows
const SECTION_MAX_LENGTH = 30;    // short labels are section headings, longer ones are notes

const DATE_HEADER_HINT = /date|time|year|month|published|created|updated|period|week/i;
const NUMBER_NOISE = /[€$£%,\s]/g;

const CHART_COLORS = ['#1d4ed8', '#0891b2', '#7c3aed', '#059669', '#d97706', '#dc2626', '#db2777', '#65a30d'];
const TABLE_PAGE_SIZE = 50;
const MAX_BUTTON_OPTIONS = 6;

/* =========================================================
   Helpers
   ========================================================= */

const pad = n => String(n).padStart(2, '0');
// Local date parts; toISOString() converts to UTC and can shift the day.
const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMonthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function getExtension(fileName) {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isEmpty(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// NaN (not 0) for non-numbers, so blanks don't skew totals.
function toNum(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (typeof val !== 'string') return NaN;
  const s = val.replace(NUMBER_NOISE, '');
  return s === '' ? NaN : Number(s);
}
const isNumeric = v => !Number.isNaN(toNum(v));

// Rejects impossible dates (e.g. 31/02) instead of rolling them over.
function validDate(y, mo, d) {
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

// Written dates: "12 March 2026", "12th Mar 2026", "March 12, 2026", "Tuesday 3 February 2026", "May 2026"
const MONTH_PATTERN = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DAY_MONTH_YEAR = new RegExp(`^(?:[a-z]+,?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}\\.?,?\\s+(\\d{4})$`, 'i');
const MONTH_DAY_YEAR = new RegExp(`^(?:[a-z]+,?\\s+)?${MONTH_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, 'i');
const MONTH_YEAR = new RegExp(`^${MONTH_PATTERN}\\.?\\s+(\\d{4})$`, 'i');
const monthNumber = name =>
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.slice(0, 3).toLowerCase()) + 1;

// Single source of truth for date parsing.
function parseDate(val) {
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val !== 'string') return null;
  const s = val.trim();
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2}|\d{4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(DAY_MONTH_YEAR);
  if (m) return validDate(Number(m[3]), monthNumber(m[2]), Number(m[1]));
  m = s.match(MONTH_DAY_YEAR);
  if (m) return validDate(Number(m[3]), monthNumber(m[1]), Number(m[2]));
  m = s.match(MONTH_YEAR);
  if (m) return validDate(Number(m[2]), monthNumber(m[1]), 1);
  return null;
}
const isDate = v => parseDate(v) !== null;

/* =========================================================
   Column detection and aggregation
   ========================================================= */

// Each column gets exactly one kind: 'date', 'numeric', 'category' or 'text'.
export function detectFields(headers, rows) {
  return headers.map(header => {
    const values = rows.map(r => r[header]).filter(v => !isEmpty(v));
    const count = values.length;
    if (count === 0) return { header, kind: 'text', unique: 0, count: 0 };

    const dateRatio = values.filter(isDate).length / count;
    const numericRatio = values.filter(isNumeric).length / count;
    const unique = new Set(values.map(v => String(v).trim())).size;
    const dateThreshold = DATE_HEADER_HINT.test(header) ? HINTED_DATE_THRESHOLD : DATE_THRESHOLD;

    let kind = 'text';
    if (dateRatio >= dateThreshold) kind = 'date';
    else if (numericRatio >= NUMERIC_THRESHOLD) kind = 'numeric';
    else if (
      unique <= MAX_CATEGORY_VALUES &&
      unique < Math.max(count * CATEGORY_UNIQUE_RATIO, MIN_CATEGORY_CEILING)
    ) kind = 'category';

    return { header, kind, unique, count };
  });
}

function sumByMonth(rows, dateField, valueField) {
  const totals = new Map();
  for (const row of rows) {
    const date = parseDate(row[dateField]);
    const value = toNum(row[valueField]);
    if (!date || Number.isNaN(value)) continue;
    const key = toMonthKey(date);
    totals.set(key, (totals.get(key) ?? 0) + value);
  }
  // YYYY-MM keys sort chronologically as strings.
  return [...totals.keys()].sort().map(key => {
    const [y, m] = key.split('-').map(Number);
    const period = new Date(y, m - 1, 1).toLocaleDateString('en-IE', { month: 'short', year: '2-digit' });
    return { period, value: totals.get(key) };
  });
}

// Sums valueField per category, or counts rows when there's no valueField.
function groupByCategory(rows, categoryField, valueField, limit = 10) {
  const totals = new Map();
  for (const row of rows) {
    const raw = row[categoryField];
    if (isEmpty(raw)) continue;
    const key = String(raw).trim();
    if (valueField) {
      const value = toNum(row[valueField]);
      if (Number.isNaN(value)) continue;
      totals.set(key, (totals.get(key) ?? 0) + value);
    } else {
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// A loop instead of Math.max(...values), which can overflow on large sheets.
export function summarise(rows, field) {
  let sum = 0, max = -Infinity, count = 0;
  for (const row of rows) {
    const v = toNum(row[field]);
    if (Number.isNaN(v)) continue;
    sum += v;
    if (v > max) max = v;
    count += 1;
  }
  return count === 0 ? null : { sum, avg: sum / count, max, count };
}

/* =========================================================
   File reading
   ========================================================= */

function normaliseCell(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toISODate(v);
  if (typeof v === 'string') {
    const s = v.trim();
    return s === '' ? null : s;
  }
  return v;
}

function makeUniqueHeaders(rawHeaders) {
  const used = new Set();
  return rawHeaders.map((h, i) => {
    const base = isEmpty(h) ? `Column ${i + 1}` : String(normaliseCell(h));
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base} (${n++})`;
    used.add(name);
    return name;
  });
}

// Returns data rows (used for charts) plus a layout that keeps the sheet's original
// order, including label rows like "Q1" or notes, for the table.
function parseSheet(XLSX, name, worksheet) {
  const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true, blankrows: false });
  if (matrix.length === 0) return { name, headers: [], rows: [], layout: [] };

  const [headerRow, ...dataRows] = matrix;
  const width = dataRows.reduce((w, r) => Math.max(w, r.length), headerRow.length);

  const filledCount = row => {
    let n = 0;
    for (let i = 0; i < width; i++) if (!isEmpty(row[i])) n++;
    return n;
  };
  const contentRows = dataRows.filter(row => filledCount(row) > 0);

  // Only treat single-cell rows as labels in wider sheets where they're the exception,
  // so a genuine one-column list is never mistaken for labels.
  const singleCellRows = contentRows.filter(row => filledCount(row) === 1).length;
  const detectLabels = width >= LABEL_MIN_COLUMNS && singleCellRows < contentRows.length * LABEL_MAX_SHARE;
  const isLabelRow = row => detectLabels && filledCount(row) === 1;

  // Keep a column if it has a header or data outside label rows; drops phantom columns
  // and columns used only for labels (like an unnamed column holding "Q1", "Q2").
  const recordRows = contentRows.filter(row => !isLabelRow(row));
  const keep = [];
  for (let i = 0; i < width; i++) {
    if (!isEmpty(headerRow[i]) || recordRows.some(r => !isEmpty(r[i]))) keep.push(i);
  }
  const headers = makeUniqueHeaders(keep.map(i => headerRow[i]));

  const rows = [];
  const layout = [];
  for (const row of contentRows) {
    if (isLabelRow(row)) {
      const text = String(normaliseCell(row.find(v => !isEmpty(v))));
      layout.push({ type: text.length > SECTION_MAX_LENGTH ? 'note' : 'section', text });
    } else {
      layout.push({ type: 'row', index: rows.length });
      rows.push(Object.fromEntries(headers.map((h, j) => [h, normaliseCell(row[keep[j]])])));
    }
  }

  return { name, headers, rows, layout };
}

export function readFile(file) {
  const ext = getExtension(file.name);
  const isCsv = ext === 'csv';

  return new Promise((resolve, reject) => {
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      reject(new Error('Upload a CSV or Excel (.xlsx, .xls) file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      reject(new Error('The file could not be read. Try selecting it again.'));
    };
      reader.onload = async () => {
        try {
        // The spreadsheet library is large, so it's only downloaded when a file is uploaded.
        const XLSX = await import('xlsx');
        // raw: true stops SheetJS guessing types in CSVs (e.g. dates becoming serial numbers).
        const workbook = isCsv
          ? XLSX.read(decodeText(reader.result), { type: 'string', raw: true })
          : XLSX.read(reader.result, { type: 'array', cellDates: true });
        const sheets = workbook.SheetNames.map(name => parseSheet(XLSX, name, workbook.Sheets[name]));
        resolve({ fileName: file.name, sheets });
      } catch (err) {
        console.error('Failed to parse file:', err);
        reject(new Error('This file could not be parsed. Check that it is a valid CSV or Excel file.'));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// CSVs saved from Excel on Windows are often not UTF-8, which turns ’ and í into "�".
function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

/* =========================================================
   Saving between visits
   ========================================================= */

// Each SmartSheet title gets its own saved slot, e.g. "smartsheet-events".
export function storageKeyFor(title) {
  const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `smartsheet-${slug || 'data'}`;
}

// Guards against old or corrupted saved data crashing the page.
function isValidWorkbook(data) {
  return Boolean(
    data &&
    typeof data.fileName === 'string' &&
    Array.isArray(data.sheets) &&
    data.sheets.length > 0 &&
    data.sheets.every(s => Array.isArray(s.headers) && Array.isArray(s.rows))
  );
}

export function loadWorkbook(key) {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const data = JSON.parse(saved);
    return isValidWorkbook(data) ? data : null;
  } catch {
    return null;
  }
}

function saveWorkbook(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('Could not save workbook:', err);
    return false;
  }
}

function removeWorkbook(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to remove.
  }
}

/* =========================================================
   Formatting and shared styles
   ========================================================= */

const compactNumber = new Intl.NumberFormat('en-IE', { notation: 'compact', maximumFractionDigits: 1 });
const formatNumber = v => Math.round(Number(v)).toLocaleString('en-IE');
const truncate = (s, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Hidden but still focusable, so keyboard users can reach the file inputs.
const visuallyHidden = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };
const pickerLabelStyle = {
  fontSize: 10, color: 'var(--muted-foreground)', marginBottom: 4,
  fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
};
const fieldStyle = {
  padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
  fontFamily: 'inherit', color: 'var(--foreground)', background: 'var(--card)',
};

// Table cells wrap up to three lines instead of cutting off after a few words.
const cellStyle = { verticalAlign: 'top', minWidth: 110, maxWidth: 320 };
const clampStyle = {
  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
  overflow: 'hidden', whiteSpace: 'normal', overflowWrap: 'anywhere',
};
const sectionRowStyle = {
  fontWeight: 600, fontSize: 13, background: 'var(--secondary)',
  borderTop: '1px solid var(--border)', padding: '10px 12px',
};
const noteRowStyle = {
  fontStyle: 'italic', fontSize: 12, color: 'var(--muted-foreground)',
  whiteSpace: 'normal', padding: '10px 12px',
};

/* =========================================================
   Small UI pieces
   ========================================================= */

function Alert({ children }) {
  return (
    <div role="alert" style={{
      marginTop: 12, marginBottom: 12, borderRadius: 6, padding: '10px 14px', fontSize: 12,
      background: 'hsl(5 61% 47% / .08)', border: '1px solid hsl(5 61% 47% / .3)',
      color: 'var(--destructive)',
    }}>
      {children}
    </div>
  );
}

function Notice({ children }) {
  return (
    <div role="status" style={{
      marginTop: 12, marginBottom: 12, borderRadius: 6, padding: '10px 14px', fontSize: 12,
      background: 'var(--secondary)', border: '1px solid var(--border)',
      color: 'var(--muted-foreground)',
    }}>
      {children}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{
      background: 'var(--secondary)', border: '1px solid var(--border)', borderRadius: 8,
      padding: 40, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13,
    }}>
      {children}
    </div>
  );
}

// Buttons for a few options, a dropdown for many, so no column is unreachable.
function FieldPicker({ label, options, value, onChange }) {
  if (options.length < 2) return null;
  return (
    <div>
      <div style={pickerLabelStyle}>{label}</div>
      {options.length <= MAX_BUTTON_OPTIONS ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {options.map(opt => (
            <button key={opt} type="button" onClick={() => onChange(opt)}
              aria-pressed={value === opt}
              className={`tab-btn${value === opt ? ' active' : ''}`}>
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} style={fieldStyle}>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      )}
    </div>
  );
}

/* =========================================================
   Charts
   ========================================================= */

// Rendered with a key per file/sheet, so selections reset when the sheet changes.
function SmartChart({ sheet }) {
  const fields = useMemo(() => detectFields(sheet.headers, sheet.rows), [sheet]);
  const byKind = kind => fields.filter(f => f.kind === kind).map(f => f.header);
  const numericFields = byKind('numeric');
  const dateFields = byKind('date');
  const categoryFields = byKind('category');

  const [numericField, setNumericField] = useState(numericFields[0]);
  const [dateField, setDateField] = useState(dateFields[0]);
  const [categoryField, setCategoryField] = useState(categoryFields[0]);

  const timeData = useMemo(
    () => (dateField && numericField ? sumByMonth(sheet.rows, dateField, numericField) : []),
    [sheet, dateField, numericField],
  );
  const categoryData = useMemo(
    () => (categoryField ? groupByCategory(sheet.rows, categoryField, numericField) : []),
    [sheet, categoryField, numericField],
  );
  const stats = useMemo(
    () => (numericField ? summarise(sheet.rows, numericField) : null),
    [sheet, numericField],
  );

  if (sheet.rows.length === 0) {
    return <EmptyState>This sheet has no data rows.</EmptyState>;
  }
  if (!numericField && !categoryField) {
    return <EmptyState>No numeric or category columns found. Charts appear when the sheet has numbers or repeated labels to group by.</EmptyState>;
  }

  const hasBothCharts = timeData.length > 0 && categoryData.length > 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <FieldPicker label="Metric" options={numericFields} value={numericField} onChange={setNumericField} />
        <FieldPicker label="Date" options={dateFields} value={dateField} onChange={setDateField} />
        <FieldPicker label="Group by" options={categoryFields} value={categoryField} onChange={setCategoryField} />
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total', value: formatNumber(stats.sum) },
            { label: 'Average', value: formatNumber(stats.avg) },
            { label: 'Maximum', value: formatNumber(stats.max) },
            { label: 'Count', value: stats.count.toLocaleString('en-IE') },
          ].map(({ label, value }) => (
            <div key={label} className="kpi-card">
              <div className="kpi-label">{label} · {numericField}</div>
              <div className="kpi-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: hasBothCharts ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
      }}>
        {timeData.length > 0 && (
          <div className="card">
            <div className="card-title">{numericField} over time</div>
            <div className="card-sub">{dateField} · monthly totals</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeData} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="period" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40}
                  tickFormatter={v => compactNumber.format(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => [formatNumber(v), numericField]} />
                <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={timeData.length === 1} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {categoryData.length > 0 && (
          <div className="card">
            <div className="card-title">
              {numericField ? `${numericField} by ${categoryField}` : `Count by ${categoryField}`}
            </div>
            <div className="card-sub">Top {categoryData.length} values</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false}
                  tickFormatter={v => compactNumber.format(v)} />
                <YAxis dataKey="name" type="category" tick={axisTick} width={140}
                  axisLine={false} tickLine={false} tickFormatter={v => truncate(String(v))} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={v => [formatNumber(v), numericField || 'Count']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {categoryData.map((entry, i) => (
                    <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Table
   ========================================================= */

// Also keyed per file/sheet, so the search box resets with the sheet.
function DataTable({ sheet }) {
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(TABLE_PAGE_SIZE);

  // Files saved by older versions have no layout; show their rows in order.
  const layout = useMemo(
    () => sheet.layout ?? sheet.rows.map((_, index) => ({ type: 'row', index })),
    [sheet],
  );

  // Hide columns that are empty in every row.
  const columns = useMemo(
    () => sheet.headers.filter(h => sheet.rows.some(row => !isEmpty(row[h]))),
    [sheet],
  );

  // When searching, show matching rows under their section headings; notes are hidden.
  const { items, matchCount } = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return { items: layout, matchCount: sheet.rows.length };

    const result = [];
    let pendingSection = null;
    let count = 0;
    for (const item of layout) {
      if (item.type === 'section') { pendingSection = item; continue; }
      if (item.type !== 'row') continue;
      const row = sheet.rows[item.index];
      const hit = columns.some(h => !isEmpty(row[h]) && String(row[h]).toLowerCase().includes(term));
      if (!hit) continue;
      if (pendingSection) { result.push(pendingSection); pendingSection = null; }
      result.push(item);
      count += 1;
    }
    return { items: result, matchCount: count };
  }, [layout, sheet, columns, search]);

  // Show up to `limit` data rows, keeping any headings and notes that sit between them.
  const visible = useMemo(() => {
    const out = [];
    let shown = 0;
    for (const item of items) {
      if (item.type === 'row') {
        if (shown === limit) break;
        shown += 1;
      }
      out.push(item);
    }
    while (out.length && out[out.length - 1].type !== 'row' && shown === limit) out.pop();
    return out;
  }, [items, limit]);

  const onSearch = e => {
    setSearch(e.target.value);
    setLimit(TABLE_PAGE_SIZE);
  };

  const shownCount = Math.min(limit, matchCount);
  const colSpan = Math.max(columns.length, 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
        <input type="search" aria-label="Search rows" placeholder="Search rows..."
          value={search} onChange={onSearch}
          style={{ ...fieldStyle, flex: 1 }} />
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
          {matchCount.toLocaleString('en-IE')} rows
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table>
          <thead>
            <tr>{columns.map(h => <th key={h} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {visible.map((item, i) => {
              if (item.type === 'section') {
                return (
                  <tr key={`section-${i}`}>
                    <td colSpan={colSpan} style={sectionRowStyle}>{item.text}</td>
                  </tr>
                );
              }
              if (item.type === 'note') {
                return (
                  <tr key={`note-${i}`}>
                    <td colSpan={colSpan} style={noteRowStyle}>{item.text}</td>
                  </tr>
                );
              }
              const row = sheet.rows[item.index];
              return (
                <tr key={`row-${item.index}`}>
                  {columns.map(h => {
                    const value = row[h];
                    if (isEmpty(value)) return <td key={h} style={cellStyle} />;
                    const text = String(value);
                    return (
                      <td key={h} style={cellStyle}>
                        <span style={clampStyle} title={text}>{text}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {matchCount === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
            {search.trim() ? 'No rows match your search.' : 'This sheet has no data rows.'}
          </div>
        )}
        {matchCount > shownCount && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
            padding: '10px 12px', fontSize: 11, color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)',
          }}>
            <span>Showing {shownCount.toLocaleString('en-IE')} of {matchCount.toLocaleString('en-IE')} rows</span>
            <button type="button" className="btn-secondary" onClick={() => setLimit(l => l + TABLE_PAGE_SIZE)}>
              Show {Math.min(TABLE_PAGE_SIZE, matchCount - shownCount)} more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Page
   ========================================================= */

// `summary` (optional): a component that analyses the whole workbook for a specific page, e.g. the
// conference list. It gets the generic charts as `fallback` to show when it doesn't recognise the file.
export default function SmartSheet({ title = 'Data', subtitle = '', eyebrow, summary: Summary }) {
  const storageKey = useMemo(() => storageKeyFor(title), [title]);

  const [workbook, setWorkbook] = useState(() => loadWorkbook(storageKey));
  const [activeSheet, setActiveSheet] = useState(0);
  const [activeTab, setActiveTab] = useState('charts');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFile = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be chosen again
    if (!file) return;

    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await readFile(file);
      setWorkbook(data);
      setActiveSheet(0);
      setActiveTab('charts');

      // Saving under the same key overwrites the previous file.
      if (!saveWorkbook(storageKey, data)) {
        // If the new file can't be saved, remove the old one so it doesn't come back on refresh.
        removeWorkbook(storageKey);
        setNotice('This file is too large to save between visits. It stays loaded until you refresh or close the page.');
      }
    } catch (err) {
      // A failed upload leaves the current file (and its saved copy) untouched.
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const clearWorkbook = () => {
    setWorkbook(null);
    setActiveSheet(0);
    setActiveTab('charts');
    setError('');
    setNotice('');
    removeWorkbook(storageKey);
  };

  const sheet = workbook ? (workbook.sheets[activeSheet] ?? workbook.sheets[0]) : null;
  const viewKey = workbook ? `${workbook.fileName}-${activeSheet}` : 'empty';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
          <div className="page-title">{title}</div>
          {subtitle && <div className="page-sub">{subtitle}</div>}
        </div>
        {workbook && (
          <div className="btn-row">
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{workbook.fileName}</span>
            <label className="btn-secondary" style={{ cursor: loading ? 'wait' : 'pointer', position: 'relative' }}>
              {loading ? 'Reading file...' : 'Replace file'}
              <input type="file" accept={ACCEPT} onChange={handleFile} disabled={loading} style={visuallyHidden} />
            </label>
            <button type="button" className="btn-secondary" onClick={clearWorkbook} disabled={loading}>
              Clear
            </button>
          </div>
        )}
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Notice>{notice}</Notice>}

      {!workbook ? (
        <div className="card">
          <label className="upload-area" style={{ position: 'relative' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)"
              strokeWidth="1.5" aria-hidden="true" style={{ margin: '0 auto', display: 'block' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="upload-title">{loading ? 'Reading file...' : `Upload ${title} data`}</div>
            <div className="upload-sub">CSV or Excel (.xlsx, .xls) · Charts generate automatically</div>
            <input type="file" accept={ACCEPT} onChange={handleFile} disabled={loading} style={visuallyHidden} />
          </label>
        </div>
      ) : (
        <>
          {workbook.sheets.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {workbook.sheets.map((s, i) => (
                <button key={`${s.name}-${i}`} type="button" onClick={() => setActiveSheet(i)}
                  aria-pressed={activeSheet === i}
                  className={`tab-btn${activeSheet === i ? ' active' : ''}`}>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className="tab-row">
            <button type="button" aria-pressed={activeTab === 'charts'}
              className={`tab-btn${activeTab === 'charts' ? ' active' : ''}`}
              onClick={() => setActiveTab('charts')}>
              Charts
            </button>
            <button type="button" aria-pressed={activeTab === 'table'}
              className={`tab-btn${activeTab === 'table' ? ' active' : ''}`}
              onClick={() => setActiveTab('table')}>
              Data table
            </button>
          </div>

          {activeTab === 'table' ? <DataTable key={viewKey} sheet={sheet} />
            : Summary ? <Summary key={viewKey} workbook={workbook} fallback={<SmartChart sheet={sheet} />} />
            : <SmartChart key={viewKey} sheet={sheet} />}
        </>
      )}
    </div>
  );
}