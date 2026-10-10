# BOARD — 唯一调度中心（所有会话先读这里）

> 项目：reset-radar（看得见准头的 Codex 重置风险与用卡规划器）
> 初始化：2026-10-11 会话 S1011-init（perpetual-board v1）

## 🛑 STOP 区（用户专用）

<!-- 用户在本区单独一行写 STOP（可附原因）→ 整个循环停止；删掉该行即恢复。除用户外任何会话不得写本区。 -->

（当前：无 STOP —— 循环运行中）

## 循环阶段判定

**WORK**（有 🟠可领卡）→ **MERGE**（无 🟠 但有 🟡待合入）→ **REVIEW**（都无 → 生成验收
artifact 逐条审差距立卡）→ 回 WORK。规则细节见 RUNBOOK.md §4/§9。

**当前阶段：MERGE→WORK（RR01–RR06 已闭环🟢；RR07 🟡待合入；RR08–RR12 🟠可领）**
（下一班建议：占 MERGE 槽合入 RR07（core 域串行），合完回 WORK 领 RR08（data-layer 域，
Tauri command get_snapshots，与 core 无在飞冲突；RR08 是 RR09 UI 的数据前置））

## 槽位（占用 = 下方在飞条目）

- LIGHT：×1（单工位：定时任务每 45 分钟唤醒一个会话，一次一卡）
- MERGE：×1（主仓合入互斥，同一时刻只有一人写主仓代码）

## 当前状态（置顶条目区——新条目插在最上面，勿动他人条目）

<!-- 条目模板：
### [时间] <卡号> | <优先级> | <类型标记>🟠在飞 | <域> | 会话 <会话ID>
- 分支/commit：agent/<卡号> @ <sha>
- 已落：<本会话进展>
- →下轮：<续作指引>
-->

### [2026-10-11 04:17→04:27] RR07 | P0 | 🧱🟡待合入 | core | 会话 S1011-0413
- 分支/commit：agent/RR07 @ 13be6b1（基于 main 58ff13b；patch 备份 task_logs/RR07.patch，
  已验证对 main 干净适用）
- 已落：src/lib/calibration.ts（scorePredictions：Brier/命中率/基准率/分周/可靠性曲线 +
  joinPredictionsWithResets 北京日键对账）+ scripts/calibrate.mjs（REVIEW artifact 渲染壳，
  RUNBOOK §9.1 命令原样可用，node 原生 type-stripping 直载 .ts）+ 16 条域测试
  （Brier 三锚 0/0.25/1 + B06 反锚定对账 + 跨年周键）；接线：import 链 .ts 扩展 +
  tsconfig allowImportingTsExtensions + beijingCalendarDateKey 导出 + npm run calibrate（D016）
- 四绿：tsc✅ 域 65/65✅ 全量 65/65 0failed✅（基线 49→65 只升）变异红验两轮
  （Brier²→|·| 红6条 / 日键漏+8h 红2条）✅ 脚本两轮冒烟✅（骨架+真实夹具 10 计分日 3 重置日）
- →下轮：待 MERGE 槽合入；RR10 消费本卡行契约与 join；RR09 UI 可直接 import calibration；
  合入后 RR12 REVIEW 有校准报告 artifact 来源

### [2026-10-11 03:47→04:16] RR06 | P1 | 🧱🟢已闭环 | core | 会话 S1011-0343 交付 → S1011-0413 合入
- 合入：agent/RR06 @ 23a1d49 → main **58ff13b**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 49/49 0failed✅（基线 33→49 只升）
- 解锁：RR07（calibration）可领（core 域串行就绪）；resetCard/planRemainingQuota 已入
  index.ts 导出，RR09 UI 可直接消费

### [2026-10-11 03:47→03:51] RR06 交付记录（S1011-0343，已由上行合入闭环吸收）
- 分支/commit：agent/RR06 @ 23a1d49（基于 main 7864217；patch 备份 task_logs/RR06.patch）
- 已落：src/lib/resetCard.ts 整文件移植（rc:22-385 逐函数行号注明；适配三处记 D015：日键统一
  北京日历 D004 避 B06、配速依赖落 planner.ts、宽类型收窄）+ planner.ts 追加
  planRemainingQuota/DEFAULT_WEEKDAY_HAZARDS（dq:89-118/dq:6）+ 16 条域测试
  （13 条参考断言原样全绿 + 3 条新增自然重置日边界）
- 四绿：tsc✅ 域 49/49✅ 全量 49/49 0failed✅（基线 33→49 只升）变异红验两轮
  （survival 忽略 hazard 红3条 / refill 阈值 25→0 红1条）✅

### [2026-10-11 03:16→03:46] RR05 | P1 | 🧱🟢已闭环 | core | 会话 S1011-0313 交付 → S1011-0343 合入
- 合入：agent/RR05 @ b86ee9e → main **7864217**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 33/33 0failed✅（基线 18→33 只升）
- 解锁：RR06（resetCard 移植）可领；planner 已从 src/lib/index.ts 导出，RR09 UI 可直接消费

### [2026-10-11 03:16→03:19] RR05 交付记录（S1011-0313，已由上行合入闭环吸收）
- 分支/commit：agent/RR05 @ b86ee9e（基于 main 8b85206；patch 备份 task_logs/RR05.patch）
- 已落：src/lib/planner.ts planDailyUsage（三段式 min(剩余, 均匀+p²前拉, 软上限K(1+1.5r)×周末0.75)，
  公式出处 dq:149-165 逐行注明；factors 对齐 D006 且 delta 之和=suggested；isWeekend 复用
  beijingWeekday（D004））+ 15 条域测试（dashboard 双 golden 逐位吻合）
- 四绿：tsc✅ 域 33/33✅ 全量 33/33 0failed✅（基线 18→33 只升）变异红验两轮（1.5→0 红5条 /
  p²→p¹ 红6条）✅

### [2026-10-11 02:46→03:14] RR04 | P0 | 🧱🟢已闭环 | core | 会话 S1011-0243 交付 → S1011-0313 合入
- 合入：agent/RR04 @ f1810f9 → main **8b85206**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 18/18 0failed✅
- 解锁：RR05（planner）可消费 assessResetRisk/beijingWeekday（import 自 src/lib）

### [2026-10-11 02:46→02:51] RR04 交付记录（S1011-0243，已由上行合入闭环吸收）
- 已落：src/lib/risk.ts assessResetRisk（factors 对齐 D006；常量全部注明 rs 行号出处）+
  beijingWeekday 公共工具（D014）+ 14 条域测试（真实夹具 golden 24.5 手算逐位吻合；
  B07 星期分布锚点 Sun..Sat=9,4,10,12,8,7,9 反验 D004 边界）
- 四绿：tsc✅ 域 18/18✅ 全量 18/18 0failed✅ 变异红验两轮（70→10 红 4 条 / watch 权重→0 红 3 条）✅

### [2026-10-11 01:45→02:30] RR02 | P1 | 🧱🟢已闭环 | docs+发布 | 会话 S1011-0143 交付 → S1011-0213 合入
- 合入：agent/RR02 @ c451728 → main **0e0f5bc**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：check-ci 结构门禁绿✅；CI 真跑待用户 push 后首跑（无 runner 不声称"跑过"）
- 遗留：node:test 纳入 CI 留给 REVIEW 立卡（done 已记）

### [2026-10-11 01:16→02:30] RR03 | P0 | 🎣🟢已闭环 | data采集 | 会话 S1011-0113 交付 → S1011-0213 合入
- 合入：agent/RR03 @ cf4d0ab → main **93858e9**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：node --test 12/12✅；RR04 起可直接消费 data/resets-history.json 的 events[].announcedAt
- 集成注记：与 RR01 合并后 vitest 误载本卡 .test.mjs → fixup c78978c 修复（D013），node:test 与
  vitest 职责正交（scripts/** 已从 vitest exclude）

### [2026-10-11 00:57→02:30] RR01 | P0 | 🧱🟢已闭环 | core+ui+data-layer | 会话 S1011-0043 交付 → S1011-0213 合入
- 合入：agent/RR01 @ cd9f759 → main **838649b**（cherry-pick，树恒等✅，worktree/分支已拆；
  原🟡条目重复表头一并清理）
- 主仓复验：tsc✅ vitest 全量 4/4 0failed✅ cargo check✅(56.9s)——RR04+ 依赖本卡全部解锁


## 建议领取顺序

1. RR04 → RR05 → RR06 → RR07（core 域串行；RR07 依赖 RR03 的数据夹具——已合入可直接消费）
2. RR08 → RR10（数据层串行）
3. RR09（UI，依赖 RR08）
4. RR11（发布打磨，依赖 RR09 截图）
5. RR12（循环锚——首批功能卡合入后执行首轮 REVIEW，之后永续滚动）
