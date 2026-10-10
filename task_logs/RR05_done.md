# RR05 done — planner（每日配速建议）

- 会话：S1011-0313（2026-10-11 03:16 领卡 → 03:19 交付）
- 分支/commit：agent/RR05 @ **b86ee9e**（基于 main 8b85206；patch 备份 task_logs/RR05.patch）
- diffstat：3 文件 +248 行（src/lib/planner.ts 93 / src/lib/__tests__/planner.core.test.ts 154 / index.ts +1 导出）

## 交付内容

`src/lib/planner.ts::planDailyUsage({remaining, daysToReset, risk, kneePercent?, isWeekend?, now?})`
→ `{suggested, cap, uniformPace, riskBoost, suggestedRemaining, factors[]}`。

- 三段式：suggested = min(剩余, 均匀配速 + p²前拉, 软上限 K(1+1.5r)×周末0.75)
- factors 对齐 D006（id/label/delta/note），恒三因子，**各 delta 之和 = suggested**
  （pace-uniform / risk-boost / soft-cap[-binding]）
- isWeekend 缺省由 beijingWeekday(now) 推导（复用 RR04，D004 北京零点唯一边界），可显式覆盖
- daysToReset 按 dq:153 trunc+clamp 0..7；risk 缺省 10、NaN 容错语义与 dq:150-153 一致

## 真值出处（证据铁律）

| 常量/公式 | 出处（codex-cockpit `src/lib/dynamicQuota.ts`，缩写 dq:NNN） |
|---|---|
| uniformPace = remaining/(daysLeft+1) | dq:154（planCalibratedRiskQuota） |
| boost = max(0, remaining-uniform)×risk² | dq:155 |
| softCap = K(1+1.5r)×(weekend?0.75:1) | dq:156；K 缺省 25=dq:7 |
| suggested = min(剩余, uniform+boost, softCap) | dq:157 |
| cap = min(剩余, softCap) | dq:163 |
| roundPercent/clamp/finiteOr 容错 | dq:137-142, 150-153 |
| golden 算例 100/61.79/25/7/weekend→36.1 | 参考仓 dynamicQuota.test.ts:31-44（dashboard 公开算例） |
| golden 算例 60/40/4/工作日→19.7 | 参考仓 dynamicQuota.test.ts:47-58 |
| 周末判定边界 | 本项目 D004 + RR04 beijingWeekday（参考实现用 04:00 记账日，B06 陷阱，本项目弃用） |

参考实现文件名已在 planner.ts 文件头与行内注释逐条注明（借鉴出处=quota-analysis/codex-cockpit）。

## 四绿证据（worktree ../reset-radar_wt/RR05，2026-10-11 03:17-03:18）

1. `npx tsc --noEmit` → **GREEN**（复原后终跑 03:18 亦 GREEN）
2. `npx vitest run src/lib/` → **33/33 passed**（本卡新增 planner.core.test.ts 15 条 + RR04 14 + meta 4）
3. `npx vitest run` 全量 → **33/33 passed，0 failed**（合入前基线 18 → 33，只升不降）
4. 变异红验两轮（三要素）：
   - 轮1：改 `SOFT_CAP_SLOPE 1.5→0`（dq:156 斜率）→ **5 条红**：dashboard golden×2（36.1/19.7 位位失配）、
     factors 求和、soft-cap-binding 标注、RR04 联动手算——红全部指向本卡软上限行为；复原后再绿
   - 轮2：改 `risk**2→risk`（dq:155 平方降一次）→ **6 条红**（上述 5 + risk NaN→boost 0.4 断言）；
     复原 → 域 33/33 + tsc + 全量 33/33 复绿

## 手算锚点（防回归漂移）

- golden：uniform 12.5 + boost 87.5×0.6179²=33.4075 → 45.91；softCap 25×1.92685×0.75=36.1284 → **36.1**（cap 同）
- 浮点注记（测试已固化）：25×1×0.75=18.75 精确 → round1 进位 18.8；25×1.15 浮点 28.7499… → 28.7

## 待用户清单

无（纯核心层新增，不涉发布资产/版本号）。

## 排障遗产

- worktree 首跑 `npx tsc` 会误装废弃包 `tsc@2.0.4`（node_modules 不随 worktree 复制）——worktree 先 `npm ci` 再门禁（B04 约 1 分钟）。

## →下轮

待 MERGE 槽合入；RR06（resetCard 移植）可随后领——同 core 域串行，本卡不动 risk.ts，
预期无路径冲突；planner 已从 src/lib/index.ts 导出，RR09 UI 可直接 import。
