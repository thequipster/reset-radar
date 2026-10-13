import {readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const fixturePath = join(root, 'data/resets-history.json');
const outputPath = join(root, 'docs/v32-descriptive-20261013.json');
const historyInputPath = join(root, 'docs/v32-history-input-20261013.json');
const appData = process.env.APPDATA;
const archivePath = appData ? join(appData, 'app.resetradar.desktop', 'card-decisions.jsonl') : null;
const zones = ['Asia/Shanghai', 'UTC', 'America/Los_Angeles'];
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86_400_000;

function completeHistory(d) {
  return !!d && Number.isFinite(Date.parse(d.fetchedAt ?? '')) && Array.isArray(d.events) &&
    (d.coverageThrough == null || (Number.isFinite(Date.parse(d.coverageThrough)) && Date.parse(d.coverageThrough) <= Date.parse(d.fetchedAt))) &&
    d.events.every(e => e && typeof e === 'object' && ['string', 'number'].includes(typeof e.id) &&
      typeof e.resetType === 'string' && Number.isFinite(typeof e.announcedAt === 'number' ? e.announcedAt : Date.parse(String(e.announcedAt)))) &&
    d.upstream?.pagination?.has_more === false && d.upstream.pagination.next_cursor == null;
}
function latestArchivedHistory(content, fallback) {
  let latest = fallback;
  for (const line of content.split(/\r?\n/)) {
    try {
      const row = JSON.parse(line);
      if (row.kind === 'platform_history' && completeHistory(row.document) &&
        (!completeHistory(latest) || Date.parse(row.document.fetchedAt) > Date.parse(latest.fetchedAt))) latest = row.document;
    } catch { /* matches runtime.ts: malformed lines are ignored */ }
  }
  return latest;
}
function weekdayIndex(ms, zone) {
  const day = new Intl.DateTimeFormat('en-US', {timeZone: zone, weekday: 'short'}).format(new Date(ms));
  return weekdays.indexOf(day);
}
function dateKey(ms, zone) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function beijingTimestamp(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(ms));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+08:00`;
}
function chiSquareSurvivalDf6(x) { const h = x / 2; return Math.exp(-h) * (1 + h + h * h / 2); }
function analyze(doc, source) {
  const raw = doc.events.filter(e => e.resetType === 'regular');
  const seen = new Set();
  const events = raw.filter(e => { const id = String(e.id); if (seen.has(id)) return false; seen.add(id); return true; })
    .map(e => ({time: typeof e.announcedAt === 'number' ? e.announcedAt : Date.parse(String(e.announcedAt))}))
    .filter(e => Number.isFinite(e.time)).sort((a,b) => a.time - b.time);
  if (!events.length) throw new Error(`${source}: no valid regular events`);
  const end = Date.parse(doc.coverageThrough ?? doc.fetchedAt);
  const coveredEvents = events.filter(e => e.time <= end);
  if (!coveredEvents.length) throw new Error(`${source}: no regular events at or before coverage cutoff`);
  function windowStats(days) {
    const start = days == null ? coveredEvents[0].time : end - days * DAY;
    const rows = coveredEvents.filter(e => days == null ? e.time >= start : e.time > start).filter(e => e.time <= end);
    const perZone = {};
    for (const zone of zones) {
      const counts = Array(7).fill(0), byDate = new Map();
      for (const e of rows) { counts[weekdayIndex(e.time, zone)]++; const d = dateKey(e.time, zone); byDate.set(d, (byDate.get(d) ?? 0) + 1); }
      const tueSat = counts[2] + counts[6];
      perZone[zone] = {weekdayCounts: Object.fromEntries(weekdays.map((d,i) => [d, counts[i]])),
        tuesdaySaturdayCount: tueSat, tuesdaySaturdayShare: rows.length ? tueSat / rows.length : null,
        eventDays: byDate.size, multiEventDays: [...byDate.values()].filter(n => n > 1).length};
    }
    let bursts = 0, inBurst = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].time - rows[i-1].time <= DAY) { if (!inBurst) bursts++; inBurst = true; }
      else inBurst = false;
    }
    let chi = 0;
    for (const n of perZone['Asia/Shanghai'].weekdayCounts ? Object.values(perZone['Asia/Shanghai'].weekdayCounts) : []) {
      const expected = rows.length / 7; chi += (n - expected) ** 2 / expected;
    }
    return {windowDays: days ?? 'all', startExclusive: days == null ? null : new Date(start).toISOString(), startInclusive: days == null ? new Date(start).toISOString() : null,
      endExclusive: null, endInclusive: new Date(end).toISOString(),
      eventCount: rows.length, eventsPerZone: perZone, adjacentAtMost24hBurstClusters: bursts,
      beijingUniformWeekdayChiSquareDf6: {statistic: chi, descriptiveTailValue: chiSquareSurvivalDf6(chi),
        note: 'Descriptive reference value only; no claim of valid inferential significance.'}};
  }
  return {source, fetchedAt: doc.fetchedAt, coverageThrough: doc.coverageThrough ?? null,
    cutoffUtc: new Date(end).toISOString(), cutoffBeijing: beijingTimestamp(end),
    regularEventEntriesBeforeDeduplication: raw.length, uniqueRegularEventIds: events.length,
    duplicateRegularEntriesRemoved: raw.length - events.length,
    eventTimeSpan: {startInclusive: new Date(events[0].time).toISOString(), endInclusive: new Date(events.at(-1).time).toISOString(),
      validRegularEventsAfterCutoff: events.filter(e => e.time > end).length},
    windows: [windowStats(null), windowStats(180), windowStats(90)]};
}
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const replay = process.argv.includes('--replay');
let selected, selectedLabel;
if (replay) {
  const pinned = JSON.parse(await readFile(historyInputPath, 'utf8'));
  selected = pinned.document;
  selectedLabel = pinned.source;
  if (!completeHistory(selected)) throw new Error('Pinned history input is incomplete');
} else {
  let archiveContent = '';
  if (archivePath) { try { archiveContent = await readFile(archivePath, 'utf8'); } catch { /* optional local archive */ } }
  selected = latestArchivedHistory(archiveContent, fixture);
  selectedLabel = selected === fixture ? 'fixture fallback (no newer complete archived history)' : 'latest complete archived platform_history document';
  const publicEventFields = ['id', 'resetType', 'announcedAt', 'firstSeenAt', 'versionSeenAt', 'relatedEventIds',
    'relatedIds', 'version', 'source', 'sourceType', 'sourceUrl', 'text'];
  const publicDocument = {fetchedAt: selected.fetchedAt, ...(selected.coverageThrough ? {coverageThrough: selected.coverageThrough} : {}),
    events: selected.events.map(e => Object.fromEntries(publicEventFields.filter(k => e[k] !== undefined).map(k => [k, e[k]]))),
    upstream: {pagination: {has_more: false, next_cursor: null, ...(selected.upstream.pagination.pages_fetched == null ? {} : {pages_fetched: selected.upstream.pagination.pages_fetched})}}};
  await writeFile(historyInputPath, `${JSON.stringify({source: selectedLabel, document: publicDocument}, null, 2)}\n`, 'utf8');
}
const result = {
  generatedAt: new Date().toISOString(),
  method: {timeBasis: 'coverage cutoff = coverageThrough ?? fetchedAt (fixed per document; never advanced to run time); cutoff shown in UTC and Beijing time',
    windowDays: [180, 90], weekdayZones: zones,
    windowBoundary: 'recent windows use (cutoff - N*24h, cutoff]; full history includes its first event and events through cutoff',
    dateKeyMethod: 'Intl.DateTimeFormat(...).formatToParts extracts year/month/day, avoiding locale-dependent formatted-string order',
    eventDays: 'distinct local calendar dates containing at least one regular event',
    multiEventDays: 'number of local dates containing at least two regular events',
    burstClusters: 'maximal consecutive groups of at least two events where each adjacent gap is <= 24 hours',
    deduplication: 'first occurrence of each regular event id retained; non-regular events excluded',
    chiSquare: 'Beijing weekday counts against equal 1/7 expectation; df=6; tail formula specified by request; descriptive only'},
  dataLimitations: ['The upstream history is only as complete as its recorded pagination and historical coverage; the available history does not establish completeness before its earliest event.',
    'The application archive is optional and may be absent; if present, only complete platform_history documents are considered, selected by greatest fetchedAt following src/lib/v3/runtime.ts latestArchivedHistory.'],
  fixture: analyze(fixture, 'repository data/resets-history.json'),
  latestArchivedHistory: analyze(selected, selectedLabel)
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({outputPath, historyInputPath, fixture: result.fixture, latestArchivedHistory: result.latestArchivedHistory}, null, 2));
