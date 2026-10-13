// src/lib/v3/platform.ts
var DAY_MS = 864e5;
var SHRINKAGE_DAYS = 28;
var asTime = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
function normalizeEvents(inputs, cutoff) {
  const byId = /* @__PURE__ */ new Map();
  let anonymous = 0;
  for (const raw of inputs) {
    if (raw.resetType !== "regular") continue;
    const at = asTime(raw.announcedAt);
    const seen = asTime(raw.firstSeenAt);
    const versionSeen = asTime(raw.versionSeenAt);
    if (at === null || at > cutoff || seen !== null && seen > cutoff || versionSeen !== null && versionSeen > cutoff) continue;
    const id = raw.id == null ? `anonymous:${at}:${anonymous++}` : String(raw.id);
    const source = raw.source ?? raw.sourceType;
    const event = {
      id,
      announcedAt: at,
      firstSeenAt: seen,
      source,
      relatedIds: [...raw.relatedEventIds ?? raw.relatedIds ?? []].map(String),
      versions: [{ version: typeof raw.version === "string" || typeof raw.version === "number" ? raw.version : null, announcedAt: at, firstSeenAt: seen, source }]
    };
    const prior = byId.get(id);
    byId.set(id, prior ? {
      ...event,
      firstSeenAt: prior.firstSeenAt === null || seen === null ? null : Math.min(prior.firstSeenAt, seen),
      versions: [...prior.versions, ...event.versions]
    } : event);
  }
  const values = [...byId.values()], parent = new Map(values.map((e) => [e.id, e.id]));
  const find = (id) => {
    const p = parent.get(id) ?? id;
    if (p !== id) parent.set(id, find(p));
    return parent.get(id) ?? id;
  };
  const union = (a, b) => {
    if (parent.has(a) && parent.has(b)) parent.set(find(b), find(a));
  };
  for (const event of values) for (const related of event.relatedIds) union(event.id, related);
  const groups = /* @__PURE__ */ new Map();
  for (const event of values) {
    const key = find(event.id);
    groups.set(key, [...groups.get(key) ?? [], event]);
  }
  return [...groups.values()].map((group) => {
    const representative = group.slice().sort((a, b) => a.announcedAt - b.announcedAt || a.id.localeCompare(b.id))[0];
    return {
      ...representative,
      firstSeenAt: group.some((x) => x.firstSeenAt === null) ? null : Math.min(...group.map((x) => x.firstSeenAt)),
      versions: group.flatMap((x) => x.versions)
    };
  }).sort((a, b) => a.announcedAt - b.announcedAt || a.id.localeCompare(b.id));
}
function intervalsFor(from, to, coverage) {
  return coverage.filter((x) => x.complete === true).map((x) => ({ from: Math.max(from, x.from), to: Math.min(to, x.to), complete: true })).filter((x) => x.to > x.from).sort((a, b) => a.from - b.from);
}
function unionCoverage(from, to, coverage) {
  const sorted = intervalsFor(from, to, coverage);
  const out = [];
  for (const current of sorted) {
    const last = out.at(-1);
    if (last && current.from <= last.to) last.to = Math.max(last.to, current.to);
    else out.push({ ...current });
  }
  return out;
}
function accumulate(from, to, coverage, e) {
  const pieces = intervalsFor(from, to, coverage);
  let cursor = from, complete = true;
  for (const p of pieces) {
    if (p.from > cursor) complete = false;
    const lo = Math.max(cursor, p.from);
    if (p.to > lo) {
      let age = (lo - from) / DAY_MS;
      let remain = (p.to - lo) / DAY_MS;
      while (remain > 1e-12) {
        const band = age < 3 ? 0 : age < 9 ? 1 : 2;
        const edge = band === 0 ? 3 : band === 1 ? 9 : Infinity;
        const step = Math.min(remain, edge - age);
        e[band] += step;
        age += step;
        remain -= step;
      }
      cursor = Math.max(cursor, p.to);
    }
    if (cursor >= to) return complete;
  }
  return complete && cursor >= to;
}
function fitPlatformModel(input) {
  const cutoff = input.trainingCutoff;
  const events = normalizeEvents(input.events, cutoff);
  const k = [0, 0, 0], e = [0, 0, 0];
  let completedGapCount = 0;
  for (let i = 1; i < events.length; i++) {
    const from = events[i - 1].announcedAt, to = events[i].announcedAt;
    if (to <= from || !accumulate(from, to, input.coverage, e)) continue;
    const age = (to - from) / DAY_MS;
    k[age < 3 ? 0 : age < 9 ? 1 : 2]++;
    completedGapCount++;
  }
  const last = events.at(-1)?.announcedAt ?? null;
  if (last !== null && cutoff > last) accumulate(last, cutoff, input.coverage, e);
  const exposureDays = e.reduce((a, b) => a + b, 0);
  const totalK = k.reduce((a, b) => a + b, 0);
  const lambda0 = totalK > 0 && exposureDays > 0 ? totalK / exposureDays : null;
  const rates = lambda0 === null ? null : e.map((exposure, i) => (k[i] + SHRINKAGE_DAYS * lambda0) / (exposure + SHRINKAGE_DAYS));
  return {
    version: "platform-v3",
    cutoff,
    events,
    k,
    e,
    lambda0,
    lambda: rates,
    globalRatePerDay: lambda0,
    lastEventAt: last,
    eventCount: events.length,
    completedGapCount,
    exposureDays,
    coverageDays: unionCoverage(-Number.MAX_SAFE_INTEGER, cutoff, input.coverage).reduce((s, x) => s + (x.to - x.from) / DAY_MS, 0),
    status: lambda0 === null ? "insufficient" : "reference"
  };
}

// src/lib/v3/trend.ts
var HALF_LIFE_DAYS = 60;
var SHRINKAGE_EXPOSURE_DAYS = 7;
var TREND_VERSION = "platform-v3.1:D60";
function eventWeight(now, at) {
  return Math.exp(-Math.LN2 / HALF_LIFE_DAYS * (now - at) / DAY_MS);
}
function weightedExposure(now, from, to, order = 1) {
  const k = Math.LN2 / HALF_LIFE_DAYS * order;
  return (Math.exp(-k * (now - to) / DAY_MS) - Math.exp(-k * (now - from) / DAY_MS)) / k;
}
function reliableCoverage(coverage, cutoff, from = -Infinity) {
  const sorted = coverage.filter((c) => c.complete && Number.isFinite(c.from) && Number.isFinite(c.to)).map((c) => ({ from: Math.max(from, c.from), to: Math.min(cutoff, c.to), complete: true })).filter((c) => c.to > c.from).sort((a, b) => a.from - b.from), out = [];
  for (const c of sorted) {
    const last = out.at(-1);
    if (last && last.to >= c.from) last.to = Math.max(last.to, c.to);
    else out.push({ ...c });
  }
  return out;
}
function fitTrendModel(input) {
  const t = input.trainingCutoff, coverage = reliableCoverage(input.coverage, t);
  const events = fitPlatformModel({ ...input, coverage: [] }).events.filter((e) => coverage.some((c) => e.announcedAt > c.from && e.announcedAt <= c.to));
  const exposureDays = coverage.reduce((s, c) => s + (c.to - c.from) / DAY_MS, 0), weightedCount = events.reduce((s, e) => s + eventWeight(t, e.announcedAt), 0);
  const weightedExposureDays = coverage.reduce((s, c) => s + weightedExposure(t, c.from, c.to), 0);
  const squaredExposure = coverage.reduce((s, c) => s + weightedExposure(t, c.from, c.to, 2), 0);
  const lambdaAll = exposureDays > 0 ? events.length / exposureDays : null;
  const ratePerDay = lambdaAll == null || weightedExposureDays <= 0 ? null : (weightedCount + SHRINKAGE_EXPOSURE_DAYS * lambdaAll) / (weightedExposureDays + SHRINKAGE_EXPOSURE_DAYS);
  return {
    version: TREND_VERSION,
    cutoff: t,
    halfLifeDays: HALF_LIFE_DAYS,
    shrinkageDays: SHRINKAGE_EXPOSURE_DAYS,
    weightedCount,
    weightedExposureDays,
    exposureDays,
    eventCount: events.length,
    lambdaAll,
    ratePerDay,
    effectiveExposureDays: squaredExposure > 0 ? weightedExposureDays ** 2 / squaredExposure : null,
    probability24h: ratePerDay == null ? null : -Math.expm1(-ratePerDay),
    probabilities: [1, 2].map((days) => ({ horizonMs: days * DAY_MS, probability: ratePerDay == null ? null : -Math.expm1(-ratePerDay * days) }))
  };
}

// src/lib/v3/weekday.ts
var WEEKDAY_SHRINKAGE_DAYS = 28;
var WEEKDAY_VERSION = "platform-v3.2:D60-W28-BJT-shadow";
var BJT_OFFSET_MS = 8 * 36e5;
var BJT = "Asia/Shanghai";
var MAX_DATE_MS = 864e13;
var MAX_PREDICTION_SEGMENTS = 3660;
var weekdayAt = (t) => new Date(t + BJT_OFFSET_MS).getUTCDay();
function fitWeekdayModel(input) {
  const base = fitTrendModel(input), counts = Array(7).fill(0), exposures = Array(7).fill(0);
  const cutoff = input.trainingCutoff, coverage = reliableCoverage(input.coverage, cutoff);
  const events = fitPlatformModel({ ...input, coverage: [] }).events.filter((e) => coverage.some((c) => e.announcedAt > c.from && e.announcedAt <= c.to));
  for (const e of events) counts[weekdayAt(e.announcedAt)] += eventWeight(cutoff, e.announcedAt);
  for (const c of coverage) {
    let from = c.from;
    while (from < c.to) {
      const nextMidnight = Math.floor((from + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS + DAY_MS;
      const to = Math.min(c.to, nextMidnight);
      exposures[weekdayAt(from)] += weightedExposure(cutoff, from, to);
      from = to;
    }
  }
  const lambda = base.ratePerDay;
  const q = exposures.map((e, d) => (counts[d] + WEEKDAY_SHRINKAGE_DAYS * (lambda ?? 0)) / (e + WEEKDAY_SHRINKAGE_DAYS));
  const qMean = q.reduce((a, b) => a + b, 0) / 7;
  const multipliers = qMean > 0 ? q.map((x) => x / qMean) : Array(7).fill(1);
  return {
    version: WEEKDAY_VERSION,
    timezone: BJT,
    shrinkagePerWeekdayDays: WEEKDAY_SHRINKAGE_DAYS,
    base,
    counts,
    exposures,
    multipliers,
    rates: multipliers.map((m) => lambda == null ? null : lambda * m)
  };
}
function predictWeekday(model, now, horizonMs = DAY_MS) {
  if (!model || !model.base || !Array.isArray(model.rates) || model.rates.length !== 7 || model.rates.some((value) => value == null || !Number.isFinite(value) || value < 0) || model.base.ratePerDay == null || !Number.isFinite(model.base.ratePerDay) || model.base.ratePerDay < 0 || !Number.isFinite(now) || Math.abs(now) > MAX_DATE_MS || now < model.base.cutoff || !Number.isFinite(horizonMs) || horizonMs < 0 || horizonMs > MAX_PREDICTION_SEGMENTS * DAY_MS) return null;
  const end = now + horizonMs;
  if (!Number.isFinite(end) || Math.abs(end) > MAX_DATE_MS || !Number.isFinite(weekdayAt(now))) return null;
  const segments = [];
  let from = now, integratedHazard = 0;
  while (from < end) {
    const to = Math.min(end, Math.floor((from + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS + DAY_MS);
    if (!(to > from) || !Number.isFinite(to)) return null;
    const weekday = weekdayAt(from), rate = model.rates[weekday];
    if (rate == null || !Number.isFinite(rate) || rate < 0) return null;
    const ratePerDay = rate, hazard = ratePerDay * (to - from) / DAY_MS;
    if (!Number.isFinite(hazard) || hazard < 0) return null;
    segments.push({ from, to, weekday, ratePerDay, hazard });
    integratedHazard += hazard;
    from = to;
    if (!Number.isFinite(integratedHazard) || segments.length > MAX_PREDICTION_SEGMENTS) return null;
  }
  const probability = -Math.expm1(-integratedHazard);
  return Number.isFinite(probability) && probability >= 0 && probability <= 1 ? { probability, integratedHazard, segments } : null;
}
export {
  WEEKDAY_SHRINKAGE_DAYS,
  WEEKDAY_VERSION,
  fitWeekdayModel,
  predictWeekday
};
