// RR53：合成压力输入；不冒充用户实测或概率权重。
import type {PlanningInput} from '../../v3/planning';
import type {PlatformModel} from '../../v3/platform';
import type {SupplyScenario} from '../../v3/supply';
import type {ResetCard} from '../../v3/cards';
const DAY=86400000,now=Date.parse('2026-10-13T01:00:00Z');
const account={observedAt:now,weekly:{remaining:23,resetsAt:now+2*DAY,durationMins:10080},short:{remaining:60,resetsAt:now+5*3600000,durationMins:300},availableCardCount:0};
const model:PlatformModel={version:'platform-v3',cutoff:now,events:[],k:[1,1,1],e:[10,10,10],lambda0:.15,lambda:[.15,.15,.15],globalRatePerDay:.15,lastEventAt:now-DAY,eventCount:3,completedGapCount:2,exposureDays:30,coverageDays:30,status:'reference'};
const scenario=(i:number,bg:boolean):SupplyScenario=>({id:`scheduled-${i}${bg?':with-platform-background':''}`,source:bg?'platform_background':'scheduled',title:'test',probability:null,weighted:false,assumptions:[],resultingDeadlines:{weekly:null,short:null},accountProbability24h:null,events:[{at:now+(i+1)*3600000,incidentId:`incident-${i}`,kind:'scheduled_weekly_supply',certainty:'conditional'}]});
export const stressInput:PlanningInput={now,account,cards:[],reviews:[now,now+DAY,now+2*DAY],preference:'service',dailyRange:null,sampleDays:0,platformModel:model,platformRates:[{id:'low',ratePerDay:.08},{id:'reference',ratePerDay:.15},{id:'high',ratePerDay:.3}],inputSnapshotId:'RR53-fixed-comparison',supplyScenarios:Array.from({length:18},(_,i)=>[scenario(i,false),scenario(i,true)]).flat()};

export function goldenInputs():PlanningInput[]{
 const card:ResetCard={localId:'c1',label:'card',enteredExpiry:null,entryPrecision:'datetime',timezone:'Asia/Shanghai',exactExpiryAt:now+3*DAY,safeDeadlineAt:now+3*DAY,source:'user',confirmedAt:now-DAY,reconciliation:'consistent',state:'available'};
 return [{...stressInput,supplyScenarios:[scenario(0,false),scenario(0,true)]},{...stressInput,supplyScenarios:[scenario(0,true)],dailyRange:{low:5,median:10,high:20,p95:30},dailySamples:[5,6,7,8,9,10,11],sampleDays:7,todayBudget:20},
 {...stressInput,platformModel:null,platformRates:[],supplyScenarios:[scenario(0,false)],dailyRange:{low:5,median:10,high:20,p95:30},cards:[card],account:{...account,availableCardCount:1},preference:'expiry'},
 {...stressInput,platformModel:null,platformRates:[],supplyScenarios:[],dailyRange:{low:5,median:10,high:20,p95:30},cards:[card],account:{...account,availableCardCount:1},preference:'save',explicitDemand:[{start:now,end:now+DAY,weeklyCost:55,shortCost:130,weight:1}]}];

}
