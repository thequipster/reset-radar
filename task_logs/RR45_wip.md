# RR45 wip — v2 UI 接线 + 删旧三模块 + 日耗观测日志 + §7.1/§7.3 日志

- 会话：S1012-1103（2026-10-12 11:06 领卡，续作至 11:54 时间盒到点收工交接）
- base：main 5555158（=737c959 v2 五模块 + 其后看板协调 commit）
- worktree：../reset-radar_wt/RR45（分支 agent/RR45，含 node_modules junction，拆前先 cmd //c rmdir）
- 已落 commit：**4bed01a**（lib 层切 v2）+ **8c2cc89**（D033 入档）+ **7da82fb**（UI 小组件切 v2）
- 接线口径六则见 docs/DECISIONS.md **D033**（本 worktree 已 commit，随卡合入）

## 本轮已完成（tsc 剩余错误只在 DashboardPanel/ExpandedCard/测试）

**lib 层全收敛（4bed01a）**：
1. 删旧三模块+测试：src/lib/{risk,planner,resetCard}.ts 与 __tests__/{risk,planner,resetCard}.core.test.ts
2. index.ts：导出 v2 五模块（beijing/resetState/riskV2/plannerV2/resetCardV2）
3. calibrationWindows.ts：beijingCalendarDateKey→beijingDayKey、RESET_RISK_HORIZON_MS→DAY_MS（beijing.ts 等价替换，实测同值）
4. history.ts：+historyEvents(ISO串→scope=global announced 事件流，lib 侧共用)
5. historyPrediction.ts：assessResetRiskV2 事件流口径（CLI 无快照，stateBefore 如实 null）
6. predictions.ts：§7.1 七字段（可选类型+buildPredictionRecord 无条件全填，D033⑤）；
   watchComparison 降为旧行遗留字段（解析保留、新行不产出）
7. watchCalibration.ts：WATCH_WEIGHT 本地常量 0.25，对账存量行
8. adapters.ts 全链重写：事件流(global 夹具+account latestReset 去重)→riskV2→paceV2/cardV2；
   VM risk/dailyPlan/cardPlan 类型切 v2 + 新顶字段 riskPercent（0-100 唯一换算点）；
   survivalAtFromCurve 插值；watch 恒 reference-only；卡过期安全上界；demand 恒 unknown

**UI 小组件（7da82fb，tsc 已过）**：orbMetric（riskPercent/todaySuggested 空态）、
copySummary（需求未知文案+CARD_DECISION_PHRASE 五值+incrementalUsage/recommendedAt）、
PeekCard（DECISION_SHORT 五值+三态文案）、CompactBar、Capsule 均切 v2。

## →下轮续作（按序）

### A. UI 组件改读 v2（tsc 剩余错误全在此；旧→新映射）

**已完成：orbMetric/copySummary/PeekCard/CompactBar/Capsule（7da82fb）——剩余两件：**

| 旧 | 新（v2） |
|---|---|
| vm.risk?.score | vm.riskPercent（round1 已算好，勿再×100） |
| vm.risk.factors（RiskFactor[].delta 0-100） | vm.risk.factorSteps（FactorStep[].delta 0-1，展示×100 留 1 位小数；id: baseline/weekday/age/watch） |
| vm.risk.watchComparison 存在性 | vm.risk.watchComparability!=="absent" 或 factorSteps 里有 id==="watch" |
| dailyPlan.suggested | dailyPlan.todaySuggested（**可 null=需求未知，UI 必须有可见文案**——卡面验证口径三降级态之一） |
| dailyPlan.factors（行） | dailyPlan.explanations（字符串数组，直接渲染） |
| suggestedRemaining/uniformPace/riskBoost/cap | 无 v2 对应：banner 改展示 demandQuality/expectedUnspentBeforeDeadline/dailyAllocations（B4.3 需求驱动） |
| cardPlan.decision 六值（no-credits/hold-until-depleted/hold-until-natural-reset/hold-until-scheduled-reset/use-today/wait-for-best-day） | 五值：not_applicable/hold/use_today/wait/uncertain |
| expectedGainTodayPercent/expectedGainBestPercent/bestDayLocalDate/outlook/daysUntilNaturalReset/credits/dailyNeedPercent/policyVersion/reasons/plannerDecisionSub | candidateResults[]（at/label/usage/incrementalUsage/unmetDemandDays/…）、incrementalUsage、recommendedAt、horizonSensitivity、explanations、assumptions、simulationError——DECISION_LABELS/DECISION_SHORT/outlookBars/plannerDecisionSub 整体重写 |
| prediction（usePredictionLog 幂等键 date/predictedRisk/factorsDigest） | **不变**——三键名未动，usePredictionLog/predictionLog.ts 零改动 |

组件消费点（Explore 全量清单，S1012-1103 实测；★=已完成）：
- ★orbMetric.ts:58/67、★copySummary.ts:17-22、★PeekCard.tsx:47/55/59/71/85-92、★CompactBar.tsx:43、★Capsule.tsx:19、App.tsx:360（prediction 透传不动）、demoScenarios.ts 不构造这四字段无需动
- **DashboardPanel.tsx（下一班首件，最重）**：7（import 类型）、69（decision==="no-credits"→not_applicable 语义重审）、353/355（score→riskPercent）、365-368（forcedReset48hPercent→survivalCurve 48h 点派生：survivalCurve 是 0-72h 每 6h，48h 点=cumulativeProbability）、375（factors→factorSteps，FactorRow 读 delta 0-1×100）、379（watchComparison→watchComparability!=="absent"）、432-486+673-698（DECISION_LABELS 六值/plannerDecisionSub/outlookBars/决策卡+展望段整体重写为 v2 五值+candidateResults+horizonSensitivity+explanations/assumptions）、565-608（dailyPlan banner：todaySuggested null=需求未知+demandQuality+expectedUnspentBeforeDeadline，删 uniformPace/riskBoost/cap/suggestedRemaining）
- ExpandedCard.tsx（遗留组件无人 import 但 tsc 覆盖）：101-195 同 DashboardPanel 口径最小改

### B. 测试重写（四件套+连带）
- ui.adapters.test.ts：import 全换 v2；L86-89 risk 同参断言→assessResetRiskV2(events)对账；L94-98 dailyPlan→planPaceV2；L101-115 cardPlan→planResetCardV2；L113 credits→state.cardsRemaining。**口径变化逐条注明**（如 watch 融合 delta=17.5 旧 golden → v2 reference-only delta=0）
- ui.reset-status.test.ts：27.5/tracker-watch delta=17.5 旧 golden 全部重算（v2 概率口径 0-1、watch 不融合）；planningResetAt→planningDeadline
- ui.copy-summary.test.ts / ui.orb-metric.test.ts（34-35 suggested→todaySuggested、44-47/70 risk 字面量构造→补 risk 必填结构或改传 riskPercent）/ ui.prediction-log.test.ts（predictedRisk===risk.score→riskPercent）/ ui.demo.test.ts 连带
- src/lib/__tests__/predictions.core+runtime.test.ts：digestFactors→digestFactorSteps、buildPredictionRecord 新签名（inputSnapshotId/stateBefore）、import ../risk→riskV2；**加「产出必含 §7.1 全字段」锁**（D033⑤ 等强度必填）
- scheduledReset.core.test.ts：import 旧三模块（L2-4）——看它用旧函数的断言改 v2 等价或删该断言（scheduledReset.ts 本体未动）
- watch.comparison.test.ts：import ../risk.ts→去；夹具 watchComparison 现为合法遗留字段
- calibration.auto/summary.test.ts、src/data/__tests__/predictionLog.io.test.ts：§7.1 字段已可选，应已恢复编译——跑 tsc 确认

### C. 卡面④⑤⑥（未动工）
- ④ 日耗观测日志：相邻快照 remaining% 差值按北京日聚合落 app_config_dir。建议沿 RR28 模式：纯函数 src/lib（DailyUsageSample[] 喂 estimateDemand），落盘薄壳 src-tauri 或前端经既有命令；完成后把 adapters 的 estimateDemand([], …) 换成真实样本源
- ⑤ §7.3 用卡建议日志：规格原文未落盘（D033 说明）——按 ResetCardDecisionV2 自然字段设计（decision/recommendedAt/incrementalUsage/horizonSensitivity/demandSensitivity/assumptions/explanations+§7.1 同款 id/cutoff 骨架）
- ⑥ docs/design/02-spec.md:166：「关闭按钮退出应用…此版本不假定存在托盘恢复入口」→ RR43 已实现托盘常驻+关窗仅收起+托盘菜单退出，段落改写对齐现状

### D. 门禁四绿
tsc rc0 → vitest 域（src/lib+src/ui+src/data）→ 全量 0 新增 failed → 变异红验 ≥3 处
（候选：adapters riskPercent 换算×10 故意改坏 / historyEvents scope global→account / predictions predictionId 拼接改坏 / watch targetMatches true 误置）
→ done+format-patch+BOARD🟡+BACKLOG+wip 删

## 门禁当前状态（本轮收工时，如实）
- tsc：src/lib 与 src/ui/adapters.ts 零错误；剩余错误=UI 组件 7 件+测试 8 件（A/B 清单）
- vitest 未跑（tsc 未绿不跑，避免噪声）——**主仓 main 未受影响，本 worktree 独立**
