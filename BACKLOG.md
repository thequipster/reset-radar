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

### RR13 | P1 | 🔧修卡🟠待领 | ui | 立卡 S1011-0843（首轮 REVIEW G1）2026-10-11
- 现象：窗宽 420（tauri.conf.json:17）下胶囊右侧「重置风险」标签被截断（RR09 胶囊态截图实证）。
- 证据：src/ui/Capsule.tsx:27 padding 14px 22px / :64 标签；docs/screenshots/20261011-capsule.png 可见截断。
- 修向：窗宽 420→460 或压缩胶囊内边距（执行会话裁决并在 done 注明理由）；README 上墙截图同步换新。
- 验证口径：release 截图（B01 特性+PrintWindow B09）无截断 + 四绿（ui 域）。
- 状态行：2026-10-11 🟠待领

### RR14 | P1 | 🔧修卡🟠待领 | ui | 立卡 S1011-0843（首轮 REVIEW G2；RR09/RR11 遗留）2026-10-11
- 现象：docs/screenshots/ 只有胶囊态；ExpandedCard 三块从未被视觉验收，README 展开卡宣称无证据件。
- 证据：TRUTH B09 机制②——agent 无前台权，交互注入不可达；可复现路径=App 读 location.hash=#expanded 起始展开。
- 修向：App.tsx 支持 hash 状态入口（纯展示接线，不违反 UI 零业务规则）→ release exe 起跑 →
  PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT) 截图 → docs/screenshots/<YYYYMMDD>-expanded.png；
  同步补胶囊态新截图（若 RR13 已改窗宽则连带更新）。
- 验证口径：两态截图落盘 + tsc/域/全量四绿。
- 状态行：2026-10-11 🟠待领

### RR15 | P1 | 🧱建卡🟠待领 | data-layer | 立卡 S1011-0843（首轮 REVIEW G3；D019③）2026-10-11
- 现象：预测落盘只有 scripts/log-prediction.mjs 写仓内 data/predictions.jsonl；安装版 app 无仓可写，
  %APPDATA% 路径与校准读取断链（D019③原文）。
- 证据：ARCHITECTURE §4 数据流（每日预测落盘由 app 承担）；README 勾选清单唯一未勾项。
- 修向：先记 D020 裁决路径方案（倾向：生产落 %APPDATA%\reset-radar\predictions.jsonl，
  calibrate/log 脚本加 --path 且默认双源合并），再 Rust 侧每日首评幂等追加（语义沿 D019：
  同日首评必落/漂移>0.5 补行/坏行保留）。
- 验证口径：Rust 单测幂等 + cargo check + 冒烟（落盘文件出现且 scripts 可读同一文件）。
- 状态行：2026-10-11 🟠待领

### RR16 | P2 | 🧱建卡🟠待领 | core | 立卡 S1011-0843（首轮 REVIEW G4；ROADMAP v0.2）2026-10-11
- 现象：codex-resets.com status.active_watch（TRUTH B07 schema 在案）未进风险模型。
- 证据：ROADMAP v0.2「上游 watch 信号以显式权重混入，权重本身参与校准对比」。
- 修向：src/lib/risk.ts 增 watch 显式因子（factors[] 可解释），权重参与校准对比；
  **红线：模型总可调参数 ≤6（ARCHITECTURE §5），超限即作废**。
- 验证口径：域测试（含 watch 权重变异红验）+ 校准报告能分列该权重。
- 状态行：2026-10-11 🟠待领

### RR17 | P2 | 🧱建卡🟠待领 | core+data-layer | 立卡 S1011-0843（首轮 REVIEW G5；ROADMAP v0.2）2026-10-11
- 现象：实际重置发生后，该日预测的对错回填只能人工。
- 证据：ROADMAP v0.2「预测日志自动对答案」；RR10 predictions.jsonl 已有原料（首行 24.5）。
- 修向：fetch-history 刷新后 diff 出新重置日 → 对该日 predictions.jsonl 行打分落 calibration
  消费格式（joinPredictionsWithResets 已在 RR07 就绪）。**依赖：RR15 路径汇流 + RR18 新鲜度守卫。**
- 验证口径：合成序列测试（有/无新重置日两种）+ 变异红验。
- 状态行：2026-10-11 🟠待领

### RR18 | P2 | 🔧修卡🟠待领 | data采集 | 立卡 S1011-0843（首轮 REVIEW G6）2026-10-11
- 现象：resets-history 夹具只在 RR03 手动拉过一次（fetchedAt 2026-10-10T17:20Z），无刷新机制；
  校准 as_of 停在夹具时刻，风险与校准全部依赖其新鲜度。
- 证据：docs/calibration-latest.md（本轮 artifact）显示 as_of=昨日夹具时刻。
- 修向：①scripts/calibrate.mjs 加新鲜度守卫：fetchedAt 距今 >7 天 → 报告头部红字告警（单测覆盖）
  ②REVIEW 拍每轮先跑 node scripts/fetch-history.mjs（幂等）再出报告（载体=review 文档前置动作，
  本轮起生效，不改 RUNBOOK）。
- 验证口径：单测（旧夹具触发告警/新夹具不触发）+ 冒烟。
- 状态行：2026-10-11 🟠待领

### RR19 | P2 | 🔧修卡🟠待领 | docs+发布 | 立卡 S1011-0843（首轮 REVIEW G7；RR02 遗留）2026-10-11
- 现象：.github/workflows/ci.yml 不跑 node --test（RR03 的 12 条 scripts 测试游离在 CI 之外）。
- 证据：RR02 done 遗留记录；node --test 12/12 本地绿。
- 修向：ci.yml 加 node:test 步骤（注意 RR03/D013 的 vitest exclude 边界不变）。
- 验证口径：check-ci 结构门禁 + yaml 校验（沿 RR02 口径）。
- 状态行：2026-10-11 🟠待领

### RR20 | P1 | 🔧修卡🟠待领 | data-layer | 立卡 S1011-0913（RR13 排障转立；TRUTH B10/D020）2026-10-11
- 现象：gnu 自建 exe DPI 无感知——本机 200% 缩放下 CSS 视口=窗宽/2，460 窗口实际 230px，
  胶囊（自然宽 421 CSS px）必然右截断；RR13 卡面两修向（加宽/压边距）均不能根治。
- 证据：TRUTH §2 B10（exe 内嵌 manifest dump 无 dpiAware；AppliedDPI=192；两轮截图切点
  与 210/230 视口模型逐字符吻合）；RR13_wip 证据链节。
- 修向：src-tauri/build.rs 的 B08 manifest（compile_for_everything 所嵌资源）补
  `<asmv3:application><windowsSettings><dpiAware>true/PM</dpiAware>
  <dpiAwareness>PerMonitorV2,PerMonitor</dpiAwareness></windowsSettings>`（保留 Common-Controls
  v6 依赖，勿丢 B08 成果）；重建后 exe 需实跑验证：同窗宽下 CSS 视口=窗宽（截图内容完整度
  或 GetClientRect×DPI 复核）。**解锁 RR13 复验收尾。**
- 验证口径：manifest dump 含 dpiAware + release 实跑截图对比（RR13 协同）+ cargo check
  --tests（Rust 门）+ 既有测试不新增 failed。
- 状态行：2026-10-11 🟠待领

### RR21 | P1 | 🔧修卡🟠待领 | ui | 立卡 S1011-1043（用户线上反馈+D021 裁决；吸收 RR14 遗产①②）2026-10-11
- 现象：呈现为 460×560 普通窗口——胶囊态胶囊仅占整窗 0.6%（大片深色空白，用户观感
  "简陋"主因）；启动等待页纯文字无样式（用户"一闪而过"观感）；展开态 460 窄窗右缘
  溢出/横向滚动/竖排单字「等/待/最」/「收起」按钮视口外（RR14 遗产①）。
- 证据：RR14 胶囊态截图识图（0.6% 占比）；RR14_done 遗产①②③；参考实现 codex-cockpit
  src-tauri/tauri.conf.json widget 窗口配置（TRUTH §1 来源 3）：decorations:false /
  transparent:true / backgroundColor:#00000000 / alwaysOnTop:true / skipTaskbar:true /
  shadow:false / focus:false / 初始 100×100 + minWidth 80/maxHeight 1200 动态尺寸。
- 修向：对齐参考实现真·悬浮窗——①tauri.conf.json 窗口配置改造（上列字段，出处
  codex-cockpit/src-tauri/tauri.conf.json）②胶囊态窗口收紧成悬浮条尺寸、展开态动态
  长高（Rust set_size 或前端 invoke，UI 零业务规则不破）③自定义拖动区
  （data-tauri-drag-region）④启动等待页样式化（与胶囊同设计语言）⑤ExpandedCard
  窄窗自适应排版（换行/压缩列/收起按钮常驻可见）。Windows gnu 注意：transparent 与
  已嵌 manifest 兼容性需实跑验证；若透明异常可退「无边框+不透明圆角窗口」仍达成主要
  观感目标（降级路径卡内自裁并记 done）。
- 验证口径：release 实跑（custom-protocol，B01）两态截图复用/适配 shot-expanded.ps1
  + 识图子代理复验（悬浮条无空白大片/展开无右溢/收起可见）+ 门禁四绿 + cargo check
  （动 src-tauri 必跑）。
- 状态行：2026-10-11 🟠待领

### RR22 | P0 | 🧱建卡🟠待领 | core | 立卡 S1011-1043（用户线上实测反馈：公告已发 4h 内重置而模型无感知）2026-10-11
- 现象：codex-resets.com 已公告 scheduled_reset（本会话实测 scheduled_for=2026-10-11T07:00Z
  即北京 15:00，"Global reset by EOD"），用户观察 app 无任何反应——风险分数不涨、
  planner 仍建议 5.1 保守配速。模型对确定性公告失聪。
- 证据：GET /api/v1/status 实测（node fetch 200，B07 域名）：scheduled_reset{id,status:
  scheduled,reset_type,announced_at,scheduled_for,text,source}；grep 全仓 scheduled/
  active_watch 在 src/ 与 src-tauri/src/ **零消费者**（仅 scripts/fetch-history.mjs 注释
  预言"RR04 要用"未兑现）；planner daysToReset 来自周窗 resetsAt 整天截断
  （planner.ts:18,55），与全球公告是两个事件源。
- 修向：src/lib 公告感知——①risk：scheduledReset 在 T 小时内→确定性覆盖（概率让位于
  公告）+ active_watch.reset_chance_percent 作加权因子；②planner：临期清仓策略
  （公告时刻前剩余额度可全用，配速公式改写）；③resetCard 同步。纯函数+注入测试，
  core 零 IO。与 RR23 契约：核心层自定义输入类型（ScheduledReset 视图），data-layer 适配。
- 验证口径：域测试（注入 scheduledReset{2h 后}→断言建议飙升/风险覆盖；无公告→与现状
  golden 逐位一致=回归锚）+ 变异红验 + 四绿。
- 状态行：2026-10-11 🟠待领

### RR23 | P0 | 🧱建卡🟠待领 | data-layer | 立卡 S1011-1043（RR22 数据前置/姊妹卡）
- 现象：app 运行时只握 codex app-server（额度权威），不拉 codex-resets.com /api/v1/
  status——公告进不了快照；data/resets-history.json 静态（fetchedAt=10-10T17:20Z，
  早于公告发布 10-10T22:16Z 差 5h 未赶上）。
- 证据：同 RR22 实测；TRUTH §1/§2 B07（API schema 已登记；本机 curl(schannel) 对该域
  偶发握手失败、node fetch 稳定——Rust reqwest 的 TLS 后端选择需实测）。
- 修向：src-tauri 新增公告拉取（reqwest rustls 起步，失败再裁 native-tls）——运行时
  定时（15min 量级）拉 /api/v1/status，scheduled_reset/active_watch 进快照契约
  （RR08 契约扩展、字段可空向后兼容）；推荐 Rust 侧拉以规避前端 CSP connect-src 改动。
  与 RR18 互补不重叠：RR23=运行时实时公告，RR18=REVIEW 离线夹具刷新。
- 验证口径：cargo check --tests + 契约测试 + TLS 探活实测 + 四绿；真值回源 B07 schema。
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
- 2026-10-11 08:44 RR11 🟢已闭环（MERGE S1011-0843：f5ce969→main ae642c0，树恒等✅ 4路径diff 0字节；预审四过（worktree探活/diffstat对账4文件+248行/patch在位且干净适用/路径交集空）；主仓复验 tsc✅ vitest 全量86/86 0failed✅ check-release✅；worktree/分支已拆（junction先拆，残留已清）；RR12 首轮 REVIEW 可执行，阶段切 WORK）
- 2026-10-11 09:04 RR12 第 1 轮完成（首轮 REVIEW，会话 S1011-0843）：四类 artifact 齐（vitest 86/86 / vite build / cargo check / 校准报告+胶囊截图）；差距 10 条全定夺（立卡 RR13–RR19 共 7 张，3 条不立卡理由见 docs/review-20261011.md）；报告 docs/review-20261011.md；artifact 批支 agent/RR12 🟡待合入（见 BOARD）；**锚卡转回 🟠待领（永不🟢）**
- 2026-10-11 09:04 RR13–RR19 🟠待领 ×7（首轮 REVIEW 新卡批次，立卡会话 S1011-0843；建议顺序 RR13→RR14→RR15→RR18→RR19→RR16→RR17，RR13/RR14 同域串行，RR17 依赖 RR15）
- 2026-10-11 09:16 RR12 首轮 artifact 批 🟢已闭环（MERGE S1011-0913：f15baad→main 6360778，树恒等✅ 5路径 diff 0字节；预审四过（worktree探活/diffstat对账5文件+190行/patch在位/交集空）；主仓复验 tsc✅ vitest 全量86/86 0failed✅；worktree/分支已拆（无junction直接remove）；锚卡 RR12 本体保持🟠待领永不🟢，REVIEW 第2轮滚动）
- 2026-10-11 09:55 RR20 🟠待领（新立：data-layer manifest 补 dpiAware，RR13 排障转立，TRUTH B10/D020）
- 2026-10-11 09:55 RR13 🟠在飞→🟠待领（留证续作，会话 S1011-0913 时间盒到点：460 复验被识图否决，根因=DPI 无感知（B10）；WIP=agent/RR13 @ 1482ca9，门禁前三绿；续作前置=RR20 合入，指引在 task_logs/RR13_wip.md；转待领避免 LIGHT 槽死锁——D020 决定③的执行细化）
- 2026-10-11 10:03 RR20 🟡待合入（agent/RR20 @ 8963fd3；四绿全过：tsc✅ 域 cargo test --lib 12/12✅ 全量 vitest 86/86 0failed✅ cargo check --tests✅ 变异红验（PerMonitorV2→MUTANT 红哨兵1条）✅；实证：exe manifest 含 dpiAware、GetDpiForWindow 192、物理客户区 840×1120=2×逻辑、识图复验右缘截断消除；真值=B10/D020+tauri-build/tao 源码核实；证据 task_logs/RR20_done.md；会话 S1011-0944）
- 2026-10-11 10:08 RR20 🟢已闭环（MERGE S1011-0944：8963fd3→main aadaed4，树恒等✅ 2路径diff 0字节；预审四过（worktree探活/单commit对账2文件+69行/patch在位/交集空）；主仓复验 tsc✅ vitest 86/86 0failed✅ cargo check --tests 4.18s✅；worktree/分支已拆（junction先拆cmd rmdir）；RR13 复验收尾解锁，阶段切 WORK）
- 2026-10-11 10:19 RR13 🟡待合入（agent/RR13 @ a994f73 单 commit 基于 main 91a3ddf；S1011-1013 续作收尾：变基含 RR20→重建 release 实跑 GetDpiForWindow 192/物理客户区 920x1120=2x(460x560)→识图复验 PASS 右缘截断消除余量 35-40px；四绿 tsc✅ ui域 8/8✅ 全量 86/86 0failed✅ 变异不适用口径零 src 逻辑；真值=B10+D020+421px 实测；证据 task_logs/RR13_done.md；worktree 留 MERGE 班拆/junction 先 rmdir）
- 2026-10-11 10:52 RR13 🟢已闭环（MERGE S1011-1043：a994f73→main 6dd9ed6，树恒等✅ 4路径diff 0字节；预审四过（worktree探活/单commit对账4文件+46行/patch在位36777B/交集空——91a3ddf..main仅看板文件）；主仓复验 tsc✅ vitest 86/86 0failed✅ cargo check --tests 1.26s✅；worktree git侧已拆（junction先拆cmd rmdir，主仓node_modules完好），空壳目录句柄占用暂留磁盘；ui 域胶囊右缘截断闭环，阶段切 WORK（RR14 起 🟠×7））
- 2026-10-11 11:22 RR14 🟡待合入（agent/RR14 @ ba11e47 单 commit 基于 main 6dd9ed6；四绿全过：tsc✅ 域 src/ui 11/11✅ 全量 89/89 0failed✅〔基线86→89只升〕 变异红验✅〔精确匹配→#mutant 红1/复原绿〕；hash 入口生效实证：CDP 两跳导航+PMv2 探针，DPI 192/客户区 920×1120，展开态三块面板齐全截图落盘+胶囊态连带更新无截字+README 图引用闭环；真值=RR09_done B09 机制②+WHATWG fragment 语义+CDP 实证；证据 task_logs/RR14_done.md；worktree 留 MERGE 班拆/junction 先 rmdir；排障遗产4条留 REVIEW——含展开态 460 窄窗排版差距候选修卡）
- 2026-10-11 11:35 RR21 🟠待领（新立：ui 域真·悬浮窗改造，用户线上反馈"简陋"+D021 裁决选项A；吸收 RR14 遗产①②；证据=RR14 截图识图 0.6% 占比+codex-cockpit tauri.conf.json widget 配置逐字段；含 transparent gnu 兼容降级路径）
- 2026-10-11 11:15 RR14 🟢已闭环（MERGE S1011-1113：ba11e47→main e569ce1，树恒等✅ 7路径diff 0字节；预审四过（worktree探活/单commit对账7文件+149行/patch在位229081B/交集空——基即main HEAD 6dd9ed6）；主仓复验 tsc✅ vitest 全量89/89 0failed✅〔基线86→89只升〕 cargo check --tests 2.00s✅；worktree/分支已拆（junction先拆cmd rmdir，主仓node_modules完好；顺手清RR09空壳，RR13仍句柄占用暂留）；ui 域 hash 状态入口闭环，阶段切 WORK（RR21 领先））
- 2026-10-11 11:52 RR22/RR23 🟠待领 ×2（新立：公告感知全链路，用户线上实测反馈——codex-resets.com scheduled_reset 公告〔北京今日15:00 Global reset〕app 无感知仍建议5.1；断链三环节实锤：运行时不拉 /status、夹具静态晚5h、模型零消费者；RR22 core 纯函数先行→RR23 data-layer 接线；UI 公告横幅并入 RR21 设计）

### RR24 | P1 | 🧱建卡🟠待领 | docs+发布 | 立卡 S1011-design（用户指定四阶段前端重设计：阶段1）
- 现象：用户要求先自由发散并产出 docs/design/01-proposals.md，再停下审阅；RR21 正在占用 LIGHT/ui 槽，本轮不可并发实施或抢占。
- 证据：本次用户总指挥任务（最高层级用户裁决）；ROADMAP.md；docs/review-20261011.md；docs/screenshots 三张落盘图；src/ui/adapters.ts DashboardViewModel 契约。
- 修向：工位释放后建立 agent/RR24 worktree，将已审阅的独立候选稿落档 docs/design/01-proposals.md；当前草稿含42条提案（每条创意/解决问题/字段或新增能力依赖），需结合 RR21 最终交付刷新现状记录。仅阶段1，不提前写02/03或实施。阶段2用户过目后另卡推进。
- 草稿：C:/Users/slsjz/.codex/visualizations/2026/10/11/01a128fd-c348-7371-baf0-05e1ac73d93e/01-proposals.md（Luna 资料整理与初稿，主会话语义/出处校对；不属仓内正式交付）。
- 验证口径：10+提案且每条说明解决问题、字段回源、截图审查文字与出处齐；仓内正式交付仍按 RUNBOOK 门禁/证据要求执行，草稿不冒称四绿或已提交。
- 状态行：2026-10-11 11:30:46 🟠待领（未领卡、不占槽；仓内落档待 RR21 释放）

- 2026-10-11 11:30:46 RR24 🟠待领（用户四阶段重设计阶段1；42条独立审阅草稿完成，仓内落档待LIGHT释放；阶段1停审阅，未进入阶段2）

### RR25 | P1 | 🧱建卡🟠待领 | docs+发布 | 立卡 S1011-design2（用户批准阶段1，指定阶段2+阶段4扩展）
- 现象：用户已认可阶段1并要求收敛方案；新增授权：阶段4除前端，其他看板卡任务也由本设计总指挥执行。
- 证据：本次用户消息原文“没问题，都按你的想法来，进入第二阶段。另外第四阶段加点东西，除了改前端，其他卡片的任务也由你来执行”；RR24候选稿、adapters/useSnapshots契约、BACKLOG RR15–RR23、ARCHITECTURE与RUNBOOK。
- 修向：工位释放后用 agent/RR25 将独立审阅方案落档 docs/design/02-spec.md。方案选定石墨深色默认+浅色切换，悬浮/预览/展开三态，今日追加建议优先，公告与模型分层，CSS Modules+tokens，全状态与校准摘要。用户确认02后才进入阶段3，参考图到位后才开始阶段4业务卡和UI实施。
- 草稿：C:/Users/slsjz/.codex/visualizations/2026/10/11/01a128fd-c348-7371-baf0-05e1ac73d93e/02-spec.md（可审阅方案；仓内未落档/未提交，代码门禁未执行，不冒称正式交付）。
- 验证口径：做/不做/理由、三态线框、深浅tokens与文字对比度、字体/间距/圆角/阴影/动效、loading/empty/error/stale/partial-null、VM来源和新增契约、阶段4逐卡依赖/验收均明确；仓内交付仍遵守RUNBOOK证据要求。
- 状态行：2026-10-11 11:40:25 🟠待领（未领卡，不占LIGHT；独立阶段2方案供用户确认）。

- 2026-10-11 11:40:25 RR24 用户认可阶段1内容，仓内落档仍待领；RR25 新立阶段2方案落档卡，保留阶段确认停点。
- 2026-10-11 11:40:25 阶段4授权补记：本设计总指挥执行除UI外其他看板任务，计划RR22→RR23→RR15→RR18→RR19→RR16→RR17→UI/契约补卡→RR12验收；RR21他人在飞勿抢，已闭环成果核验复用。执行前重读状态，逐卡分会话，不绕过槽位/门禁/STOP；发布动作仍留用户。
- 2026-10-11 11:56 RR21 🟡待合入（agent/RR21 @ 2b10c27 单 commit 基于 main b518bcd；四绿全过：tsc✅ 域 src/ui 15/15✅ 全量 93/93 0failed✅〔基线89→93只升〕 变异红验✅〔胶囊高76→560病灶值→红2→复原绿〕 cargo check --tests 5.19s✅ check-release 13链接✅；实证：胶囊 920×152=2×(460×76) 悬浮条收紧/展开 920×1296 前端 LogicalSize 动态长高/DPI 192/屏幕DC实拍四角=桌面像素→gnu transparent 生效未走降级/EXSTYLE TOPMOST+NOACTIVATE/识图子代理两图 PASS；真值=codex-cockpit tauri.conf.json widget 逐字段+其 lib.rs:210-233+capabilities 三权限+DOM 实测定尺寸；证据 task_logs/RR21_done.md；worktree 留 MERGE 班拆/junction 先 rmdir；**注：本卡交付悬浮窗本体，公告横幅未含**——RR22/RR23 立卡时言明并入 RR21 设计，但公告数据链（core 纯函数+运行时 /status）尚未落地，横幅应随 RR22/RR23 消费卡实施；排障遗产4条留 REVIEW〔PrintWindow 透明伪象判别法/preview 端口占用/「校准」2字孤行小瑕疵/RR14 遗产①③ 随本卡闭环〕）

### RR26 | P1 | 🧱建卡🟠在飞 | docs+发布 | 立卡/领卡 S1011-design3（用户进入阶段3）
- 现象：用户要求生图提示词只说明UIUX，明确撤销风格/配色约束；前两阶段文档尚在独立审阅目录。
- 证据：当前用户消息、RR24/25已审阅文档、adapters视图契约；RR21待合入，LIGHT已释放。
- 修向：agent/RR26独立worktree落档docs/design/01-proposals.md、02-spec.md、03-image-prompts.md；02视觉部分按最新用户裁决改为待参考图决定，03提供6张各自可复制的场景/视角/区域/UIUX/比例提示词，无hex或固定风格。仅文档，不执行阶段4代码。
- 验证口径：tsc、UI域、全量vitest；文档契约核验+变异红验（撤销“卡数未知”语义必须红，恢复绿）；done附用户裁决/字段出处/独立文档校验结果，生图表现待用户生成参考图后验收。
- 状态行：2026-10-11 11:57:14 🟠在飞（LIGHT；三份文档统一落档，RR24/25落档事项并入本卡追溯，不另领两卡）。

- 2026-10-11 12:05:03 RR26 🟡待合入（agent/RR26 @961fdfb；三阶段文档+6组无视觉限制UIUX提示词；tsc/UI11/全量89/文档验收绿+未知卡误变0文档变异红验exit1复原绿；主仓git apply --check标准RR26.patch通过；done在task_logs/RR26_done.md，worktree留待用户回图/后续合入）。
- 2026-10-11 12:05:03 RR24/RR25落档事项已并入RR26交付，勿重复领；随RR26合入后同步闭环。用户明确撤销具体风格/配色/字体/材质对图AI的限制，覆盖旧卡面石墨青绿描述；UIUX/阶段4其它卡执行授权保留。

- 2026-10-11 12:33:26 RR21/RR26 🟢已闭环：MERGE S1011-design4，2b10c27→0fe0159 / 961fdfb→bca3ba4；逐路径树恒等，主仓tsc/93tests/设计验收/cargo check --tests绿。RR24/RR25由RR26覆盖落档，闭环勿重领。RR26有用户未跟踪六张参考图故保留worktree，RR21暂保留避免junction风险。
- 2026-10-11 12:33:26 RR22 🟠在飞：S1011-design4，agent/RR22基线bca3ba4；用户阶段4授权，公告语义以02-spec分离模型概率/计划优先。

### RR27 | P1 | 🔧修卡🟠待领 | ui | 阶段4参考图实施（S1011-design4立卡）
- 现象：悬浮窗本体虽已RR21修复，src/ui仍旧视觉，两态尚无peek；用户已提供六张图并授权照图重构。
- 证据：TRUTH §U阶段4授权；docs/design/02-spec.md、04-progress.md及ref六图（RR22原字节归档）；adapters.ts为唯一数字契约。
- 修向：在agent/RR27重构src/ui/，CSS Modules+主题token、自己画SVG入icons；compact/peek/expanded、顶栏拖动区、主题记忆、动效/减少动效、loading/empty/error/stale/partial-null/卡0与未知、未来与待核实公告。只映射VM，禁止业务公式；动态窗口尺寸与NOACTIVATE键盘焦点实测。校准摘要仅消费RR28只读契约，不抄演示数据；DPI/manifest旧修复保留。
- 验证口径：UI域行为测试/tsc/全量vitest/核心交互变异红验；动Rust则cargo check --tests；GNU release带custom-protocol，实际截图覆盖三态/主题/异常，子代理读盘审460px无横滚及按钮可达；完成报告含截图/门禁/借鉴出处。
- 状态行：2026-10-11 🟠待领；依赖RR23完成公告VM契约、RR28校准只读契约；不占LIGHT，勿在RR22在飞期间抢槽。

### RR28 | P2 | 🧱建卡🟠待领 | data-layer+core | 校准摘要只读桥接（S1011-design4立卡）
- 现象：用户已批准展开页校准入口，但当前VM没有运行时样本数/Brier/命中率，不能填图稿假成绩。
- 证据：ARCHITECTURE §2/§4持续校准与分层；02-spec字段新增表；src/lib/calibration.ts为算法唯一源，docs/calibration-latest.md当前零完结样本。
- 修向：读取RR15统一预测日志与RR18新鲜历史，薄壳调用src/lib/calibration，形成可空只读摘要/来源时刻/样本数/失败状态；Rust仅IO，React零评分公式，计分口径继续北京零点/完结日/同日首行。零样本显示待积累；无需新增UI业务规则。若脚本先生成摘要，用只读Tauri命令取真实文件并标明生成时刻。
- 验证口径：真实生成器输出和核心既有校准golden对账、零样本/坏JSON/文件缺失/过期状态、只读契约测试；tsc/域/全量/变异红验+动Rust的cargo check --tests；出处/产物路径写done。
- 状态行：2026-10-11 🟠待领；依赖RR15/RR18/RR17，前置RR27消费，未领不占槽。
- 2026-10-11 12:42:36 RR22 🟡待合入：c8321dc，27文件+664/-10；核心93/全量108/tsc绿；变异红6+红1字节恢复绿；D022修正确定性公告概率推断，参考图归档；RR27/RR28新增未领卡，详卡面。
- 2026-10-11 12:44:16 RR22 🟢已闭环：c8321dc→main1142551，27路径树恒等，主仓tsc/108tests/设计验收绿；RR22 worktree安全拆除（junction先以Directory.Delete非递归拆）；RR21已注销，仅空目录句柄占用暂留，main node_modules完整。RR21/RR22分支归档保留，不force；RR26用户图原件保留。下一卡RR23，RR27/RR28待前置。
- 2026-10-11 12:47:01 RR23 🟠在飞：S1011-RR23，agent/RR23基线1142551；status采集/缓存/失败独立于额度，生产adapter消费公告，门禁含Rust与TLS实证。

- 2026-10-11 13:06:14 RR23 🟡待合入：98d9bbc，34文件；tsc/110域/125全量/Rust24/TLS与生产落盘绿；TS红8、Rust红2原字节恢复绿；done/patch齐备，LIGHT释放。

- 2026-10-11 13:07:13 RR23 🟢已闭环：98d9bbc→main1f67601，全树恒等；主仓tsc/125tests/cargo check --tests绿，生产status+额度落盘已实证。worktree安全拆除，分支归档保留，LIGHT/MERGE释放；下一卡RR15，UI RR27待前置。

- 2026-10-11 13:08:01 RR15 🟠在飞：S1011-RR15，agent/RR15基线1f67601；日志路径汇流与app真实记录，严格TS单一幂等实现。

- 2026-10-11 13:23:17 RR15 🟡待合入：a246165，52文件；tsc/118域/137全量/Rust29/Node8，4类变异红恢复，release+真实自动记录/重启不重复/脚本互读绿；LIGHT释放，done/patch齐备。

- 2026-10-11 13:25:31 RR15 🟢已闭环：a246165→main44f2bba，52路径及全树恒等；主仓tsc/137tests/Node8/Rustcheck/calibrate绿，生产日志已自动生成并验证重启不重复。worktree安全先拆junction再移除、branch归档、wip归档；LIGHT/MERGE释放，下一RR18历史更新/regular筛选。

- 2026-10-11 13:27:05 RR18 🟠在飞：S1011-RR18，agent/RR18 base44f2bba；7日守卫与脚本刷新、regular/banked消费者核对，旧golden保留原字节。

- 2026-10-11 13:38:55 RR18 🟡待合入 62d71e1；真实历史60/54/6，7日守卫，旧golden归档，VM历史元数据；四绿及3红恢复，生产日志保留；LIGHT释放。

- 2026-10-11 13:40:27 RR18 🟢已闭环 main7e406e0←62d71e1；全树恒等，主仓tsc147/Node30/calibrate绿；worktree安全拆除、旧日志保留；MERGE释放，下一RR19。

- 2026-10-11 13:41:45 S1011-RR19 领RR19 LIGHT，base7e406e0；Node CI入口/全套件覆盖/失败传播/版本对账。

- 2026-10-11 13:47:17 S1011-RR19 🟡交付3edf240，四绿/Node34/结构YAML/4红恢复，LIGHT释放；占MERGE自合入。

- 2026-10-11 13:48:23 RR19 🟢已闭环 3edf240→main17fc22c，全树恒等、tsc147TS/34Node/结构YAML/版本绿；安全拆worktree，LIGHT/MERGE释放；下一RR16。

- 2026-10-11 13:49:23 S1011-RR16 🟠领卡LIGHT；base17fc22c，watch有效性/既有25%权重/校准分列。

- 2026-10-11 14:00:37 RR16 🟡待合入（f7890a5，39路径，tsc/146域/170全/37Node/4红恢复/Vite/native/生产null-watch与361B保留；done/patch齐）。

- 2026-10-11 14:01:31 RR16 🟢已闭环（f7890a5→main299c1d5，树恒等；主仓tsc/170/37Node/校准绿，worktree先安全拆junction再移除，wip移档，branch保留归档）。

- 2026-10-11 14:02:09 S1011-RR17 领卡LIGHT；base299c1d5，修正预测目标24h并自动对账。
- 2026-10-11 14:36:30 RR17 🟡待合入：agent/RR17 @657da35 单commit基于main299c1d5；四绿147/177/38Node；三组变异红恢复；自动对答案产物data/calibration.json+docs报告落地；详见task_logs/RR17_done.md。
- 2026-10-11 14:40:30 RR17 🟢已闭环 main971be17；主仓复验tsc/177TS/38Node绿。→下一卡RR28（校准摘要只读桥接）。
- 2026-10-11 14:48:20 RR28 🟡待合入：c53fc42；只读桥接（脚本写应用目录快照→Rust读→TS映射→VM）；182TS/38Node/Rust32；详见task_logs/RR28_done.md。
- 2026-10-11 14:53:00 RR28 🟢已闭环 main c546b52；主仓复验绿。→下一卡RR27（照六图UI重构）。
- 2026-10-11 15:40:00 RR27 🟡待合入：95c3a98；三态UI/主题/SVG/全状态/截图三轮复审8/8；详见task_logs/RR27_done.md。
- 2026-10-11 15:45:30 RR27 🟢已闭环 main a362c4e；主仓复验绿。→RR12第2轮REVIEW。

### RR29 | P3 | 🔧修卡🟠待领 | ui | 立卡 S1011-RR12r2（REVIEW 第2轮 G1）
- 现象：RR27 已实测 Escape/按钮可达，但 NOACTIVATE 点击激活后的 Tab 全键盘遍历顺序、深浅主题逐前景/背景组合 4.5:1 对比度数值、credits-zero 决策卡视口截图未逐一留证。
- 证据：docs/review-20261011-round2.md G1；RR27_done 排障遗产三条；docs/screenshots/ 现有 12 张缺口。
- 修向：computer-use/CDP 键序探针遍历三态控件并截图；对比度按 widget.css token 实值逐组合计算留档；补拍 credits-zero 顶部视口。
- 验证口径：键序覆盖全部可交互控件；对比度报告（每组合值+出处）；新截图过识图子代理。
- 状态行：2026-10-11 15:50 🟠待领（未领不占槽）。

### RR30 | P3 | 🎣挖卡🟠待领 | docs+发布 | 立卡 S1011-RR12r2（REVIEW 第2轮 G2）
- 现象：CI（windows-latest=MSVC）release 产物是否内嵌/生效 dpiAware 未取证；RR20 只实证了 GNU 路径。
- 证据：RR20_done MSVC 注记；.github/workflows/release.yml runs-on: windows-latest；TRUTH B10。
- 修向：用户 push 触发 CI 首跑后，下载产物 dump manifest/实证 DPI 声明；无声明则立修卡补 MSVC 分支。**依赖用户执行 push（发布动作留给用户）。**
- 验证口径：MSVC exe manifest 原文或等效实证落 task_logs；结论回填 TRUTH §2。
- 状态行：2026-10-11 15:50 🟠待领（依赖用户 CI 首跑；未跑前不可宣称验证）。

### RR31 | P1 | 🔧修卡🟠在飞 | ui | 立卡/领卡 S1011-RR31（用户在线指定）
- 现象：用户三条反馈——①展开面板不要右侧滚动条，改成多个模块点进去看；②04b-light-bottom 顶部有一行小字「爆出来」（吸顶栏 0.97 半透明，滚动内容透出）；③demo-credits-unknown 顶部同样透出。
- 证据：用户消息原文（TRUTH §U 2026-10-11 追加）；docs/screenshots/20261011-rr27-04b-expanded-light-bottom.png 与 demo-credits-unknown.png；DashboardPanel.module.css .header background: var(--bg-panel)（rgba 0.97）。
- 修向：展开面板改分页模块（概览/风险/用卡/数据四页签，常驻顶栏+页签行，每页适配 690 高无滚动）；吸顶栏换不透明背景+分隔阴影；收益图注补「按可消耗量封顶」防误读（本轮用户算法疑问的展示层答复）。
- 验证口径：tsc/UI域/全量/变异红验（页签切换纯函数）；release 截图覆盖四页签×深浅+原异常态，识图子代理复核无滚动条、无顶部透出；hash 页签入口可复现。
- 状态行：2026-10-11 16:05 🟠在飞（LIGHT，用户在线指定优先于 RR29/RR30）。
- 2026-10-11 16:04:00 RR31 🟡待合入：b0cb857；分页模块化+顶栏实底+图注澄清；详见task_logs/RR31_done.md。
- 2026-10-11 16:08:30 RR31 🟢已闭环 main a89369c。→RR29/RR30待领或用户发布。

### RR32 | P3 | 🎣挖卡🟠待领 | ui+assets | 立卡 S1011-1722（用户件务：图标交付归档）
- 现象：生图AI已交付 reset-radar 雷达图标全套（推荐「精密蓝」01-precision；四候选SVG/10尺寸PNG/8帧ico/探索板/handoff三件）；handoff 明示接入须在原工程完成，当前 src-tauri/icons/ 仍是 Tauri 默认图标。
- 证据：docs/design/icons-20261011/（整包归档，SHA256SUMS 40/40 核验通过）；handoff/设计与接入说明.md（接入四步）；tauri.conf.json bundle.icon 现指默认五件（32x32.png/128x128.png/128x128@2x.png/icon.icns/icon.ico）。
- 修向：按 handoff 接入——icons/reset-radar.ico 与对应 PNG 更换 src-tauri/icons/（icns 无交付，Windows 目标不受影响，保留现件并注明）；UI 内品牌 logo 可换 source/reset-radar-mark.svg 造型（浅色底用 02-glass 配色，勿将亮色透明标放白底）；重建后核 exe/任务栏/窗口图标与 100%–200% 缩放（shell 图标缓存可能延迟显示旧标）。
- 验证口径：release 构建后 exe 内嵌图标实证（资源转储或截图）；识图子代理复核两主题下界面 logo 可见；check-release 门禁如涉及 README 图则同步过。
- 状态行：2026-10-11 17:22 🟠待领（未领不占槽）。

### RR33 | P2 | 🧱修卡🟠在飞 | license+docs | 立卡/领卡 S1011-RR33（用户在线裁决：如实声明）
- 现象：移植文件头与 README 已署名 codex-cockpit（MIT），但未保留对方版权行（Copyright (c) 2026 Quota Float contributors）；MIT 条款要求实质性复用携带原版权与许可声明。用户裁决不走重写路线，走如实声明。
- 证据：逐行比对实测定档——resetCard.ts 331 行中 263 行与原文相同（~77%）；codex.rs 握手段约 300 行同文；planner.ts 约 46 行公式段同源；risk.ts 思路重写非逐字；README 致谢已有链接与版本；TRUTH §1 来源3。
- 修向：新增 THIRD_PARTY_NOTICES.md（对方 MIT 许可全文 + 复用清单表）；resetCard.ts/codex.rs/planner.ts 头部补原版权行；risk.ts 补声明指引；README 致谢补版权行与声明链接。
- 验证口径：typecheck/域/全量 vitest/Node38（注释与文档级改动，全量即覆盖）；cargo check --tests（触及 .rs）；check-release（README 链接门）；变异红验不适用（无可执行代码变更，理由记 done，沿 RR12 artifact 批口径）。
- 状态行：2026-10-11 17:44 🟠在飞（LIGHT，用户在线指定，S1011-RR33）。
- 2026-10-11 17:49:59 RR33 🟢已闭环 main 8aa944d；主仓复验绿（tsc/238/check-release/cargo check）。重叠度定档与声明全文见 done 与 THIRD_PARTY_NOTICES.md。
- 2026-10-11 18:05:00 RR32 🟡待合入（agent/RR32 @3237e5b 基于 77c8e0c；22文件+238/−12；tsc/域91/全量248/Rust check/check-release 绿；变异红验两组；release exe 内嵌=交付 ico 8 帧字节逐帧命中+识图 6 图 PASS；详见 task_logs/RR32_done.md。会话 S1011-1735）
- 2026-10-11 18:08:00 RR32 🟢已闭环 main 7e5dffa←3237e5b 树恒等（22路径0字节）；主仓复验 tsc/248全量/cargo check/check-release 绿；双 junction 先拆 worktree 移除、branch 归档。→RR29 待领（RR30 依赖用户 CI 首跑）。
