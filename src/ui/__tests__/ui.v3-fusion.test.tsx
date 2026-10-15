import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Dashboard, { V3CompactBar, V3Peek, type V3PanelProps } from '../V3Dashboard';
import { buildV3Dashboard } from '../v3Model';
import { demoSnapshot } from '../demoScenarios';
import { emptyPersonalInputs, reconcileCardCount } from '../../lib/v3/cards';
import type { PersonalInputsController } from '../usePersonalInputs';
import styles from '../DashboardPanel.module.css';
import compact from '../CompactBar.module.css';
const now=Date.parse('2026-10-12T10:00:00+08:00');
const snapshot={...demoSnapshot(),updatedAt:new Date(now).toISOString()};
const vm=buildV3Dashboard(snapshot, {events:[],fetchedAt:snapshot.updatedAt},now,undefined,[],[],true);
const controller:PersonalInputsController={state:{...emptyPersonalInputs(null),accountCount:3,reconciliation:reconcileCardCount([],3),reminders:[],effectiveWorkloadToday:null,effectiveWeeklyBudgetPercent:null},addCard:()=>{},updateExpiry:()=>{},recordUse:()=>{},markUnresolved:()=>{},confirmAbsent:()=>{},restoreAvailable:()=>{},setWorkloadToday:()=>{},setPreference:()=>{},setUsualViewTimes:()=>{},setWeeklyBudgetPercent:()=>{},recordFeedback:()=>{}};
const props:V3PanelProps={vm,controller,phase:'ready',readError:null,subscriptionError:false,refreshing:false,demo:true,activeTheme:'dark',onThemePreference:()=>{},onRefresh:()=>{},onCollapse:()=>{},onClose:()=>{}};
function panel(tab='overview',override:Partial<V3PanelProps>={}){vi.stubGlobal('window',{location:{hash:`#expanded&tab=${tab}`}});return renderToStaticMarkup(<Dashboard {...props} {...override}/>);}
afterEach(()=>vi.unstubAllGlobals());
describe('原设计与v3融合',()=>{
  it('双窗保留各自彩色环和真实截止，v3.1零样本默认分配与日耗学习分开',()=>{
    const html=panel();expect(html).toContain(styles.ringBlue);expect(html).toContain(styles.ringGreen);expect(html).toContain(styles.suggestionBanner);
    expect(vm.coldAdvice.expectedConsumption).toBeNull();expect(vm.coldAdvice.allocatedWeeklyPointsToday).not.toBeNull();expect(html.match(/自动恢复/g)!.length).toBeGreaterThanOrEqual(2);expect(html).not.toContain('今日达到最优');
    // RR56 人话版：三句话 + 7 天条 + 就地选“今天忙不忙”。
    expect(html).toContain('今天最多用约');expect(html).toContain('今天忙不忙');expect(html).toContain('aria-pressed');expect(html).toContain('专业细节（模型原话）');
  });
  it('平台卡片保持P0参考与账号未知分离，不变成本人回满概率',()=>{
    const html=panel('risk');expect(html).toContain(styles.riskCard);expect(html).toContain('本人账号');expect(html).toContain('账号平台补给概率：—');expect(html).toContain('P0 · 当前概率参考');expect(html).toContain('尚未升级');
  });
  it('无数据仍有刷新入口与缺失说明',()=>{const html=panel('overview',{vm:null});expect(html).toContain('缺失数据不会填成满额');expect(html).toContain('刷新额度');});
  it('用卡页保留工作量、偏好、台账和建议依据（RR56 人话文案）',()=>{const html=panel('planner');for(const text of ['今天忙不忙','今天你更在意什么','我的卡（到期时间）','专业细节（规划比较）','用卡之后会怎样'])expect(html).toContain(text);});
  it('旧胶囊有独立拖动把手、展开按钮与短窗余额',()=>{
    const html=renderToStaticMarkup(<V3CompactBar vm={vm} demo onExpand={()=>{}}/>);expect(html).toContain(compact.shell);expect(html).toContain('data-tauri-drag-region');expect(html).toContain('短窗');expect(html).toContain('展开完整面板');expect(html).not.toContain('风险');
  });
  it('胶囊0卡与未知卡不混淆，过期状态可被读屏',()=>{
    const zero=renderToStaticMarkup(<V3CompactBar vm={{...vm,resetCredits:0,status:'stale'}} demo={false} onExpand={()=>{}}/>);
    expect(zero).toContain('卡 ×0');expect(zero).toContain('数据过期');
    const unknown=renderToStaticMarkup(<V3CompactBar vm={{...vm,resetCredits:null}} demo={false} onExpand={()=>{}}/>);expect(unknown).toContain('卡 —');expect(unknown).not.toContain('卡 ×0');
  });
  it('预览沿用气泡分行并标出旧观测，而不是实时语气',()=>{
    const html=renderToStaticMarkup(<V3Peek vm={{...vm,status:'stale'}} demo onOpen={()=>{}}/>);expect(html).toContain('今天最多用');expect(html).toContain('上次读取');expect(html).toContain('数据过期');expect(html).toContain('看今天怎么用');
  });
  it('工作台首屏优先展示用卡决策，导航与刷新入口仍完整',()=>{
    const html=panel();
    expect(html).toContain('把额度用在，恰好的时候。');
    expect(html).toContain('先选用卡窗口，再安排用量');
    expect(html).toContain('立即更新公告并重算');
    expect(html).toContain('查看额度分配依据');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain('没有事件标记，不代表这一天安全');
  });
  it('概率雷达只展示真实参考数值，不生成安全等级',()=>{
    const html=panel('overview',{vm:{...vm,platform:{...vm.platform,probability24h:.123}}});
    expect(html).toContain('12.3%');
    expect(html).toContain('未来 24 小时公告参考');
    expect(html).toContain('公告概率不等于本账号回满概率');
    expect(html).not.toContain('放心使用');
  });
});
