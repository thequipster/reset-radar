import {WEEKDAY_VERSION} from '../lib/v3/weekday';
import {weekdayExperiment,dueWeekdayReviews,weekdayRollbackReview,evaluateWeekdayJournal} from '../lib/v3/weekdayEvaluation';
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { buildUsageObservations, type SnapshotV3, type UsageObservation } from "../lib/v3/observations";
import { freezePlanning, freezePrediction, nextSignalVersion, predictionGroupAt, type PlanningJournalRecord, type PredictionRecordV3 } from "../lib/v3/journal";
import type { ProviderSnapshot } from "./types";
import type { ResetStatusSnapshot } from "../lib/resetStatus";
import {archivePlatformHistory, latestArchivedHistory} from '../lib/v3/runtime';
import {settlePlatformPredictions,summarizeVerdicts,weeklyFallbackReview} from '../lib/v3/verdict';
import {RESET_HISTORY_SOURCE} from './history';
import {normalizeAccount} from '../lib/v3/inputs';
import type {AccountObservationSnapshot,AccountObservationInterval} from '../lib/v3/supply';

type LogRead = { path: string; content: string };
type AppendResult = "appended" | "conflict" | "busy";

export function normalizeProviderSnapshotV3(snapshot: ProviderSnapshot): SnapshotV3 | null {
  const accountKey = snapshot.accountKey;
  const observedAt = snapshot.rateLimitSnapshot?.observedAt ?? snapshot.updatedAt;
  if (!accountKey || !Number.isFinite(Date.parse(observedAt))) return null;
  const toWindow = (window: ProviderSnapshot["weeklyWindow"]): SnapshotV3["weekly"] =>
    window?.resetsAt && Number.isFinite(Date.parse(window.resetsAt)) && Number.isFinite(window.remainingPercent)
      ? { generation: window.resetsAt, usedPercent: Math.max(0, Math.min(100, 100 - window.remainingPercent)) }
      : null;
  const normalized=normalizeAccount(snapshot);
  const normalizedWindow=(window:NonNullable<typeof normalized>['weekly']):SnapshotV3['weekly']=>({generation:new Date(window.resetsAt).toISOString(),usedPercent:100-window.remaining});
  return {
    id: `v3-${accountKey}-${observedAt}`,
    observedAt,
    accountKey,
    sourceVersion: `${snapshot.provider}:${snapshot.rateLimitSnapshot?.source ?? "provider"}`,
    weekly: normalized?normalizedWindow(normalized.weekly):toWindow(snapshot.weeklyWindow),
    short: normalized?normalizedWindow(normalized.short):toWindow(snapshot.shortWindow),
    schemaVersion: 3,
    rawSnapshot: snapshot,
  };
}

async function read(kind: "usage" | "cards"): Promise<LogRead> {
  return invoke<LogRead>("read_observation_log", { kind });
}

async function appendOnce(kind: "usage" | "cards", row: { id: string; observedAt: string; [key: string]: unknown }): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const log = await read(kind);
    if (log.content.split(/\r?\n/).some((line) => {
      try { return JSON.parse(line).id === row.id; } catch { return false; }
    })) return log.content;
    const result = await invoke<AppendResult>("append_observation_log", {
      kind, expectedContent: log.content, line: JSON.stringify(row),
    });
    if (result === "appended") return `${log.content}${log.content && !log.content.endsWith("\n") ? "\n" : ""}${JSON.stringify(row)}\n`;
    if (result === "busy") throw new Error("观测日志正在写入，请稍后重试");
  }
  throw new Error("观测日志更新冲突，请稍后重试");
}

export function useV3Journal(snapshot: ProviderSnapshot | null, enabled: boolean) {
  const [observations, setObservations] = useState<UsageObservation[]>([]);
  const [accountSnapshots,setAccountSnapshots]=useState<AccountObservationSnapshot[]>([]);
  const [signalHistory, setSignalHistory] = useState<PlatformSignalHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyError,setHistoryError]=useState<string|null>(null);
  const [historyDocument,setHistoryDocument]=useState<unknown>(RESET_HISTORY_SOURCE);
  const [predictionContent,setPredictionContent]=useState('');
  const activeAccount = useRef<string | null>(snapshot?.accountKey ?? null);
  const writer = useRef<Promise<unknown>>(Promise.resolve());
  const weekdayStopped=useRef<string|null>(null);
  const enqueueWrite = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = writer.current.catch(() => undefined).then(operation);
    writer.current = result;
    return result;
  }, []);

  const refresh = useCallback(async (accountKey: string | null = activeAccount.current) => {
    const log = await read("usage");
    const snapshots: SnapshotV3[] = [];
    for (const line of log.content.split(/\r?\n/)) {
      try {
        const row = JSON.parse(line) as SnapshotV3;
        // Old observations.jsonl records retain their meaning and are never
        // mistaken for v3 snapshots merely because their fields look similar.
        if (row?.schemaVersion === 3 && row.rawSnapshot && typeof row.id === "string" && typeof row.observedAt === "string" && typeof row.accountKey === "string") snapshots.push(row);
      } catch { /* tolerate a damaged JSONL row */ }
    }
    if (activeAccount.current === accountKey){
      const scoped=accountKey==null?[]:snapshots.filter(row=>row.accountKey===accountKey);
      setObservations(buildUsageObservations(scoped));
      setAccountSnapshots(scoped.flatMap(row=>{const normalized=normalizeAccount(row.rawSnapshot as ProviderSnapshot);return normalized?[normalized]:[]}));
    }
    const cardLog = await read("cards");
    setSignalHistory(readSignalHistory(cardLog.content));
    setPredictionContent(cardLog.content);
    setHistoryDocument(latestArchivedHistory(cardLog.content,RESET_HISTORY_SOURCE));
  }, []);

  const appendSnapshot = useCallback(async (input: ProviderSnapshot) => {
    const row = normalizeProviderSnapshotV3(input);
    if (!row) return;
    await enqueueWrite(() => appendOnce("usage", { ...row, observedAt: new Date(Date.parse(String(row.observedAt))).toISOString() }));
    await refresh(input.accountKey ?? null);
  }, [enqueueWrite, refresh]);

  const appendSignals = useCallback(async (input: ProviderSnapshot) => {
    const status = input.resetStatus;
    if (!status || status.status !== "ok" || !status.fetchedAt) return;
    const observedAt = status.fetchedAt;
    if (!Number.isFinite(Date.parse(observedAt))) return;
    const currentValues = [status.scheduledReset ?? null, status.activeWatch ?? null] as const;
    const signalKinds = ["scheduled_reset", "active_watch"] as const;
    await enqueueWrite(async () => {
      const history = readSignalHistory((await read("cards")).content);
      // A repeated/stale provider cache is not a newly observed signal version.
      for (let i = 0; i < signalKinds.length; i += 1) {
        const signalKind = signalKinds[i]!;
        const value = currentValues[i];
        const prior = history.filter((entry) => entry.signalKind === signalKind).at(-1);
        if(prior&&Date.parse(prior.observedAt)>=Date.parse(observedAt))continue;
        const version = nextSignalVersion(prior ?? null, value, observedAt);
        if (!version) continue;
        const row = { id: `signal-${signalKind}-${observedAt}-${encodeURIComponent(JSON.stringify(value))}`,
          ...version, kind: "platform_signal", signalKind };
        await appendOnce("cards", row);
        history.push(row as PlatformSignalHistory);
      }
    });
    await refresh(input.accountKey ?? null);
  }, [enqueueWrite, refresh]);

  const appendPrediction = useCallback(async (input: PredictionRecordV3) => {
    const record = freezePrediction(input);
    const observedAt = new Date(record.issuedAt).toISOString();
    const scheduledGroup = predictionGroupAt(record.issuedAt, false);
    await enqueueWrite(async () => {
      const log = await read("cards");
      const alreadyPrimary = scheduledGroup.groupDate != null && log.content.split(/\r?\n/).some((line) => {
        try {
          const row = JSON.parse(line);
          return row.group === "primary_daily" && row.groupDate === scheduledGroup.groupDate &&
            row.record?.target === record.target && row.record?.modelVersion === record.modelVersion;
        } catch { return false; }
      });
      const grouping = predictionGroupAt(record.issuedAt, alreadyPrimary);
      return appendOnce("cards", { id: record.id, observedAt, kind: "prediction", ...grouping, record });
    });
  }, [enqueueWrite]);

  const weekdayFault=async(reason:string,at:number)=>appendOnce('cards',{id:`weekday-fault:${WEEKDAY_VERSION}`,observedAt:new Date(at).toISOString(),kind:'weekday_fault',modelVersion:WEEKDAY_VERSION,at,reason});
  const stopWeekdayShadow=useCallback(async(reason:string,at:number)=>{
    weekdayStopped.current=reason;await enqueueWrite(()=>weekdayFault(reason,at));setError(`星期影子已停写：${reason}`);
  },[enqueueWrite]);
  const appendWeekdayPair=useCallback(async(d60Input:PredictionRecordV3,weekdayInput:PredictionRecordV3):Promise<{error:string|null}>=>{
    const d60=freezePrediction(d60Input),weekday=freezePrediction(weekdayInput);
    if(d60.modelVersion!=='platform-v3.1:D60'||weekday.modelVersion!==WEEKDAY_VERSION||d60.target!=='platform_notice'||weekday.target!==d60.target||
      ['issuedAt','trainingCutoff','windowStart','windowEnd','platformHistorySnapshotId'].some(key=>d60[key as keyof PredictionRecordV3]!==weekday[key as keyof PredictionRecordV3])||
      d60.windowEnd-d60.windowStart!==86400000||!d60.platformHistorySnapshotId||d60.platformHistorySnapshotId.endsWith(':unknown')||weekday.probability==null)
      throw new Error('星期影子与D60缺同次冻结的24小时窗口/历史快照');
    return enqueueWrite(async()=>{
      let content=(await read('cards')).content;
      const rows=content.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
      const stopped=rows.find(row=>row.kind==='weekday_fault'&&row.modelVersion===WEEKDAY_VERSION);
      if(stopped)weekdayStopped.current=String(stopped.reason);
      const scheduled=predictionGroupAt(d60.issuedAt,false);
      const alreadyPrimary=scheduled.groupDate!=null&&rows.some(row=>row.kind==='prediction'&&row.group==='primary_daily'&&row.groupDate===scheduled.groupDate&&
        row.record?.target==='platform_notice'&&['platform-v3.1:D60',WEEKDAY_VERSION].includes(row.record.modelVersion));
      const grouping=predictionGroupAt(d60.issuedAt,alreadyPrimary);
      const observedAt=new Date(d60.issuedAt).toISOString();
      // D60先落盘，候选故障不能抹去主参考；两行沿用同一个冻结group，CAS串行防重启增样。
      content=await appendOnce('cards',{id:d60.id,observedAt,kind:'prediction',...grouping,record:d60});
      if(weekdayStopped.current)return {error:`星期候选此前已停写：${weekdayStopped.current}`};
      try{
        if(!rows.some(row=>row.kind==='weekday_experiment'&&row.record?.modelVersion===WEEKDAY_VERSION)){
          // 同次实际计算的发布时钟；不用历史coverage/fetchedAt回填启用日期。
          content=await appendOnce('cards',weekdayExperiment(d60.issuedAt));
        }
        content=await appendOnce('cards',{id:weekday.id,observedAt,kind:'prediction',...grouping,record:weekday});
        setPredictionContent(content);return {error:null};
      }catch(cause){const reason=String(cause);weekdayStopped.current=reason;try{await weekdayFault(reason,Date.now());}catch{/* 原写失败仍抛显式候选故障，不改旧行。 */}setError(`星期影子已停写：${reason}`);return {error:reason};}
    });
  },[enqueueWrite]);

  const appendPlanning = useCallback(async (input: PlanningJournalRecord) => {
    const record = freezePlanning(input);
    await enqueueWrite(() => appendOnce("cards", { id: record.id, observedAt: new Date().toISOString(), kind: "planning", record }));
  }, [enqueueWrite]);
  // v3.1：原预测字节不变；成熟标签与迟到纠正独立追加到同一CAS日志。
  useEffect(()=>{
    if(!enabled)return;let alive=true;
    void enqueueWrite(async()=>{
      const log=await read('cards'),now=Date.now();let content=log.content;
      const history=latestArchivedHistory(content,RESET_HISTORY_SOURCE);
      for(const v of settlePlatformPredictions(content,history,now)){if(!alive)return;content=await appendOnce('cards',{...v,observedAt:v.observedAtISO});}
      for(const review of dueWeekdayReviews(content,now)){if(!alive)return;content=await appendOnce('cards',review);}
      // 每周一实际运行时回顾一次，不能靠每次render追赢家。
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
      const rows=content.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)]}catch{return []}});
      if(new Date(now+8*3_600_000).getUTCDay()===1&&!rows.some(r=>r.kind==='weekly_review'&&r.reviewDate===date)){
        const verdicts=new Map<string,{version:number;label:0|1|null}>();for(const r of rows.filter(r=>r.kind==='verdict'))if(!verdicts.has(r.predictionId)||verdicts.get(r.predictionId)!.version<r.version)verdicts.set(r.predictionId,r);
        const mature=rows.filter(r=>r.kind==='prediction'&&r.group==='primary_daily'&&verdicts.get(r.record.id)?.label!=null&&r.record.probability!=null).map(r=>({...r.record,groupDate:r.groupDate,label:verdicts.get(r.record.id)!.label!}));
        const review=weeklyFallbackReview(mature,now,rows.filter(r=>r.kind==='weekly_review').map(r=>r.record));
        content=await appendOnce('cards',{id:`weekly-review:${date}:${review.version}`,observedAt:new Date(now).toISOString(),kind:'weekly_review',reviewDate:date,record:review,summary:summarizeVerdicts(content)});
      }
      if(new Date(now+8*3_600_000).getUTCDay()===1&&!rows.some(r=>r.kind==='weekday_rollback_review'&&r.reviewDate===date)){
        const record=weekdayRollbackReview(content,now);
        if(evaluateWeekdayJournal(content,now).activationAt!=null)content=await appendOnce('cards',{id:`weekday-rollback:${WEEKDAY_VERSION}:${date}`,observedAt:new Date(now).toISOString(),kind:'weekday_rollback_review',reviewDate:date,record});
      }
      if(alive)setPredictionContent(content);
    }).catch(cause=>{if(alive)setError(`标签结算未完成：${String(cause)}`)});
    return()=>{alive=false;};
  },[enabled,historyDocument,snapshot?.updatedAt,enqueueWrite]);

  const appendAccountMapping=useCallback(async(accountKey:string,rows:readonly AccountObservationInterval[],observedAt:number)=>{
    await enqueueWrite(async()=>{
      for(const row of rows){
        if(row.incidentId==null&&row.knownClassification==='unobservable')continue;
        const id=`mapping:${accountKey}:${row.interval.fromExclusive}:${row.interval.toInclusive}:${row.incidentId??'unknown'}:${row.knownClassification}:${row.evidence.confirmedCardUseIds.join(',')}`;
        await appendOnce('cards',{id,observedAt:new Date(observedAt).toISOString(),kind:'account_mapping',accountKey,record:row});
      }
    });
  },[enqueueWrite]);

  useEffect(() => {
    activeAccount.current = snapshot?.accountKey ?? null;
    if (!enabled) { setObservations([]);setAccountSnapshots([]); setError(null);setHistoryError(null); setPredictionContent(''); setHistoryDocument(RESET_HISTORY_SOURCE); return; }
    let alive = true;
    void (async () => {
      try {
        if (snapshot?.status === "ok") await appendSnapshot(snapshot);
        else await refresh(snapshot?.accountKey ?? null);
        if(snapshot)await appendSignals(snapshot);
        if (alive) setError(null);
      } catch (cause) { if (alive) setError(String(cause)); }
    })();
    return () => { alive = false; };
  }, [enabled, snapshot?.updatedAt, snapshot?.accountKey, appendSnapshot, appendSignals, refresh]);

  // 跟随已有15分钟status节流，一次新成功status拉完整分页；失败不延长历史覆盖。
  useEffect(()=>{
    if(!enabled||snapshot?.resetStatus?.status!=='ok'||!snapshot.resetStatus.fetchedAt)return;
    let alive=true;
    void(async()=>{
      const raw=await invoke<unknown>('fetch_platform_history');
      if(!alive)return;
      await enqueueWrite(async()=>{
        if(!alive)return;
        const log=await read('cards');
        const document=archivePlatformHistory(raw,latestArchivedHistory(log.content,RESET_HISTORY_SOURCE));
        await appendOnce('cards',{id:`platform-history:${document.fetchedAt}`,observedAt:document.fetchedAt,kind:'platform_history',document});
      });
      if(alive){await refresh();setHistoryError(null);}
    })().catch(cause=>{if(alive)setHistoryError(`平台完整历史刷新失败，未新增覆盖：${String(cause)}`);});
    return()=>{alive=false;};
  },[enabled,snapshot?.resetStatus?.fetchedAt,snapshot?.resetStatus?.status,enqueueWrite,refresh]);

  return { observations,accountSnapshots, signalHistory, historyDocument,predictionContent,error:error??historyError, refresh, appendSnapshot, appendPrediction,appendWeekdayPair,stopWeekdayShadow, appendPlanning,appendAccountMapping };
}

export interface PlatformSignalHistory {
  signalKind: "scheduled_reset" | "active_watch";
  observedAt: string;
  firstSeenAt: string;
  change: "first_seen" | "changed" | "cancelled";
  value: ResetStatusSnapshot["scheduledReset"] | ResetStatusSnapshot["activeWatch"];
}

function readSignalHistory(content: string): PlatformSignalHistory[] {
  const rows: PlatformSignalHistory[] = [];
  for (const line of content.split(/\r?\n/)) {
    try {
      const row = JSON.parse(line);
      if (row?.kind === "platform_signal" &&
          ["scheduled_reset", "active_watch"].includes(row.signalKind) &&
          typeof row.observedAt === "string" && typeof row.firstSeenAt === "string" &&
          ["first_seen", "changed", "cancelled"].includes(row.change)) rows.push(row as PlatformSignalHistory);
    } catch { /* tolerate damaged historical JSONL rows */ }
  }
  return rows.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}
