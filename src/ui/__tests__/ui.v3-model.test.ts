import {describe,expect,it} from 'vitest';
import {buildV3Dashboard,normalizeAccount} from '../v3Model';
import {demoSnapshot} from '../demoScenarios';
import {emptyPersonalInputs,reconcileCardCount} from '../../lib/v3/cards';
import {normalizeSignalVersions} from '../../lib/v3/inputs';
import {DAY_MS} from '../../lib/beijing';
import type {PersonalInputsState} from '../usePersonalInputs';
const now=Date.parse('2026-10-12T10:00:00+08:00');
const history={events:Array.from({length:54},(_,i)=>({id:String(i),resetType:'regular',announcedAt:new Date(now-(54-i)*DAY_MS).toISOString(),text:'official announcement'})),fetchedAt:new Date(now).toISOString(),upstream:{pagination:{has_more:false,next_cursor:null}}};
const snapshot=()=>({...demoSnapshot(),updatedAt:new Date(now).toISOString(),rateLimitSnapshot:null});
describe('v3运行接线语义',()=>{
 it('54条带官方text保留53完整间隔，正式目标是P而A未知',()=>{const vm=buildV3Dashboard(snapshot(),history,now);expect(vm.platform.training.eventCount).toBe(54);expect(vm.platform.training.completedGapCount).toBe(53);expect(vm.platform.probability24h).toBeGreaterThan(0);expect(vm.supply?.accountProbability24h).toBeNull();expect(vm.recommendation.weeklyBudgetToday).toBeNull();});
 it('窗口依时长识别，调换primary位置不交换资源单位',()=>{const s=snapshot();const swapped={...s,weeklyWindow:s.shortWindow,shortWindow:s.weeklyWindow};expect(normalizeAccount(swapped)?.weekly.durationMins).toBe(10080);expect(normalizeAccount(swapped)?.short.durationMins).toBe(300);});
 it('个人偏好和卡修改不改变P；未录入有效期不制造14天',()=>{const s=snapshot();const personal={...emptyPersonalInputs(null),reconciliation:reconcileCardCount([],3),effectiveWorkloadToday:null,effectiveWeeklyBudgetPercent:null,reminders:[],accountCount:3}satisfies PersonalInputsState;const a=buildV3Dashboard(s,history,now,personal);const b=buildV3Dashboard(s,history,now,{...personal,preference:'save-cards',version:1});expect(a.platform).toEqual(b.platform);expect(b.planning?.selected).toBeNull();expect(personal.reconciliation.placeholderCount).toBe(3);});
 it('没有完整分页证据概率不伪造0，显示不足null',()=>{const incomplete={...history,upstream:{pagination:{has_more:true,next_cursor:'next'}}};const vm=buildV3Dashboard(snapshot(),incomplete,now);expect(vm.platform.probability24h).toBeNull();});
 it('排期取消沿用同incident，watch新episode拥有新ID',()=>{const rows=[{signalKind:'scheduled_reset' as const,observedAt:'2026-10-12T00:00Z',firstSeenAt:'2026-10-12T00:00Z',change:'first_seen',value:{id:'s',scheduledFor:'2026-10-13T00:00Z'}},{signalKind:'scheduled_reset' as const,observedAt:'2026-10-12T01:00Z',firstSeenAt:'2026-10-12T00:00Z',change:'cancelled',value:null}];const normalized=normalizeSignalVersions(rows,'scheduled_reset');expect(normalized[1]!.id).toBe('s');expect(normalized[1]!.status).toBe('cancelled');const watches=rows.map((r,i)=>({...r,signalKind:'active_watch' as const,change:'first_seen',firstSeenAt:String(i),value:{reset_chance_percent:80}}));expect(normalizeSignalVersions(watches,'active_watch').map(r=>r.id)).toEqual(['active_watch:0','active_watch:1']);});
});
