import {describe,it,expect} from 'vitest';
import {DAY_MS,HOUR_MS} from '../beijing';
import {sprintPlan,type SprintInput} from '../v3/sprintPlan';
import type {ResetCard} from '../v3/cards';
const now=Date.parse('2026-10-15T14:00:00Z');
const card=(id:string,days=6):ResetCard=>({localId:id,label:id,enteredExpiry:null,entryPrecision:'datetime',timezone:'Asia/Shanghai',exactExpiryAt:now+days*DAY_MS,safeDeadlineAt:now+days*DAY_MS,source:'user',confirmedAt:now,reconciliation:'consistent',state:'available'});
const input=(remaining=80):SprintInput=>({now,weekly:{remaining,resetsAt:now+20*DAY_MS},cards:[card('one')],hoursPerDay:24,risk:{ratePerDay:.1,fetchedAt:now,scheduledAt:null}});
describe('risk-first activation windows',()=>{
 it('remaining quota changes preparation only, never activation date',()=>{
  const a=sprintPlan(input(10)).steps[0]!,b=sprintPlan(input(95)).steps[0]!;
  expect(a.useAt).toBe(b.useAt);expect(a.prepareFrom).not.toBe(b.prepareFrom);expect(a.reason).toBe('low_risk');
 });
 it('equal-risk windows select the midpoint of feasible activation interval',()=>{
  const step=sprintPlan(input()).steps[0]!;
  expect(step.useAt).toBe((now+step.latestAt)/2);
  expect(step.burnedOutAt).toBeLessThanOrEqual(step.windowEnd!);
  expect(step.probability).toBeCloseTo(1-Math.exp(-.1*30/24));
 });
 it('known imminent reset is avoided including the post-card consumption period',()=>{
  const i=input();i.risk!.scheduledAt=now+20*HOUR_MS;
  const step=sprintPlan(i).steps[0]!;
  expect(step.windowStart).toBe(now+32*HOUR_MS);expect(step.useAt).toBeGreaterThanOrEqual(step.windowStart!);
 });
 it('stale or missing history never creates a date',()=>{
  const i=input();i.risk!.fetchedAt=now-31*60_000;expect(sprintPlan(i).steps).toEqual([]);
  i.risk!.fetchedAt=now;i.risk!.ratePerDay=null;expect(sprintPlan(i).steps).toEqual([]);
 });
 it('high background risk is not called a safe window',()=>{
  const i=input();i.risk!.ratePerDay=1;expect(sprintPlan(i).steps).toEqual([]);
 });
 it('expiry and multi-card spacing are respected',()=>{
  const i=input();i.cards=[card('one',8),card('two',12)];const steps=sprintPlan(i).steps;
  expect(steps).toHaveLength(2);expect(steps[1]!.useAt).toBeGreaterThanOrEqual(steps[0]!.burnedOutAt);
  for(const s of steps)expect(s.useAt).toBeLessThanOrEqual(s.latestAt);
 });
 it('no room around a known reset does not force an activation',()=>{
  const i=input();i.cards=[card('urgent',.2)];i.risk!.scheduledAt=now+HOUR_MS;
  expect(sprintPlan(i).steps).toEqual([]);
 });
});
