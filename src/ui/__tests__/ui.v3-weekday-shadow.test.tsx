import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard, { type V3PanelProps } from '../V3Dashboard';
import { buildV3Dashboard } from '../v3Model';
import { demoSnapshot } from '../demoScenarios';
import { emptyPersonalInputs, reconcileCardCount } from '../../lib/v3/cards';
import { fitWeekdayModel, predictWeekday } from '../../lib/v3/weekday';
import { evaluateWeekdayJournal, type WeekdayCalibration } from '../../lib/v3/weekdayEvaluation';
import type { PersonalInputsController } from '../usePersonalInputs';

const now=Date.parse('2026-10-12T10:00:00+08:00');
const snapshot={...demoSnapshot(),updatedAt:new Date(now).toISOString()};
const baseVm=buildV3Dashboard(snapshot,{events:[],fetchedAt:snapshot.updatedAt},now,undefined,[],[],true);
const model=fitWeekdayModel({events:[],coverage:[],trainingCutoff:now});
const weekdayShadow={model,forecast:predictWeekday(model,now),differencePoints:1.25,status:'shadow' as const,reason:'配对观测中'};
const vm={...baseVm,weekdayShadow};
const controller:PersonalInputsController={state:{...emptyPersonalInputs(null),accountCount:3,reconciliation:reconcileCardCount([],3),reminders:[],effectiveWorkloadToday:null,effectiveWeeklyBudgetPercent:null},addCard:()=>{},updateExpiry:()=>{},recordUse:()=>{},markUnresolved:()=>{},confirmAbsent:()=>{},restoreAvailable:()=>{},setWorkloadToday:()=>{},setPreference:()=>{},setUsualViewTimes:()=>{},setWeeklyBudgetPercent:()=>{},recordFeedback:()=>{}};
const props:V3PanelProps={vm,controller,phase:'ready',readError:null,subscriptionError:false,refreshing:false,demo:true,activeTheme:'dark',onThemePreference:()=>{},onRefresh:()=>{},onCollapse:()=>{},onClose:()=>{}};
const calibration:WeekdayCalibration={...evaluateWeekdayJournal('',now),activationAt:now,matchedCount:24,positiveCount:5,weekCount:8,brierD60:0.14,brierWeekday:0.139,deltaBrier:0.001,logLossD60:0.4,logLossWeekday:0.39,pendingCount:2,unknownCount:1,missingPairCount:3,malformedCount:0,coverageInsufficientCount:4,temporaryCount:7,nextReviewAt:now+90*86_400_000,evidenceStatus:'collecting'};
function panel(override:Partial<V3PanelProps>={}){vi.stubGlobal('window',{location:{hash:'#expanded&tab=data'}});return renderToStaticMarkup(<Dashboard {...props} {...override}/>);}
afterEach(()=>vi.unstubAllGlobals());

describe('星期影子数据页',()=>{
  it('并列显示D60与影子预测、配对证据和预定评审，同时声明不影响用卡',()=>{
    const html=panel({weekdayCalibration:calibration});
    for(const text of ['星期影子 · 当前参考保持不变','D60 配对参考','当前选中','+1.25 个百分点','有效配对日','24','5 / 8','ΔBrier（D60−星期）','+0.0010','正在收集线上配对样本 · 未验证','启用后第 90 / 180 / 365 天','影子概率只用于配对观察；不改变用卡模拟或建议','转正都须人工审阅'])expect(html).toContain(text);
  });
  it('无评分数据时不把缺失样本伪装成零，并说明不可用原因',()=>{
    const html=panel({vm:{...vm,weekdayShadow:{...weekdayShadow,forecast:null,status:'unavailable',reason:'训练暴露不足'}}});
    expect(html).toContain('星期预测暂不可用：训练暴露不足');expect(html).toContain('有效配对日');expect(html).toContain('>—</dd>');
  });
});
