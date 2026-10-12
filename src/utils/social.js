// Helpers for the social media data returned by /api/social-data.
// Each series is a list of { date: 'YYYY-MM-DD', value } rows covering every year.

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function localDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Adds the labels the charts need.
export function withLabels(rows = []) {
  return rows.map(row => {
    const d = localDate(row.date);
    return {
      ...row,
      monthKey: row.date.slice(0, 7),
      monthLabel: d.toLocaleDateString('en-IE', { month: 'short', year: '2-digit' }),
      dayLabel: d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }),
    };
  });
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
  return isoDate ? localDate(isoDate).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : '';
}

export const compactTick = v => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v);