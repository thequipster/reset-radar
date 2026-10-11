# DECISIONS — 初始化决策日志（AI 决定，全部留痕）

> 规则：初始化期用户离线，所有决策由 AI 依据 docs/ARCHITECTURE.md 的原则做出，逐条编号记录。
> 用户回来后任何一条都可以用「用户裁决」推翻：在 TRUTH.md §U 登记即生效，并立卡执行。

## D001 项目名与定位（2026-10-11）

- 名：**reset-radar**；中文名「重置雷达」。
- 定位：**看得见准头的 Codex 重置风险与用卡规划器**。不是又一个额度悬浮窗——核心差异是
  「校准闭环」：每条风险预测都被记录、事后对答案（Brier 分数/命中率），模型准不准摆在明面上。
- 决定依据：用户明确要「属于自己的、可发布的」项目；对参考项目的批评共识是
  「模型复杂度超过了信号质量」，本项目反其道行之：可验证优先于精巧。

## D002 技术栈（2026-10-11）

- Tauri 2 + React + TypeScript + Vite（UI 薄壳）；核心算法全部放 `src/lib/` 纯函数（零 React 依赖）；vitest 单测。
- 决定依据：参考项目验证过这条路的可行性（21MB 单文件、低内存）；纯函数核心使其 493 个测试可维护。

## D003 仓库即主仓（2026-10-11）

- 本仓库根 = 永续看板主仓（看板五件套 + 源码同仓），worktree 建在仓库外 `../reset-radar_wt/`。
- 决定依据：单人+AI 工位场景，单仓降低协调成本；perpetual-board 协议要求看板读写主仓绝对路径。

## D004 唯一日边界：北京零点（2026-10-11）

- 全项目只允许一种「天」的边界：北京时间 00:00。禁止引入 04:00 记账日等第二套边界。
- 决定依据：参考项目双边界并存导致日期标签差一天的实测 bug（见 TRUTH §8 黑名单）。

## D005 首屏 stale-while-revalidate 内建进 v1（2026-10-11）

- 快照持久化（last-snapshots.json）+ 热启动先画旧值 + 后台刷新，从第一张数据卡就做，不后补。
- 决定依据：参考项目的启动慢根因即为此，后补成本高（我实测修复过整个链路）。

## D006 算法可解释性为强制接口（2026-10-11）

- 任何输出「建议/风险/决策」的函数必须返回 factors 数组（id/label/delta/note），UI 必须展示。
- 决定依据：参考项目 reset_forecast 的可解释因子是它最值得继承的设计。

## D007 MIT License，版权人 thequipster（2026-10-11）

- 参考：借鉴自 MIT 项目 codex-cockpit 的算法思路，落地时在 done/task_logs 注明出处文件，法律与道义双合规。

## D008 单工位起步（2026-10-11）

- LIGHT 槽 ×1（定时任务每 45 分钟唤醒一个会话，一次一卡）。协议本身支持多工位，等首版跑顺再扩。

## D009 构建与发布路径（2026-10-11）

- 本机开发验证：windows-gnu 工具链（已装好，见 RUNBOOK §10）；正式发布：GitHub Actions
  windows-latest（MSVC）构建。gnu 产物需带 WebView2Loader.dll 的坑已登记 TRUTH，发布以 CI 为准。

## D010 RR01 合入前 scripts 域卡的门禁等价口径（2026-10-11，会话 S1011-0113）

- 现象：RUNBOOK §5 门禁①②③ 以 tsc/vitest 为工具，但二者要等 RR01（脚手架）合入主仓才存在；
  RR03（scripts 域、零 TS、仅依赖 node）按建议顺序先于 RR01 合入开工，字面上无法执行 §5 ①②③。
- 决定：RR01 合入前的 scripts 域卡，以「**卡面验证口径 + node:test（node 22 内建测试器，零 npm 依赖）
  + 变异红验**」作为门禁四绿的等价物；不为跑测试引入任何 npm 依赖（避免与 RR01 脚手架的
  package.json/lock 产生路径冲突）。RR01 合入后本条款即失效，后续一切卡回到 §5 全口径。
- 依据：ARCHITECTURE §2 分层——scripts/ 属证据层（数据采集），不属核心层 TS，用 node 内建测试器
  与其依赖极简定位一致；RUNBOOK §1.11 无人值守决策权。本决定不引用 §5 降级条款（该条款仅 RR01 专属）。
- 实施例：RR03 以 `node --test scripts/fetch-history.test.mjs`（12 用例）作域/全量门禁，
  变异红验两轮（去重窗口 5→0、未来容差 5→0）均如期转红、复原转绿，证据见 task_logs/RR03_done.md。

## D011 RR01 合入前 docs+发布域（纯 yaml/md）卡的门禁等价口径（2026-10-11，会话 S1011-0143）

- 现象：RR02（CI 建卡）基于 main 开工时主仓尚无 package.json（RR01 未合入），tsc/vitest 无对象，
  字面无法执行 RUNBOOK §5 ①②③；D010 仅覆盖 scripts 域。
- 决定：纯 yaml/md 卡以「actionlint + PyYAML 双语法校验 + 结构断言脚本 `scripts/check-ci.py`
  （把卡面『步骤结构与修向逐条对照』实现为可复现断言，兼作变异红验靶）+ 变异红验」作为门禁
  四绿的等价物；全量 vitest 基线以 RR01 worktree 复跑复核（本卡零 TS 改动）。RR01 合入后失效。
- 依据：D010 同构延伸；RUNBOOK §1.11 无人值守决策权。
- 实施例：RR02 以 actionlint 1.7.12（exit 0）+ PyYAML 6.0.3 parse OK + check-ci.py 绿 +
  三变异红验（删 vitest 步骤/改 ubuntu-latest/撤徽章均红→复原绿）交付，RR01 worktree 基线 4/4 绿。

## D012 CI 徽章 owner 取 thequipster（2026-10-11，会话 S1011-0143）

- 现象：Actions 徽章 URL 需完整 owner/repo，而 GitHub 仓库尚未创建（发布留给用户，RUNBOOK §1.7）。
- 决定：徽章指向 `thequipster/reset-radar`；依据 git config user.name=thequipster + D007 版权人
  同名先例。若实际 GitHub 用户名不同，RR11「README 内链接全部可达」检查兜底替换。
- 依据：RUNBOOK §1.11 无人值守决策权。

## D013 MERGE 槽集成修复权：测试运行器接线类回归可在合入内直修（2026-10-11，会话 S1011-0213）

- 现象：RR01（vitest 骨架）与 RR03（scripts/ 下 node:test 套件）单独门禁全绿，合并后
  `npx vitest run` 全量出现文件级 failed——vitest 默认 include `**/*.test.mjs` 误载
  `scripts/fetch-history.test.mjs`（node:test 语法，vitest 转换器无法解析）。全量基线
  「0 failed」被打破，且 RR02 的 CI 同样会红。
- 决定：MERGE 槽在合入复跑门禁时发现**纯集成接线回归**（测试运行器/构建配置接线、零业务
  逻辑、不改 src/lib 算法），允许在主仓以独立 fixup commit 直修并在本文件留痕；超出此口径
  （触及业务逻辑/算法）仍退回 🔴重开走卡流程。本次修复：vite.config.ts vitest exclude
  追加 `scripts/**`（node:test 归 `node --test`，RR03 已约定；两套测试运行器职责正交）。
- 依据：RUNBOOK §1.11 无人值守决策权；§8.3 要求主仓复跑门禁不得新增 failed——集成回归
  不修则合入无法闭环；ARCHITECTURE「算法唯一实现源 src/lib」未受影响（改动仅测试接线）。

## D014 beijingWeekday 导出为公共工具（2026-10-11，会话 S1011-0243）

- 现象：RR04 实现星期判定时，D004 的「北京零点边界」需要一个可测试、可复用的单一入口，
  否则 RR05（planner）/RR07（校准）各自内联 +8h 逻辑会产生边界漂移（参考项目 B06 前车之鉴）。
- 决定：`src/lib/risk.ts` 导出 `beijingWeekday(ts)`（UTC 时间戳 → 北京星期 0-6），
  作为全项目星期判定的唯一实现源；测试用 TRUTH §2 B07 的独立核实分布锚定。
- 依据：ARCHITECTURE「算法唯一实现源」原则在边界工具上的延伸；RUNBOOK §1.11 无人值守决策权。

## D015 RR06 移植口径：日键统一 D004 + 配速依赖落位 planner.ts（2026-10-11，会话 S1011-0343）

- 现象：参考实现 resetCard.ts 依赖三件外部物，直接照搬会踩 B06 或复制第二实现。
- 决定：① estimateDailyNeedPercent 的历史日键弃用参考实现 usageDateKey（04:00 记账日，B06 陷阱），
  统一为北京日历键 beijingCalendarDateKey（D004）；② planRemainingQuota（dq:99-118）与
  DEFAULT_WEEKDAY_HAZARDS（dq:6）作为同源依赖移植入 planner.ts 供跨卡复用，resetCard import 消费
  （§1.4 单一实现源）；③ 参考实现未使用的 ResetForecast import 不移植，上游宽类型收窄为
  DailyNeedSample；卡面「决策文案留核心层外」经复核参考实现本就合规（decision 枚举 + reasons 机器键）。
- 依据：D004 全项目唯一日边界；RUNBOOK §1.4 多目标同步；§1.11 无人值守决策权。

## D016 RR07 校准器接线与接口契约（2026-10-11，会话 S1011-0413）

- 现象：① RUNBOOK §9.1 固定命令 `node scripts/calibrate.mjs > docs/calibration-latest.md`，
  但计分算法唯一实现源在 src/lib（TS）——.mjs 直 import .ts 无现成通路（vite-node/tsx 未装，
  加依赖违背最小化）；② 卡面只给了度量定义，scorePredictions 的刻度/同日多行/未完结日/周分组键/
  空输入语义未定，RR10（落盘器）与 RR09（UI）都要消费该契约，不定则返工。
- 决定：
  ① 脚本走 node ≥22.18 原生 type-stripping 直载核心层（本机 v22.23.1 实测两轮冒烟通过）；
    代价=核心层 import 链显式带 `.ts` 扩展（node ESM 解析硬要求）+ tsconfig 增
    `allowImportingTsExtensions`（noEmit 下合法）。不引新依赖、不改 §9.1 命令、§1.4 单一实现源保持。
  ② 接口契约：predictedRisk 全项目 0-100 刻度（assessResetRisk().score 直传）；同日多行取首行
    （ex-ante——当日后续补行已含当日信息，不算事前预测）；未完结北京日（dateKey ≥ as_of 日键）
    不计分；as_of 取历史夹具 fetchedAt（数据新鲜度，与 risk.ts now 语义同源）——夹具滞后时不把
    未覆盖日误判 realized=false；byWeek 分组键=该周周一的北京日历键（规避 ISO 周号跨年归属歧义）；
    n=0 时 brier/hitRate=null（返回 0 会误读为完美预测）。
  ③ `beijingCalendarDateKey` 自 resetCard.ts 导出（D014 beijingWeekday 同例——日键唯一实现源）。
- 依据：RUNBOOK §1.4/§1.11、§9.1 固定命令；ARCHITECTURE §2 分层（脚本=IO 壳、算法在 lib）；
  risk.ts as_of 语义先例；B06（边界漂移前车之鉴）。

## D017 B08 正规化取 compile_for_everything 而非 compile_for_tests（2026-10-11，会话 S1011-0643）

- 现象：B08（gnu test exe 缺 Common-Controls manifest → 0xC0000139）需在 build.rs 正规化，
  embed-resource 提供按 target 粒度的多个 compile_for_* 变体，选型影响 bin 产物形态。
- 决定：① 用 `compile_for_everything`（通用 `cargo:rustc-link-arg=`）——`compile_for_tests`
  的 `cargo:rustc-link-arg-tests` 指令要求包有 `[[test]]` target，本包测试全在 lib 内
  （`#[cfg(test)]`），cargo 直接拒指令（实测报 "does not have a test target"）；通用版覆盖
  `#[test]` unit test binary（embed-resource 3.0.12 文档明示）。② 接受 bin 与 tauri-build
  资源各链一份同内容 CC manifest 的重复（ld warning "multiple non-default manifests"）：
  两份均含 Common-Controls v6 依赖，加载器取任一份行为等价；release app 冒烟实证可运行
  （进程存活+真实握手落盘）。③ 门控 `CARGO_CFG_TARGET_ENV=gnu`——MSVC/CI 不进该分支，
  rc.exe 路径问题不外溢。
- 依据：TRUTH B08 机制链（gcc spec if-exists default-manifest.o / embed-resource
  lib.rs:443 `rustc-link-arg-bins` 只进 bin）；quota-float.exe 单份 CC manifest 实证；
  ARCHITECTURE 最小复杂度（不为消一条无害 warning 引入 -B 遮蔽等更脆机制）。

## D018 RR09 UI 卡可动 tauri.conf.json 窗口参数；浏览器降级 demo 快照口径（2026-10-11，会话 S1011-0713）

- 现象：① 卡面「悬浮胶囊+展开卡」需要窗口高度从 300 放到 560，而 tauri.conf.json 物理上
  位于 src-tauri/（data-layer 域目录）；② `npm run dev` 纯浏览器环境无 `__TAURI_INTERNALS__`，
  invoke 必然失败。
- 决定：① 窗口铬（宽高/标题/装饰）属 UI 交付面：ui 域卡允许改 tauri.conf.json 的
  `app.windows` 展示参数（本卡仅 height 300→560）；域互斥不受影响（当时无 data-layer 卡
  在飞）。Rust 源码（src-tauri/src/）仍归 data-layer 域，ui 卡不碰。② useSnapshots 在无
  Tauri 环境降级为内置 demo 快照（数值=RR08 冒烟实测样本 plan=PLUS/周窗29%/credits3），
  界面显示「demo 数据」标记；demo 快照不参与任何测试断言（adapters 测试全部自构造夹具）。
- 依据：RUNBOOK §4 域互斥本义（防并行撞路径，非禁配置归属）；ARCHITECTURE §2
  （降级壳不含业务规则）；RR08 冒烟落盘实测值复用（TRUTH §1 证据链内）。

## D019 RR10 预测落盘：幂等单一源在 src/lib、落盘器走脚本而非 app（2026-10-11，会话 S1011-0743）

- 现象：① 卡面「同日只在风险值变化超阈值时补行」未给阈值；② 卡域标 core+data-layer，
  落盘执行者可选 app 内（Rust command 写文件）或脚本（node 调 src/lib）。
- 决定：① `PREDICTION_RISK_CHANGE_THRESHOLD = 0.5`（0-100 分制）——risk.score 固定输出
  1 位小数（risk.ts round1），0.5 即显示精度下界：漂移 >0.5 才是可感知变化，≤0.5 视为噪声；
  严格大于才补行（恰等抑制，域测试有边界锚）。② 幂等逻辑单一源 = src/lib/predictions.ts
  纯函数 `appendPredictionLog`；落盘器 = scripts/log-prediction.mjs 薄壳（零算法，先例
  calibrate.mjs D016 node 直载 .ts），as_of=历史夹具 fetchedAt（与 calibrate.mjs 同口径），
  date=as_of 北京日键（D004）。app 内落盘不接：运行时 app 只拿得到 %APPDATA% 路径，与
  校准脚本读取的仓库内 data/predictions.jsonl 断链；证据层归档（版本化、可回测）归脚本，
  RUNBOOK §1.5 数据锁「只由脚本追加」同向。app 内每日评估自动落盘若日后需要，由 REVIEW
  立卡统一裁决路径汇流（如 app 写 %APPDATA% + 脚本合并归档），本卡不预铺。
- 依据：calibrate.mjs 占位文案点名「RR10 落盘器」；ARCHITECTURE §4 数据流（落盘→校准
  回测同一条证据链）；§2 分层（算法只在核心层，IO 是薄壳）；RUNBOOK §1.4 单一实现源。

## D020 RR13 修法裁决：窗宽 460 方案因 DPI 无感知根因作废，转 RR20 manifest 修复 + RR13 复验收尾（2026-10-11，会话 S1011-0913）
- 背景：卡面修向二选一（窗宽 420→460 或压内边距）。执行会话先裁 460+minWidth（胶囊设计
  语言完整、位宽余量、D018 先例），但 release 截图识图复验收**否决**：截断未消除。
- 证据链（详见 TRUTH B10 / RR13_wip）：IAB 浏览器实测胶囊自然宽 421 CSS px（460 窗口本应
  放得下）；注册表 AppliedDPI=192（200%）；exe 内嵌 manifest dump 无 dpiAware → DPI 无感知
  → CSS 视口=窗宽/2=230px → 两轮截图切点与模型逐字符吻合。
- 决定：①卡面两修向在本机缩放下均不能根治，作废（不撤回事实，撤回裁决）；②真根因在
  src-tauri/build.rs 的 B08 manifest 未含 dpiAware——立 RR20（data-layer 🔧修卡）补
  PerMonitorV2；③RR13 保持🟠在飞，续作口径改为「RR20 合入后 460 窗宽复验截图无截断 +
  README 换图收尾」，width 460+minWidth 的 conf 改动保留在 agent/RR13 WIP（1482ca9）。
- 依据：ARCHITECTURE §2 分层（DPI 感知属窗口铬/构建域非 UI 展示层）；证据铁律（装进项目
  前回源核实——识图复验收即回源）；时间盒纪律（不硬撑不跳门禁）。

## D021 呈现方式裁决：对齐参考实现改真·悬浮窗（RR21）（2026-10-11，会话 S1011-1043）
- 背景：用户线上反馈两问——①现呈现方式为何（普通窗口非悬浮窗）②界面观感"一闪而过很
  简陋"。三选项（真悬浮窗/保守微调/悬浮窗+托盘）交用户拍板，用户授权"怎么好怎么改"。
- 证据：胶囊态截图识图实测胶囊仅占整窗 0.6%（460×560 窗为展开态预留高度，胶囊态未
  收紧→大片空白=简陋感主因）；启动等待页纯文字无样式；展开态 460 窄窗右缘溢出/横滚/
  竖排单字/收起按钮视口外（RR14 遗产①）；参考实现 codex-cockpit（TRUTH §1 来源 3）
  src-tauri/tauri.conf.json widget 窗口即真·悬浮窗：decorations:false / transparent:*
  true / alwaysOnTop:true / skipTaskbar:true / shadow:false / focus:false / 初始
  100×100 动态尺寸。
- 决定：采用真·悬浮窗方案（选项 A），立 RR21（ui 域 P1）：窗口配置对齐参考实现 + 胶囊
  态收紧成悬浮条 + 展开动态长高 + 拖动区 + 等待页样式化 + ExpandedCard 窄窗自适应
  （吸收 RR14 遗产①②）。系统托盘（选项 C）不裁死、留 ROADMAP 后续增量。参考实现配置
  借鉴须在 RR21 done 注明出处文件名。
- 依据：用户原始倾向（"之前那个悬浮窗也不错"）；证据铁律（TRUTH §1 登记源，配置逐字段
  回源核实过）；ARCHITECTURE §2 分层（窗口铬属 Tauri 配置域，业务层零改动）；体验-成本
  比（Tauri 原生能力，无新依赖）。

## D022 RR22 公告优先用于规划，不伪造概率；精确边界与证据分离（2026-10-11，S1011-design4）
- 依据：已批准02-spec的公告/模型分列及到期待核实语义；TRUTH B07公开/status；本轮原文task_logs/RR22_artifacts/status-live.json。
- 当前接口2026-10-11T04:33:44Z返回latest_reset时间04:01:09Z，scheduled_reset/active_watch均null；历史卡面的15:00计划不能当当前实况。静态测试公告是注入场景，不修改真实夹具。
- 取消RR22旧卡面“确定性覆盖概率”的推断：第三方计划没有校准可靠性，不能伪造成100%。risk保留统计score，独立返回scheduledReset状态并加delta=0说明；未来有效regular计划优先截短daily与card使用horizon。既有watch25%权重保持单一实现，不新增重复因子。
- 同日2h公告把均匀配速提高到剩余全部份额，但保留原软上限与追加口径；零业务IO。到时/过时只标awaiting-confirmation，不继续清仓、不自动当免费回满、不给公告之后的用卡候选。自然重置时间与统计24h/48h碰撞仍保留原义。
- 卡收益按“公告如期执行”情景计算，planningResetAt明确标记；低收益新增hold-until-scheduled-reset，避免错误称为自然重置。精确计划时刻截断第一日概率质量/消耗，候选日按北京零点边界筛选；无公告分支保持原golden逐字段一致。
- regular=立即额度重置；banked=需手动兑换的卡，不能猜成自动回满，其他未知类型仅展示。事实出处：https://codex-resets.com/ 首页banked解释；来源时效/采集失败交RR23处理，RR22不自设TTL常数。
- RR23适配契约：ScheduledReset{id,status,resetType,announcedAt,scheduledFor,text,source}（camelCase），status仅scheduled参与；取消/非法/尚未发布不采用。未来公告是planned，到精确时刻即awaiting-confirmation；输入now必须显式来自对应数据时间，避免旧额度观测时刻使公告倒计时冻结。watch原第三参数保持后向兼容。

## D023 阶段4参考图采纳与保存（2026-10-11，S1011-design4）
- 用户授权继续阶段4，六张图放在RR26 worktree的ref目录；Luna只读逐图识别，选择纵向展开图为主、横向6:1条为紧凑态，其他补预览/主题/状态/组件，详见docs/design/04-progress.md。
- 图稿只提供布局/视觉依据；数字、日期、风险等级与因子归属不从图抄入产品。保留用户原名并原字节复制到RR22/ref，SHA256对账一致，随卡版本化，以免拆RR26时丢用户素材。
- MERGE后暂保留RR21/RR26 worktree（junction及用户未跟踪素材），不执行递归强拆。后续安全清理另作协调动作，发布仍留用户。

## D024 RR23 公告来源与额度分时钟，失败不等于无公告（2026-10-11，S1011-RR23）
- 依据：ARCHITECTURE分层与出站超时；TRUTH B07 /status；BACKLOG RR23约15min轮询；02-spec来源新鲜度/已过计划待核实；D022禁止伪造必然概率。
- Rust reqwest/rustls进行TLS验证，沿参考Cargo.toml:25配置，4s总超时沿reset_forecast.rs:334；与6s额度采集并行。Client构造失败也返回来源error而非令整个app panic。
- 成功缓存15min；失败保留数据/成功时刻并标error，按同周期重试。freshUntil从成功抓取时刻+轮询期派生，纯TS核心只比较来源边界，零重复TTL常数。成功null清旧计划，缺字段/坏结构报失败；旧磁盘快照不建立新的单调时钟锚点，首刷立即实拉。
- 新鲜来源用当前评估时刻验证公告与latest_reset，不能用旧额度observedAt忽略新发布的计划或继续执行过期计划。VM新增riskEvaluatedAt、resetStatus及独立fetched/generated/lastAttempt时间；额度observedAt与status不被覆盖。
- 最新确认regular事件按时间戳去重并入风险历史；banked只是发卡，不能算自动回满。离线历史已有banked条目，RR18刷新/消费者核对时一并处理；不手改夹具数值。
- sources成功过期与sources失败都保留旧公告展示信息，actionableReset=null；没有整个来源字段时后向兼容旧golden。计划/概率分别显示，React不实现业务策略；watch本卡原样透传，RR16接既有单一权重与比较。

## D025 RR15 生产预测日志路径汇流，Rust仅IO（2026-10-11，S1011-RR15）
- RR15倾向路径被现有Tauri app_config_dir具体化：Windows APPDATA/app.resetradar.desktop/predictions.jsonl，与last-snapshots.json共目录，identifier见tauri.conf.json；mac/Linux脚本对应同一Tauri配置目录约定。无需另建reset-radar目录产生第二条断链。
- ARCHITECTURE要求算法唯一src/lib，覆盖卡面“Rust每日首评幂等”的实现细节：buildPredictionRecord/appendPredictionLog纯TS生成候选与判重，React/Node只是调用，Rust只提供固定路径读盘及expectedContent比较后追加，绝不再写0.5规则或北京日期公式。
- app仅记录真实有效风险评估：公告来源存在但非ok不写；来源新鲜时风险与额度独立，额度失败不抹去有效风险预测。无来源旧契约只有quota为ok才沿原as_of记录。候选date是riskEvaluatedAt北京日，fetchedAt为执行时间；demo不落盘，旧快照不是新的成功预测。
- app与Node用同名predictions.jsonl.lock create_new排他锁，持锁比对读取内容再append，竞争后重读核心重算；只追加新行与必要的末尾换行，不改坏行/旧字节。不自动删未知持有者的锁，失败明确返回busy/error；app有限重试防止永久等待。
- log-prediction默认写生产文件；calibrate默认双源按实际记录fetchedAt稳定排序，同时间归档先，核心继续同日首行。--path指定独立来源方便归档/测试；不自动将生产记录写回受锁数据夹具。RR17/RR28沿本路径消费，历史新鲜度仍交RR18处理。
