/** Account-supply scenarios. These are conditional mechanisms, never weighted averages. */
import { DAY_MS, PlatformForecast, RegularEventInput } from './platform';

export type AccountState = {
  observedAt: number;
  weekly: { remaining: number; resetsAt: number; durationMins: number };
  short: { remaining: number; resetsAt: number; durationMins: number };
  availableCardCount: number;
  lastConfirmedCardUseAt?: number;
  lastConfirmedExternalResetAt?: number;
};
export type SupplyIncident = {
  id: string; kind: 'scheduled' | 'watch' | 'regular'; status: string;
  firstSeenAt: number | null; announcedAt: number | null; scheduledFor: number | null;
  cancelledAt: number | null; version: number; source?: unknown; text?: string;
  relatedIds: string[]; raw?: unknown;
  versionHistory: { version: number; firstSeenAt: number | null; status: string; announcedAt: number | null; scheduledFor: number | null; cancelledAt: number | null }[];
};
export type SupplyScenario = {
  id: string; title: string; source: 'natural' | 'scheduled' | 'watch' | 'platform_background';
  probability: number | null; weighted: false;
  assumptions: string[]; events: { at: number; kind: 'weekly_reset' | 'short_reset' | 'platform_incident' | 'scheduled_weekly_supply' | 'scheduled_short_supply'; incidentId?: string; certainty: 'observed' | 'conditional' }[];
  resultingDeadlines: { weekly: number | null; short: number | null }; accountProbability24h: null;
};
export type AccountObservationSnapshot = AccountState & { linkedIncidentIds?: readonly string[];candidateIncidentIds?:readonly string[] };
export type CardUseOperation = { id: string; occurredAt: number; confirmed: boolean; linkedIncidentIds?: readonly string[] };
export type IncidentExecutionWindow = { incidentId: string; from: number; to: number; basis: 'observed_execution_window' };
export type AccountMappingStatus = 'hit' | 'miss' | 'unobservable' | 'ambiguous';
export type AccountKnownClassification = 'platform_external_reset' | 'natural_reset' | 'card_use' | 'no_reset_observed' | 'unobservable' | 'ambiguous' | 'unknown';
export type AccountObservationInterval = {
  interval: { fromExclusive: number; toInclusive: number };
  incidentId: string | null; announcedAt: number | null;
  status: AccountMappingStatus; knownClassification: AccountKnownClassification;
  evidence: { weeklyBalanceIncreased: boolean; shortBalanceIncreased: boolean; weeklyResetsAtChanged: boolean; shortResetsAtChanged: boolean; naturalResetCrossed: boolean; confirmedCardUseIds: string[]; explicitIncidentLink: boolean; completeIncidentWindowObserved: boolean };
  reason: string;
};
const time = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const obj = (v: unknown): Record<string, any> => v && typeof v === 'object' ? v as Record<string, any> : {};

/** Accepts either individual snapshots or resetStatus's scheduledReset/activeWatch shape. */
export function normalizeSupplyIncidents(input: {
  scheduleSnapshots?: readonly unknown[]; watchSnapshots?: readonly unknown[];
  platformEvents?: readonly RegularEventInput[]; now?: number;
}): SupplyIncident[] {
  const rawItems: { kind: SupplyIncident['kind']; raw: unknown }[] = [];
  const schedules = input.scheduleSnapshots ?? [];
  for (const value of schedules) {
    const r = obj(value); const nested = r.scheduledReset ?? r.schedule ?? r;
    if (nested) rawItems.push({ kind: 'scheduled', raw: { ...obj(nested), firstSeenAt: obj(nested).firstSeenAt ?? obj(nested).first_seen_at ?? r.fetchedAt ?? r.fetched_at } });
  }
  for (const value of input.watchSnapshots ?? []) {
    const r = obj(value); const nested = r.activeWatch ?? r.watch ?? r;
    if (nested) rawItems.push({ kind: 'watch', raw: { ...obj(nested), firstSeenAt: obj(nested).firstSeenAt ?? obj(nested).first_seen_at ?? r.fetchedAt ?? r.fetched_at } });
  }
  for (const event of input.platformEvents ?? []) if (!event.resetType || event.resetType === 'regular') rawItems.push({ kind: 'regular', raw: event });
  const byId = new Map<string, SupplyIncident>(); let anon = 0;
  for (const item of rawItems) {
    const r = obj(item.raw), id = String(r.id ?? r.eventId ?? r.watchId ?? `${item.kind}:anonymous:${time(r.announcedAt ?? r.announced_at ?? r.fetchedAt) ?? anon++}`);
    const cancelledAt = r.cancelledAt ?? r.cancelled_at ?? r.canceledAt ?? r.canceled_at;
    const status = String(r.status ?? (cancelledAt ? 'cancelled' : item.kind === 'scheduled' ? 'scheduled' : 'active'));
    const firstSeenAt = r.firstSeenAt ?? r.first_seen_at;
    const announcedAt = r.announcedAt ?? r.announced_at;
    const scheduledFor = r.scheduledFor ?? r.scheduled_for ?? r.scheduledAt ?? r.scheduled_at;
    const incident: SupplyIncident = { id, kind: item.kind, status, firstSeenAt: time(firstSeenAt), announcedAt: time(announcedAt),
      scheduledFor: time(scheduledFor), cancelledAt: time(cancelledAt), version: Number.isFinite(r.version) ? r.version : 1,
      source: r.source ?? r.sourceUrl ?? r.sourceType, text: typeof r.text === 'string' ? r.text : undefined,
      relatedIds: Array.isArray(r.relatedEventIds??r.relatedIds) ? (r.relatedEventIds??r.relatedIds).map(String) : [], raw: item.raw,
      versionHistory: [{ version: Number.isFinite(r.version) ? r.version : 1, firstSeenAt: time(firstSeenAt), status,
        announcedAt: time(announcedAt), scheduledFor: time(scheduledFor), cancelledAt: time(cancelledAt) }] };
    const old = byId.get(id);
    // Keep one incident identity while retaining latest visible version/status.
    if (!old) byId.set(id, incident);
    else {
      const history = [...old.versionHistory, ...incident.versionHistory];
      if (incident.version >= old.version) byId.set(id, { ...incident, versionHistory: history });
      else byId.set(id, { ...old, versionHistory: history });
    }
  }
  const incidents = [...byId.values()];
  // Explicit relation, never same-day/time proximity, merges regular records into schedule incidents.
  for (const schedule of incidents.filter(x => x.kind === 'scheduled')) {
    const related = incidents.filter(x => x.kind === 'regular' && (schedule.relatedIds.includes(x.id) || x.relatedIds.includes(schedule.id)));
    for(const regular of related){
      schedule.versionHistory.push(...regular.versionHistory);
      schedule.relatedIds=[...new Set([...schedule.relatedIds,regular.id,...regular.relatedIds])];
      if(schedule.announcedAt==null)schedule.announcedAt=regular.announcedAt;
      incidents.splice(incidents.indexOf(regular),1);
    }
  }
  return incidents.sort((a, b) => (a.firstSeenAt ?? a.announcedAt ?? Infinity) - (b.firstSeenAt ?? b.announcedAt ?? Infinity));
}

function coversInterval(from: number, to: number, coverage: readonly { from: number; to: number; complete?: boolean }[]): boolean {
  if (!(to > from)) return false;
  const ranges = coverage.filter(x => x.complete === true).map(x => ({ from: Math.max(from, x.from), to: Math.min(to, x.to) }))
    .filter(x => x.to > x.from).sort((a, b) => a.from - b.from);
  let cursor = from;
  for (const range of ranges) {
    if (range.from > cursor) return false;
    cursor = Math.max(cursor, range.to);
    if (cursor >= to) return true;
  }
  return false;
}

/**
 * Classifies account-state observations without converting announcement time into execution time.
 * An incident can be a hit only with an explicit account-to-incident link; time overlap alone is a candidate/ambiguity.
 */
export function classifyAccountObservations(input: {
  snapshots: readonly AccountObservationSnapshot[];
  cardOperations?: readonly CardUseOperation[];
  incidents: readonly SupplyIncident[];
  coverage?: readonly { from: number; to: number; complete?: boolean }[];
  executionWindows?: readonly IncidentExecutionWindow[];
}): AccountObservationInterval[] {
  const snapshots = [...input.snapshots].filter(x => Number.isFinite(x.observedAt)).sort((a, b) => a.observedAt - b.observedAt);
  const incidents = new Map(input.incidents.map(x => [x.id, x]));
  const windows = input.executionWindows ?? [];
  const operations = input.cardOperations ?? [];
  const output: AccountObservationInterval[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const previous = snapshots[i - 1], current = snapshots[i];
    if (current.observedAt <= previous.observedAt) continue;
    const weeklyBalanceIncreased = current.weekly.remaining > previous.weekly.remaining;
    const shortBalanceIncreased = current.short.remaining > previous.short.remaining;
    const weeklyResetsAtChanged = current.weekly.resetsAt !== previous.weekly.resetsAt;
    const shortResetsAtChanged = current.short.resetsAt !== previous.short.resetsAt;
    const naturalResetCrossed = [previous.weekly.resetsAt, previous.short.resetsAt].some(deadline => deadline > previous.observedAt && deadline <= current.observedAt);
    const resetSignal = weeklyBalanceIncreased || shortBalanceIncreased || weeklyResetsAtChanged || shortResetsAtChanged;
    const cardOps = operations.filter(op => op.confirmed && op.occurredAt > previous.observedAt && op.occurredAt <= current.observedAt);
    const linkedIds = new Set([...(current.linkedIncidentIds ?? []), ...cardOps.flatMap(op => op.linkedIncidentIds ?? [])]);
    const relevantWindows = windows.filter(w => w.from < current.observedAt && w.to > previous.observedAt);
    const ids = new Set([...linkedIds, ...(current.candidateIncidentIds??[]), ...relevantWindows.map(w => w.incidentId)]);
    if (ids.size === 0) ids.add(''); // retain an account observation even without an incident candidate
    const completeCoveredWindow = (id: string) => {
      const w = windows.find(x => x.incidentId === id);
      return !!w && w.from >= previous.observedAt && w.to <= current.observedAt && coversInterval(w.from, w.to, input.coverage ?? []);
    };
    for (const id of ids) {
      const incident = incidents.get(id);
      const explicitIncidentLink = linkedIds.has(id);
      const completeIncidentWindowObserved = id !== '' && completeCoveredWindow(id);
      const bothFullAndUnchanged = previous.weekly.remaining >= 100 && current.weekly.remaining >= 100 &&
        previous.short.remaining >= 100 && current.short.remaining >= 100 && !weeklyResetsAtChanged && !shortResetsAtChanged;
      let status: AccountMappingStatus = 'unobservable';
      let knownClassification: AccountKnownClassification = 'unobservable';
      let reason = '观测区间没有足够证据归因到平台 incident。';
      if (naturalResetCrossed && cardOps.length > 0) {
        status = 'ambiguous'; knownClassification = 'ambiguous'; reason = '自然截止与确认用卡重叠，无法识别平台 incident 的独立作用。';
      } else if (cardOps.length > 0) {
        status = 'unobservable'; knownClassification = 'card_use'; reason = '确认用卡先造成额度变化；账号目标 A 被干预删失，不能将其记作平台命中或未命中。';
      } else if (naturalResetCrossed && resetSignal) {
        status = id !== '' ? 'ambiguous' : 'unobservable';
        knownClassification = id !== '' ? 'ambiguous' : 'natural_reset';
        reason = '变化与自然截止重叠；不能仅凭时间接近把平台公告归为账号命中。';
      } else if (explicitIncidentLink && resetSignal && incident && (incident.kind === 'regular' || incident.kind === 'scheduled')) {
        status = 'hit'; knownClassification = 'platform_external_reset';
        reason = '账号观测明确关联到 incident 且检测到余额增加或窗口截止变化；执行区间仍以相邻快照表示。';
      } else if (!resetSignal && bothFullAndUnchanged) {
        status = 'unobservable'; knownClassification = 'unobservable';
        reason = '两个额度窗口均满且截止未变化，命中与未命中均不可辨识。';
      } else if (!resetSignal && completeIncidentWindowObserved && cardOps.length === 0 && !naturalResetCrossed) {
        status = 'miss'; knownClassification = 'no_reset_observed';
        reason = '显式执行观测窗被完整覆盖，窗口内未见余额回升或截止变化。';
      } else if (resetSignal && id !== '' && !explicitIncidentLink) {
        status = 'ambiguous'; knownClassification = 'unknown';
        reason = '有账号重置候选，但只有时间窗关联，没有账号到 incident 的明确链接。';
      } else if (resetSignal && explicitIncidentLink) {
        status = 'ambiguous'; knownClassification = 'unknown';
        reason = '检测到重置及显式链接，但链接目标不是可计入账号补给的 scheduled/regular incident。';
      } else if (resetSignal) {
        status = 'ambiguous'; knownClassification = 'unknown'; reason = '检测到账号重置候选，但缺少可确认的来源归因。';
      }
      output.push({ interval: { fromExclusive: previous.observedAt, toInclusive: current.observedAt }, incidentId: id || null,
        announcedAt: incident?.announcedAt ?? null, status, knownClassification,
        evidence: { weeklyBalanceIncreased, shortBalanceIncreased, weeklyResetsAtChanged, shortResetsAtChanged, naturalResetCrossed,
          confirmedCardUseIds: cardOps.map(op => op.id), explicitIncidentLink, completeIncidentWindowObserved }, reason });
    }
  }
  return output;
}

export function buildSupplyScenarios(input: {
  accountState: AccountState; platformForecast: PlatformForecast | null;
  scheduleSnapshots?: readonly unknown[]; watchSnapshots?: readonly unknown[];
  platformEvents?: readonly RegularEventInput[]; accountMappingEvidence?: readonly unknown[];
  mechanismConfig?: { horizonMs?: number; includePlatformBackground?: boolean; platformBackgroundProbability?: number | null; nextReviewAt?:number|null };
  now: number;
}): { accountProbability24h: null; accountProbabilityReason: string; incidents: SupplyIncident[]; scenarios: SupplyScenario[]; watchNotes: unknown[] } {
  const { accountState: state, now } = input, horizon = input.mechanismConfig?.horizonMs ?? DAY_MS;
  const incidents = normalizeSupplyIncidents(input);
  const schedules = incidents.filter(x => x.kind === 'scheduled' && !['cancelled', 'canceled', 'cancel'].includes(x.status.toLowerCase()) && x.cancelledAt === null && x.scheduledFor !== null && x.scheduledFor + DAY_MS >= now && x.scheduledFor <= now + horizon);
  const events: SupplyScenario['events'] = [
    { at: state.weekly.resetsAt, kind: 'weekly_reset', certainty: 'observed' },
    { at: state.short.resetsAt, kind: 'short_reset', certainty: 'observed' },
  ];
  const scenarios: SupplyScenario[] = [{ id: 'natural-only', title: '自然截止（已观测）', source: 'natural', probability: null, weighted: false,
    assumptions: ['只使用当前快照所示自然截止，不推断公告命中。'], events: events.map(e => ({ ...e })), resultingDeadlines: { weekly: state.weekly.resetsAt, short: state.short.resetsAt }, accountProbability24h: null }];
  for (const schedule of schedules) {
    const when = schedule.scheduledFor!;
    for (const [name, delay] of [['按时兑现', 0], ['延后 6 小时', 6 * 3_600_000], ['延后 24 小时', DAY_MS]] as const) {
      const at = when + delay;
      for (const windowMode of ['weekly-only', 'both-windows'] as const) for (const reanchor of [false, true]) {
        const scheduledEvent: SupplyScenario['events'][number] = { at, kind: 'platform_incident', incidentId: schedule.id, certainty: 'conditional' };
        const supplyEvents: SupplyScenario['events'] = [scheduledEvent,
          { at, kind: 'scheduled_weekly_supply', incidentId: schedule.id, certainty: 'conditional' },
          ...(windowMode === 'both-windows' ? [{ at, kind: 'scheduled_short_supply' as const, incidentId: schedule.id, certainty: 'conditional' as const }] : [])];
        scenarios.push({ id: `${schedule.id}:${name}:${windowMode}:${reanchor ? 'reanchor' : 'no-reanchor'}`,
          title: `排期${name} · ${windowMode === 'weekly-only' ? '仅周窗' : '双窗'} · ${reanchor ? '重锚周窗' : '不重锚周窗'}`,
          source: 'scheduled', probability: null, weighted: false,
          assumptions: [`假设排期在 ${new Date(at).toISOString()} 给本账号补给。`, '该机制情景没有经验权重，不与其他情景平均。',
            windowMode === 'weekly-only' ? '只重置周窗；短窗自然截止保持原值。' : '周窗与短窗均回满；短窗下一截止点未知，不能推导为执行时刻 + 5 小时。',
            reanchor ? '周窗截止重锚为执行时刻 + 168 小时。' : '周窗截止沿用当前截止。'],
          events: [...events.map(e => ({ ...e })), ...supplyEvents],
          resultingDeadlines: { weekly: reanchor ? at + 7 * DAY_MS : state.weekly.resetsAt, short: windowMode === 'both-windows' ? null : state.short.resetsAt }, accountProbability24h: null });
      }
    }
    scenarios.push({ id: `${schedule.id}:no-show`, title: '排期不兑现', source: 'scheduled', probability: null, weighted: false,
      assumptions: ['排期在当前情景窗口内没有给本账号补给；无实测延迟上界。'], events: events.map(e => ({ ...e })), resultingDeadlines: { weekly: state.weekly.resetsAt, short: state.short.resetsAt }, accountProbability24h: null });
  }
  const bgP = input.mechanismConfig?.platformBackgroundProbability ?? input.platformForecast?.probability24h ?? null;
  if (input.mechanismConfig?.includePlatformBackground && bgP !== null) scenarios.push({ id: 'platform-background-sensitive', title: '历史总平台过程敏感性（非排期净背景）', source: 'platform_background', probability: bgP, weighted: false,
    assumptions: ['该值是全部 regular 的平台公告概率，不是账号补给概率，也未排除已知排期。', '这是独立敏感性场景，不与排期兑现情景平均。'],
    events: [...events.map(e => ({ ...e })), { at: now + horizon, kind: 'platform_incident', certainty: 'conditional' }], resultingDeadlines: { weekly: state.weekly.resetsAt, short: state.short.resetsAt }, accountProbability24h: null });
  const watches = incidents.filter(x => x.kind === 'watch'&&!['cancelled','canceled'].includes(x.status)&&x.cancelledAt===null);
  const watchNotes = watches.map(x => ({ id: x.id, status: x.status, firstSeenAt: x.firstSeenAt, raw: x.raw,
    interpretation: 'watch目标/窗口未验证；仅作为原样信号，不改变P或账号概率' }));
  for (const watch of watches) for(const short of [false,true]) for(const reanchor of [false,true])scenarios.push({ id: `${watch.id}:conditional-watch:${short?'both':'weekly'}:${reanchor?'reanchor':'no-reanchor'}`, title: 'Watch 信号条件情景（目标/窗口未知）', source: 'watch', probability: null, weighted: false,
    assumptions: ['保留原始 watch 记录；目标、时间窗口或是否包含排期未验证。', '该条件情景不改变正式 P0，也不能当作账号命中概率。'],
    events: [...events.map(e => ({ ...e })), { at: input.mechanismConfig?.nextReviewAt??now+DAY_MS, kind: 'platform_incident', incidentId: watch.id, certainty: 'conditional' },
      {at:input.mechanismConfig?.nextReviewAt??now+DAY_MS,kind:'scheduled_weekly_supply',incidentId:watch.id,certainty:'conditional'},
      ...(short?[{at:input.mechanismConfig?.nextReviewAt??now+DAY_MS,kind:'scheduled_short_supply' as const,incidentId:watch.id,certainty:'conditional' as const}]:[])],
    resultingDeadlines: { weekly: reanchor?(input.mechanismConfig?.nextReviewAt??now+DAY_MS)+7*DAY_MS:state.weekly.resetsAt, short: short?null:state.short.resetsAt }, accountProbability24h: null });
  if(input.mechanismConfig?.includePlatformBackground&&bgP!==null){
    const deterministic=scenarios.filter(s=>s.source==='scheduled'||s.source==='watch');
    for(const scenario of deterministic)scenarios.push({...scenario,id:`${scenario.id}:with-platform-background`,source:'platform_background',title:`${scenario.title} + 历史总过程敏感性`,assumptions:[...scenario.assumptions,'同时考虑历史全部regular过程，不称作排期之外的发生率，不与未到账机制情景平均。']});
  }
  return { accountProbability24h: null, accountProbabilityReason: '尚未测得平台公告对本账号的命中及延迟', incidents, scenarios, watchNotes };
}
