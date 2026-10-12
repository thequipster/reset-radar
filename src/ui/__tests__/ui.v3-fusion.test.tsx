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
  it('双窗保留各自彩色环和真实截止，预算未知显示学习而非数字',()=>{
    const html=panel();expect(html).toContain(styles.ringBlue);expect(html).toContain(styles.ringGreen);expect(html).toContain(styles.suggestionBanner);
    expect(html).toContain('正在学习你的用量');expect(html.match(/自然补给/g)).toHaveLength(2);expect(html).not.toContain('今日达到最优');
  });
  it('平台卡片保持P0参考与账号未知分离，不变成本人回满概率',()=>{
    const html=panel('risk');expect(html).toContain(styles.riskCard);expect(html).toContain('本人账号');expect(html).toContain('账号平台补给概率：—');expect(html).toContain('P0 · 参考概率');expect(html).toContain('尚未升级');
  });
  it('无数据仍有刷新入口与缺失说明',()=>{const html=panel('overview',{vm:null});expect(html).toContain('缺失数据不会填成满额');expect(html).toContain('刷新额度');});
  it('用卡页保留工作量、偏好、台账和建议依据',()=>{const html=panel('planner');for(const text of ['今天大概忙不忙','今天你更在意什么','卡片台账','建议方案与计算依据'])expect(html).toContain(text);});
  it('旧胶囊有独立拖动把手、展开按钮与短窗余额',()=>{
    const html=renderToStaticMarkup(<V3CompactBar vm={vm} demo onExpand={()=>{}}/>);expect(html).toContain(compact.shell);expect(html).toContain('data-tauri-drag-region');expect(html).toContain('短窗');expect(html).toContain('展开完整面板');expect(html).not.toContain('风险');
  });
  it('胶囊0卡与未知卡不混淆，过期状态可被读屏',()=>{
    const zero=renderToStaticMarkup(<V3CompactBar vm={{...vm,resetCredits:0,status:'stale'}} demo={false} onExpand={()=>{}}/>);
    expect(zero).toContain('卡 ×0');expect(zero).toContain('数据过期');
    const unknown=renderToStaticMarkup(<V3CompactBar vm={{...vm,resetCredits:null}} demo={false} onExpand={()=>{}}/>);expect(unknown).toContain('卡 —');expect(unknown).not.toContain('卡 ×0');
  });
  it('预览沿用气泡分行并标出旧观测，而不是实时语气',()=>{
    const html=renderToStaticMarkup(<V3Peek vm={{...vm,status:'stale'}} demo onOpen={()=>{}}/>);expect(html).toContain('今日周预算');expect(html).toContain('上次观测');expect(html).toContain('数据过期');expect(html).toContain('查看完整规划');
  });
});
