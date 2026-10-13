// 用户v3.2 §7：只比较同次冻结D60/W28；90/180/365日预定评审，不自动转正。
import {beijingDayKey,beijingDayStart,DAY_MS} from '../beijing';
import type {PredictionRecordV3} from './journal';
import {WEEKDAY_VERSION} from './weekday';
import {TREND_VERSION} from './trend';
import type {Verdict} from './verdict';

export const WEEKDAY_REVIEW_DAYS=[90,180,365] as const;
export const WEEKDAY_BOOTSTRAP_SEED=20261012;
export const WEEKDAY_BOOTSTRAP_SAMPLES=10000;
export const WEEKDAY_CONFIDENCE=1-.05/3;
export function weekdayExperiment(enabledAt:number){
 if(!Number.isFinite(enabledAt)||Math.abs(enabledAt)>8.64e15)throw new Error('invalid weekday activation');
 return {kind:'weekday_experiment' as const,id:`weekday-experiment:${WEEKDAY_VERSION}`,observedAt:new Date(enabledAt).toISOString(),
  record:{modelVersion:WEEKDAY_VERSION,enabledAt,timezone:'Asia/Shanghai',halfLifeDays:60,overallShrinkageDays:7,weekdayShrinkageDays:28,
   reviewDays:[...WEEKDAY_REVIEW_DAYS],bootstrapSeed:WEEKDAY_BOOTSTRAP_SEED,bootstrapSamples:WEEKDAY_BOOTSTRAP_SAMPLES,confidence:WEEKDAY_CONFIDENCE}};
}
type Frozen=PredictionRecordV3&{group:string;groupDate?:string};
export type WeekdayPair={issuedAt:number;windowEnd:number;groupDate:string;historySnapshotId:string;label:0|1;d60:number;weekday:number};
export type WeekdayMetrics={count:number;positiveCount:number;brierD60:number|null;brierWeekday:number|null;deltaBrier:number|null;
 logLossD60:number|null;logLossWeekday:number|null;predictedActualRatioD60:number|null;predictedActualRatioWeekday:number|null;
 bins:{from:number;to:number;count:number;meanD60:number|null;meanWeekday:number|null;eventRate:number|null}[]};
export type WeekdayBlockInterval={blockDays:7|14;blockCount:number;partialBlockCount:number;samples:number;seed:number;confidence:number;lower:number|null;upper:number|null};
export type WeekdayReview={kind:'weekday_review';id:string;observedAt:string;record:{modelVersion:typeof WEEKDAY_VERSION;reviewDay:90|180|365;reviewedAt:number;
 checkpointAt:number;missed:boolean;matchedCount:number;positiveCount:number;weekCount:number;metrics:WeekdayMetrics;blocks7:WeekdayBlockInterval;blocks14:WeekdayBlockInterval;
 eligibleForManualReview:boolean;manualReviewRequired:true;reason:string}};
export interface WeekdayCalibration extends WeekdayMetrics{
 activationAt:number|null;matchedCount:number;weekCount:number;pendingCount:number;unknownCount:number;missingPairCount:number;malformedCount:number;
 coverageInsufficientCount:number;temporaryCount:number;labelMismatchCount:number;nextReviewAt:number|null;
 evidenceStatus:'unregistered'|'collecting'|'review_due'|'reviewed_unverified'|'eligible_for_manual_review'|'stopped';
 byWeekday:(WeekdayMetrics&{weekday:number})[];periods:(WeekdayMetrics&{from:number;to:number})[];
 reviews:WeekdayReview[];faults:{at:number;reason:string}[];pairs:WeekdayPair[];
}
const finiteProbability=(p:unknown):p is number=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1;
const checkpoint=(activationAt:number,days:number)=>beijingDayStart(beijingDayKey(activationAt))!+days*DAY_MS;
const validTime=(t:unknown):t is number=>typeof t==='number'&&Number.isFinite(t)&&Math.abs(t)<=8.64e15;
const versions=new Set<string>([TREND_VERSION,WEEKDAY_VERSION]);
const weekdayAt=(t:number)=>new Date(t+8*3600000).getUTCDay();
const monday=(t:number)=>{const day=beijingDayStart(beijingDayKey(t))!;return day-((weekdayAt(day)+6)%7)*DAY_MS;};
const mean=(v:readonly number[])=>v.length?v.reduce((s,x)=>s+x,0)/v.length:null;
function metrics(rows:readonly WeekdayPair[]):WeekdayMetrics{
 const positiveCount=rows.filter(r=>r.label===1).length;
 const brierD60=mean(rows.map(r=>(r.d60-r.label)**2)),brierWeekday=mean(rows.map(r=>(r.weekday-r.label)**2));
 const loss=(p:number,y:0|1)=>-Math.log(Math.max(1e-15,y?p:1-p));
 return {count:rows.length,positiveCount,brierD60,brierWeekday,deltaBrier:brierD60==null||brierWeekday==null?null:brierD60-brierWeekday,
  logLossD60:mean(rows.map(r=>loss(r.d60,r.label))),logLossWeekday:mean(rows.map(r=>loss(r.weekday,r.label))),
  predictedActualRatioD60:positiveCount?rows.reduce((s,r)=>s+r.d60,0)/positiveCount:null,
  predictedActualRatioWeekday:positiveCount?rows.reduce((s,r)=>s+r.weekday,0)/positiveCount:null,
  bins:[0,1/3,2/3].map(from=>{const values=rows.filter(r=>r.d60>=from&&(from===2/3||r.d60<from+1/3));return {from,to:from+1/3,count:values.length,
   meanD60:mean(values.map(r=>r.d60)),meanWeekday:mean(values.map(r=>r.weekday)),eventRate:mean(values.map(r=>r.label))};})};
}

/** 整块重抽样，首尾部分块保留；按北京周一固定锚点，不按样本第一天重锚。 */
export function weekdayBlockInterval(rows:readonly WeekdayPair[],blockDays:7|14,from:number,to:number):WeekdayBlockInterval{
 const anchor=Date.UTC(1970,0,5)-8*3600000,span=blockDays*DAY_MS;
 const groups=new Map<number,{sum:number;count:number}>();
 for(const r of rows){const key=anchor+Math.floor((r.issuedAt-anchor)/span)*span,g=groups.get(key)??{sum:0,count:0};
  g.sum+=(r.d60-r.label)**2-(r.weekday-r.label)**2;g.count++;groups.set(key,g);}
 const blocks=[...groups.entries()].sort((a,b)=>a[0]-b[0]);
 const summary={blockDays,blockCount:blocks.length,partialBlockCount:blocks.filter(([start])=>start<from||start+span>to).length,
  samples:WEEKDAY_BOOTSTRAP_SAMPLES,seed:WEEKDAY_BOOTSTRAP_SEED,confidence:WEEKDAY_CONFIDENCE};
 if(blocks.length<2)return {...summary,lower:null,upper:null};
 let seed=WEEKDAY_BOOTSTRAP_SEED;
 const rng=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
 const values:number[]=[];
 for(let i=0;i<WEEKDAY_BOOTSTRAP_SAMPLES;i++){let sum=0,count=0;for(let j=0;j<blocks.length;j++){const block=blocks[Math.floor(rng()*blocks.length)]![1];sum+=block.sum;count+=block.count;}values.push(sum/count);}
 values.sort((a,b)=>a-b);const alpha=(1-WEEKDAY_CONFIDENCE)/2;
 return {...summary,lower:values[Math.floor(alpha*(values.length-1))]!,upper:values[Math.ceil((1-alpha)*(values.length-1))]!};
}

export function evaluateWeekdayJournal(content:string,now:number):WeekdayCalibration{
 const lines:unknown[]=[],predictions=new Map<string,Frozen>(),verdicts=new Map<string,Verdict>();
 let malformedCount=0,temporaryCount=0,activationAt:number|null=null;
 const reviews:WeekdayReview[]=[],faults:{at:number;reason:string}[]=[];
 for(const line of content.split(/\r?\n/)){if(!line.trim())continue;try{lines.push(JSON.parse(line));}catch{malformedCount++;}}
 for(const value of lines){const row=value as Record<string,any>;if(!row||typeof row!=='object')continue;
  if(row.kind==='weekday_experiment'&&row.record?.modelVersion===WEEKDAY_VERSION){const r=row.record,expected=weekdayExperiment(validTime(r.enabledAt)?r.enabledAt:now).record;
   if(r.enabledAt<=now&&validTime(r.enabledAt)&&Object.keys(expected).every(k=>JSON.stringify(r[k])===JSON.stringify(expected[k as keyof typeof expected])))activationAt=activationAt==null?r.enabledAt:Math.min(activationAt,r.enabledAt);else malformedCount++;}
  if(row.kind==='weekday_review'&&row.record?.modelVersion===WEEKDAY_VERSION&&WEEKDAY_REVIEW_DAYS.includes(row.record.reviewDay)&&Number.isFinite(row.record.reviewedAt)&&row.record.reviewedAt<=now)reviews.push(row as unknown as WeekdayReview);
  if(row.kind==='weekday_fault'&&row.modelVersion===WEEKDAY_VERSION&&Number.isFinite(row.at)&&row.at<=now&&typeof row.reason==='string')faults.push({at:row.at,reason:row.reason});
  if(row.kind==='prediction'&&row.record?.target==='platform_notice'&&versions.has(row.record.modelVersion)){
   const r=row.record as PredictionRecordV3;
   if(typeof r.id!=='string'||![r.issuedAt,r.trainingCutoff,r.windowStart,r.windowEnd].every(validTime)||r.trainingCutoff>r.issuedAt||r.windowStart!==r.issuedAt||r.windowEnd-r.windowStart!==DAY_MS||r.issuedAt>now||!(r.probability==null||finiteProbability(r.probability))){malformedCount++;continue;}
   if(predictions.has(r.id))continue;
   if(row.group==='temporary'){temporaryCount++;continue;}
   const bjt=new Date(r.issuedAt+8*3600000);
   if(row.group!=='primary_daily')continue;
   if(row.groupDate!==beijingDayKey(r.issuedAt)||bjt.getUTCHours()!==9||bjt.getUTCMinutes()!==0){malformedCount++;continue;}
   predictions.set(r.id,{...r,group:row.group,groupDate:row.groupDate});
  }
 }
 for(const value of lines){const v=value as Verdict;if(v?.kind!=='verdict'||!predictions.has(v.predictionId))continue;const p=predictions.get(v.predictionId)!;
  if(v.target!==p.target||v.modelVersion!==p.modelVersion||v.windowEnd!==p.windowEnd||!Number.isSafeInteger(v.version)||v.version<1||!Number.isFinite(v.settledAt)||v.settledAt>now||v.settledAt<p.windowEnd||
   !((v.outcome==='positive'&&v.label===1)||(v.outcome==='negative'&&v.label===0)||(v.outcome==='unknown'&&v.label===null))){malformedCount++;continue;}
  const prior=verdicts.get(v.predictionId);if(!prior||v.version>prior.version)verdicts.set(v.predictionId,v);
 }
 const groups=new Map<string,Map<string,Frozen>>();
 for(const p of predictions.values()){
  if(activationAt==null||p.issuedAt<activationAt)continue;
  const history=p.platformHistorySnapshotId;if(typeof history!=='string'||!history||history.endsWith(':unknown')){malformedCount++;continue;}
  const key=JSON.stringify([p.target,p.issuedAt,p.trainingCutoff,p.windowStart,p.windowEnd,history]);
  const g=groups.get(key)??new Map<string,Frozen>();if(g.has(p.modelVersion)){malformedCount++;continue;}g.set(p.modelVersion,p);groups.set(key,g);
 }
 const pairs:WeekdayPair[]=[],seenDates=new Set<string>();let pendingCount=0,unknownCount=0,missingPairCount=0,labelMismatchCount=0,coverageInsufficientCount=0;
 for(const g of groups.values()){
  const d=g.get(TREND_VERSION),w=g.get(WEEKDAY_VERSION);
  if(!d||!w){missingPairCount++;continue;}
  const dv=verdicts.get(d.id),wv=verdicts.get(w.id);
  if(d.windowEnd>now||!dv||!wv){pendingCount++;continue;}
  if(dv.outcome==='unknown'||wv.outcome==='unknown'){unknownCount++;coverageInsufficientCount++;continue;}
  if(d.probability==null||w.probability==null){unknownCount++;continue;}
  if(dv.label!==wv.label){labelMismatchCount++;continue;}
  if(seenDates.has(d.groupDate!)){malformedCount++;continue;}
  seenDates.add(d.groupDate!);pairs.push({issuedAt:d.issuedAt,windowEnd:d.windowEnd,groupDate:d.groupDate!,historySnapshotId:d.platformHistorySnapshotId!,label:dv.label!,d60:d.probability,weekday:w.probability});
 }
 pairs.sort((a,b)=>a.issuedAt-b.issuedAt);const all=metrics(pairs),weekCount=new Set(pairs.map(r=>monday(r.issuedAt))).size;
 const done=new Set(reviews.map(r=>r.record.reviewDay)),nextDay=activationAt==null?null:WEEKDAY_REVIEW_DAYS.find(d=>!done.has(d))??null;
 const nextReviewAt=activationAt==null||nextDay==null?null:checkpoint(activationAt,nextDay);
 const reviewed=reviews.some(r=>r.record.eligibleForManualReview&&!r.record.missed);
 return {...all,activationAt,matchedCount:pairs.length,weekCount,pendingCount,unknownCount,missingPairCount,malformedCount,coverageInsufficientCount,
  temporaryCount,labelMismatchCount,nextReviewAt,evidenceStatus:faults.length?'stopped':activationAt==null?'unregistered':reviewed?'eligible_for_manual_review':nextReviewAt!=null&&now>=nextReviewAt?'review_due':reviews.length?'reviewed_unverified':'collecting',
  byWeekday:Array.from({length:7},(_,weekday)=>({...metrics(pairs.filter(r=>weekdayAt(r.issuedAt)===weekday)),weekday})),
  periods:activationAt==null?[]:Array.from({length:Math.max(1,Math.min(5,Math.ceil((now-activationAt)/ (90*DAY_MS))))},(_,i)=>{const from=activationAt!+i*90*DAY_MS,to=Math.min(now,from+90*DAY_MS);return {...metrics(pairs.filter(r=>r.issuedAt>=from&&r.issuedAt<to)),from,to};}),reviews,faults,pairs};
}

/** 错过的评审只登记missed，不用日后累计赢家回填旧评审点。 */
export function dueWeekdayReviews(content:string,now:number):WeekdayReview[]{
 const evaluation=evaluateWeekdayJournal(content,now);if(evaluation.activationAt==null||evaluation.faults.length)return [];
 const done=new Set(evaluation.reviews.map(r=>r.record.reviewDay)),result:WeekdayReview[]=[];
 for(const reviewDay of WEEKDAY_REVIEW_DAYS){const checkpointAt=checkpoint(evaluation.activationAt,reviewDay);if(done.has(reviewDay)||now<checkpointAt)continue;
  const missed=beijingDayKey(now)!==beijingDayKey(checkpointAt),pairs=evaluation.pairs.filter(r=>r.windowEnd<=checkpointAt),m=metrics(pairs);
  const weekCount=new Set(pairs.map(r=>monday(r.issuedAt))).size;
  const blocks7=weekdayBlockInterval(pairs,7,evaluation.activationAt,checkpointAt),blocks14=weekdayBlockInterval(pairs,14,evaluation.activationAt,checkpointAt);
  const enough=pairs.length>=60&&m.positiveCount>=10&&weekCount>=12;
  const eligible=!missed&&enough&&m.deltaBrier!=null&&m.deltaBrier>0&&blocks7.lower!=null&&blocks7.lower>0&&blocks14.lower!=null&&blocks14.lower>0&&m.logLossWeekday!=null&&m.logLossD60!=null&&m.logLossWeekday<=m.logLossD60&&evaluation.labelMismatchCount===0;
  result.push({kind:'weekday_review',id:`weekday-review:${WEEKDAY_VERSION}:${reviewDay}`,observedAt:new Date(now).toISOString(),record:{modelVersion:WEEKDAY_VERSION,
   reviewDay,reviewedAt:now,checkpointAt,missed,matchedCount:pairs.length,positiveCount:m.positiveCount,weekCount,metrics:m,blocks7,blocks14,
   eligibleForManualReview:eligible,manualReviewRequired:true,reason:missed?'错过预定评审日；不回补转正资格':!enough?'配对日/正例/不同周数不足':eligible?'仅达到人工评审资格；须审阅分期、星期校准与日志链，未自动转正':'固定配对改善或7/14日区间、对数损失门槛未满足'}});
 }
 return result;
}

export function weekdayRollbackReview(content:string,now:number){
 const e=evaluateWeekdayJournal(content,now),recent=e.pairs.filter(r=>r.issuedAt>=now-29*DAY_MS&&r.windowEnd<=now).slice(-28),m=metrics(recent);
 const enough=recent.length===28,thresholdExceeded=enough&&m.deltaBrier!=null&&m.deltaBrier<-.01;
 const prior=content.split(/\r?\n/).flatMap(line=>{try{const r=JSON.parse(line);return r.kind==='weekday_rollback_review'&&r.record?.modelVersion===WEEKDAY_VERSION&&Number.isFinite(r.record.reviewedAt)&&r.record.reviewedAt<now?[r.record]:[];}catch{return [];}}).sort((a,b)=>b.reviewedAt-a.reviewedAt)[0];
 const consecutive=prior&&monday(now)-monday(prior.reviewedAt)===7*DAY_MS;
 return {modelVersion:WEEKDAY_VERSION,reviewedAt:now,maturePairCount:recent.length,thresholdExceeded,rollbackSuggested:!!(thresholdExceeded&&consecutive&&prior.thresholdExceeded),
  metrics:m,reason:'工程护栏：28成熟配对日差超过0.01且两次每周审阅；当前只记录影子诊断，未转正'};
}
