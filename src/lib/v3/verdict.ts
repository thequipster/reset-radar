import {WEEKDAY_VERSION} from './weekday';
import {completeHistoryDocument} from './runtime';
import {fitPlatformModel, DAY_MS, type RegularEventInput} from './platform';

export type Verdict = {kind:'verdict';id:string;observedAtISO:string;predictionId:string;target:string;modelVersion:string;version:number;
  outcome:'positive'|'negative'|'unknown';label:0|1|null;historySnapshotId:string;windowEnd:number;settledAt:number};
type Prediction = {id:string;target:string;modelVersion:string;issuedAt:number;trainingCutoff:number;windowStart:number;windowEnd:number;probability:number|null;group?:string;groupDate?:string};
const supported=/^(?:platform-v3:P[01](?:-shadow)?|platform-v3\.1:(?:D60|R90-shadow))$/;
const uid=(v:unknown)=>typeof v==='string'&&v.length>0;
function read(content:string){const predictions:Prediction[]=[], verdicts:Verdict[]=[];
  for(const line of content.split(/\r?\n/))try{const x=JSON.parse(line);if(x.kind==='verdict'&&uid(x.predictionId)&&Number.isSafeInteger(x.version))verdicts.push(x);
    const r=x.record??x;if(x.kind==='prediction'&&r?.target==='platform_notice'&&uid(r.id)&&(supported.test(r.modelVersion)||r.modelVersion===WEEKDAY_VERSION)&&
      [r.issuedAt,r.trainingCutoff,r.windowStart,r.windowEnd].every(Number.isFinite)&&r.trainingCutoff<=r.issuedAt&&r.windowStart<=r.issuedAt&&r.windowEnd>r.windowStart&&
      (r.probability==null||(Number.isFinite(r.probability)&&r.probability>=0&&r.probability<=1)))predictions.push({...r,group:x.group,groupDate:x.groupDate});
  }catch{/* ignore malformed journal rows */}return {predictions,verdicts};}
export function settlePlatformPredictions(content:string,history:unknown,now:number):Verdict[]{
  const {predictions,verdicts}=read(content), complete=completeHistoryDocument(history)&&Date.parse(history.fetchedAt)<=now;
  const through=complete?Date.parse(history.coverageThrough??history.fetchedAt):-Infinity, events=complete?history.events as RegularEventInput[]:[];
  const regular=events.filter(e=>e.resetType==='regular'), times=regular.map(e=>typeof e.announcedAt==='number'?e.announcedAt:Date.parse(String(e.announcedAt))).filter(Number.isFinite);
  const earliest=times.length?Math.min(...times):null;
  const dedup=fitPlatformModel({events:regular,coverage:[],trainingCutoff:now}).events;
  const snapshot=complete?String((history as any).snapshotId??(history as any).id??history.fetchedAt):'coverage_missing';
  const latest=new Map<string,Verdict>();for(const v of verdicts){const p=latest.get(v.predictionId);if(!p||v.version>p.version)latest.set(v.predictionId,v);}
  const appended:Verdict[]=[];
  for(const p of predictions){if(p.windowEnd>now)continue;
    const covered=through>=p.windowEnd&&earliest!=null&&earliest<=p.windowStart;
    const hit=covered&&dedup.some(e=>e.announcedAt>p.windowStart&&e.announcedAt<=p.windowEnd);
    const outcome=covered?(hit?'positive':'negative'):'unknown', prior=latest.get(p.id);
    if(prior?.outcome===outcome)continue;
    const version=(prior?.version??0)+1;
    appended.push({kind:'verdict',id:`verdict:${p.id}:${version}`,observedAtISO:new Date(now).toISOString(),predictionId:p.id,target:p.target,
      modelVersion:p.modelVersion,version,outcome,label:outcome==='unknown'?null:hit?1:0,historySnapshotId:snapshot,windowEnd:p.windowEnd,settledAt:now});
  }return appended;
}
export function summarizeVerdicts(content:string){
  const {predictions,verdicts}=read(content),latest=new Map<string,Verdict>();for(const v of verdicts){const p=latest.get(v.predictionId);if(!p||v.version>p.version)latest.set(v.predictionId,v);}
  const groups=new Map<string,{sampleCount:number;positiveCount:number;unknownCount:number;pendingCount:number;brier:number|null;logLoss:number|null;temporaryCount:number}>();
  for(const p of predictions){const key=`${p.modelVersion}|${p.target}`,g=groups.get(key)??{sampleCount:0,positiveCount:0,unknownCount:0,pendingCount:0,brier:null,logLoss:null,temporaryCount:0};
    const v=latest.get(p.id);if((p as any).group==='temporary')g.temporaryCount++;if(!v){if((p as any).group==='primary_daily')g.pendingCount++;groups.set(key,g);continue;}
    if(v.outcome==='unknown'){if((p as any).group==='primary_daily')g.unknownCount++;groups.set(key,g);continue;}
    const prob=p.probability, scoreable=(p as any).group==='primary_daily'&&prob!=null&&Number.isFinite(prob)&&prob>=0&&prob<=1;
    if(scoreable){g.sampleCount++;if(v.label===1)g.positiveCount++;const sq=(prob-v.label!)**2,eps=1e-15;
      // Aggregate losses are stored internally until final projection.
      (g as any)._b=((g as any)._b??0)+sq;(g as any)._l=((g as any)._l??0)-(v.label?Math.log(Math.max(eps,prob)):Math.log(Math.max(eps,1-prob)));(g as any)._sc=((g as any)._sc??0)+1;}
    groups.set(key,g);
  }
  return [...groups].map(([key,g])=>{const n=(g as any)._sc??0;return {modelVersion:key.split('|')[0],target:key.slice(key.indexOf('|')+1),sampleCount:g.sampleCount,positiveCount:g.positiveCount,
    unknownCount:g.unknownCount,pendingCount:g.pendingCount,temporaryCount:g.temporaryCount,brier:n?(g as any)._b/n:null,logLoss:n?(g as any)._l/n:null};});
}
type ReviewScoreRow={groupDate?:string;issuedAt:number;trainingCutoff:number;windowStart:number;windowEnd:number;target:string;modelVersion:string;probability:number;label:0|1};
const bjtDate=(time:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
export function weeklyFallbackReview(rows:readonly ReviewScoreRow[],now:number,previousReviews:readonly {reviewedAt:number;thresholdExceeded:boolean}[]=[]){
  const since=now-29*DAY_MS, matureBefore=now-DAY_MS, grouped=new Map<string,Map<string,ReviewScoreRow>>();
  for(const r of rows){if(!Number.isFinite(r.issuedAt)||!Number.isFinite(r.trainingCutoff)||!Number.isFinite(r.windowStart)||!Number.isFinite(r.windowEnd)||
      !Number.isFinite(r.probability)||r.probability<0||r.probability>1||(r.label!==0&&r.label!==1)||r.trainingCutoff>r.issuedAt||r.windowStart>r.issuedAt||
      r.issuedAt<since||r.issuedAt>matureBefore||r.windowEnd>now||r.target!=='platform_notice'||!['platform-v3:P0','platform-v3.1:D60'].includes(r.modelVersion))continue;
    const date=r.groupDate??bjtDate(r.issuedAt),key=[date,r.issuedAt,r.trainingCutoff,r.windowStart,r.windowEnd,r.target].join('|');
    const pair=grouped.get(key)??new Map<string,ReviewScoreRow>();pair.set(r.modelVersion,r);grouped.set(key,pair);
  }
  const pairs=[...grouped.values()].flatMap(g=>{const p0=g.get('platform-v3:P0'),d60=g.get('platform-v3.1:D60');return p0&&d60&&p0.label===d60.label?[[p0,d60] as const]:[];});
  const dates=new Set(pairs.map(([r])=>r.groupDate??bjtDate(r.issuedAt))),p0s=pairs.map(([r])=>r),d60s=pairs.map(([,r])=>r);
  const score=(xs:readonly ReviewScoreRow[])=>xs.length?xs.reduce((s,r)=>s+(r.probability-r.label)**2,0)/xs.length:null;
  const brierP0=score(p0s),brierD60=score(d60s),difference=brierP0==null||brierD60==null?null:brierD60-brierP0,thresholdExceeded=difference!=null&&difference>.01;
  const prior=previousReviews.filter(r=>Number.isFinite(r.reviewedAt)&&r.reviewedAt<=now).sort((a,b)=>b.reviewedAt-a.reviewedAt)[0];
  const alreadyReviewed=prior?.reviewedAt===now;
  const consecutive=prior!=null&&now-prior.reviewedAt>=7*DAY_MS&&now-prior.reviewedAt<=14*DAY_MS;
  const fallbackSuggested=!alreadyReviewed&&dates.size>=28&&thresholdExceeded&&consecutive&&prior.thresholdExceeded;
  return {version:'weekly-fallback-v2',reviewedAt:now,windowDays:28,threshold:.01,reason:fallbackSuggested?'D60 Brier exceeds P0 by >0.01 in two consecutive weekly reviews':
      dates.size<28?'fewer than 28 distinct mature paired days':!thresholdExceeded?'D60 is not more than 0.01 worse than P0':!consecutive?'no consecutive weekly review':
      !prior?.thresholdExceeded?'previous weekly review did not exceed threshold':alreadyReviewed?'review already recorded for this date':'review threshold not met',
    alreadyReviewed,thresholdExceeded,maturePairCount:pairs.length,matureDayCount:dates.size,positiveCount:pairs.filter(([r])=>r.label===1).length,
    brierP0,brierD60,difference,fallbackSuggested};
}
