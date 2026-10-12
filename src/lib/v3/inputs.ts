// v3 §1/11：窗口按时长识别，输入未知不填额度/有效期。纯函数不读系统时钟。
import {beijingDayFloor,DAY_MS} from '../beijing';
import type {AccountState} from './simulator';
export interface QuotaWindowInput {remainingPercent:number;resetsAt:string|null;windowSeconds:number}
export interface AccountSnapshotInput {weeklyWindow:QuotaWindowInput|null;shortWindow:QuotaWindowInput|null;rateLimitSnapshot?:{observedAt:string}|null;updatedAt:string;resetCredits:number|null}
export function normalizeAccount(snapshot:AccountSnapshotInput):AccountState|null{
 const windows=[snapshot.weeklyWindow,snapshot.shortWindow].filter((w):w is QuotaWindowInput=>w!=null&&w.windowSeconds>0&&w.resetsAt!=null&&Number.isFinite(Date.parse(w.resetsAt))&&Number.isFinite(w.remainingPercent)).sort((a,b)=>b.windowSeconds-a.windowSeconds);
 if(windows.length!==2||windows[0]!.windowSeconds<=windows[1]!.windowSeconds)return null;
 const observedAt=Date.parse(snapshot.rateLimitSnapshot?.observedAt??snapshot.updatedAt);if(!Number.isFinite(observedAt))return null;
 const convert=(w:QuotaWindowInput)=>({remaining:Math.max(0,Math.min(100,w.remainingPercent)),resetsAt:Date.parse(w.resetsAt!),durationMins:w.windowSeconds/60});
 return{observedAt,weekly:convert(windows[0]!),short:convert(windows[1]!),availableCardCount:snapshot.resetCredits??0};
}
export function buildReviewTimes(now:number,times:readonly string[],confirmed:boolean,horizonDays=42):number[]{
 const result=[now];if(!confirmed)return result;
 for(let day=beijingDayFloor(now);day<now+horizonDays*DAY_MS;day+=DAY_MS)for(const time of times){const m=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);if(!m)continue;const at=day+Number(m[1])*3_600_000+Number(m[2])*60_000;if(at>now)result.push(at);}
 return[...new Set(result)].sort((a,b)=>a-b);
}
export interface SignalVersionInput {signalKind:'scheduled_reset'|'active_watch';observedAt:string;firstSeenAt:string;change:string;value:unknown}
export function normalizeSignalVersions(rows:readonly SignalVersionInput[],kind:SignalVersionInput['signalKind']):Record<string,unknown>[] {
 let previous:Record<string,unknown>|null=null;
 return rows.filter(h=>h.signalKind===kind).map((h,i)=>{
  const value=h.value&&typeof h.value==='object'?h.value as Record<string,unknown>:null;
  const id=value?.id??(h.change==='first_seen'?`${kind}:${h.firstSeenAt}`:previous?.id??`${kind}:${h.firstSeenAt}`);
  const row=value?{...value,id,firstSeenAt:h.firstSeenAt,version:i+1}:{...previous,id,status:'cancelled',cancelledAt:h.observedAt,firstSeenAt:h.firstSeenAt,version:i+1};
  previous=row;return row;
 });
}
