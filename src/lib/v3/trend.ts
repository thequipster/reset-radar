// 用户v3.1 §3：日历权重与暴露同步；60/7为预先固定产品假设，不是训练最优参数。
import {DAY_MS,fitPlatformModel,predictPlatform,bootstrapWeeklyBrierImprovement,type RegularEventInput,type CoverageInterval} from './platform';
export const HALF_LIFE_DAYS=60, SHRINKAGE_EXPOSURE_DAYS=7;
export const TREND_VERSION='platform-v3.1:D60';
export type TrendInput={events:readonly RegularEventInput[];coverage:readonly CoverageInterval[];trainingCutoff:number};
export function eventWeight(now:number,at:number){return Math.exp(-Math.LN2/HALF_LIFE_DAYS*(now-at)/DAY_MS);}
export function weightedExposure(now:number,from:number,to:number,order=1){const k=Math.LN2/HALF_LIFE_DAYS*order;return (Math.exp(-k*(now-to)/DAY_MS)-Math.exp(-k*(now-from)/DAY_MS))/k;}
export function reliableCoverage(coverage:readonly CoverageInterval[],cutoff:number,from=-Infinity){
 const sorted=coverage.filter(c=>c.complete&&Number.isFinite(c.from)&&Number.isFinite(c.to)).map(c=>({from:Math.max(from,c.from),to:Math.min(cutoff,c.to),complete:true as const})).filter(c=>c.to>c.from).sort((a,b)=>a.from-b.from),out:CoverageInterval[]=[];
 for(const c of sorted){const last=out.at(-1);if(last&&last.to>=c.from)last.to=Math.max(last.to,c.to);else out.push({...c});}return out;
}
export function fitTrendModel(input:TrendInput){
 const t=input.trainingCutoff,coverage=reliableCoverage(input.coverage,t);
 const events=fitPlatformModel({...input,coverage:[]}).events.filter(e=>coverage.some(c=>e.announcedAt>c.from&&e.announcedAt<=c.to));
 const exposureDays=coverage.reduce((s,c)=>s+(c.to-c.from)/DAY_MS,0),weightedCount=events.reduce((s,e)=>s+eventWeight(t,e.announcedAt),0);
 const weightedExposureDays=coverage.reduce((s,c)=>s+weightedExposure(t,c.from,c.to),0);
 const squaredExposure=coverage.reduce((s,c)=>s+weightedExposure(t,c.from,c.to,2),0);
 const lambdaAll=exposureDays>0?events.length/exposureDays:null;
 const ratePerDay=lambdaAll==null||weightedExposureDays<=0?null:(weightedCount+SHRINKAGE_EXPOSURE_DAYS*lambdaAll)/(weightedExposureDays+SHRINKAGE_EXPOSURE_DAYS);
 return {version:TREND_VERSION,cutoff:t,halfLifeDays:HALF_LIFE_DAYS,shrinkageDays:SHRINKAGE_EXPOSURE_DAYS,weightedCount,weightedExposureDays,exposureDays,eventCount:events.length,lambdaAll,ratePerDay,
  effectiveExposureDays:squaredExposure>0?weightedExposureDays**2/squaredExposure:null,
  probability24h:ratePerDay==null?null:-Math.expm1(-ratePerDay),
  probabilities:[1,2].map(days=>({horizonMs:days*DAY_MS,probability:ratePerDay==null?null:-Math.expm1(-ratePerDay*days)}))};
}
export function rateProbability(rate:number|null,horizonMs:number){return rate==null||!Number.isFinite(rate)||rate<0||!Number.isFinite(horizonMs)||horizonMs<0?null:-Math.expm1(-rate*horizonMs/DAY_MS);}
export function recentWindowRate(input:TrendInput){const coverage=reliableCoverage(input.coverage,input.trainingCutoff,input.trainingCutoff-90*DAY_MS);return fitTrendModel({...input,coverage}).lambdaAll;}
export type ReplayRow={issuedAt:number;label:0|1;p0:number;p1:number;d60:number;r90:number};
const keys=['p0','p1','d60','r90'] as const;
function metrics(rows:readonly ReplayRow[]){return Object.fromEntries(keys.map(key=>{const n=rows.length,positives=rows.filter(r=>r.label).length,predicted=rows.reduce((s,r)=>s+r[key],0);return [key,{count:n,positiveCount:positives,brier:n?rows.reduce((s,r)=>s+(r[key]-r.label)**2,0)/n:null,logLoss:n?rows.reduce((s,r)=>s-Math.log(Math.max(1e-15,r.label?r[key]:1-r[key])),0)/n:null,predictedActualRatio:positives?predicted/positives:null,
  bins:[0,1/3,2/3].map(from=>{const rs=rows.filter(r=>r[key]>=from&&(r[key]<from+1/3||from===2/3));return {from,to:from+1/3,count:rs.length,meanProbability:rs.length?rs.reduce((s,r)=>s+r[key],0)/rs.length:null,eventRate:rs.length?rs.filter(r=>r.label).length/rs.length:null};})}];})) as Record<typeof keys[number],{count:number;positiveCount:number;brier:number|null;logLoss:number|null;predictedActualRatio:number|null;bins:{from:number;to:number;count:number;meanProbability:number|null;eventRate:number|null}[]}>;}
export function replayTrend(input:TrendInput&{to?:number;availabilityDelayHours?:0|6|24}){
 const to=Math.min(input.to??input.trainingCutoff,input.trainingCutoff),coverage=reliableCoverage(input.coverage,to),start=coverage[0]?.from??to;
 // 历史归档的versionSeenAt常只是首次本机抓取。无firstSeenAt时使用公开的
 // “公告即时可知/当前规范版本”理想化假设；绝不用于在线拟合或改写冻结记录。
 const canonical=input.events.map(e=>e.firstSeenAt==null?{...e,versionSeenAt:null}:e);
 const rows:ReplayRow[]=[],outcome=fitPlatformModel({...input,events:canonical,trainingCutoff:input.trainingCutoff,coverage:[]}).events;
 let t=Math.floor((start+8*3_600_000)/DAY_MS)*DAY_MS-8*3_600_000+9*3_600_000;
 for(;t+DAY_MS<=to;t+=DAY_MS){
  if(reliableCoverage(input.coverage,t).reduce((s,c)=>s+(c.to-c.from)/DAY_MS,0)<60)continue;
  if(!coverage.some(c=>c.from<=t&&c.to>=t+DAY_MS))continue;
  const visible=canonical.map(e=>input.availabilityDelayHours?{...e,firstSeenAt:Math.max(typeof e.firstSeenAt==='number'?e.firstSeenAt:Date.parse(String(e.firstSeenAt??e.announcedAt)),typeof e.announcedAt==='number'?e.announcedAt:Date.parse(String(e.announcedAt)))+input.availabilityDelayHours*3_600_000}:e);
  const train={events:visible,coverage:input.coverage,trainingCutoff:t},long=fitPlatformModel(train),fc=predictPlatform(long,t),trend=fitTrendModel(train),r90=rateProbability(recentWindowRate(train),DAY_MS);
  if(fc.probability24h==null||fc.shadow.probability24h==null||trend.probability24h==null||r90==null)continue;
  rows.push({issuedAt:t,label:outcome.some(e=>e.announcedAt>t&&e.announcedAt<=t+DAY_MS)?1:0,p0:fc.probability24h,p1:fc.shadow.probability24h,d60:trend.probability24h,r90});
 }
 const block=(days:number)=>bootstrapWeeklyBrierImprovement(rows.map(r=>({week:Math.floor((r.issuedAt-start)/(days*DAY_MS)),label:r.label,p0:r.p0,p1:r.d60})));
 const recent90=metrics(rows.filter(r=>r.issuedAt>=to-90*DAY_MS)),recent180=metrics(rows.filter(r=>r.issuedAt>=to-180*DAY_MS));
 return {rows,all:metrics(rows),recent90,recent180,blocks7:block(7),blocks14:block(14),idealized:input.events.some(e=>e.firstSeenAt==null),availabilityDelayHours:input.availabilityDelayHours??0,
  note:'固定参数辅助历史回放；已看近期趋势，非独立测试集；缺firstSeenAt按公告即时可知假设。'};
}
export function selectTrendReference(decay:ReturnType<typeof fitTrendModel>,replay:ReturnType<typeof replayTrend>,loggingReady=true){
 const valid=decay.probability24h!=null&&Number.isFinite(decay.probability24h)&&decay.probability24h>=0&&decay.probability24h<=1;
 const enough=replay.recent90.d60.count>=30,contra=replay.recent90.d60.brier!=null&&replay.recent90.p0.brier!=null&&replay.recent90.d60.brier-replay.recent90.p0.brier>.01;
 const active=valid&&enough&&!contra&&loggingReady;
 return {activeModel:active?'D60' as const:'P0' as const,deployment:active?'reference_active' as const:'fallback' as const,evidence:enough?'historical_replay' as const:'specified' as const,
  reason:!valid?'D60计算或覆盖不足，回退长期参考':!enough?'近90天可评分日不足30，D60只作辅助':contra?'近90天Brier损失超过预定0.01止损线，保留P0':!loggingReady?'日志未接通，临时参考；不声明正在校准':'D60参考版已启用，历史回放非证明更准；未来持续记账',decay,replay};
}
