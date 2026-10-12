import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard, { type V3PanelProps } from '../V3Dashboard';
import { buildV3Dashboard } from '../v3Model';
import { demoSnapshot } from '../demoScenarios';
import { emptyPersonalInputs, reconcileCardCount } from '../../lib/v3/cards';
import type { PersonalInputsController } from '../usePersonalInputs';

const now=Date.parse('2026-10-12T10:00:00+08:00');
const snapshot={...demoSnapshot(),updatedAt:new Date(now).toISOString()};
const vm=buildV3Dashboard(snapshot,{events:[],fetchedAt:snapshot.updatedAt},now,undefined,[],[],true);
const controller:PersonalInputsController={state:{...emptyPersonalInputs(null),accountCount:3,reconciliation:reconcileCardCount([],3),reminders:[],effectiveWorkloadToday:null,effectiveWeeklyBudgetPercent:null},addCard:()=>{},updateExpiry:()=>{},recordUse:()=>{},markUnresolved:()=>{},confirmAbsent:()=>{},restoreAvailable:()=>{},setWorkloadToday:()=>{},setPreference:()=>{},setUsualViewTimes:()=>{},setWeeklyBudgetPercent:()=>{},recordFeedback:()=>{}};
const props:V3PanelProps={vm,controller,phase:'ready',readError:null,subscriptionError:false,refreshing:false,demo:true,activeTheme:'dark',onThemePreference:()=>{},onRefresh:()=>{},onCollapse:()=>{},onClose:()=>{}};
function panel(override:Partial<V3PanelProps>={},tab='overview'){vi.stubGlobal('window',{location:{hash:`#expanded&tab=${tab}`}});return renderToStaticMarkup(<Dashboard {...props} {...override}/>);}
afterEach(()=>vi.unstubAllGlobals());

describe('RR51 冷启动与预览提示',()=>{
  it('不足七个完整需求日时提供两条醒目填写入口',()=>{
    const html=panel({vm:{...vm,demand:{...vm.demand,sampleDays:0}}});
    expect(html).toContain('还在学习你的用量');expect(html).toContain('填写今天用量');expect(html).toContain('补充卡台账');expect(html).toContain('马上得到条件建议');
  });
  it('预览明确双窗及周截止推算且提醒不会执行用卡',()=>{
    const html=panel({vm:{...vm,demand:{...vm.demand,sampleDays:0}}},'planner');
    expect(html).toContain('周窗预计回满');expect(html).toContain('短窗截止待刷新确认');expect(html).toContain('此预览不会执行用卡');
  });
  it('个人输入入口打开台账并滚动聚焦预算或卡标签',()=>{
    const source=readFileSync(join(__dirname,'..','PersonalInputs.tsx'),'utf8');
    expect(source).toContain('focusSection?: "budget" | "cards" | null');expect(source).toContain('detailsRef.current.open = true');
    expect(source).toContain('target?.scrollIntoView?.');expect(source).toContain('target?.focus()');
  });
  it('数据页区分当前模型、全期回放与在线 verdict，60 日只作回顾节点',()=>{
    const replayModel={count:25,positiveCount:4,brier:0.18,logLoss:0.61,predictedActualRatio:1.2,bins:[]};
    const enriched={...vm,platformReference:{...vm.platformReference,activeModel:'D60' as const,replay:{...vm.platformReference.replay,all:{p0:replayModel,p1:replayModel,d60:replayModel,r90:replayModel}}}};
    const html=panel({vm:enriched,verdictSummaries:[{modelVersion:'D60',sampleCount:0,positiveCount:0,unknownCount:0,pendingCount:0,brier:null,logLoss:null}]},'data');
    expect(html).toContain('当前参考模型');expect(html).toContain('D60');expect(html).toContain('历史回放 · 全期');expect(html).toContain('线上验证汇总');expect(html).toContain('60 日仅作回顾节点');expect(html).not.toContain('升级至少需要60个');
  });
});
