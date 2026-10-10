# RR06 done — resetCard 重置卡规划器（移植）

- 会话：S1011-0343（2026-10-11 03:47 领卡 → 03:51 交付；本班先完成 MERGE RR05→main 7864217）
- 分支/commit：agent/RR06 @ **23a1d49**（基于 main 7864217；patch 备份 task_logs/RR06.patch）
- diffstat：4 文件 +690 行（src/lib/resetCard.ts 373 新增 / src/lib/__tests__/resetCard.core.test.ts 261 新增 /
  src/lib/planner.ts +55 / src/lib/index.ts +1 导出）
- 协议瑕疵自记：领卡时漏写 RR06_wip.md（会话内一气呵成未中断），活性以心跳行 03:47 领卡行为准。

## 交付内容

1. `src/lib/resetCard.ts`：整文件移植参考实现（rc:NNN 逐函数行号注明）——
   `planResetCard`（重置卡决策：no-credits/hold-until-depleted/hold-until-natural-reset/use-today/wait-for-best-day
   + outlook 逐日期望收益）、`estimateDailyNeedPercent`（近期日消耗均值）、`planResetCardPacing`
   （卡模式配速）、`forcedResetBeforeDayPercent`、四个 RESET_CARD_* 策略常量（版本 reset-card-p010-v1）。
2. `src/lib/planner.ts` 追加两件同源依赖（§1.4 单一实现源，不复制第二份）：
   `DEFAULT_WEEKDAY_HAZARDS`（dq:6）、`planRemainingQuota` + `quotaConsumptionUrgency`（dq:89-118，
   剩余额度净值口径三段式；参考实现的 sharedAccount 分支本项目无此概念不移植）。
3. 测试 16 条 = 参考仓 13 条断言原样移植 + 本项目新增 3 条边界（见下）。
4. `src/lib/index.ts` 导出 resetCard（UI/RR09 可直接 import）。

## 真值出处（证据铁律）

| 内容 | 出处 |
|---|---|
| resetCard.ts 全部函数/常量/公式 | codex-cockpit `src/lib/resetCard.ts` rc:22-385（MIT，TRUTH §1 来源 3），文件头注明 |
| DEFAULT_WEEKDAY_HAZARDS = [.1,.7,.1,.1,.1,.7,.1] | 同仓 `dynamicQuota.ts` dq:6 |
| planRemainingQuota / quotaConsumptionUrgency | 同仓 `dynamicQuota.ts` dq:89-118 |
| 13 条移植测试（断言原样） | 同仓 `src/lib/resetCard.test.ts`（测试名内逐条注明行号） |
| 北京日历键（rc:112）与 D004 一致性 | 本项目 D004；参考实现 resetCard 本就是纯北京零点键，复核确认 |

本项目适配三处（= docs/DECISIONS.md **D015**）：
① estimateDailyNeedPercent 的 cutoff/today 过滤键：参考实现 usageDateKey（04:00 记账日，
**B06 双日边界陷阱**）→ 本项目 beijingCalendarDateKey（D004 唯一零点边界）；该函数入参契约
DailyNeedSample.localDate = 北京日历键。
② planRemainingQuota/DEFAULT_WEEKDAY_HAZARDS 落位 planner.ts 供跨卡复用，resetCard import 消费。
③ 参考实现头部 import 的 ResetForecast 未使用，不移植；CodexDailyUsage/DailyUsageSummary 宽类型
收窄为 DailyNeedSample。卡面「决策文案留核心层外」：参考实现本就返回 decision 枚举 +
reasons 机器键，零文案，合规无需改动。

## 四绿证据（worktree ../reset-radar_wt/RR06，2026-10-11 03:49-03:51）

1. `npx tsc --noEmit` → **GREEN**（复原后终跑 03:51 亦 GREEN）
2. `npx vitest run src/lib/` → **49/49 passed**（本卡新增 16 + RR05 15 + RR04 14 + meta 4；
   13 条移植测试一次全绿 = 逐函数等价移植的强证据）
3. `npx vitest run` 全量 → **49/49 passed，0 failed**（合入前基线 33 → 49，只升不降）
4. 变异红验两轮（三要素）：
   - 轮1：改 `survivalFraction` 忽略 dayHazard（`1-h` → `1`，风险存活模型失效）→ **3 条红**：
     「周六重置波前夜不烧卡」（决策/24h 断言）、「校准的 24h 预报替换第一天先验」
     （stormy.forcedReset24hPercent > calm 失败）、「forcedResetBeforeDayPercent 随视野增长」
     （twoDays > 0 失败）——红全部指向本卡风险存活/定价行为；复原 → 绿。
   - 轮2：改 `RESET_CARD_MIN_USEFUL_REFILL_PERCENT 25→0`（持卡门槛失效）→ **1 条红**：
     「额度尚多时持卡」decision 不再 hold-until-depleted——正中本卡门槛常量行为；
     复原 → 域 16/16 + tsc + 全量 49/49 复绿。

## 新增边界用例（卡面验证口径：跨自然重置日）

- resetsAt 已到/已过 → null（rc:246 后半分支）
- 自然重置当日自身不进候选：周三正午 + 重置在 1.5 天后（周五零点）→ outlook 恰为 [周三, 周四]，
  bestDayLocalDate ≠ 重置日
- D004 北京零点切日：重置前 12h 的 23:30 归今天键 / 00:30 归明天键（B06 反例锚定）

## 待用户清单

无（纯核心层新增，不涉发布资产/版本号/删除功能）。

## 排障遗产

- 同 B04：worktree 首跑需 `npm ci`（约 40s），node_modules 不随 worktree 复制。

## →下轮

待 MERGE 槽合入；RR07（calibration，core 域）随后领——本卡动了 planner.ts（追加导出，无改动
既有行），RR07 新文件 calibration.ts + scripts/calibrate.mjs，预期冲突面极小但同域仍按串行顺序。
