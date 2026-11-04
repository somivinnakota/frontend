import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Legend } from 'recharts';
import SmartSheet from '../components/SmartSheet';

// Columns are found by the words in their headers, not by exact names or positions.
const COLUMN = {
  name: /name|title|conference|event|meeting/i,
  scope: /national|international|scope/i,
  theme: /them(e|atic)|topic|area/i,
  quarter: /quarter/i,
  type: /poster|oral|invited|talk|keynote|workshop|lecture/i,
  location: /location|venue|city|country|where/i,
  award: /award|prize/i,
  skip: /award|prize|total|\+|note|link|committee/i, // awards, and totals that would double count
};
const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const isDate = v => MONTH.test(v) || /\d\/\d/.test(v);
// Quarter from a date like "27-Jan", "March 19th" or "26-27/03/2026".
function quarterOfDate(v) {
  const t = text(v);
  const month = t.match(MONTH) ? MONTHS.indexOf(t.match(MONTH)[1].toLowerCase()) + 1 : Number(t.match(/\d\/(\d{1,2})\//)?.[1]);
  return month >= 1 && month <= 12 ? Math.ceil(month / 3) : undefined;
}

const text = v => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());
// Country for a conference location. The list usually holds a city ("Naples", "leeds", "CUMH"),
// so cities and Irish hospitals/universities are looked up; a country named in the text wins.
const COUNTRIES = ['Ireland', 'United Kingdom', 'United States', 'Netherlands', 'Italy', 'Sweden', 'Denmark', 'France', 'Germany',
  'Spain', 'Portugal', 'Poland', 'Czech Republic', 'Belgium', 'Austria', 'Switzerland', 'Norway', 'Finland', 'Greece', 'Canada', 'Australia'];
const PLACES = {
  Ireland: ['dublin', 'cork', 'galway', 'limerick', 'waterford', 'belfast', 'ucc', 'cuh', 'cumh', 'rcpi', 'maynooth', 'kilkenny', 'killarney', 'athlone', 'sligo',
    'tullamore', 'mullingar', 'portlaoise', 'kildare', 'naas', 'drogheda', 'dundalk', 'wexford', 'tralee', 'ennis', 'letterkenny', 'castlebar', 'carlow', 'navan', 'clonmel'],
  'United Kingdom': ['uk', 'england', 'scotland', 'wales', 'london', 'leeds', 'manchester', 'birmingham', 'liverpool', 'edinburgh', 'glasgow', 'oxford', 'cambridge', 'bristol', 'cardiff', 'nottingham', 'harrogate', 'brighton', 'york'],
  'United States': ['usa', 'boston', 'chicago', 'new york', 'washington', 'san francisco', 'san diego', 'philadelphia', 'seattle', 'denver', 'atlanta', 'houston', 'baltimore', 'los angeles', 'miami', 'orlando', 'honolulu', 'austin'],
  Netherlands: ['amsterdam', 'groningen', 'rotterdam', 'utrecht', 'the hague', 'leiden', 'maastricht'],
  Italy: ['naples', 'napoli', 'rome', 'milan', 'florence', 'venice', 'turin', 'bologna', 'verona'],
  Sweden: ['stockholm', 'gothenburg', 'uppsala', 'malmo'],
  Denmark: ['copenhagen', 'aarhus'],
  France: ['paris', 'lyon', 'lyons', 'marseille', 'nice', 'bordeaux', 'toulouse'],
  Germany: ['berlin', 'munich', 'hamburg', 'frankfurt', 'cologne', 'heidelberg'],
  Spain: ['madrid', 'barcelona', 'valencia', 'seville'],
  Portugal: ['lisbon', 'porto'],
  Poland: ['warsaw', 'krakow'],
  'Czech Republic': ['prague', 'brno', 'czechia'],
  Belgium: ['brussels', 'antwerp', 'ghent'],
  Austria: ['vienna', 'salzburg'],
  Switzerland: ['geneva', 'zurich', 'basel', 'lausanne', 'bern'],
  Canada: ['toronto', 'montreal', 'vancouver', 'ottawa'],
  Australia: ['sydney', 'melbourne', 'brisbane', 'perth'],
};
function countryOf(location) {
  const t = text(location).toLowerCase();
  if (!t) return '';
  if (/online|virtual|webinar|zoom|teams/.test(t)) return 'Online';
  const named = COUNTRIES.find(c => t.includes(c.toLowerCase()));
  if (named) return named;
  const words = ` ${t.replace(/[^a-z]+/g, ' ')} `;
  const match = Object.entries(PLACES).find(([, places]) => places.some(p => words.includes(` ${p} `)));
  return match ? match[0] : `Other (${text(location)})`;
}

const yearIn = s => Number(text(s).match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/)?.[1]) || undefined;

// Similar spellings ("Neonataology" / "Neonatology") count as the same thing.
function similar(a, b) {
  const pairs = s => { const t = text(s).toLowerCase().replace(/[^a-z0-9]/g, ''); return [...t].slice(1).map((c, i) => t[i] + c); };
  const x = pairs(a), y = pairs(b);
  const shared = x.filter(p => { const i = y.indexOf(p); if (i < 0) return false; y.splice(i, 1); return true; }).length;
  return (2 * shared) / ((x.length + shared + y.length) || 1) >= 0.85;
}

export function analyseConferences(workbook) {
  const conferences = [];
  const missing = [];
  for (const sheet of workbook.sheets) {
    const { headers, rows } = sheet;
    const share = (h, test) => { const v = rows.map(r => text(r[h])).filter(Boolean); return v.length ? v.filter(test).length / v.length : 0; };
    const find = re => headers.find(h => re.test(h) && !COLUMN.skip.test(h) && share(h, Boolean));
    const types = headers.filter(h => COLUMN.type.test(h) && !COLUMN.skip.test(h))
      .map(h => ({ header: h, label: h.replace(/^[#\s]+/, ''), word: h.match(COLUMN.type)[0].toLowerCase() }));
    // Award columns, e.g. "# Poster Award" and "# Oral Award". Cells may hold a number or a description
    // ("1 Best Student Poster Winner…", "Honourable Mention"): a number is used as it is, any other text counts as 1.
    const awards = headers.filter(h => COLUMN.award.test(h) && /poster|oral/i.test(h))
      .map(h => ({ header: h, label: /poster/i.test(h) ? 'Poster awards' : 'Oral awards' }));
    const col = {
      // The name column holds text, not dates (some lists type the date under "Conference List").
      name: headers.filter(h => COLUMN.name.test(h) && !COLUMN.type.test(h))
        .sort((a, b) => share(a, v => MONTH.test(v)) - share(b, v => MONTH.test(v)))[0],
      scope: find(COLUMN.scope), theme: find(COLUMN.theme), quarter: find(COLUMN.quarter), location: find(COLUMN.location),
      date: headers.find(h => share(h, isDate) >= 0.5),
    };
    // Columns that exist but are empty in this file, so the page can say so.
    missing.push(...headers.filter(h => (COLUMN.scope.test(h) || COLUMN.theme.test(h)) && !share(h, Boolean)));
    if (!col.name || !(col.scope || col.theme || types.length)) continue;

    const sheetYear = yearIn(sheet.name) || yearIn(workbook.fileName);
    const layout = sheet.layout ?? rows.map((_, index) => ({ type: 'row', index }));
    let current = null;
    let sectionQuarter;
    for (const item of layout) {
      if (item.type === 'section') { // headings like "Q1 - Jan-Mar" start afresh
        current = null;
        sectionQuarter = Number(item.text.match(/\bQ\s?([1-4])\b/i)?.[1]) || undefined;
      }
      if (item.type !== 'row') continue;
      const row = rows[item.index];
      // A number, or 1 for an entry like "Poster" / "E-Poster with a lightning talk".
      const counts = types.map(t => {
        const v = text(row[t.header]);
        return Number(v) || (v.toLowerCase().includes(t.word) ? 1 : 0);
      });
      const awardCounts = awards.map(a => { const v = text(row[a.header]); return v ? Number(v.match(/^\d+/)?.[0]) || 1 : 0; });
      const hasInfo = counts.some(Boolean) || awardCounts.some(Boolean) || isDate(text(row[col.date]))
        || [col.scope, col.theme, col.quarter].some(h => h && text(row[h]));
      if (!hasInfo) continue; // notes and links, not conferences
      const name = text(row[col.name]);
      // Rows with a blank (or repeated) name are more presentations at the conference above.
      if (name && !(current && similar(current.name, name))) {
        const quarter = Number(text(row[col.quarter]).match(/[1-4]/)?.[0]) || quarterOfDate(row[col.date]) || sectionQuarter;
        current = { name, year: yearIn(row[col.date]) || sheetYear, quarter, scope: '', country: '', themes: new Set(), counts: {}, awards: {} };
        conferences.push(current);
      }
      if (!current) continue;
      current.scope = current.scope || text(row[col.scope]);
      current.country = current.country || countryOf(row[col.location]);
      const conf = current;
      awards.forEach((a, i) => { conf.awards[a.label] = (conf.awards[a.label] || 0) + awardCounts[i]; });
      if (text(row[col.theme])) current.themes.add(text(row[col.theme]));
      const { counts: total } = current;
      types.forEach((t, i) => { total[t.label] = (total[t.label] || 0) + counts[i]; });
    }
  }
  conferences.missing = [...new Set(missing)];
  return conferences.length ? conferences : null;
}

// Counts per value, merging similar spellings under the most common one.
function tally(values) {
  const groups = [];
  for (const v of values) {
    const g = groups.find(g => similar(g.names[0], v));
    if (g) { g.value += 1; g.names.push(v); } else groups.push({ names: [v], value: 1 });
  }
  return groups.map(g => {
    const name = g.names.sort((a, b) => g.names.filter(n => n === b).length - g.names.filter(n => n === a).length)[0];
    return { name: name === name.toUpperCase() || name === name.toLowerCase() ? name[0].toUpperCase() + name.slice(1).toLowerCase() : name, value: g.value };
  }).sort((a, b) => (a.name === 'Not specified') - (b.name === 'Not specified') || b.value - a.value);
}

const axisTick = { fontSize: 10, fill: 'var(--muted-foreground)' };
const tooltipStyle = { fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' };

function Chart({ title, sub, data, horizontal, height }) {
  return (
    <div className="card">
      <div className="card-title">{title}</div>
      <div className="card-sub">{sub}</div>
      <ResponsiveContainer width="100%" height={height || (horizontal ? Math.max(160, data.length * 30 + 20) : 220)}>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 18, right: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={!horizontal} vertical={horizontal} />
          {horizontal ? <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
            : <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />}
          {horizontal ? <YAxis dataKey="name" type="category" width={150} tick={axisTick} axisLine={false} tickLine={false} />
            : <YAxis allowDecimals={false} width={32} tick={axisTick} axisLine={false} tickLine={false} />}
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--secondary)' }} />
          <Bar dataKey="value" name="Count" fill="var(--accent)" maxBarSize={horizontal ? 20 : 48} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}>
            <LabelList dataKey="value" position={horizontal ? 'right' : 'top'} style={{ fontSize: 11, fill: 'var(--foreground)' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Poster and oral awards side by side, per year (or per quarter when the list covers one year).
function AwardsChart({ data, totals, height = 220 }) {
  return (
    <div className="card">
      <div className="card-title">Poster and oral awards</div>
      <div className="card-sub">{totals['Poster awards']} poster · {totals['Oral awards']} oral</div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 18, right: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} width={32} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--secondary)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {['Poster awards', 'Oral awards'].map((key, i) => (
            <Bar key={key} dataKey={key} fill={i ? 'var(--primary)' : 'var(--accent)'} maxBarSize={32} radius={[4, 4, 0, 0]}>
              <LabelList dataKey={key} position="top" style={{ fontSize: 11, fill: 'var(--foreground)' }} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ConferenceSummary({ workbook, fallback }) {
  const conferences = useMemo(() => analyseConferences(workbook), [workbook]);
  if (!conferences) return fallback; // not a conference list: show the normal charts

  const years = [...new Set(conferences.map(c => c.year).filter(Boolean))].sort();
  const scope = tally(conferences.map(c => c.scope || 'Not specified'));
  const themes = tally(conferences.flatMap(c => (c.themes.size ? [...c.themes] : ['Not specified'])));
  const trend = years.length > 1
    ? years.map(y => ({ name: String(y), value: conferences.filter(c => c.year === y).length }))
    : [1, 2, 3, 4].map(q => ({ name: `Q${q}`, value: conferences.filter(c => c.quarter === q).length }));
  // Awards per year (or quarter), and the country each conference was held in.
  const periods = years.length > 1 ? years.map(y => ({ name: String(y), test: c => c.year === y }))
    : [1, 2, 3, 4].map(q => ({ name: `Q${q}`, test: c => c.quarter === q }));
  const awardSum = (list, key) => list.reduce((sum, c) => sum + (c.awards[key] || 0), 0);
  const awardTotals = { 'Poster awards': awardSum(conferences, 'Poster awards'), 'Oral awards': awardSum(conferences, 'Oral awards') };
  const awardData = periods.map(p => {
    const list = conferences.filter(p.test);
    return { name: p.name, 'Poster awards': awardSum(list, 'Poster awards'), 'Oral awards': awardSum(list, 'Oral awards') };
  });
  const hasAwards = conferences.some(c => Object.keys(c.awards).length);
  const countries = tally(conferences.map(c => c.country || 'Not specified'));
  const hasCountries = countries.some(c => c.name !== 'Not specified');
  const scopeCount = name => scope.find(s => s.name.toLowerCase() === name)?.value ?? 0;
  // Only show what the file actually records.
  const hasScope = scope.some(s => s.name !== 'Not specified');
  const hasThemes = themes.some(t => t.name !== 'Not specified');
  const cards = [['Conferences', conferences.length],
    ...(hasScope ? [['International', scopeCount('international')], ['National', scopeCount('national')]] : []),
    ...(hasThemes ? [['Thematic areas', themes.filter(t => t.name !== 'Not specified').length]] : [])];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        {cards.map(([label, value]) => (
          <div key={label} className="kpi-card"><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div></div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))' }}>
        <Chart title={years.length > 1 ? 'Conferences by year' : `Conferences by quarter${years[0] ? `, ${years[0]}` : ''}`}
          sub={years.length > 1 ? `${years[0]} to ${years[years.length - 1]}` : undefined}
          data={trend} />
        {hasScope && <Chart title="International vs national" sub="Conferences" data={scope} />}
        <Chart title="Type of presentation" sub="Presentations"
          data={[...new Set(conferences.flatMap(c => Object.keys(c.counts)))]
            .map(name => ({ name, value: conferences.reduce((sum, c) => sum + (c.counts[name] || 0), 0) }))} />
        {hasThemes && <Chart title="Thematic area" sub="Conferences with a presentation in the area" data={themes} horizontal height={220} />}
        {hasAwards && <AwardsChart data={awardData} totals={awardTotals} height={hasCountries ? Math.max(220, countries.length * 30 + 20) : 220} />}
        {hasCountries && <Chart title="Country" sub="Where each conference was held (one per conference)" data={countries} horizontal />}
      </div>
      {conferences.missing.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted-foreground)' }}>
          Empty in this file, so not charted: {conferences.missing.join(', ')}. Fill them in and upload again to see those charts.
        </div>
      )}
    </div>
  );
}

export default function Conferences() {
  return <SmartSheet eyebrow="Evidence" title="Conference list" subtitle="Upload CSV or Excel to visualise conference presentations and attendance" summary={ConferenceSummary} />;
}