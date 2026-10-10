# BOARD — 唯一调度中心（所有会话先读这里）

> 项目：reset-radar（看得见准头的 Codex 重置风险与用卡规划器）
> 初始化：2026-10-11 会话 S1011-init（perpetual-board v1）

## 🛑 STOP 区（用户专用）

<!-- 用户在本区单独一行写 STOP（可附原因）→ 整个循环停止；删掉该行即恢复。除用户外任何会话不得写本区。 -->

（当前：无 STOP —— 循环运行中）

## 循环阶段判定

**WORK**（有 🟠可领卡）→ **MERGE**（无 🟠 但有 🟡待合入）→ **REVIEW**（都无 → 生成验收
artifact 逐条审差距立卡）→ 回 WORK。规则细节见 RUNBOOK.md §4/§9。

**当前阶段：WORK（10 张 🟠待领；RR01 🟡待合入；RR03 🟠在飞）**

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

### [2026-10-11 01:16] RR03 | P0 | 🎣🟠在飞 | data采集 | 会话 S1011-0113
- 分支/commit：agent/RR03（worktree ../reset-radar_wt/RR03，自 main a0af473 分出）
- 已落：领卡开工——scripts/fetch-history.mjs 拉真实重置历史 + 清洗夹具（只采集不实装算法）
- →下轮：—

### [2026-10-11 00:57] RR01 | P0 | 🧱🟡待合入 | core+ui+data-layer | 会话 S1011-0043
- 分支/commit：agent/RR01 @ cd9f759（worktree ../reset-radar_wt/RR01 保留待 MERGE）
- 已落：Tauri2+React19+TS+Vite7+vitest5 骨架；identifier app.resetradar.desktop；src/lib+meta+smoke 4 测试；
  .gitignore 补 src-tauri/gen/。门禁：tsc✅ vitest 4/0✅ 变异红验✅（2 断言红→复原绿）cargo check✅(1m32s) build✅(958ms)
- →下轮：MERGE 会话 cherry-pick cd9f759 → 树恒等 → 主仓复跑门禁 → 拆 worktree；此后 RR02/RR03 可领，RR04+ 依赖本卡


## 建议领取顺序

1. RR01（脚手架——一切的地基，其余卡都依赖它）
2. RR03（挖数据——与 RR02 不同域，若 RR01 在飞可先领：脚本仅依赖 node，不依赖脚手架）
3. RR02（CI——纯 yaml，可与任何卡并行）
4. RR04 → RR05 → RR06 → RR07（core 域串行；RR07 依赖 RR03 的数据夹具）
5. RR08 → RR10（数据层串行）
6. RR09（UI，依赖 RR08）
7. RR11（发布打磨，依赖 RR09 截图）
8. RR12（循环锚——首批功能卡合入后执行首轮 REVIEW，之后永续滚动）
