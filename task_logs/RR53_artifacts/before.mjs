// src/lib/beijing.ts
var BEIJING_OFFSET_MS = 8 * 36e5;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
function beijingHoursIntoDay(ms) {
  const into = (ms + BEIJING_OFFSET_MS) % DAY_MS;
  return (into < 0 ? into + DAY_MS : into) / HOUR_MS;
}
function beijingDayFloor(ms) {
  return ms - beijingHoursIntoDay(ms) * HOUR_MS;
}

// src/lib/v3/coldStart.ts
var POLICY_DAILY_COST = { light: 50 / 7, normal: 100 / 7, busy: 200 / 7 };
var CARD_BUFFER_MS = 30 * 6e4;
function allocateColdBudget(account, now, nextReviewAt, todayWeight = 1) {
  const remaining = account.weekly.remaining, cutoff = account.weekly.resetsAt;
  if (![remaining, cutoff, now].every(Number.isFinite) || remaining < 0 || cutoff <= now) return null;
  const totalHours = (cutoff - now) / HOUR_MS;
  const todayEnd = Math.min(cutoff, beijingMidnightAfter(now));
  const todayHours = Math.max(0, (todayEnd - now) / HOUR_MS);
  const reviewHours = Math.max(0, Math.min(cutoff, nextReviewAt != null && nextReviewAt > now ? nextReviewAt : now + 12 * HOUR_MS) - now) / HOUR_MS;
  const weightedHours = totalHours + (todayWeight - 1) * todayHours;
  const total = clamp(remaining, 0, remaining);
  const weightedReviewHours = Math.min(reviewHours, todayHours) * todayWeight + Math.max(0, Math.min(reviewHours, totalHours) - todayHours);
  return { today: total * todayHours * todayWeight / weightedHours, untilReview: total * weightedReviewHours / weightedHours, total };
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function beijingMidnightAfter(now) {
  const day = Math.floor((now + 8 * HOUR_MS) / DAY_MS) * DAY_MS;
  return day - 8 * HOUR_MS + DAY_MS;
}

// src/lib/v3/platform.ts
var DAY_MS2 = 864e5;
function mulberry32(seed) {
  return () => {
    let t = seed += 1831565813;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function generateRenewalPaths(model, opts) {
  const count = opts.count ?? 256, paths = [];
  const rates = opts.variant === "age_piecewise" ? model.lambda : model.lambda?.map(() => model.lambda0 ?? 0);
  if (!rates) return Array.from({ length: count }, () => []);
  for (let n = 0; n < count; n++) {
    const rng = mulberry32(opts.seed + Math.imul(n, 2654435769) >>> 0);
    const path = [];
    let time = opts.now, age = model.lastEventAt === null ? 0 : Math.max(0, (opts.now - model.lastEventAt) / DAY_MS2);
    while (time < opts.now + opts.horizonMs) {
      const u = Math.max(Number.MIN_VALUE, 1 - rng()), threshold = -Math.log(u);
      let remaining = threshold, elapsedDays = 0, a = age;
      while (true) {
        const band = a < 3 ? 0 : a < 9 ? 1 : 2, edge = band === 0 ? 3 : band === 1 ? 9 : Infinity;
        const chunk = edge - a, h = rates[band] * chunk;
        if (remaining <= h || !Number.isFinite(chunk)) {
          elapsedDays += remaining / rates[band];
          break;
        }
        remaining -= h;
        elapsedDays += chunk;
        a = edge;
      }
      time += elapsedDays * DAY_MS2;
      if (time > opts.now + opts.horizonMs) break;
      path.push(time);
      age = 0;
    }
    paths.push(path);
  }
  return paths;
}

// src/lib/v3/simulator.ts
var weeklyDeadlineAfterCard = (now) => now + 7 * DAY_MS;
var ACTION_BUFFER_MS = 30 * 6e4;
function available(card, at) {
  return card.state === "available" && card.reconciliation === "consistent" && card.confirmedAt != null && card.safeDeadlineAt != null && at < card.safeDeadlineAt - ACTION_BUFFER_MS;
}
function applyCardUse(state, cardId, at, mechanisms) {
  const card = state.cards.find((c) => c.localId === cardId);
  if (!card || !available(card, at) || state.availableCardCount < 1) return null;
  return {
    ...state,
    observedAt: at,
    availableCardCount: state.availableCardCount - 1,
    lastConfirmedCardUseAt: at,
    weekly: { ...state.weekly, remaining: 100, resetsAt: weeklyDeadlineAfterCard(at) },
    short: { ...state.short, remaining: 100, resetsAt: mechanisms.shortAfterCard === "restart_duration" ? at + state.short.durationMins * 6e4 : state.short.resetsAt },
    weeklyGeneration: state.weeklyGeneration + 1,
    shortGeneration: state.shortGeneration + 1,
    cards: state.cards.map((c) => c.localId === cardId ? { ...c, state: "used" } : { ...c })
  };
}
function simulatePolicy(initial, cards, policy, world, mechanisms, forecastAt) {
  let state = {
    ...initial,
    weekly: { ...initial.weekly },
    short: { ...initial.short },
    cards: cards.map((c) => ({ ...c })),
    weeklyGeneration: 0,
    shortGeneration: 0
  };
  let loss = 0, consumedWeekly = 0, consumedShort = 0, expiredCards = 0, missedSafeDeadlines = 0;
  let firstInsufficientAt = null;
  const actions = [], trajectory = [];
  const applied = /* @__PURE__ */ new Set(), deadlineSeen = /* @__PURE__ */ new Set();
  const evaluateShort = world.demand.some((b) => b.shortCost != null);
  const reviews = new Set(world.reviews.filter((t) => t >= world.start && t < world.end));
  const fixed = [.../* @__PURE__ */ new Set([
    world.start,
    world.end,
    ...reviews,
    ...world.demand.flatMap((b) => [b.start, b.end]),
    ...world.platform.map((e) => e.at),
    ...cards.flatMap((c) => c.safeDeadlineAt == null ? [] : [c.safeDeadlineAt])
  ])].filter((t) => t >= world.start && t <= world.end).sort((a, b) => a - b);
  let fixedIndex = 0;
  let at = world.start;
  while (at < world.end) {
    for (const key of ["weekly", "short"]) {
      const window = state[key];
      if (window.resetsAt <= at && Number.isFinite(window.resetsAt)) {
        const continuation = key === "weekly" ? mechanisms.weeklyContinuation : mechanisms.shortContinuation;
        const duration = window.durationMins * 6e4;
        const generations = continuation === "fixed_duration" && duration > 0 ? Math.floor((at - window.resetsAt) / duration) + 1 : 1;
        state[key] = { ...window, remaining: 100, resetsAt: continuation === "fixed_duration" && duration > 0 ? window.resetsAt + generations * duration : Infinity };
        if (key === "weekly") state.weeklyGeneration += generations;
        else state.shortGeneration += generations;
      }
    }
    for (const event of world.platform.filter((e) => e.at === at)) {
      if (applied.has(event.incidentId)) continue;
      applied.add(event.incidentId);
      if (event.weekly) {
        state.weekly = { ...state.weekly, remaining: 100, resetsAt: event.reanchorWeekly ? at + state.weekly.durationMins * 6e4 : state.weekly.resetsAt };
        state.weeklyGeneration++;
      }
      if (event.short) {
        state.short = { ...state.short, remaining: 100 };
        state.shortGeneration++;
      }
      state.lastConfirmedExternalResetAt = at;
    }
    state.cards = state.cards.map((c) => {
      if (c.state !== "available" || c.safeDeadlineAt == null || c.safeDeadlineAt > at || deadlineSeen.has(c.localId)) return c;
      deadlineSeen.add(c.localId);
      if (c.exactExpiryAt != null && c.exactExpiryAt <= at) {
        expiredCards++;
        state.availableCardCount = Math.max(0, state.availableCardCount - 1);
        return { ...c, state: "expired-confirmed" };
      }
      missedSafeDeadlines++;
      return { ...c, state: "unresolved" };
    });
    if (reviews.has(at)) {
      const visible = structuredClone(state);
      const requested = policy({ now: at, state: visible, forecast: structuredClone(forecastAt(at, visible)) });
      if (requested != null) {
        const next2 = applyCardUse(state, requested, at, mechanisms);
        if (next2) {
          state = next2;
          actions.push({ at, cardId: requested });
        }
      }
    }
    trajectory.push({
      at,
      weekly: state.weekly.remaining,
      short: state.short.remaining,
      weeklyGeneration: state.weeklyGeneration,
      shortGeneration: state.shortGeneration
    });
    while (fixedIndex < fixed.length && fixed[fixedIndex] <= at) fixedIndex++;
    const next = Math.min(
      world.end,
      state.weekly.resetsAt > at ? state.weekly.resetsAt : Infinity,
      evaluateShort && state.short.resetsAt > at ? state.short.resetsAt : Infinity,
      fixed[fixedIndex] ?? world.end
    );
    if (!(next > at) || !Number.isFinite(next)) throw new Error("invalid simulation time axis");
    for (const block of world.demand) {
      const duration = Math.min(next, block.end) - Math.max(at, block.start);
      if (duration <= 0 || block.end <= block.start) continue;
      const fraction = duration / (block.end - block.start);
      const week = Math.max(0, block.weeklyCost * fraction);
      const short = block.shortCost == null ? null : Math.max(0, block.shortCost * fraction);
      const served = Math.min(
        1,
        week > 0 ? state.weekly.remaining / week : 1,
        short != null && short > 0 ? state.short.remaining / short : 1
      );
      if (served < 1 && firstInsufficientAt == null) firstInsufficientAt = Math.max(at, block.start) + duration * served;
      loss += block.weight * fraction * (1 - served);
      consumedWeekly += week * served;
      state.weekly.remaining = Math.max(0, state.weekly.remaining - week * served);
      if (short != null) {
        consumedShort += short * served;
        state.short.remaining = Math.max(0, state.short.remaining - short * served);
      }
    }
    at = next;
  }
  return {
    loss,
    consumedWeekly,
    consumedShort,
    cardsSpent: actions.length,
    expiredCards,
    missedSafeDeadlines,
    firstInsufficientAt,
    shortWindowEvaluated: world.demand.length > 0 && world.demand.every((b) => b.shortCost != null),
    actions,
    trajectory,
    terminal: state
  };
}
var NEVER_USE = () => null;
function enumeratePolicyParameters(shortKnown) {
  const result = [];
  for (const quantile of [0.5, 0.8, 0.95]) for (const horizonHours of [0, 24, 48])
    for (const expiryLeadHours of [0, 24, 48]) for (const useForShort of shortKnown ? [false, true] : [false])
      result.push({ quantile, horizonHours, expiryLeadHours, useForShort });
  return result;
}
function makePolicy(parameters, firstAction, start, mechanisms = { shortAfterCard: "keep_deadline", weeklyContinuation: "fixed_duration", shortContinuation: "fixed_duration" }) {
  return ({ now, state, forecast }) => {
    const cards = state.cards.filter((c) => available(c, now)).sort((a, b) => a.safeDeadlineAt - b.safeDeadlineAt || a.localId.localeCompare(b.localId));
    if (now === start) return firstAction === "wait" ? null : firstAction;
    const weekGap = forecast.weeklyCost > state.weekly.remaining;
    const shortGap = parameters.useForShort && forecast.shortCost != null && forecast.shortCost > state.short.remaining;
    const card = cards[0];
    if (!card) return null;
    const nearExpiry = parameters.expiryLeadHours > 0 && card.safeDeadlineAt - now <= parameters.expiryLeadHours * HOUR_MS;
    if (!weekGap && !shortGap && !nearExpiry) return null;
    if (weekGap && state.weekly.remaining >= 100 && !shortGap) return null;
    if (shortGap && state.short.remaining >= 100 && !weekGap) return null;
    const blocks = forecast.blocks.filter((b) => b.end > now);
    if (blocks.length === 0) return null;
    const predictedWorld = { start: now, end: Math.max(...blocks.map((b) => b.end)), demand: blocks, platform: [], reviews: [now] };
    const emptyForecast = () => ({ weeklyCost: 0, shortCost: null, nextKnownSupplyAt: state.weekly.resetsAt, blocks: [] });
    const keep = simulatePolicy(state, state.cards, NEVER_USE, predictedWorld, mechanisms, emptyForecast);
    const use = simulatePolicy(state, state.cards, ({ now: t }) => t === now ? card.localId : null, predictedWorld, mechanisms, emptyForecast);
    return use.loss < keep.loss || use.loss <= keep.loss && use.consumedWeekly > keep.consumedWeekly ? card.localId : null;
  };
}
function nextReviewDelay(reviews, now) {
  return Math.max(HOUR_MS, (reviews.find((t) => t > now) ?? now + DAY_MS) - now);
}

// src/lib/v3/planning.ts
var MODEL_VERSION = "decision-v3.1-policy-default";
function seedFromSnapshot(id) {
  let n = 2166136261;
  for (const c of `${id}:${MODEL_VERSION}`) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
function random(seed) {
  return () => {
    seed |= 0;
    seed = seed + 1831565813 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function allocateDailyBudget(account, blocks, now, priorities) {
  if (!Number.isFinite(account.weekly.resetsAt) || account.weekly.resetsAt <= now || blocks.length === 0) return null;
  const segments = blocks.filter((b) => b.end > now && b.start < account.weekly.resetsAt).map((b, index) => {
    const start = Math.max(now, b.start), end = Math.min(account.weekly.resetsAt, b.end);
    const demand = b.weeklyCost * (end - start) / (b.end - b.start);
    return { start, end, demand, weight: priorities?.[index] == null ? demand : Math.max(0, priorities[index]), budget: 0 };
  });
  if (segments.length === 0 || segments.some((b) => !Number.isFinite(b.demand) || b.demand < 0)) return null;
  const target = Math.min(Math.max(0, account.weekly.remaining), segments.reduce((s, b) => s + b.demand, 0));
  let lo = 0, hi = Math.max(1, ...segments.map((b) => b.weight > 0 ? b.demand / b.weight : 0));
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    const total = segments.reduce((s, b) => s + Math.min(b.demand, mid * b.weight), 0);
    if (total < target) lo = mid;
    else hi = mid;
  }
  for (const b of segments) b.budget = Math.min(b.demand, hi * b.weight);
  const todayEnd = beijingDayFloor(now) + DAY_MS;
  const today = segments.reduce((s, b) => s + b.budget * Math.max(0, Math.min(todayEnd, b.end) - b.start) / (b.end - b.start), 0);
  return { today, allocations: segments.map(({ start, end, demand, budget }) => ({ start, end, demand, budget })), shortWindowEvaluated: blocks.every((b) => b.shortCost != null) };
}
function makeBlocks(input, end, daily) {
  if (input.explicitDemand) return input.explicitDemand.filter((b) => b.end > input.now && b.start < end).map((b) => ({ ...b }));
  if (input.dailyRange == null && input.todayBudget == null) return [];
  const blocks = [];
  const floor = beijingDayFloor(input.now);
  for (let start = floor, index = 0; start < end; start += DAY_MS, index++) {
    if (index > 0 && input.dailyRange == null) break;
    const a = Math.max(input.now, start), b = Math.min(end, start + DAY_MS), cost = daily(index);
    blocks.push({ start: a, end: input.demandPattern === "concentrated" ? Math.min(b, a + 4 * HOUR_MS) : b, weeklyCost: cost * (b - a) / DAY_MS, shortCost: null, weight: (b - a) / DAY_MS, source: input.policyDefaultTier ? "policy_default" : input.todayBudget != null && index === 0 ? "user_plan" : "learned" });
  }
  return blocks;
}
function scenarioEvents(scenario, start, end) {
  const groups = /* @__PURE__ */ new Map();
  for (const e of scenario.events) {
    if (e.at < start || e.at >= end || !e.incidentId || e.certainty !== "conditional") continue;
    const event = groups.get(e.incidentId) ?? { at: e.at, incidentId: e.incidentId, weekly: false, short: false, reanchorWeekly: scenario.id.includes("reanchor") && !scenario.id.includes("no-reanchor") };
    if (e.kind === "scheduled_weekly_supply") event.weekly = true;
    if (e.kind === "scheduled_short_supply") event.short = true;
    groups.set(e.incidentId, event);
  }
  return [...groups.values()].filter((e) => e.weekly || e.short);
}
function mean(v) {
  return v.reduce((s, n) => s + n, 0) / Math.max(1, v.length);
}
function tail(v, probabilistic) {
  if (!probabilistic) return Math.max(0, ...v);
  const values = [...v].sort((a, b) => b - a);
  return mean(values.slice(0, Math.max(1, Math.ceil(values.length * 0.1))));
}
function summarize(id, results, baselines, probabilistic) {
  const losses = results.map((r) => r.loss), m = mean(losses);
  const variance = mean(losses.map((v) => (v - m) ** 2));
  return {
    id,
    lossMean: probabilistic ? m : Math.max(0, ...losses),
    lossTail: tail(losses, probabilistic),
    spent: mean(results.map((r) => r.cardsSpent)),
    expired: mean(results.map((r) => r.expiredCards)),
    missedSafeDeadline: mean(results.map((r) => r.missedSafeDeadlines)),
    consumedWeekly: mean(results.map((r) => r.consumedWeekly)),
    deltaLoss: mean(results.map((r, i) => baselines[i].loss - r.loss)),
    deltaConsumedWeekly: mean(results.map((r, i) => r.consumedWeekly - baselines[i].consumedWeekly)),
    deltaCardsExpired: mean(results.map((r, i) => baselines[i].expiredCards - r.expiredCards)),
    firstActionAt: results.find((r) => r.actions.length)?.actions[0]?.at ?? null,
    shortWindowEvaluated: results.every((r) => r.shortWindowEvaluated),
    shortageFraction: mean(results.map((r) => Number(r.loss > 0))),
    estimateError: probabilistic ? Math.sqrt(variance / results.length) : 0
  };
}
function comparePolicies(candidates, preference) {
  const eligible = candidates.filter((c) => !c.dominated);
  if (!eligible.length) return null;
  const minTail = Math.min(...eligible.map((c) => c.Ltail));
  const best = eligible.filter((c) => c.Ltail - minTail <= Math.max(0, ...c.scenarios.map((s) => s.estimateError)));
  const time = (c) => Math.min(...c.scenarios.map((s) => s.firstActionAt ?? Infinity));
  const keys = (c) => preference === "save" ? [c.Nspent, -time(c), c.Lmean, c.Eexpire] : preference === "expiry" ? [c.Eexpire, c.Lmean, c.Nspent, time(c)] : [c.Lmean, c.Eexpire, c.Nspent, time(c)];
  return [...best].sort((a, b) => {
    const ka = keys(a), kb = keys(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return (a.firstCardDeadline ?? Infinity) - (b.firstCardDeadline ?? Infinity) || a.id.localeCompare(b.id);
  })[0];
}
function scenarioActionSensitivity(candidates, preference) {
  const ids = [...new Set(candidates.flatMap((c) => c.scenarios.map((s) => s.id)))];
  const actions = /* @__PURE__ */ new Set();
  for (const id of ids) {
    const scoped = candidates.flatMap((c) => {
      const s = c.scenarios.find((s2) => s2.id === id);
      return s ? [{ ...c, scenarios: [s], Ltail: s.lossTail, Lmean: s.lossMean, Eexpire: s.expired, Nspent: s.spent }] : [];
    });
    const selected = comparePolicies(scoped, preference);
    if (selected) actions.add(selected.firstAction);
  }
  return actions.size > 1;
}
function evaluateHorizon(input, days, seed) {
  const end = input.now + days * DAY_MS;
  const empirical = !input.policyDefaultTier && (input.dailySamples?.length ?? 0) >= 7;
  const demandCases = input.policyDefaultTier ? ["light", "normal", "busy"].map((tier) => ({ id: `default-${tier}`, multiplier: input.todayBudget != null ? tier === "light" ? 0.5 : tier === "busy" ? 2 : 1 : 1, daily: POLICY_DAILY_COST[tier] })) : input.todayBudget != null ? [0.5, 1, 2].map((multiplier, i) => ({ id: `pressure-${i}`, multiplier, daily: input.dailyRange?.median ?? 0 })) : !empirical && input.dailyRange && (input.workload == null || input.workload === "unknown") ? [{ id: "demand-low", multiplier: 1, daily: input.dailyRange.low }, { id: "demand-median", multiplier: 1, daily: input.dailyRange.median }, { id: "demand-high", multiplier: 1, daily: input.dailyRange.high }] : [{ id: "demand-reference", multiplier: 1, daily: input.dailyRange?.median ?? 0 }];
  const sampleGroups = demandCases.flatMap((demandCase) => (input.policyDefaultTier ? ["uniform", "concentrated"] : ["uniform"]).map((pattern) => {
    const samples = Array.from({ length: empirical ? 256 : 1 }, (_, path) => {
      const rng = random((seed ^ 1145392449) + Math.imul(path, 2654435769) >>> 0);
      const costs = Array.from({ length: days + 1 }, () => empirical ? input.dailySamples[Math.floor(rng() * input.dailySamples.length)] : demandCase.daily);
      const todayRange = input.todayRange ?? input.dailyRange;
      return makeBlocks({ ...input, demandPattern: pattern }, end, (index) => index === 0 && input.todayBudget != null ? input.todayBudget * demandCase.multiplier : input.policyDefaultTier ? costs[index] : index === 0 && input.workload === "light" && todayRange ? todayRange.low : index === 0 && input.workload === "busy" && todayRange ? todayRange.high : index === 0 && input.workload === "normal" && input.todayRange ? input.todayRange.median : costs[index]);
    });
    return { id: `${demandCase.id}${input.policyDefaultTier ? `:${pattern}` : ""}`, samples, pattern, daily: demandCase.daily };
  }));
  const rateCases = input.platformRates?.length ? input.platformRates : [{ id: "reference", ratePerDay: input.platformModel?.lambda0 ?? 0 }];
  const backgrounds = rateCases.map((rc) => ({ id: rc.id, ratePerDay: rc.ratePerDay, paths: input.platformModel ? generateRenewalPaths({ ...input.platformModel, lambda0: rc.ratePerDay, lambda: [rc.ratePerDay, rc.ratePerDay, rc.ratePerDay] }, { now: input.now, horizonMs: days * DAY_MS, count: 256, seed }) : [] }));
  const scenarios = input.supplyScenarios.length ? input.supplyScenarios : [{ id: "no-extra-supply", events: [] }];
  const mechanisms = [
    { shortAfterCard: "keep_deadline", weeklyContinuation: "fixed_duration", shortContinuation: "fixed_duration" },
    { shortAfterCard: "restart_duration", weeklyContinuation: "fixed_duration", shortContinuation: "fixed_duration" },
    { shortAfterCard: "keep_deadline", weeklyContinuation: "unknown", shortContinuation: "unknown" },
    { shortAfterCard: "restart_duration", weeklyContinuation: "unknown", shortContinuation: "unknown" }
  ];
  const worlds = scenarios.flatMap((sc) => (sc.source === "platform_background" ? backgrounds : [backgrounds[0]]).flatMap((background) => mechanisms.flatMap((mechanism, mi) => {
    return sampleGroups.map(({ samples: group, id, pattern, daily }) => {
      const probabilistic = empirical || sc.source === "platform_background" && background.ratePerDay > 0 && Number.isFinite(background.ratePerDay);
      const grouped = probabilistic && !empirical ? Array.from({ length: 256 }, () => group[0]) : group;
      return {
        id: `${sc.id}:mechanism-${mi}:${id}${sc.source === "platform_background" ? `:rate-${background.id}` : ""}`,
        mechanism,
        probabilistic,
        pattern,
        daily,
        paths: grouped.map((demand, path) => ({ start: input.now, end, demand, reviews: input.reviews, platform: [...scenarioEvents(sc, input.now, end), ...sc.source === "platform_background" ? (background.paths[path] ?? []).map((at, i) => ({ at, incidentId: `background-${path}-${i}`, weekly: true, short: false, reanchorWeekly: false })) : []] }))
      };
    });
  })));
  const baselines = worlds.map((w) => w.paths.map((path) => simulatePolicy(input.account, input.cards, NEVER_USE, path, w.mechanism, () => ({ weeklyCost: 0, shortCost: null, nextKnownSupplyAt: input.account.weekly.resetsAt, blocks: [] }))));
  const known = input.cards.filter((c) => c.state === "available" && c.reconciliation === "consistent" && c.confirmedAt != null && c.safeDeadlineAt != null && input.now < c.safeDeadlineAt - 30 * 6e4).sort((a, b) => a.safeDeadlineAt - b.safeDeadlineAt || a.localId.localeCompare(b.localId));
  const comparisons = [];
  const parameterOptions = enumeratePolicyParameters(input.explicitDemand?.every((b) => b.shortCost != null) ?? false);
  for (const parameters of known.length ? parameterOptions : parameterOptions.slice(0, 1)) for (const firstAction of ["wait", ...known.map((c) => c.localId)]) {
    const metrics = worlds.map((w, wi) => {
      const horizonMs = parameters.horizonHours === 0 ? nextReviewDelay(input.reviews, input.now) : parameters.horizonHours * HOUR_MS;
      const daily = input.policyDefaultTier ? w.daily : input.dailyRange ? parameters.quantile === 0.5 ? input.dailyRange.median : parameters.quantile === 0.8 ? input.dailyRange.high : input.dailyRange.p95 : input.todayBudget ?? 0;
      const forecastAt = (at, state) => {
        const today = beijingDayFloor(at) === beijingDayFloor(input.now);
        const todayRange = input.todayRange ?? input.dailyRange;
        const todayDaily = input.policyDefaultTier ? daily : todayRange ? parameters.quantile === 0.5 ? todayRange.median : parameters.quantile === 0.8 ? todayRange.high : todayRange.p95 : daily;
        const blocks = makeBlocks({ ...input, demandPattern: w.pattern, now: at, todayBudget: today ? input.todayBudget : null }, Math.min(end, at + horizonMs), (index) => index === 0 && today ? input.todayBudget ?? todayDaily : daily);
        return { weeklyCost: blocks.reduce((s, b) => s + b.weeklyCost, 0), shortCost: blocks.every((b) => b.shortCost != null) ? blocks.reduce((s, b) => s + (b.shortCost ?? 0), 0) : null, nextKnownSupplyAt: state.weekly.resetsAt, blocks };
      };
      const results = known.length === 0 ? baselines[wi] : w.paths.map((path) => simulatePolicy(input.account, input.cards, makePolicy(parameters, firstAction, input.now, w.mechanism), path, w.mechanism, forecastAt));
      return summarize(w.id, results, baselines[wi], w.probabilistic);
    });
    const Nspent = Math.max(...metrics.map((m) => m.spent));
    comparisons.push({
      id: `${firstAction}:${parameters.quantile}:${parameters.horizonHours}:${parameters.expiryLeadHours}:${parameters.useForShort}`,
      firstAction: firstAction === "wait" ? null : firstAction,
      parameters,
      scenarios: metrics,
      Ltail: Math.max(...metrics.map((m) => m.lossTail)),
      Lmean: Math.max(...metrics.map((m) => m.lossMean)),
      Eexpire: Math.max(...metrics.map((m) => m.expired)),
      Nspent,
      firstCardDeadline: known.find((c) => c.localId === firstAction)?.safeDeadlineAt ?? void 0,
      dominated: Nspent > 0 && metrics.every((m) => m.deltaLoss <= 0 && m.deltaConsumedWeekly <= 0)
    });
  }
  for (const current of comparisons.filter((c) => c.firstAction != null)) {
    const wait = comparisons.find((c) => c.firstAction == null && JSON.stringify(c.parameters) === JSON.stringify(current.parameters));
    if (wait && current.scenarios.every((s, i) => wait.scenarios[i].lossTail <= s.lossTail && wait.scenarios[i].consumedWeekly >= s.consumedWeekly && wait.scenarios[i].spent <= s.spent) && current.scenarios.some((s, i) => wait.scenarios[i].spent < s.spent)) current.dominated = true;
  }
  return { selected: comparePolicies(input.policyDefaultTier ? scopeDefaultComparisons(comparisons, input.policyDefaultTier) : comparisons, input.preference), comparisons };
}
function scopeDefaultComparisons(comparisons, tier) {
  return comparisons.map((c) => {
    const scenarios = c.scenarios.filter((s) => s.id.includes(`default-${tier}:`));
    return { ...c, scenarios, Ltail: Math.max(...scenarios.map((s) => s.lossTail)), Lmean: Math.max(...scenarios.map((s) => s.lossMean)), Eexpire: Math.max(...scenarios.map((s) => s.expired)), Nspent: Math.max(...scenarios.map((s) => s.spent)) };
  });
}
function planActions(input) {
  if (input.dailyRange == null && input.todayBudget == null && input.explicitDemand == null) {
    const tier = input.workload === "light" || input.workload === "busy" ? input.workload : "normal";
    input = { ...input, policyDefaultTier: tier, dailyRange: { low: POLICY_DAILY_COST.light, median: POLICY_DAILY_COST[tier], high: POLICY_DAILY_COST.busy, p95: POLICY_DAILY_COST.busy } };
  }
  const seed = seedFromSnapshot(input.inputSnapshotId);
  const assumptions = [
    "\u5E73\u53F0\u516C\u544A\u6982\u7387\u4E0D\u662F\u8D26\u53F7\u8865\u7ED9\u6982\u7387\uFF1B\u673A\u5236\u60C5\u666F\u6CA1\u6709\u6743\u91CD\u3002",
    "\u8FDC\u671F\u81EA\u7136\u7A97\u53E3\u7EED\u63A5\u548C\u7528\u5361\u540E\u77ED\u7A97\u622A\u6B62\u5206\u522B\u505A\u673A\u5236\u60C5\u666F\u3002",
    "\u7F3A\u65E5\u5185\u8F68\u8FF9\u65F6\uFF0C\u5468\u9700\u6C42\u4EC5\u4F5C\u5747\u5300\u65F6\u957F\u5206\u914D\u60C5\u666F\uFF1B\u77ED\u7A97\u672A\u8BC4\u4F30\u3002",
    ...input.policyDefaultTier ? ["\u9ED8\u8BA4\u8F7B/\u5747\u8861/\u8F83\u5FD950/100/200\u70B9\u6BCF7\u5929\u662F\u989D\u5EA6\u5C3A\u5EA6\u5047\u8BBE\uFF0C\u65E0\u4EBA\u5DE5\u6982\u7387\uFF1B\u53E6\u6BD4\u8F83\u6BCF\u65E5\u99964\u5C0F\u65F6\u96C6\u4E2D\u538B\u529B\uFF0C\u4E0D\u662F\u4F5C\u606F\u9884\u6D4B\u3002"] : [],
    ...input.platformRates ? ["21\u201342\u59290.5/1/2\u500DD60\u4E3A\u65E0\u6743\u91CD\u8FDC\u671F\u538B\u529B\uFF0C\u4E0D\u662F\u5DF2\u77E5\u89C4\u5F8B\u6216\u7F6E\u4FE1\u533A\u95F4\u3002"] : []
  ];
  const basic = {
    status: "need_data",
    action: input.cards.length ? "review_expiry" : "none",
    cardId: null,
    nextReviewAt: input.reviews.find((t) => t > input.now) ?? null,
    lastSafeActionAt: null,
    weeklyBudgetToday: null,
    shortWindowEvaluated: false,
    reasons: ["\u8FD8\u5728\u5B66\u4E60\u4F60\u7684\u7528\u91CF\uFF1B\u5361\u622A\u6B62\u63D0\u9192\u4E0E\u503C\u5F97\u7528\u5361\u5206\u5F00\u3002"],
    assumptions,
    counterfactuals: [],
    sensitivity: "unknown"
  };
  const horizons = [];
  let result = evaluateHorizon(input, 21, seed);
  horizons.push({ days: 21, firstAction: result.selected?.firstAction ?? null });
  let changes = false, hadReversal = false;
  for (const days of [28, 35, 42]) {
    const next = evaluateHorizon(input, days, seed);
    const first = next.selected?.firstAction ?? null;
    horizons.push({ days, firstAction: first });
    const reversed = first !== (result.selected?.firstAction ?? null);
    changes = reversed;
    if (days === 28 && !reversed) {
      result = next;
      break;
    }
    hadReversal ||= reversed;
    result = next;
  }
  const selected = result.selected;
  const chosenCard = input.cards.find((c) => c.localId === selected?.firstAction);
  const positive = selected != null && selected.scenarios.every((s) => s.deltaLoss > 0 || s.deltaLoss >= 0 && s.deltaConsumedWeekly > 0);
  const reverses = selected?.scenarios.some((s) => s.deltaLoss < 0) ?? false;
  const mechanismReversal = scenarioActionSensitivity(result.comparisons, input.preference);
  const uncertain = input.inventoryConflict || input.sampleDays < 7 || input.dailyRange == null || changes || reverses || mechanismReversal;
  const firstAction = selected?.firstAction ?? null;
  const budgetForToday = (daily) => allocateDailyBudget(input.account, makeBlocks(input, input.account.weekly.resetsAt, (index) => index === 0 ? daily : input.dailyRange?.median ?? daily), input.now)?.today ?? null;
  const todayRange = input.todayRange ?? input.dailyRange;
  const allocation = input.policyDefaultTier ? allocateColdBudget(input.account, input.now, input.reviews.find((t) => t > input.now) ?? null, input.workload === "light" ? 0.5 : input.workload === "busy" ? 2 : 1) : null;
  const low = allocation?.today ?? budgetForToday(input.todayBudget != null ? input.todayBudget * 0.5 : todayRange?.low ?? 0), high = allocation?.today ?? budgetForToday(input.todayBudget != null ? input.todayBudget * 2 : todayRange?.high ?? 0);
  const recommendation = {
    ...basic,
    status: !selected ? "not_applicable" : firstAction && positive && !uncertain ? "act_now" : uncertain ? "conditional" : "wait",
    action: firstAction ? "use_card" : "keep_card",
    cardId: firstAction,
    lastSafeActionAt: chosenCard?.safeDeadlineAt == null ? null : chosenCard.safeDeadlineAt - 30 * 6e4,
    weeklyBudgetToday: low == null || high == null ? null : { low, high },
    shortWindowEvaluated: selected?.scenarios.every((s) => s.shortWindowEvaluated) ?? false,
    reasons: !selected ? ["\u6CA1\u6709\u53EF\u6267\u884C\u7684\u7528\u5361\u65B9\u6848\u3002"] : firstAction ? ["\u8BE5\u7528\u5361\u65B9\u6848\u4E0E\u5148\u7B49\u5F85\u3001\u6C38\u8FDC\u4E0D\u7528\u5361\u5171\u540C\u6BD4\u8F83\uFF1B\u6536\u76CA\u4EE5\u5B9E\u9645\u6EE1\u8DB3\u9700\u6C42\u8BA1\u7B97\u3002"] : ["\u5F53\u524D\u5148\u4E0D\u7528\u5361\uFF1B\u540E\u7EED\u4ECD\u5728\u67E5\u770B\u65F6\u6BB5\u91CD\u65B0\u51B3\u5B9A\u3002"],
    assumptions: [...assumptions, ...mechanismReversal ? ["\u4E0D\u540C\u673A\u5236\u6216\u9700\u6C42\u538B\u529B\u4E0B\u9996\u4E2A\u52A8\u4F5C\u53CD\u8F6C\uFF1B\u5F53\u524D\u4EC5\u7ED9\u6761\u4EF6\u5EFA\u8BAE\uFF0C\u5230\u8D26\u6216\u9700\u6C42\u786E\u8BA4\u540E\u518D\u51B3\u5B9A\u3002"] : [], ...hadReversal ? ["\u8F83\u77ED\u89C6\u91CE\u66FE\u6539\u53D8\u9996\u4E2A\u52A8\u4F5C\uFF0C\u5DF2\u5EF6\u957F\u81F342\u5929\u590D\u7B97\u3002"] : [], ...input.dailyRange == null ? ["\u4EC5\u8BC4\u4F30\u624B\u586B\u4ECA\u5929\u5DE5\u4F5C\u91CF0.5/1/2\u500D\u538B\u529B\uFF0C\u672A\u6765\u9700\u6C42\u672A\u77E5\uFF0C\u4E0D\u4F5C\u957F\u671F\u5F3A\u5EFA\u8BAE\u3002"] : []],
    counterfactuals: result.comparisons,
    sensitivity: changes || reverses || mechanismReversal ? "changes_with_assumptions" : uncertain ? "unknown" : "stable"
  };
  const alternative = comparePolicies(result.comparisons.filter((c) => c.firstAction !== firstAction), input.preference);
  const defaultScenarios = input.policyDefaultTier ? ["light", "normal", "busy"].map((tier) => {
    const c = comparePolicies(scopeDefaultComparisons(result.comparisons, tier), input.preference);
    return { tier, firstAction: c?.firstAction ?? null, lossTail: c?.Ltail ?? 0, consumedWeekly: c?.scenarios.reduce((n, s) => Math.min(n, s.consumedWeekly), Infinity) ?? 0 };
  }) : void 0;
  return { recommendation, comparisons: result.comparisons, horizons, seed, modelVersion: MODEL_VERSION, assumptions, selected, alternative, defaultScenarios };
}
export {
  MODEL_VERSION,
  allocateDailyBudget,
  comparePolicies,
  planActions,
  scenarioActionSensitivity,
  scopeDefaultComparisons,
  seedFromSnapshot
};
