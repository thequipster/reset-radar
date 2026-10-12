import {describe,expect,it} from 'vitest';
import {DAY_MS} from '../v3/platform';
import {fitTrendModel,eventWeight,weightedExposure,rateProbability,replayTrend,selectTrendReference} from '../v3/trend';
const t=Date.parse('2026-10-12T09:00:00+08:00');
const event=(day:number,type='regular',id=String(day))=>({id,resetType:type,announcedAt:t-day*DAY_MS});
const coverage=[{from:t-240*DAY_MS,to:t,complete:true as const}];
const fit=(events:ReturnType<typeof event>[],cov=coverage)=>fitTrendModel({events,coverage:cov,trainingCutoff:t});
describe('v3.1 日历衰减与回放',()=>{
 it('半衰期60/120天权重为0.5/0.25',()=>{expect(eventWeight(t,t-60*DAY_MS)).toBeCloseTo(.5,14);expect(eventWeight(t,t-120*DAY_MS)).toBeCloseTo(.25,14);});
 it('相同覆盖相同总数，近期事件密集者有更高率；分母必须精确加权',()=>{
   const a=fit([event(210),event(200),event(190)]),b=fit([event(20),event(10),event(1)]);expect(b.ratePerDay).toBeGreaterThan(a.ratePerDay!);
   const ew=weightedExposure(t,coverage[0].from,t);expect(b.weightedExposureDays).toBeCloseTo(ew,12);expect(b.ratePerDay).toBeCloseTo((b.weightedCount+7*3/240)/(ew+7),12);
 });
 it('可靠无事件尾段下降，空档不当作同等无事件证据',()=>{
  const old={events:[event(100),event(3)],coverage,trainingCutoff:t},baseline=fitTrendModel(old);
  const later=fitTrendModel({...old,trainingCutoff:t+30*DAY_MS,coverage:[{...coverage[0],to:t+30*DAY_MS}]}),gap=fitTrendModel({...old,trainingCutoff:t+30*DAY_MS});
  expect(later.ratePerDay).toBeLessThan(baseline.ratePerDay!);expect(later.ratePerDay).toBeLessThan(gap.ratePerDay!);
 });
 it('未来事件、banked、个人用卡不改变旧预测',()=>{
  const a=fit([event(100),event(1)]),b=fit([event(100),event(1),event(-1),event(0,'banked'),event(0,'card_use')]);expect(b).toEqual(a);
 });
 it('历史缺可知时刻使用显式理想化回放；在线不能提前看到本机抓取的版本',()=>{
   const events=[event(230),event(100),event(10)].map(e=>({...e,versionSeenAt:t+DAY_MS}));
   expect(fitTrendModel({events,coverage,trainingCutoff:t}).eventCount).toBe(0);
   const replay=replayTrend({events,coverage,trainingCutoff:t});expect(replay.idealized).toBe(true);expect(replay.rows.length).toBeGreaterThan(0);
 });
 it('未知起点事件条件化排除；独立更早覆盖可计入它',()=>{
  const events=[event(240),event(1)];expect(fit(events).eventCount).toBe(1);expect(fit(events,[{...coverage[0],from:t-241*DAY_MS}]).eventCount).toBe(2);
 });
 it('重复ID/关系去重、重叠覆盖合并、无覆盖null',()=>{
  const a=fit([event(100),event(1)]),b=fit([event(100),event(1),event(1)], [...coverage,{...coverage[0]}]);expect(b).toEqual(a);expect(fit([event(1)],[]).probability24h).toBeNull();
 });
 it('0.226次每天通过泊松换算，预测率冻结而不自行衰减',()=>{expect(rateProbability(.226,DAY_MS)).toBeCloseTo(1-Math.exp(-.226),14);expect(rateProbability(.226,DAY_MS)).not.toBe(.226);expect(rateProbability(.226,2*DAY_MS)).toBeCloseTo(1-Math.exp(-.452),14);});
 it('四模型同日期回放至少60覆盖日，并可reference_active+historical_replay，不等60在线日',()=>{
  const input={events:Array.from({length:45},(_,i)=>event(239-i*5)),coverage,trainingCutoff:t},replay=replayTrend(input);
  expect(replay.rows.length).toBeGreaterThan(30);expect(replay.rows.every(r=>new Date(r.issuedAt+8*3_600_000).getUTCHours()===9)).toBe(true);
  expect(replay.all.p0.count).toBe(replay.all.d60.count);expect(replay.all.r90.count).toBe(replay.all.d60.count);
  const permissive={...replay,recent90:{...replay.recent90,d60:{...replay.recent90.d60,brier:replay.recent90.p0.brier}}};
  const selected=selectTrendReference(fitTrendModel(input),permissive);expect(selected.activeModel).toBe('D60');expect(selected.evidence).toBe('historical_replay');expect(selected.deployment).toBe('reference_active');
  expect(selectTrendReference(fitTrendModel(input),{...permissive,recent90:{...permissive.recent90,d60:{...permissive.recent90.d60,brier:(permissive.recent90.p0.brier??0)+.011}}}).activeModel).toBe('P0');
 });
});
