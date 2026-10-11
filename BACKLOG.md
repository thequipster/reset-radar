# BACKLOG — 卡账与编号唯一源（reset-radar）

> 规则：状态流转只追加行不删历史；开新卡前查本文件尾部最大号 +1。
> 卡类型：🧱建卡（从零搭新能力）/ 🔧修卡（须已确认真值出处）/ 🎣挖卡（只挖证据不实装）。
> 立卡五件必齐：现象 / 证据（含真值出处或「待挖」）/ 修向 / 验证口径 / 状态行。
> 状态机：🟠待领 → 🟠在飞 → 🟡待合入 → 🟢已闭环；异常：🔴重开、🚫证伪、🟣待用户。

## 卡片区（新卡追加在状态区上方）

### RR01 | P0 | 🧱建卡🟠待领 | core+ui+data-layer | 立卡 S1011-init 2026-10-11
- 现象：仓库只有看板与文档，无任何可运行代码。
- 证据：主仓根目录现状（无 package.json）；架构定稿要求 Tauri2+React+TS+vite+vitest（ARCHITECTURE §2/§3）。
- 修向：`npm create tauri@latest` 或手工搭 Tauri 2 + React + TS + Vite 骨架（identifier 必须改为
  `app.resetradar.desktop` 之类本项目专属，防与参考项目撞配置目录——参考 TRUTH B05）；接入 vitest；
  放一个 smoke 测试与空的 src/lib/ 目录；`.gitignore` 已就绪勿重复。
- 验证口径：`npm run build`（tsc+vite）通过；`npx vitest run` 0 failed；`npm run tauri dev` 能起空窗
  （进程存活≥10 秒即算，注意 gnu 本机构建限制可只验 `cargo check` + 前端 build）。
- 状态行：2026-10-11 🟠待领

### RR02 | P1 | 🧱建卡🟠待领 | docs+发布 | 立卡 S1011-init 2026-10-11
- 现象：无 CI，发布无从谈起（gnu 本机产物需带 dll，不适合作为发布件——TRUTH B02）。
- 证据：TRUTH §2 B01/B02；GitHub Actions windows-latest 自带 MSVC 是社区标准路径。
- 修向：`.github/workflows/ci.yml`：windows-latest；npm ci → tsc → vitest → cargo check →
  `tauri build`（CI 用 MSVC 无 dll 问题）→ 产物上传 artifact。README 徽章接线。
- 验证口径：yaml 语法校验通过（actionlint 或 python yaml parse）；步骤结构与本卡修向逐条对照；
  （无 runner 环境下）不以"跑过"作声称，等用户 push 后首跑见真章——done 里注明此局限。
- 状态行：2026-10-11 🟠待领

### RR03 | P0 | 🎣挖卡🟠待领 | data采集 | 立卡 S1011-init 2026-10-11
- 现象：风险校准需要真实重置历史，仓库尚无数据。
- 证据：TRUTH §1 证据源 2（codex-resets.com 公开 API）。
- 修向：写 `scripts/fetch-history.mjs`（node，带 4s 超时与 UA）拉 `/api/v1/resets` + `/api/v1/status`，
  清洗（去未来日期、5 分钟去重——参考 reset_forecast.rs sanitize_history 思路，注明出处）后存
  `data/resets-history.json`（含 fetchedAt）。只采集不实装算法。
- 验证口径：脚本可重复运行幂等；产出 JSON 字段/schema 写进 TRUTH §2 新锚点（条数、时间跨度、
  星期分布统计表附在 done）。
- 状态行：2026-10-11 🟠待领

### RR04 | P0 | 🧱建卡🟠待领 | core | 立卡 S1011-init 2026-10-11
- 现象：核心层没有风险模型。
- 证据：参考 reset_forecast.rs 的 calibrated_risk（星期基线 Tue/Sat 70%→其余 10%、连续重置抬升、
  历史间隔条件风险、星期分布平滑）——借鉴思路重写为 TS，禁照抄常量而不注明。
- 修向：`src/lib/risk.ts`：`assessResetRisk(history, now) → {score, factors[]}`，factors 结构对齐 D006
  （id/label/delta/note）。用 RR03 的真实夹具做一组回归样例。
- 验证口径：域测试全绿；变异红验（如把基线 0.7 改 0.1 必红）；每个常量带出处注释。
- 状态行：2026-10-11 🟠待领

### RR05 | P1 | 🧱建卡🟠待领 | core | 立卡 S1011-init 2026-10-11
- 现象：没有每日配速建议。
- 证据：参考 dynamicQuota.ts planRemainingQuota：建议量 = min(剩余, 均匀+风险²前拉, 软上限 K(1+1.5r))。
- 修向：`src/lib/planner.ts`：`planDailyUsage({remaining, daysToReset, risk, ...}) → {suggested, cap, factors[]}`。
  公式注释里写清出处文件与行。补已知数值回归（用参考项目测试里的 dashboard 算例：
  remaining=100, risk=61.79, K=25, daysLeft=7, weekend → 36.1）。
- 验证口径：域测试含上述回归样例全绿 + 变异红验（改 1.5 系数必红）。
- 状态行：2026-10-11 🟠待领

### RR06 | P1 | 🧱建卡🟠待领 | core | 立卡 S1011-init 2026-10-11
- 现象：没有重置卡规划器（本项目招牌功能之一）。
- 证据：参考实现 `src/lib/resetCard.ts` + `docs/reset-card-planner.md`（初始化会话亲手写的 MIT 代码，
  路径见 TRUTH §1 来源 3），13 个单测已存在可一并移植。
- 修向：移植 resetCard.ts + 测试到本项目（文件头注明移植出处）；按 D004 统一北京零点边界
  （该实现已是纯北京日历键，复核即可）；决策文案常量留在核心层外（返回 decision 枚举，文案归 UI）。
- 验证口径：移植后 13 测试全绿原样通过 + 至少 1 条本项目新增边界用例（如跨自然重置日）+ 变异红验。
- 状态行：2026-10-11 🟠待领

### RR07 | P0 | 🧱建卡🟠待领 | core | 立卡 S1011-init 2026-10-11
- 现象：没有校准器——差异化核心（D001）尚未存在。
- 证据：Brier 分数 = 预测概率与 0/1 实现的均方差（标准定义）；命中率 = 阈值化命中占比。
- 修向：`src/lib/calibration.ts`：`scorePredictions(records) → {brier, hitRate, byWeek[], reliability[]}`；
  `scripts/calibrate.mjs` 读 `data/predictions.jsonl` + `data/resets-history.json` 出
  `docs/calibration-latest.md` 报告（REVIEW artifact）。
- 验证口径：合成序列数学正确性测试（完美预测 Brier=0、恒 50% 预测 Brier=0.25、全错=1）+ 变异红验。
- 状态行：2026-10-11 🟠待领

### RR08 | P1 | 🧱建卡🟠待领 | data-layer | 立卡 S1011-init 2026-10-11
- 现象：Rust 数据层不存在，UI 无米下锅。
- 证据：codex.rs 的 app-server 握手序列（TRUTH §1 来源 1/3）；D005 要求 SWR 内建 v1。
- 修向：`src-tauri`：Tauri command `get_snapshots`（spawn app-server 读 rateLimits+credits，
  6s 超时，kill_on_drop）；快照写 `last-snapshots.json`（原子写 tmp+rename）；启动时载入为
  stale 缓存立即返回、后台刷新事件推送——即参考项目 2026-10-10 修复版行为。
- 验证口径：Rust 解析单测（固定 JSON 样例，codex.rs 测试数据可借鉴注明出处）；
  `cargo check` 绿；本机起 app 冒烟（进程存活+配置目录出现 last-snapshots.json）。
- 状态行：2026-10-11 🟠待领

### RR09 | P1 | 🧱建卡🟠待领 | ui | 立卡 S1011-init 2026-10-11
- 现象：无可视界面。
- 证据：ARCHITECTURE §2（UI 零业务规则）；D006（factors 必须展示）。
- 修向：悬浮胶囊（剩余%）+ 展开卡三块：风险雷达（分数+可解释因子列表）/ 今日建议（数字+factors）/
  用卡规划（决策+期望收益+24h/48h 碰撞概率）。数据从 RR08 的快照/事件来。
- 验证口径：`npm run tauri dev` 截图存 docs/screenshots/（两态各一）；tsc 绿；
  UI 层文件 grep 无业务公式（数字全部来自 lib）。
- 状态行：2026-10-11 🟠待领

### RR10 | P1 | 🧱建卡🟠待领 | core+data-layer | 立卡 S1011-init 2026-10-11
- 现象：预测不落盘则校准闭环无原料（参考项目的最大遗憾——收集了数据却从不对答案）。
- 证据：D001 差异化定位；data/predictions.jsonl 约定见 RUNBOOK §1.5。
- 修向：每日首次评估时追加一行 `{date, predictedRisk, factorsDigest, fetchedAt}`（幂等：同日
  只在风险值变化超阈值时补行）；只追加不修改。
- 验证口径：域测试幂等性（同日重复调用不重复追加/仅变化补行）+ 变异红验。
- 状态行：2026-10-11 🟠待领

### RR11 | P1 | 🧱建卡🟠待领 | docs+发布 | 立卡 S1011-init 2026-10-11
- 现象：仓库距"用户一键 push 即发布"还差打磨。
- 证据：README 已有骨架；发布资产规则见 RUNBOOK §6。
- 修向：README 补真实截图与功能清单勾选；版本定 0.1.0（package.json+tauri.conf.json 同步）；
  release workflow（打 tag 触发构建，产物附件）；检查 LICENSE/TRUTH 致谢完整性。
- 验证口径：两处版本一致；CI yaml 校验；README 内链接全部可达（文件存在性检查）；
  done 明确列"用户发布步骤三条"（gh repo create / push / 打 tag）。
- 状态行：2026-10-11 🟠待领

### RR12 | P0 | 🔁循环锚卡🟠待领 | 全域 | 立卡 S1011-init 2026-10-11
- 现象：首批功能卡走完后循环可能停摆（无 🟠 无 🟡）。
- 证据：perpetual-board 循环四拍——REVIEW 拍是引擎（RUNBOOK §9）。
- 修向：执行首轮 REVIEW：生成全套验收 artifact（全量测试输出 / 构建证据 / 校准报告 / UI 截图），
  逐条审差距 + 扫 ROADMAP 未立卡条目，立出 RR13+ 新卡批次；之后每轮 REVIEW 照此滚动。
  **本卡永不 🟢 闭环**——它是循环锚，本轮审查完在状态区追加"第 N 轮完成"行后转回 🟠待领。
- 验证口径：产出 docs/review-<日期>.md 且差距逐条有定夺（不许悬空）；BOARD 切回 WORK 且 BACKLOG 有新卡。
- 状态行：2026-10-11 🟠待领

## 状态流转区（追加行；格式 `- <日期> <状态> <sha/备注>`）

- 2026-10-11 🟠待领 ×12（RR01–RR12 初始化批次，立卡会话 S1011-init）
- 2026-10-11 00:57 RR01 🟡待合入（agent/RR01 @ cd9f759；四绿+卡面口径全过，证据 task_logs/RR01_done.md；会话 S1011-0043）
- 2026-10-11 01:32 RR03 🟡待合入（agent/RR03 @ cf4d0ab；D010 等价口径全过：node:test 12/12+幂等复跑一致+变异红验两轮；TRUTH §2 B07 锚点已建；证据 task_logs/RR03_done.md；会话 S1011-0113）
- 2026-10-11 01:50 RR02 🟡待合入（agent/RR02 @ c451728；D011 等价口径全过：actionlint 0 告警+PyYAML parse+check-ci.py 结构断言绿+RR01 基线 4/4 复核+三变异红验；徽章 owner 裁决 D012；证据 task_logs/RR02_done.md；会话 S1011-0143）
- 2026-10-11 02:30 RR01 🟢已闭环（MERGE S1011-0213：cd9f759→main 838649b，树恒等✅；主仓复验 tsc✅ vitest 4/4 0failed✅ cargo check✅56.9s；worktree/分支已拆）
- 2026-10-11 02:30 RR03 🟢已闭环（MERGE S1011-0213：cf4d0ab→main 93858e9，树恒等✅；node --test 12/12✅；worktree/分支已拆）
- 2026-10-11 02:30 RR02 🟢已闭环（MERGE S1011-0213：c451728→main 0e0f5bc，树恒等✅；check-ci 结构门禁绿✅；CI 真跑待用户 push 首跑；worktree/分支已拆）
- 2026-10-11 02:30 MERGE 批量合入注记：RR01+RR03 合并暴露 vitest 误载 scripts/*.test.mjs 的集成回归，以 fixup c78978c 直修（决策 D013：MERGE 槽测试接线类回归窄口径直修权），全量基线恢复 0 failed；阶段按阶段机切 WORK（RR04–RR12 🟠可领）
- 2026-10-11 02:51 RR04 🟡待合入（agent/RR04 @ f1810f9；四绿全过：tsc✅ 域18/18✅ 全量18/18 0failed✅ 变异红验两轮（基线70→10红4条/watch权重→0红3条）✅；真实夹具 golden 24.5 手算逐位吻合+B07 分布锚点；证据 task_logs/RR04_done.md；会话 S1011-0243）
- 2026-10-11 03:14 RR04 🟢已闭环（MERGE S1011-0313：f1810f9→main 8b85206，树恒等✅；主仓复验 tsc✅ vitest 全量18/18 0failed✅；worktree/分支已拆；RR05 解锁可消费 assessResetRisk）
- 2026-10-11 03:19 RR05 🟡待合入（agent/RR05 @ b86ee9e；四绿全过：tsc✅ 域33/33✅ 全量33/33 0failed✅ 变异红验两轮（SOFT_CAP_SLOPE 1.5→0 红5条 / p²→p¹ 红6条）✅；dashboard 双 golden 逐位吻合；证据 task_logs/RR05_done.md；会话 S1011-0313）
- 2026-10-11 03:46 RR05 ??已闭环（MERGE S1011-0343：b86ee9e→main 7864217，树恒等✅；预审三过（探活/对账3文件+248行/patch适用）；主仓复验 tsc✅ vitest 全量33/33 0failed✅；worktree/分支已拆；RR06 解锁可领，阶段切 WORK）
- 2026-10-11 03:51 RR06 🟡待合入（agent/RR06 @ 23a1d49；四绿全过：tsc✅ 域49/49✅ 全量49/49 0failed✅ 变异红验两轮（survival忽略hazard红3/refill阈值25→0红1）✅；13条参考断言原样全绿+3条新增自然重置日边界；适配决策D015；证据 task_logs/RR06_done.md；会话 S1011-0343）
- 2026-10-11 04:16 RR06 🟢已闭环（MERGE S1011-0413：23a1d49→main 58ff13b，树恒等✅；预审四过（worktree探活/diffstat对账4文件+690行/patch在位/路径交集空）；主仓复验 tsc✅ vitest 全量49/49 0failed✅；worktree/分支已拆；RR07 可领，阶段切 WORK）
- 2026-10-11 04:27 RR07 🟡待合入（agent/RR07 @ 13be6b1；四绿全过：tsc✅ 域65/65✅ 全量65/65 0failed✅ 变异红验两轮（Brier²→|·|红6/日键漏+8h红2）✅；Brier三锚0/0.25/1+B06反锚定对账+跨年周键；脚本两轮冒烟（node v22.23.1 原生type-stripping直载.ts）；契约决策D016；证据 task_logs/RR07_done.md；会话 S1011-0413）
- 2026-10-11 04:44 RR07 🟢已闭环（MERGE S1011-0443：13be6b1→main dddc641，树恒等✅；预审四过（worktree探活/单commit对账8文件+619行/patch在位且对main干净适用/路径交集空）；主仓复验 tsc✅ vitest 全量65/65 0failed✅（基线49→65只升）；worktree/分支已拆；core 域首批四卡全闭环，RR08 可领，阶段切 WORK）
- 2026-10-11 06:57 RR08 🟡待合入（agent/RR08 @ a1f802a=e5f6463+a1f802a 两 commit；门禁全过：tsc✅ cargo test --lib 10/10✅（B08 正规化后免手工补丁）全量 vitest 65/65 0failed✅ 变异红验两轮✅ cargo check --tests✅；冒烟：release app 存活+真实 app-server 握手落盘（plan=PLUS/周窗29%/credits3）；TRUTH B08 勘正+D017；证据 task_logs/RR08_done.md；会话 S1011-0443 交付前段 → S1011-0643 §7 接管续作）
- 2026-10-11 07:16 RR08 🟢已闭环（MERGE S1011-0713：a1f802a(2 commits)→main 42d443c，树恒等✅；预审四过（worktree探活/diffstat对账7文件+923行/patch干净适用/路径交集空）；主仓复验 tsc✅ vitest 全量65/65 0failed✅ cargo check --tests 12.9s✅；worktree/分支已拆；RR09 UI 数据前置 get_snapshots 就绪可领，阶段切 WORK）
- 2026-10-11 08:05 RR09 🟡待合入（agent/RR09 @ 12d8380；四绿全过：tsc✅ 域8/8✅ 全量73/73 0failed✅ 变异红验两轮（主数字换源红5/daysToReset注入+8h红1）✅ cargo check --tests 复验✅；release app 实跑截图胶囊态真实数据（29%）；tauri dev 本机死路+输入注入不可达记 TRUTH B09，展开态截图留续作；证据 task_logs/RR09_done.md；会话 S1011-0713）
- 2026-10-11 07:55 RR09 🟢已闭环（MERGE S1011-0743：12d8380→main 0bbd62c，树恒等✅；预审四过（worktree探活/diffstat对账10文件+666行/patch在位/路径交集空）；主仓复验 tsc✅ vitest 全量73/73 0failed✅（基线65→73只升） cargo check --tests 1.27s✅；worktree/分支已拆；RR10 可领，阶段切 WORK）
- 2026-10-11 08:00 RR10 🟡待合入（agent/RR10 @ d35bc8b=c78e462+d35bc8b 两 commit；四绿全过：tsc✅ 域13/13✅ 全量86/86 0failed✅（基线73→86只升） 变异红验两轮（阈值比较符>=红1/日键换源UTC红1）✅ 落盘器冒烟两跑幂等实证✅；首行 predictedRisk=24.5 与 RR04 golden 同源交叉验证；D019 已记；证据 task_logs/RR10_done.md；会话 S1011-0743）
- 2026-10-11 08:18 RR10 🟢已闭环（MERGE S1011-0813：d35bc8b(2 commits)→main 8ec7d6b，树恒等✅ 涉及7路径diff 0字节；预审四过（worktree探活/diffstat对账7文件+304行/patch在位且干净适用/路径交集空）；主仓复验 tsc✅ vitest 全量86/86 0failed✅（基线73→86只升）；worktree/分支已拆（junction先拆）；RR11 可领，阶段切 WORK）
- 2026-10-11 08:42 RR11 🟡待合入（agent/RR11 @ f5ce969；等价口径全过：tsc✅ 全量86/86 0failed✅ check-release.mjs（版本同步0.1.0+README链接12条+tag守卫咬合证）✅ check-release-wf.py 结构门禁✅ check-ci.py 回归✅ actionlint 零告警✅ 变异红验两轮（链接条件反转红12/触发器比较符反转红1）✅；README 打磨+release workflow+发布三步就绪；证据 task_logs/RR11_done.md；会话 S1011-0813）
