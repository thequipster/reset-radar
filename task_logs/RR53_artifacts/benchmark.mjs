import {writeFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {planActions}=await import(pathToFileURL(process.argv[2]));
const DAY=86400000,now=Date.parse('2026-10-13T01:00:00Z');
const account={observedAt:now,weekly:{remaining:23,resetsAt:now+2*DAY,durationMins:10080},short:{remaining:60,resetsAt:now+5*3600000,durationMins:300},availableCardCount:0};
const model={version:'platform-v3',cutoff:now,events:[],k:[1,1,1],e:[10,10,10],lambda0:.15,lambda:[.15,.15,.15],globalRatePerDay:.15,lastEventAt:now-DAY,eventCount:3,completedGapCount:2,exposureDays:30,coverageDays:30,status:'reference'};
const scenario=(i,bg)=>({id:`scheduled-${i}${bg?':with-platform-background':''}`,source:bg?'platform_background':'scheduled',events:[{at:now+(i+1)*3600000,incidentId:`incident-${i}`,kind:'scheduled_weekly_supply',certainty:'conditional'}]});
const input={now,account,cards:[],reviews:[now,now+DAY,now+2*DAY],preference:'service',dailyRange:null,sampleDays:0,platformModel:model,platformRates:[{id:'low',ratePerDay:.08},{id:'reference',ratePerDay:.15},{id:'high',ratePerDay:.3}],inputSnapshotId:'RR53-fixed-comparison',supplyScenarios:Array.from({length:18},(_,i)=>[scenario(i,false),scenario(i,true)]).flat()};
if(process.argv[3]==='golden') {
 const card={localId:'c1',label:'card',enteredExpiry:null,entryPrecision:'datetime',timezone:'Asia/Shanghai',exactExpiryAt:now+3*DAY,safeDeadlineAt:now+3*DAY,source:'user',confirmedAt:now-DAY,reconciliation:'consistent',state:'available'};
 const fixtures=[input,{...input,supplyScenarios:[scenario(0,true)],dailyRange:{low:5,median:10,high:20,p95:30},dailySamples:[5,6,7,8,9,10,11],sampleDays:7,todayBudget:20},
 {...input,platformModel:null,platformRates:[],supplyScenarios:[scenario(0,false)],dailyRange:{low:5,median:10,high:20,p95:30},cards:[card],account:{...account,availableCardCount:1},preference:'expiry'},
 {...input,platformModel:null,platformRates:[],supplyScenarios:[],dailyRange:{low:5,median:10,high:20,p95:30},cards:[card],account:{...account,availableCardCount:1},preference:'save',explicitDemand:[{start:now,end:now+DAY,weeklyCost:55,shortCost:130,weight:1}]}];
 const results=fixtures.map(planActions);
 if(process.argv[4]==='write')writeFileSync(new URL('./golden.json',import.meta.url),JSON.stringify(results));
 else assert.deepEqual(results,JSON.parse(readFileSync(new URL('./golden.json',import.meta.url),'utf8')));
 console.log(JSON.stringify({mode:'golden',fixtures:results.length,metrics:results.map(r=>r.selected.scenarios.length),match:process.argv[4]!=='write'}));
} else {
 const runs=Number(process.argv[4]??1);
 for(let i=0;i<runs;i++){
  const start=performance.now();const result=planActions({...input,inputSnapshotId:`RR53-refresh-${i}`});
  console.log(JSON.stringify({run:i+1,ms:Math.round(performance.now()-start),scenarios:result.selected.scenarios.length,horizons:result.horizons.length,...process.memoryUsage()}));
 }
}
