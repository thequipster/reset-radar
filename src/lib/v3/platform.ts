/** Pure platform-announcement model. Times are UTC milliseconds. */
export const DAY_MS = 86_400_000;
export const AGE_BANDS_DAYS = [3, 9] as const;
export const SHRINKAGE_DAYS = 28;
export type RegularEventInput = {
  id?: string | number; resetType?: string; announcedAt?: string | number;
  firstSeenAt?: string | number | null; source?: unknown; sourceType?: unknown;
  relatedEventIds?: readonly (string | number)[]; relatedIds?: readonly (string | number)[];
  [key: string]: unknown;
};
/** complete=true must be backed by successful fetch/pagination evidence. */
export type CoverageInterval = { from: number; to: number; complete: true };
export type PlatformEventVersion = { version: string | number | null; announcedAt: number; firstSeenAt: number | null; source?: unknown };
export type PlatformEvent = { id: string; announcedAt: number; firstSeenAt: number | null; source?: unknown; relatedIds: string[]; versions: PlatformEventVersion[] };
export type PlatformModel = {
  version: 'platform-v3'; cutoff: number; events: PlatformEvent[];
  k: [number, number, number]; e: [number, number, number];
  lambda0: number | null; lambda: [number, number, number] | null;
  globalRatePerDay: number | null; lastEventAt: number | null;
  eventCount: number; completedGapCount: number; exposureDays: number;
  coverageDays: number; status: 'insufficient' | 'reference';
};
export type PlatformForecast = {
  target: 'platform_notice'; probability24h: number | null;
  probabilities: { horizonMs: number; probability: number | null }[];
  model: 'constant_rate'; shadow: { model: 'age_piecewise'; probability24h: number | null; probabilities: { horizonMs: number; probability: number | null }[] };
  globalRatePerDay: number | null; ageDays: number | null;
  factors: { key: string; before: number; after: number; explanation: string }[];
  shadowFactors: { key: string; before: number; after: number; explanation: string }[];
  training: { eventCount: number; completedGapCount: number; exposureDays: number };
  status: 'insufficient' | 'reference' | 'validated';
};
const asTime = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isFinite(n) ? n : null; }
  return null;
};
function normalizeEvents(inputs: readonly RegularEventInput[], cutoff: number): PlatformEvent[] {
  const byId = new Map<string, PlatformEvent>();
  let anonymous = 0;
  for (const raw of inputs) {
    if (raw.resetType !== 'regular') continue;
    const at = asTime(raw.announcedAt);
    const seen = asTime(raw.firstSeenAt);
    const versionSeen=asTime(raw.versionSeenAt);
    if (at === null || at > cutoff || (seen !== null && seen > cutoff) || (versionSeen!==null&&versionSeen>cutoff)) continue;
    const id = raw.id == null ? `anonymous:${at}:${anonymous++}` : String(raw.id);
    const source = raw.source ?? raw.sourceType;
    const event = { id, announcedAt: at, firstSeenAt: seen, source,
      relatedIds: [...(raw.relatedEventIds ?? raw.relatedIds ?? [])].map(String),
      versions: [{ version: typeof raw.version === 'string' || typeof raw.version === 'number' ? raw.version : null, announcedAt: at, firstSeenAt: seen, source }] };
    // Revisions with one ID are one event; use the latest visible representation.
    const prior = byId.get(id);
    byId.set(id, prior ? { ...event, firstSeenAt: prior.firstSeenAt === null || seen === null ? null : Math.min(prior.firstSeenAt, seen),
      versions: [...prior.versions, ...event.versions] } : event);
  }
  const values = [...byId.values()], parent = new Map(values.map(e => [e.id, e.id]));
  const find = (id: string): string => { const p = parent.get(id) ?? id; if (p !== id) parent.set(id, find(p)); return parent.get(id) ?? id; };
  const union = (a: string, b: string) => { if (parent.has(a) && parent.has(b)) parent.set(find(b), find(a)); };
  for (const event of values) for (const related of event.relatedIds) union(event.id, related);
  const groups = new Map<string, PlatformEvent[]>();
  for (const event of values) { const key = find(event.id); groups.set(key, [...(groups.get(key) ?? []), event]); }
  return [...groups.values()].map(group => {
    const representative = group.slice().sort((a, b) => a.announcedAt - b.announcedAt || a.id.localeCompare(b.id))[0];
    return { ...representative, firstSeenAt: group.some(x => x.firstSeenAt === null) ? null : Math.min(...group.map(x => x.firstSeenAt!)),
      versions: group.flatMap(x => x.versions) };
  })
    .sort((a, b) => a.announcedAt - b.announcedAt || a.id.localeCompare(b.id));
}
function intervalsFor(from: number, to: number, coverage: readonly CoverageInterval[]): CoverageInterval[] {
  return coverage.filter(x => x.complete === true).map(x => ({ from: Math.max(from, x.from), to: Math.min(to, x.to), complete: true as const }))
    .filter(x => x.to > x.from).sort((a, b) => a.from - b.from);
}
function unionCoverage(from: number, to: number, coverage: readonly CoverageInterval[]): CoverageInterval[] {
  const sorted = intervalsFor(from, to, coverage); const out: CoverageInterval[] = [];
  for (const current of sorted) {
    const last = out.at(-1);
    if (last && current.from <= last.to) last.to = Math.max(last.to, current.to);
    else out.push({ ...current });
  }
  return out;
}
function accumulate(from: number, to: number, coverage: readonly CoverageInterval[], e: number[]): boolean {
  const pieces = intervalsFor(from, to, coverage);
  let cursor = from, complete = true;
  for (const p of pieces) {
    if (p.from > cursor) complete = false; // unknown gap; continue to count later known exposure
    const lo = Math.max(cursor, p.from);
    if (p.to > lo) {
      let age = (lo - from) / DAY_MS;
      let remain = (p.to - lo) / DAY_MS;
      while (remain > 1e-12) {
        const band = age < 3 ? 0 : age < 9 ? 1 : 2;
        const edge = band === 0 ? 3 : band === 1 ? 9 : Infinity;
        const step = Math.min(remain, edge - age);
        e[band] += step; age += step; remain -= step;
      }
      cursor = Math.max(cursor, p.to);
    }
    if (cursor >= to) return complete;
  }
  return complete && cursor >= to;
}
function ageIntegrals(ageDays: number, horizonDays: number, rates: readonly number[]): number {
  let age = ageDays, remain = horizonDays, h = 0;
  while (remain > 1e-12) {
    const band = age < 3 ? 0 : age < 9 ? 1 : 2;
    const edge = band === 0 ? 3 : band === 1 ? 9 : Infinity;
    const step = Math.min(remain, edge - age);
    h += rates[band] * step; age += step; remain -= step;
  }
  return h;
}
export function fitPlatformModel(input: {
  events: readonly RegularEventInput[]; coverage: readonly CoverageInterval[];
  trainingCutoff: number; now?: number;
}): PlatformModel {
  const cutoff = input.trainingCutoff;
  const events = normalizeEvents(input.events, cutoff);
  const k = [0, 0, 0], e = [0, 0, 0];
  let completedGapCount = 0;
  for (let i = 1; i < events.length; i++) {
    const from = events[i - 1].announcedAt, to = events[i].announcedAt;
    if (to <= from || !accumulate(from, to, input.coverage, e)) continue;
    const age = (to - from) / DAY_MS;
    k[age < 3 ? 0 : age < 9 ? 1 : 2]++; completedGapCount++;
  }
  const last = events.at(-1)?.announcedAt ?? null;
  if (last !== null && cutoff > last) accumulate(last, cutoff, input.coverage, e);
  const exposureDays = e.reduce((a, b) => a + b, 0);
  const totalK = k.reduce((a, b) => a + b, 0);
  const lambda0 = totalK > 0 && exposureDays > 0 ? totalK / exposureDays : null;
  const rates = lambda0 === null ? null : e.map((exposure, i) => (k[i] + SHRINKAGE_DAYS * lambda0) / (exposure + SHRINKAGE_DAYS)) as [number, number, number];
  return { version: 'platform-v3', cutoff, events, k: k as [number, number, number], e: e as [number, number, number], lambda0, lambda: rates,
    globalRatePerDay: lambda0, lastEventAt: last, eventCount: events.length, completedGapCount, exposureDays,
    coverageDays: unionCoverage(-Number.MAX_SAFE_INTEGER, cutoff, input.coverage).reduce((s, x) => s + (x.to - x.from) / DAY_MS, 0),
    status: lambda0 === null ? 'insufficient' : 'reference' };
}
export function predictPlatform(model: PlatformModel, now: number, horizonsMs: readonly number[] = [DAY_MS]): PlatformForecast {
  const ageDays = model.lastEventAt === null ? null : Math.max(0, (now - model.lastEventAt) / DAY_MS);
  const p0 = (h: number) => model.lambda0 === null ? null : 1 - Math.exp(-model.lambda0 * h / DAY_MS);
  const p1 = (h: number) => model.lambda === null || ageDays === null ? null : 1 - Math.exp(-ageIntegrals(ageDays, h / DAY_MS, model.lambda));
  const probs = horizonsMs.map(horizonMs => ({ horizonMs, probability: p0(horizonMs) }));
  const p0TwentyFour = p0(DAY_MS), p1TwentyFour = p1(DAY_MS);
  const ageAfter = ageDays === null || model.lambda === null || p0TwentyFour === null ? null : p1TwentyFour;
  return { target: 'platform_notice', probability24h: p0(DAY_MS), probabilities: probs, model: 'constant_rate', shadow: { model: 'age_piecewise', probability24h: p1(DAY_MS), probabilities: horizonsMs.map(horizonMs => ({ horizonMs, probability: p1(horizonMs) })) },
    globalRatePerDay: model.lambda0, ageDays, factors: p0TwentyFour === null ? [] : [{ key: 'baseline', before: 0, after: p0TwentyFour, explanation: 'P0 constant-rate formal reference' }],
    shadowFactors: p0TwentyFour === null || ageAfter === null ? [] : [{ key: 'baseline', before: 0, after: p0TwentyFour, explanation: 'P0 comparison' },
      { key: 'platform_age', before: p0TwentyFour, after: ageAfter, explanation: 'P1 age-piecewise shadow; attribution, not causation' }],
    training: { eventCount: model.eventCount, completedGapCount: model.completedGapCount, exposureDays: model.exposureDays }, status: model.status };
}
function mulberry32(seed: number): () => number { return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export type MatchedPlatformScore = { week: number; label: 0 | 1; p0: number; p1: number };
/** Resample whole BJT weeks to preserve within-week dependence (§10.3); compare matched P0/P1 scores (§10.4).
 * Fixed seed and 1024 replicates make the descriptive bootstrap interval reproducible; it is not a promotion threshold.
 */
export function bootstrapWeeklyBrierImprovement(rows: readonly MatchedPlatformScore[], opts: { seed?: number; resamples?: 256 | 1024 } = {}) {
  const weeks = new Map<number, MatchedPlatformScore[]>();
  for (const row of rows) weeks.set(row.week, [...(weeks.get(row.week) ?? []), row]);
  const blocks = [...weeks.values()];
  if (!blocks.length) return { seed: opts.seed ?? 20261012, resamples: opts.resamples ?? 1024, estimate: null, lower: null, upper: null, blockCount: 0 };
  const score = (sample: readonly MatchedPlatformScore[]) => sample.reduce((s, r) => s + ((r.p0 - r.label) ** 2 - (r.p1 - r.label) ** 2), 0) / sample.length;
  const estimate = score(rows), rng = mulberry32(opts.seed ?? 20261012), n = opts.resamples ?? 1024;
  const draws: number[] = [];
  for (let i = 0; i < n; i++) {
    const sample: MatchedPlatformScore[] = [];
    for (let j = 0; j < blocks.length; j++) sample.push(...blocks[Math.floor(rng() * blocks.length)]);
    draws.push(score(sample));
  }
  draws.sort((a, b) => a - b);
  const quantile = (q: number) => { const x = (draws.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return draws[lo] + (draws[hi] - draws[lo]) * (x - lo); };
  return { seed: opts.seed ?? 20261012, resamples: n, estimate, lower: quantile(0.025), upper: quantile(0.975), blockCount: blocks.length };
}

export type OnlinePlatformScoreRow = {
  group?: string; groupDate?: string; target?: string; trainingCutoff?: number; issuedAt?: number;
  probability?: number | null; probabilityP0?: number | null; probabilityP1?: number | null; p0?: number | null; p1?: number | null;
  outcome?: 'positive' | 'negative' | 'pending' | 'censored' | 'unknown' | 0 | 1 | null; label?: 0 | 1 | null;
  record?: { target?: string; trainingCutoff?: number; issuedAt?: number; probability?: number | null; modelVersion?: string };
};
/** Summarize only primary-daily, same-target, same-cutoff P0/P1 pairs; missing and censored rows remain explicit. */
export function summarizeOnlinePlatformScores(rows: readonly OnlinePlatformScoreRow[]) {
  const primary = rows.filter(r => r.group === 'primary_daily' && (r.target ?? r.record?.target) === 'platform_notice');
  const keys = (r: OnlinePlatformScoreRow) => {
    const cutoff = r.trainingCutoff ?? r.record?.trainingCutoff;
    const issued = r.issuedAt ?? r.record?.issuedAt;
    return cutoff == null || issued == null ? null : `${r.groupDate ?? ''}|platform_notice|${cutoff}|${issued}`;
  };
  const groups = new Map<string, OnlinePlatformScoreRow[]>();
  for (const r of primary) { const key = keys(r); if (key) groups.set(key, [...(groups.get(key) ?? []), r]); }
  const matched: { label: 0 | 1; p0: number; p1: number }[] = [];
  let pending = 0, censored = 0, unknown = 0, missingPair = 0;
  for (const group of groups.values()) {
    const p0row = group.find(r => r.p0 != null || r.probabilityP0 != null || (r.record?.modelVersion ?? '').toLowerCase().includes('p0'));
    const p1row = group.find(r => r.p1 != null || r.probabilityP1 != null || (r.record?.modelVersion ?? '').toLowerCase().includes('p1'));
    const p0 = p0row?.p0 ?? p0row?.probabilityP0 ?? p0row?.probability ?? p0row?.record?.probability;
    const p1 = p1row?.p1 ?? p1row?.probabilityP1 ?? (p0row === p1row ? null : p1row?.probability ?? p1row?.record?.probability) ?? group.find(r => r.probabilityP1 != null)?.probabilityP1;
    const outcome = group.map(r => r.outcome ?? r.label).find(x => x != null) ?? null;
    if (outcome === 'censored') { censored++; continue; }
    if (outcome === 'pending') { pending++; continue; }
    if (outcome === 'unknown' || outcome === null) { unknown++; continue; }
    const label = outcome === 'positive' ? 1 : outcome === 'negative' ? 0 : outcome;
    if ((label !== 0 && label !== 1) || p0 == null || p1 == null || !Number.isFinite(p0) || !Number.isFinite(p1)) { missingPair++; continue; }
    matched.push({ label, p0, p1 });
  }
  const bins = (key: 'p0' | 'p1') => {
    const edges = [0, .05, .1, .2, .5, 1];
    return edges.slice(0, -1).map((lo, i) => { const hi = edges[i + 1], values = matched.filter(r => r[key] >= lo && (i === edges.length - 2 ? r[key] <= hi : r[key] < hi));
      return { from: lo, to: hi, count: values.length, meanProbability: values.length ? values.reduce((s, r) => s + r[key], 0) / values.length : null, eventRate: values.length ? values.reduce((s, r) => s + r.label, 0) / values.length : null }; });
  };
  return { primaryRows: primary.length, matchedCount: matched.length, pending, censored, unknown, missingPair,
    brierP0: matched.length ? matched.reduce((s, r) => s + (r.p0 - r.label) ** 2, 0) / matched.length : null,
    brierP1: matched.length ? matched.reduce((s, r) => s + (r.p1 - r.label) ** 2, 0) / matched.length : null,
    probabilityBins: { p0: bins('p0'), p1: bins('p1') } };
}
export function generateRenewalPaths(model: PlatformModel, opts: { now: number; horizonMs: number; count?: number; seed: number; variant?: 'constant_rate' | 'age_piecewise' }): number[][] {
  const count = opts.count ?? 256, paths: number[][] = [];
  const rates = opts.variant === 'age_piecewise' ? model.lambda : model.lambda?.map(() => model.lambda0 ?? 0) as [number, number, number] | null;
  if (!rates) return Array.from({ length: count }, () => []);
  for (let n = 0; n < count; n++) {
    // 每条路径有固定随机流，延长某一条路径不能挪动后续路径的抽样起点。
    const rng=mulberry32((opts.seed+Math.imul(n,0x9e3779b9))>>>0);
    const path: number[] = []; let time = opts.now, age = model.lastEventAt === null ? 0 : Math.max(0, (opts.now - model.lastEventAt) / DAY_MS);
    while (time < opts.now + opts.horizonMs) {
      const u = Math.max(Number.MIN_VALUE, 1 - rng()), threshold = -Math.log(u);
      // Invert the piecewise cumulative hazard exactly, resetting age at each generated event.
      let remaining = threshold, elapsedDays = 0, a = age;
      while (true) {
        const band = a < 3 ? 0 : a < 9 ? 1 : 2, edge = band === 0 ? 3 : band === 1 ? 9 : Infinity;
        const chunk = edge - a, h = rates[band] * chunk;
        if (remaining <= h || !Number.isFinite(chunk)) { elapsedDays += remaining / rates[band]; break; }
        remaining -= h; elapsedDays += chunk; a = edge;
      }
      time += elapsedDays * DAY_MS;
      if (time > opts.now + opts.horizonMs) break;
      path.push(time); age = 0;
    }
    paths.push(path);
  }
  return paths;
}
export function backtestPlatform(input: { events: readonly RegularEventInput[]; coverage: readonly CoverageInterval[]; from: number; to: number; issuedAtStepMs?: number; horizonMs?: number; blockDays?: number }) {
  const dailyFixed = input.issuedAtStepMs === undefined, step = input.issuedAtStepMs ?? DAY_MS, h = input.horizonMs ?? DAY_MS;
  const rows: { issuedAt: number; p0: number | null; p1: number | null; label: 0 | 1 | null }[] = [];
  const outcomeEvents = normalizeEvents(input.events, Number.POSITIVE_INFINITY);
  const bjtOffset = 8 * 3_600_000;
  const localDayStart = Math.floor((input.from + bjtOffset) / DAY_MS) * DAY_MS - bjtOffset;
  let firstIssueAt = dailyFixed ? localDayStart + 9 * 3_600_000 : input.from;
  if (firstIssueAt < input.from) firstIssueAt += dailyFixed ? DAY_MS : 0;
  for (let t = firstIssueAt; t + h <= input.to; t += step) {
    const model = fitPlatformModel({ events: input.events, coverage: input.coverage, trainingCutoff: t });
    const fc = predictPlatform(model, t, [h]);
    const covered = unionCoverage(t, t + h, input.coverage);
    const complete = covered.length > 0 && covered[0].from <= t && covered.at(-1)!.to >= t + h && covered.every((x, i) => i === 0 || x.from <= covered[i - 1].to);
    const hit = outcomeEvents.some(e => e.announcedAt > t && e.announcedAt <= t + h);
    rows.push({ issuedAt: t, p0: fc.probability24h, p1: fc.shadow.probability24h, label: hit ? 1 : complete ? 0 : null });
  }
  const scored = rows.filter(r => r.label !== null && r.p0 !== null && r.p1 !== null);
  const brier = (key: 'p0' | 'p1') => scored.length ? scored.reduce((s, r) => s + ((r[key] as number) - (r.label as number)) ** 2, 0) / scored.length : null;
  const weeks = new Map<number, typeof scored>(); for (const r of scored) { const w = Math.floor((r.issuedAt + bjtOffset + 3 * DAY_MS) / (7 * DAY_MS)); weeks.set(w, [...(weeks.get(w) ?? []), r]); }
  const weeklyBlocks = [...weeks.values()].map(block => ({ count: block.length, brierP0: block.reduce((s, r) => s + ((r.p0 as number) - (r.label as number)) ** 2, 0) / block.length, brierP1: block.reduce((s, r) => s + ((r.p1 as number) - (r.label as number)) ** 2, 0) / block.length }));
  const positives = scored.filter(r => r.label === 1).length, improvement = brier('p0') !== null && brier('p1') !== null ? (brier('p0') as number) - (brier('p1') as number) : null;
  const matchedForBootstrap = scored.map(r => ({ week: Math.floor((r.issuedAt + bjtOffset + 3 * DAY_MS) / (7 * DAY_MS)), label: r.label as 0 | 1, p0: r.p0 as number, p1: r.p1 as number }));
  const weeklyBootstrap = bootstrapWeeklyBrierImprovement(matchedForBootstrap);
  const weeklyBlockRobustness: 'insufficient' | 'supported' | 'unclear' = weeklyBlocks.length < 3 ? 'insufficient' : weeklyBootstrap.lower !== null && weeklyBootstrap.lower > 0 ? 'supported' : 'unclear';
  const idealized = input.events.some(e => e.firstSeenAt == null);
  return { rows, scoredCount: scored.length, positiveCount: positives, brierP0: brier('p0'), brierP1: brier('p1'), weeklyBlocks, weeklyBootstrap,
    idealized, weeklyBlockRobustness,
    upgradeEligible: !idealized && scored.length >= 60 && positives >= 10 && improvement !== null && improvement > 0 && weeklyBlockRobustness === 'supported' };
}
