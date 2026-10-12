import {describe,it,expect} from 'vitest';
import {settlePlatformPredictions,summarizeVerdicts,weeklyFallbackReview} from '../v3/verdict';
const day=86_400_000, t=Date.UTC(2026,0,1);
const history=(events:any[],end=t+10*day)=>({fetchedAt:new Date(end).toISOString(),coverageThrough:new Date(end).toISOString(),events,
  upstream:{pagination:{has_more:false,next_cursor:null}}});
const prediction=(id:string,start=t,probability=.8,modelVersion='platform-v3.1:D60',group='primary_daily')=>JSON.stringify({kind:'prediction',group,groupDate:'2026-01-01',record:{id,target:'platform_notice',modelVersion,issuedAt:start,trainingCutoff:start,
  windowStart:start,windowEnd:start+day,probability}});
describe('v3.1 verdict',()=>{
  it('settles and scores mature windows without altering prediction rows',()=>{
    const content=prediction('a'),rows=settlePlatformPredictions(content,history([{id:'e0',resetType:'regular',announcedAt:t-2*day},{id:'e1',resetType:'regular',announcedAt:t+day}],t+3*day),t+3*day);
    expect(rows[0]).toMatchObject({outcome:'positive',label:1,version:1});
    const summary=summarizeVerdicts(content+'\n'+JSON.stringify(rows[0]))[0];expect(summary.sampleCount).toBe(1);expect(summary.positiveCount).toBe(1);expect(summary.brier).toBeCloseTo(.04);
  });
  it('appends a late correction as a new version',()=>{
    const content=prediction('b'),h=history([{id:'e0',resetType:'regular',announcedAt:t-2*day}],t+3*day);
    const first=settlePlatformPredictions(content,h,t+3*day)[0];
    const corrected=settlePlatformPredictions(content+'\n'+JSON.stringify(first),history([{id:'e0',resetType:'regular',announcedAt:t-2*day},{id:'late',resetType:'regular',announcedAt:t+day}],t+4*day),t+4*day)[0];
    expect(corrected).toMatchObject({version:2,outcome:'positive',label:1});
  });
  it('marks absent historical coverage unknown and leaves immature future windows pending',()=>{
    expect(settlePlatformPredictions(prediction('missing'),null,t+3*day)[0].outcome).toBe('unknown');
    expect(settlePlatformPredictions(prediction('c'),history([{id:'e',resetType:'regular',announcedAt:t+2*day}],t+3*day),t+3*day)[0].outcome).toBe('unknown');
    expect(settlePlatformPredictions(prediction('d'),history([{id:'e',resetType:'regular',announcedAt:t-2*day}],t+day/2),t+day/2)).toEqual([]);
  });
  it('emits unknown when a mature window is beyond fetched coverage, then appends a correction',()=>{
    const content=prediction('lag'),thin=history([{id:'old',resetType:'regular',announcedAt:t-2*day}],t+day/2);
    const unknown=settlePlatformPredictions(content,thin,t+2*day)[0];expect(unknown).toMatchObject({outcome:'unknown',label:null,version:1});
    const full=history([{id:'old',resetType:'regular',announcedAt:t-2*day}],t+3*day);
    expect(settlePlatformPredictions(content+'\n'+JSON.stringify(unknown),full,t+3*day)[0]).toMatchObject({outcome:'negative',label:0,version:2});
  });
  it('scores only primary rows with valid probabilities and tracks temporary rows separately',()=>{
    const primary=prediction('score'),temp=prediction('temp',t,.5,'platform-v3.1:D60','temporary');
    const verdict=(id:string)=>JSON.stringify({kind:'verdict',id:`v-${id}`,predictionId:id,version:1,outcome:'positive',label:1});
    const rows=summarizeVerdicts([primary,temp,verdict('score'),verdict('temp')].join('\n'))[0];
    expect(rows.sampleCount).toBe(1);expect(rows.positiveCount).toBe(1);expect(rows.temporaryCount).toBe(1);
  });
  it('requires 28 distinct matched days and consecutive weekly threshold breaches',()=>{
    const rows=[...Array(28)].flatMap((_,i)=>['platform-v3:P0','platform-v3.1:D60'].map(modelVersion=>({groupDate:`2026-01-${String(i+1).padStart(2,'0')}`,
      issuedAt:t+(i+2)*day,trainingCutoff:t+(i+2)*day,windowStart:t+(i+2)*day,windowEnd:t+(i+3)*day,target:'platform_notice',modelVersion,probability:modelVersion.endsWith('P0') ? .1 : .9,label:0 as const})));
    const now=t+30*day,prior=[{reviewedAt:now-7*day,thresholdExceeded:true}];
    expect(weeklyFallbackReview(rows.filter(r=>r.modelVersion==='platform-v3:D60'),now,prior).maturePairCount).toBe(0);
    const review=weeklyFallbackReview(rows,now,prior);expect(review.matureDayCount).toBe(28);expect(review.fallbackSuggested).toBe(true);
    expect(weeklyFallbackReview(rows,now,[...prior,{reviewedAt:now,thresholdExceeded:true}]).fallbackSuggested).toBe(false);
  });
});
