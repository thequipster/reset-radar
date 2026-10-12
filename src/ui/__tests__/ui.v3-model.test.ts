import {describe,expect,it} from 'vitest';
import {buildV3Dashboard,normalizeAccount} from '../v3Model';
import {demoSnapshot} from '../demoScenarios';
import {emptyPersonalInputs,reconcileCardCount} from '../../lib/v3/cards';
import {normalizeSignalVersions} from '../../lib/v3/inputs';
import {DAY_MS} from '../../lib/beijing';
import type {PersonalInputsState} from '../usePersonalInputs';
import type {UsageObservation} from '../../lib/v3/observations';
import {normalizeProviderSnapshotV3} from '../useV3Journal';
const now=Date.parse('2026-10-12T10:00:00+08:00');
const history={events:Array.from({length:54},(_,i)=>({id:String(i),resetType:'regular',announcedAt:new Date(now-(54-i)*DAY_MS).toISOString(),text:'official announcement'})),fetchedAt:new Date(now).toISOString(),upstream:{pagination:{has_more:false,next_cursor:null}}};
const snapshot=()=>({...demoSnapshot(),updatedAt:new Date(now).toISOString(),rateLimitSnapshot:null});
describe('v3运行接线语义',()=>{
 it('快照日志也按窗口时长归一化，调换字段不污染用量历史',()=>{
   const s={...snapshot(),accountKey:'test-account'};
   const normalized=normalizeProviderSnapshotV3(s);
   const swapped=normalizeProviderSnapshotV3({...s,weeklyWindow:s.shortWindow,shortWindow:s.weeklyWindow});
   expect(swapped?.weekly).toEqual(normalized?.weekly);expect(swapped?.short).toEqual(normalized?.short);
 });
 it('学到足够忙闲标签后仅改变今天的预测；未来保持全体分布',()=>{
   const s={...snapshot(),accountKey:'test-account'};
   const midnight=Date.parse('2026-10-12T00:00:00+08:00');
   const observations:UsageObservation[]=Array.from({length:14},(_,i)=>({id:String(i),accountKey:s.accountKey,fromAt:midnight-(14-i)*DAY_MS,toAt:midnight-(13-i)*DAY_MS,sourceVersion:'test',short:null,
     weekly:{generation:'g',previousGeneration:'g',nextGeneration:'g',knownConsumption:i<7?10:80,coverageMs:DAY_MS,crossedReset:false,isLowerBound:false,capacityConstrained:false}}));
   const personal={...emptyPersonalInputs(s.accountKey),planningMode:'learned' as const,reconciliation:reconcileCardCount([],0),effectiveWorkloadToday:'busy' as const,effectiveWeeklyBudgetPercent:null,reminders:[],accountCount:0,
     inputVersions:Array.from({length:7},(_,i)=>({version:i,changedAt:midnight-(14-i)*DAY_MS,field:'workloadToday' as const,before:null,after:{localDate:new Date(midnight-(14-i)*DAY_MS+8*3_600_000).toISOString().slice(0,10),level:'busy'}}))}satisfies PersonalInputsState;
   const vm=buildV3Dashboard(s,history,now,personal,observations,[],true);
   expect(vm.planningInput!.todayRange?.high).toBe(10);
   expect(vm.planningInput!.dailyRange?.high).toBe(80);
   expect(vm.planningInput!.dailySamples).toHaveLength(14);
 });
 it('54条带官方text保留53完整间隔，P与A分离且无个人需求仍有默认预算',()=>{const vm=buildV3Dashboard(snapshot(),history,now,undefined,[],[],true);expect(vm.platform.training.eventCount).toBe(54);expect(vm.platform.training.completedGapCount).toBe(53);expect(vm.platform.probability24h).toBeGreaterThan(0);expect(vm.supply?.accountProbability24h).toBeNull();expect(vm.recommendation.weeklyBudgetToday?.high).toBeGreaterThan(0);expect(vm.coldAdvice.expectedConsumption).toBeNull();expect(vm.coldAdvice.nextReviewAt).not.toBeNull();});
 it('窗口依时长识别，调换primary位置不交换资源单位',()=>{const s=snapshot();const swapped={...s,weeklyWindow:s.shortWindow,shortWindow:s.weeklyWindow};expect(normalizeAccount(swapped)?.weekly.durationMins).toBe(10080);expect(normalizeAccount(swapped)?.short.durationMins).toBe(300);});
 it('个人偏好和卡修改不改变P；未录入有效期不制造14天',()=>{const s=snapshot();const personal={...emptyPersonalInputs(null),reconciliation:reconcileCardCount([],3),effectiveWorkloadToday:null,effectiveWeeklyBudgetPercent:null,reminders:[],accountCount:3}satisfies PersonalInputsState;const a=buildV3Dashboard(s,history,now,personal,[],[],true);const b=buildV3Dashboard(s,history,now,{...personal,preference:'save-cards',version:1},[],[],true);expect(a.platform).toEqual(b.platform);expect(b.coldAdvice.cardId).toBeNull();expect(personal.reconciliation.placeholderCount).toBe(3);});
 it('没有完整分页证据概率不伪造0，显示不足null',()=>{const incomplete={...history,upstream:{pagination:{has_more:true,next_cursor:'next'}}};const vm=buildV3Dashboard(snapshot(),incomplete,now);expect(vm.platform.probability24h).toBeNull();});
 it('排期取消沿用同incident，watch新episode拥有新ID',()=>{const rows=[{signalKind:'scheduled_reset' as const,observedAt:'2026-10-12T00:00Z',firstSeenAt:'2026-10-12T00:00Z',change:'first_seen',value:{id:'s',scheduledFor:'2026-10-13T00:00Z'}},{signalKind:'scheduled_reset' as const,observedAt:'2026-10-12T01:00Z',firstSeenAt:'2026-10-12T00:00Z',change:'cancelled',value:null}];const normalized=normalizeSignalVersions(rows,'scheduled_reset');expect(normalized[1]!.id).toBe('s');expect(normalized[1]!.status).toBe('cancelled');const watches=rows.map((r,i)=>({...r,signalKind:'active_watch' as const,change:'first_seen',firstSeenAt:String(i),value:{reset_chance_percent:80}}));expect(normalizeSignalVersions(watches,'active_watch').map(r=>r.id)).toEqual(['active_watch:0','active_watch:1']);});
});
