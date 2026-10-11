# BOARD — 唯一调度中心（所有会话先读这里）

> 项目：reset-radar（看得见准头的 Codex 重置风险与用卡规划器）
> 初始化：2026-10-11 会话 S1011-init（perpetual-board v1）

## 🛑 STOP 区（用户专用）

<!-- 用户在本区单独一行写 STOP（可附原因）→ 整个循环停止；删掉该行即恢复。除用户外任何会话不得写本区。 -->

（当前：无 STOP —— 循环运行中）

## 循环阶段判定

**WORK**（有 🟠可领卡）→ **MERGE**（无 🟠 但有 🟡待合入）→ **REVIEW**（都无 → 生成验收
artifact 逐条审差距立卡）→ 回 WORK。规则细节见 RUNBOOK.md §4/§9。

**当前阶段：WORK（RR13–RR19 🟠可领 ×7；另有 RR12 首轮 artifact 批 🟡待合入）**
（下一班建议：优先领 RR13（胶囊溢出小修，ui 域快赢）；建议顺序 RR13→RR14→RR15→RR18→
RR19→RR16→RR17（RR13/RR14 同域串行，RR17 依赖 RR15）。若先开 MERGE 槽：合 agent/RR12
@ f15baad（单 commit，5 文件纯新增 docs/task_logs，无冲突可能；patch=task_logs/RR12.patch；
**RR12 worktree 无 junction 可直接 remove**）。取材详单：docs/review-20261011.md）

## 槽位（占用 = 下方在飞条目）

- LIGHT：×1（单工位：定时任务每 45 分钟唤醒一个会话，一次一卡）
- MERGE：×1（主仓合入互斥，同一时刻只有一人写主仓代码）

## 当前状态（置顶条目区——新条目插在最上面，勿动他人条目）

### [2026-10-11 08:46→09:06] RR12 首轮 artifact 批 | P0 | 🔁🟡待合入 | docs（REVIEW 产物） | 会话 S1011-0843
- 分支/commit：agent/RR12 @ **f15baad**（单 commit；基于 main ae642c0；patch 备份
  task_logs/RR12.patch）；**锚卡本体已转回🟠待领（永不🟢），此条目只跟踪本轮 artifact 批合入**
- 已落：docs/review-20261011.md（差距 10 条零悬空定夺：立卡 RR13–RR19 共 7 张 +
  3 条不立卡附理由）+ docs/calibration-latest.md（n=0 可计分日=冷启动）+ RR12_artifacts/
  三件（vitest 86/86 / vite build / cargo check）+ ROADMAP v0.2 行尾标注
- 门禁：代码与 main 恒等（零代码改动），tsc✅ 全量 86/86 0failed✅ 即等价口径；变异红验
  不适用（无代码可变异，理由见 done）；事故已修（junction 递归删损 node_modules→npm ci
  复原，TRUTH B09〔补记〕登记）
- →下轮：MERGE 合入后拆 worktree（无 junction 可直接 remove）；REVIEW 第 2 轮触发=无🟠无🟡，
  前置=先跑 fetch-history 刷新夹具（RR18 ②）

### [2026-10-11 08:20→08:44] RR11 | P1 | 🧱🟢已闭环 | docs+发布 | 会话 S1011-0813 交付 → S1011-0843 合入
- 合入：agent/RR11 @ f5ce969（单 commit）→ main **ae642c0**（cherry-pick，树恒等✅ 涉及
  4 路径 diff 0 字节；worktree/分支已拆——junction 先拆 cmd rmdir，残留已清）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅ check-release✅（版本同步 0.1.0+README 链接 12 条）
- 分支/commit：agent/RR11 @ **f5ce969**（单 commit；基于 main 9b81f38；patch 备份
  task_logs/RR11.patch 对 main 干净适用✅）
- 已落：README 重写（胶囊态真实截图上墙+功能清单勾选 7/8+校准闭环用法+发布三步+致谢精确
  到 v0.3.0-beta.5；"keyring"措辞修准为 codex CLI 鉴权）+ release.yml（tag v* 触发，10 步，
  gh release create 挂 nsis/msi/SHA256SUMS，permissions 仅此 wf 写）+ check-release.mjs
  （版本同步+README 链接 12 条+tag 守卫）+ check-release-wf.py（结构门禁）
- 门禁（等价口径沿 RR02/D011）：tsc✅ 全量 86/86 0failed✅ check-release/check-release-wf/
  check-ci 回归/actionlint 1.7.12 零告警/PyYAML 全绿✅ 变异红验两轮✅（链接条件反转红12/
  触发器比较符反转红1）+ tag 守卫咬合证（v9.9.9 红/v0.1.0 绿）
- 版本定档 0.1.0 两处已一致（核验后不动值）；LICENSE/TRUTH 致谢完整性检查结论：无需改动
- 解锁：RR12 首轮 REVIEW（首批 11 卡全闭环，发布三步就绪待用户执行）

### [2026-10-11 07:56→08:00] RR10 | P1 | 🧱🟢已闭环 | core+data-layer | 会话 S1011-0743 交付 → S1011-0813 合入
- 合入：agent/RR10 @ d35bc8b（2 commits c78e462+d35bc8b）→ main **8ec7d6b**
  （cherry-pick，树恒等✅ 涉及 7 路径 diff 0 字节；worktree/分支已拆——junction 先拆
  cmd rmdir 一步干净，主仓 node_modules 完好）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅（基线 73→86 只升；Rust 门不适用——本卡
  未动 src-tauri/）
- 分支/commit：agent/RR10 @ **d35bc8b**（2 commits；基于 main 0bbd62c；patch 备份
  task_logs/RR10.patch 对 main 干净适用✅）
- 已落：src/lib/predictions.ts 幂等追加单一源（同日首评必落/漂移>0.5 补行/否则抑制/
  坏行保留）+ scripts/log-prediction.mjs 落盘器薄壳（calibrate.mjs 点名期待）+
  data/predictions.jsonl 首行（落盘器生成，24.5=RR04 golden 同源交叉验证）+ D019 决策
- 四绿：tsc✅ 域 13/13✅ 全量 86/86 0failed✅（基线 73→86 只升）变异红验两轮✅
  （阈值比较符>=红1 / 日键换源UTC红1）+ 落盘器冒烟两跑幂等实证✅（第2跑 suppressed）
- 设计裁决 D019：阈值 0.5=score 一位小数显示精度下界；app 内落盘不接（%APPDATA% 与
  校准读取断链，留 REVIEW）
- 遗留（REVIEW 取材）：app 内自动落盘路径汇流（D019③）+ RR09 两遗留（展开态截图/
  胶囊溢出立修卡）

### [2026-10-11 07:21→07:55] RR09 | P1 | 🧱🟢已闭环 | ui | 会话 S1011-0713 交付 → S1011-0743 合入
- 合入：agent/RR09 @ 12d8380（单 commit）→ main **0bbd62c**（cherry-pick，树恒等✅；
  worktree/分支已拆——junction 先拆，RR09 空壳目录被句柄占用暂留磁盘，git 状态已清）
- 主仓复验：tsc✅ vitest 全量 73/73 0failed✅（基线 65→73 只升）cargo check --tests 1.27s✅
- 交付详情：task_logs/RR09_done.md（src/ui/ 六件+App 两态+窗高 560；数字全部来自
  src/lib；胶囊态截图真实数据 29% 端到端）
- 遗留（REVIEW 取材）：①展开态截图（done 有两条路径）②胶囊溢出 420px 立修卡
- 解锁：RR10 可领（data-layer 预测落盘）；RR11 待展开态截图

### [2026-10-11 07:21→08:05] RR09 交付记录（S1011-0713，已由上行合入闭环吸收）
- 分支/commit：agent/RR09 @ **12d8380**（单 commit；基于 main 42d443c；patch 备份
  task_logs/RR09.patch 对 main 干净适用）
- 已落：src/ui/ 六件（types 契约/adapters 纯映射/useSnapshots 事件接线+浏览器降级 D018/
  history 夹具只读/Capsule/ExpandedCard）+ App 两态切换 + tauri.conf.json 窗高 560（D018）；
  数字全部来自 src/lib（§2/D006）
- 四绿：tsc✅ 域 8/8✅ 全量 73/73 0failed✅（基线 65→73 只升）变异红验两轮✅
  （主数字换源红5 / daysToReset 注入+8h 红1）+ cargo check --tests 1m02s✅（复验）
- 运行证据：release app（custom-protocol）实跑 + PrintWindow 截图 **胶囊态真实数据 ✅**
  （29%=RR08 冒烟实测值，端到端通）；⚠️ `tauri dev` 本机 cdylib 链接死路（TRUTH B09）
  → 卡面口径以 release 等效替代；**展开态截图未取得**（agent 会话无前台权，输入注入
  不可达，B09）→ 下轮补
- →下轮：①展开态截图（computer-use SDK 注入或 App 支持 hash 状态入口）②胶囊溢出 420px
  立修卡素材 ③MERGE 拆 worktree 前先拆 node_modules junction（done 有指引）

### [2026-10-11 04:47→07:16] RR08 | P1 | 🧱🟢已闭环 | data-layer | 会话 S1011-0443 交付 → S1011-0643 接管续作 → S1011-0713 合入
- 合入：agent/RR08 @ a1f802a（2 commits）→ main **42d443c**（cherry-pick，树恒等✅，
  worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 65/65 0failed✅ cargo check --tests 12.9s✅
- 交付详情：task_logs/RR08_done.md（codex.rs app-server 握手+解析/snapshots.rs 原子写+SWR/
  models/lib get_snapshots/build.rs B08 正规化 D017；真实握手落盘冒烟 plan=PLUS/周窗29%/credits3）
- 解锁：RR09（UI）数据前置 get_snapshots+background-snapshots-updated 就绪；RR10 同域解锁

<!-- 条目模板：
### [时间] <卡号> | <优先级> | <类型标记>🟠在飞 | <域> | 会话 <会话ID>
- 分支/commit：agent/<卡号> @ <sha>
- 已落：<本会话进展>
- →下轮：<续作指引>
-->

### [2026-10-11 04:17→04:44] RR07 | P0 | 🧱🟢已闭环 | core | 会话 S1011-0413 交付 → S1011-0443 合入
- 合入：agent/RR07 @ 13be6b1 → main **dddc641**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 65/65 0failed✅（基线 49→65 只升）
- 解锁：core 域首批（risk/planner/resetCard/calibration）全闭环；calibration 已入 index.ts 导出，
  RR09 UI 可直接 import；npm run calibrate 可跑，RR12 REVIEW 校准报告 artifact 有来源；
  RR10 可消费 scorePredictions 行契约与 joinPredictionsWithResets

### [2026-10-11 04:17→04:27] RR07 交付记录（S1011-0413，已由上行合入闭环吸收）
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
