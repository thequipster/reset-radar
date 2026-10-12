// v3在线历史及标签：只消费完整分页证据；不以latest_reset推断期间没有其他公告。
import {beijingDayStart, DAY_MS} from '../beijing';
import {fitPlatformModel, summarizeOnlinePlatformScores, bootstrapWeeklyBrierImprovement,
  type RegularEventInput, type OnlinePlatformScoreRow, type MatchedPlatformScore} from './platform';
import type {PredictionRecordV3} from './journal';

export interface PlatformHistoryDocument {
  fetchedAt:string; coverageThrough?:string; events:RegularEventInput[];
  upstream:{pagination:{has_more:false;next_cursor:null;pages_fetched?:number}};
}
export function completeHistoryDocument(value:unknown):value is PlatformHistoryDocument {
  const d=value as Partial<PlatformHistoryDocument>|null;
  return !!d&&Number.isFinite(Date.parse(d.fetchedAt??''))&&Array.isArray(d.events)&&
    (d.coverageThrough==null||Number.isFinite(Date.parse(d.coverageThrough))&&Date.parse(d.coverageThrough)<=Date.parse(d.fetchedAt??''))&&
    d.events.every(e=>e&&typeof e==='object'&&['string','number'].includes(typeof e.id)&&
      typeof e.resetType==='string'&&Number.isFinite(typeof e.announcedAt==='number'?e.announcedAt:Date.parse(String(e.announcedAt))))&&
    d.upstream?.pagination?.has_more===false&&d.upstream.pagination.next_cursor==null;
}

/** 第一次本机读到的新ID保留真实抓取时间；旧归档缺firstSeen时不伪造历史可用性。 */
export function archivePlatformHistory(raw:unknown,previous:unknown):PlatformHistoryDocument {
  if(!completeHistoryDocument(raw))throw new Error('平台历史缺完整分页或有效事件证据');
  const prior=new Map(completeHistoryDocument(previous)?previous.events.map(e=>[String(e.id),e]):[]);
  return {...raw,events:raw.events.map(e=>{
    const old=prior.get(String(e.id));
    return {...e,firstSeenAt:old?old.firstSeenAt??null:raw.fetchedAt,
      versionSeenAt:old&&JSON.stringify({...old,firstSeenAt:undefined,versionSeenAt:undefined})===JSON.stringify({...e,firstSeenAt:undefined,versionSeenAt:undefined})?old.versionSeenAt??null:raw.fetchedAt};
  })};
}

/** 冻结预测保持原字节；成熟标签根据后来完整归档派生，不回写旧输入。 */
export function evaluatePlatformJournal(content:string,history:unknown,now:number){
  const records:Array<OnlinePlatformScoreRow&{record:PredictionRecordV3}>=[];
  const ids=new Set<string>();
  for(const line of content.split(/\r?\n/)){
    try{
      const row=JSON.parse(line);
      const r=row.record as PredictionRecordV3;
      if(row.kind!=='prediction'||r?.target!=='platform_notice'||!/^platform-v3:P[01](?:-shadow)?$/.test(r.modelVersion)||
        typeof r.id!=='string'||ids.has(r.id)||![r.issuedAt,r.trainingCutoff,r.windowStart,r.windowEnd].every(Number.isFinite)||
        r.windowEnd<=r.windowStart||r.trainingCutoff>r.issuedAt||r.issuedAt>now)continue;
      ids.add(r.id);records.push({...row,record:r});
    }catch{/* 损坏、旧版本或非预测行不产生可评分样本。 */}
  }
  const complete=completeHistoryDocument(history)&&Date.parse(history.fetchedAt)<=now;
  const fetchedAt=complete?Date.parse(history.coverageThrough??history.fetchedAt):null;
  const rawEvents=complete?history.events:[];
  const times=rawEvents.filter(e=>e.resetType==='regular').map(e=>typeof e.announcedAt==='number'?e.announcedAt:Date.parse(String(e.announcedAt)));
  const start=times.length?Math.min(...times):null;
  const events=fitPlatformModel({events:rawEvents,coverage:[],trainingCutoff:now}).events;
  const rows=records.map(row=>{
    const r=row.record;
    const covered=fetchedAt!=null&&start!=null&&start<=r.windowStart&&fetchedAt>=r.windowEnd;
    const outcome=r.windowEnd>now||!covered?'pending' as const:
      events.some(e=>e.announcedAt>r.windowStart&&e.announcedAt<=r.windowEnd)?'positive' as const:'negative' as const;
    return {...row,outcome};
  });
  const summary=summarizeOnlinePlatformScores(rows);
  const primary=rows.filter(r=>r.group==='primary_daily');
  const paired:MatchedPlatformScore[]=[];
  const seen=new Set<string>();
  for(const row of primary){
    const r=row.record,key=`${row.groupDate}|${r.issuedAt}|${r.trainingCutoff}`;
    if(seen.has(key)||r.modelVersion!=='platform-v3:P0'||!['positive','negative'].includes(row.outcome))continue;
    const shadow=primary.find(p=>p.groupDate===row.groupDate&&p.record.issuedAt===r.issuedAt&&p.record.trainingCutoff===r.trainingCutoff&&p.record.modelVersion==='platform-v3:P1-shadow');
    if(r.probability==null||shadow?.record.probability==null||!Number.isFinite(r.probability)||!Number.isFinite(shadow.record.probability))continue;
    const day=beijingDayStart(row.groupDate??'');if(day==null)continue;
    const weekday=new Date(day+8*3_600_000).getUTCDay();
    paired.push({week:day-((weekday+6)%7)*DAY_MS,label:row.outcome==='positive'?1:0,p0:r.probability,p1:shadow.record.probability});seen.add(key);
  }
  const weeklyBootstrap=bootstrapWeeklyBrierImprovement(paired);
  const positiveCount=paired.filter(r=>r.label===1).length;
  const improvement=summary.brierP0==null||summary.brierP1==null?null:summary.brierP0-summary.brierP1;
  return {...summary,positiveCount,improvement,weeklyBootstrap,coverageEnd:fetchedAt,
    issuedCount:records.length,temporaryRows:rows.filter(r=>r.group==='temporary').length,
    // 只给验证资格，不自动改正式模型；升级须冻结版本并保留回滚。
    upgradeEvidenceReady:summary.matchedCount>=60&&positiveCount>=10&&improvement!=null&&improvement>0&&
      weeklyBootstrap.blockCount>=2&&weeklyBootstrap.lower!=null&&weeklyBootstrap.lower>0};
}
export type PlatformCalibrationV3=ReturnType<typeof evaluatePlatformJournal>;

export function latestArchivedHistory(content:string,fallback:unknown):unknown {
  let latest=fallback;
  for(const line of content.split(/\r?\n/))try{
    const row=JSON.parse(line);
    if(row.kind==='platform_history'&&completeHistoryDocument(row.document)&&
      (!completeHistoryDocument(latest)||Date.parse(row.document.fetchedAt)>Date.parse(latest.fetchedAt)))latest=row.document;
  }catch{/* 单条损坏不能抹去可用的完整历史。 */}
  return latest;
}
