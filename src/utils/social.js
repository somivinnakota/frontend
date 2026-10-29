// Helpers for the social media data returned by /api/social-data.
// Each series is a list of { date: 'YYYY-MM-DD', value } rows covering every year.

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function localDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date labels are made once per date and reused: building a new formatter for every row
// (toLocaleDateString) took over 2 seconds on the Social media page.
const MONTH_FORMAT = new Intl.DateTimeFormat('en-IE', { month: 'short', year: '2-digit' });
const DAY_FORMAT = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short' });
const labelCache = new Map();
function labelsFor(isoDate) {
  let labels = labelCache.get(isoDate);
  if (!labels) {
    const d = localDate(isoDate);
    labels = { monthLabel: MONTH_FORMAT.format(d), dayLabel: DAY_FORMAT.format(d) };
    labelCache.set(isoDate, labels);
  }
  return labels;
}

// Adds the labels the charts need.
export function withLabels(rows = []) {
  return rows.map(row => ({ ...row, monthKey: row.date.slice(0, 7), ...labelsFor(row.date) }));
}

export const forYear = (rows = [], year) => rows.filter(row => row.date.startsWith(`${year}-`));

// Keeps rows on or before the given month and day (e.g. '09-28') in any year.
export const upToDay = (rows = [], monthDay) => rows.filter(row => row.date.slice(5) <= monthDay);

export const sumValues = (rows = []) => rows.reduce((total, row) => total + row.value, 0);
export const peakValue = (rows = []) => rows.reduce((max, row) => Math.max(max, row.value), 0);

// Monthly totals in date order. Rows must have gone through withLabels().
export function aggregateByMonth(rows = []) {
  const months = new Map();
  for (const { monthKey, monthLabel, value } of rows) {
    const entry = months.get(monthKey) || { monthKey, month: monthLabel, value: 0 };
    entry.value += value;
    months.set(monthKey, entry);
  }
  return [...months.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export function formatDayMonth(isoDate) {
  return isoDate ? labelsFor(isoDate).dayLabel : '';
}

export const compactTick = v => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v);