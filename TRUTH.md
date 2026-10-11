# TRUTH — reset-radar 证据锚点登记簿

> 规则：只登记**已验证**的事实（有出处可复核）；每个条目带来源。修正旧条目=保留原文+〔勘正〕括注。
> 挖卡会话回填；修卡引用本簿条目作为真值出处。

## §1 证据源清单（改动允许引用的事实源）

| 来源 | 位置/方式 | 说明 |
|------|-----------|------|
| Codex 官方接口 | 本机 codex CLI `codex app-server --stdio`（JSON-RPC：initialize → initialized → account/rateLimits/read）；credits 接口 `https://chatgpt.com/backend-api/wham/rate-limit-reset-credits` | 额度/窗口/重置卡数量的唯一权威。请求握手序列与字段名参考 codex.rs |
| codex-resets.com 公开历史 | `https://codex-resets.com/api/v1/resets?limit=100&order=desc` 与 `/api/v1/status` | 强制重置历史日期（announced_at 字符串数组）——风险校准的数据源 |
| 参考实现（MIT） | `C:\Users\slsjz\.zcode\workspace\default\quota-analysis\codex-cockpit`（HouSiyuan2001/codex-cockpit v0.3.0-beta.5 完整源码） | 借鉴算法思路时的出处仓。重点文件：`src-tauri/src/reset_forecast.rs`（风险因子）、`src/lib/dynamicQuota.ts`（配速公式）、`src/lib/resetCard.ts` + `docs/reset-card-planner.md`（重置卡规划器，初始化会话亲手写的，可直接移植）、`src-tauri/src/codex.rs`（app-server 握手） |
| 本机工具链事实 | 见 §2 锚点 B01–B05 | 构建环境实测结论，夜间会话必读 |
| Node官方文档 | https://nodejs.org/docs/latest-v24.x/api/typescript.html 与 https://nodejs.org/api/cli.html#--test | Node24内置类型擦除与node:test命令；CI配置沿既有Node24，脚本实测另记 |
| 用户裁决 | 本文件 §U 各条 | 最高层级，覆盖一切推断 |

## §2 已确认锚点

### B01 gnu 构建 Tauri 必带 custom-protocol 特性（初始化会话实测 2026-10-10）
- 机制：`cargo build --release` 裸跑出的 exe 会去连 devUrl（localhost:1420），运行白屏，
  webview 显示"localhost - 网络错误"。必须 `cargo build --release --features tauri/custom-protocol`。
- 出处：初始化会话在 quota-float 复刻构建时实测（task_logs 归档前的排障记录）。

### B02 gnu 产物动态依赖 WebView2Loader.dll（实测 2026-10-10）
- 机制：windows-gnu 构建的 exe import `WebView2Loader.dll`（MSVC 构建则静态链入，单文件免依赖）。
  gnu exe 必须与该 dll 同目录分发。dll 现成位置：
  `C:\Users\slsjz\.zcode\workspace\default\quota-analysis\codex-cockpit\src-tauri\target\debug\build\webview2-com-sys-af1d3331ed152cca\out\x64\WebView2Loader.dll`（160KB）。
- 出处：objdump -p 对比新旧 exe 的 DLL Name 表。

### B03 工具链 PATH 必须用 MSYS 风格（实测 2026-10-10）
- 机制：Git Bash 里 `export PATH="C:/...:..."` 传给 rustc 子进程会失效（dlltool "program not found"）；
  必须 `/c/Users/slsjz/...` 风格。Rust gnu 工具链：`~/.cargo/bin`（stable-x86_64-pc-windows-gnu 1.99）；
  完整 MinGW（gcc/dlltool/as，winlibs 16.2）：`C:\Users\slsjz\.zcode\workspace\default\quota-analysis\toolchain\mingw64\bin`。
- 出处：三次构建实测，见 RUNBOOK §10。

### B04 本机 npm/cargo 国内镜像已配（实测 2026-10-10）
- 机制：cargo 已配 rsproxy.cn 镜像（~/.cargo/config.toml）；npm registry 默认源可用但 GitHub 下载
  ~180KB/s（限速在本地网络）。npm ci 一个 Tauri 前端约 1 分钟。

### B05 参考项目可作 UI 验收参照（实测 2026-10-10）
- 机制：参考实现（改造版）已装于 `D:\Users\slsjz\AppData\Local\Codex Cockpit\quota-float.exe`，
  配置目录 `%APPDATA%\app.codexcockpit.desktop`。本项目 UI 卡可对照它做截图对比，但
  **绝不修改该安装目录任何文件**。

### B06 双日边界陷阱（实测 2026-10-10）
- 机制：参考项目 `usageDateKey`（04:00 记账日）与北京零点两套边界混用，曾致用卡规划日期标签差一天。
  本项目全项目唯一边界=北京零点（D004）。

### B07 codex-resets.com 真实历史夹具与 API schema（RR03 会话实测 2026-10-11）
- API schema（GET /api/v1/resets?limit=100&order=desc → 200）：
  `{ data: [{ id, reset_type, announced_at, text, source: { type, author?, url } }], pagination: { has_more, next_cursor }, meta: { api_version, generated_at } }`；
  GET /api/v1/status → 200：`{ data: { latest_reset{同上}, scheduled_reset, active_watch, stats: { total, last_reset_at, days_since_last, avg_interval_days } }, meta }`。
  announced_at 为 ISO-8601 毫秒 Z 串。注意：本机 curl(schannel) 对该域握手偶发失败，node fetch(OpenSSL) 稳定 200——探活用 node。
- 夹具：`data/resets-history.json`（scripts/fetch-history.mjs 生成，schema `reset-radar/resets-history@1`）：
  `{ schema, fetchedAt, sources, upstream{apiVersion,generatedAt,pagination}, status{…/status.data 原样}, events[], summary }`；
  events 为清洗后（解析失败丢弃/未来容差 5min/倒序/相邻 5min 去重，/status 的 latest_reset 并入——移植自 reset_forecast.rs:103-132）
  的 `{ id, resetType, announcedAt, text, sourceType, sourceUrl }`，announcedAt 统一为 ISO 毫秒 Z 串、最新在前。
- 首拉统计（2026-10-11 01:20 +08，meta.generated_at 2026-10-10T17:15Z）：**59 条**（banked 6 / regular 53），
  跨度 2025-09-17 → 2026-10-08（约 386 天），status.stats：avg_interval_days=6.7、days_since_last=2.6；
  **北京星期分布**（D004 边界）：Mon 4 / Tue 10 / Wed 12 / Thu 8 / Fri 7 / Sat 9 / Sun 9
  （Tue+Sat 合计 19/59≈32%——参考实现"Tue/Sat 70% 基线"与真实样本的偏差正是 RR04/RR07 校准闭环的原料）。
- 出处：RR03 会话对两端点的直接实测（响应原文存于上述夹具；task_logs/RR03_done.md 有证据链）。

### B08 本机 gnu 下 cargo test 的 test exe 需补 Common-Controls v6 manifest（RR08 会话实测 2026-10-11）
- 机制：gnu 工具链给 exe 嵌的默认 manifest（longPathAware/asInvoker，在 exe `.rsrc` 节）不含
  `Microsoft.Windows.Common-Controls` v6 依赖；tao/wry 静态导入的 `TaskDialogIndirect`/
  `SetWindowSubclass` 等符号只存在于 comctl32 v6 → test exe 启动即 `0xC0000139
  STATUS_ENTRYPOINT_NOT_FOUND`（bash 下表现为 exit 127 且零输出，易误判 command not found）。
  外置 `<exe>.manifest` 无效（有内嵌 manifest 时外置被忽略）。
- 修法（已实证）：pwsh `UpdateResource` 把含 `<dependency>…Common-Controls 6.0.0.0…</dependency>`
  的 manifest 原位写入 test exe（RT_MANIFEST=24 / ID=1）→ 10/10 全绿；**每次重编译 test exe 后
  需重打**。待正规化：build.rs 里 windres 嵌含依赖的 manifest（RR08 下轮）。
- 另：webview2-com 链入的 `WebView2Loader.dll` 需与 test exe 同目录（`target/debug/deps/`，
  从 `target/debug/build/webview2-com-sys-*/out/x64/` 拷贝），否则 0xC0000135。
- 诊断手法：objdump -p 全量核对 import 表 (DLL,符号) 对（407 对中定位 SYM_FAIL
  comctl32!TaskDialogIndirect）。
- 出处：RR08 会话 S1011-0443 实测（task_logs/RR08_wip.md 有过程链）。
- 〔勘正 2026-10-11 S1011-0643〕已正规化（agent/RR08 a1f802a）：根因补全——tauri-build 的
  资源经 embed-resource `cargo:rustc-link-arg-bins` 只进正式 bin，test exe 只剩 gcc spec
  `%{!shared:%:if-exists(default-manifest.o%s)}`（winlibs `x86_64-w64-mingw32/lib/`）链入
  的默认 manifest。build.rs 以 `embed_resource::compile_for_everything`（通用
  `cargo:rustc-link-arg=`，覆盖 `#[test]` unit test binary；`-tests` 变体只认 `[[test]]`
  target 会被 cargo 拒指令）补一份与 bin 同源 manifest → cargo test --lib 直接 10/10，
  无需手工补丁。副作用：链接 warning `.rsrc merge failure: multiple non-default manifests`
  （ld 对 bin/test 各有两份同内容 CC manifest）——无害，加载器取任一份都含 comctl32 v6；
  release app 冒烟实证可运行。MSVC 构建不走该分支（build.rs 按 TARGET_ENV=gnu 门控）。

### B09 本机 gnu 下 `tauri dev` 同死路；agent 会话输入注入不可达（RR09 会话实测 2026-10-11）
- 机制①：`npm run tauri dev` 走 dev 模式会链接 cdylib（`reset_radar_lib.dll`）——与 §8-2
  `cargo test` 全量同型的 gnu ld 失败：`export ordinal too large: 94564`。dev 模式在本机
  不可用；运行验证一律走 release 路径：`cargo build --release --features
  tauri/custom-protocol`（B01 特性必带）后直跑 exe。
- 机制②：工位 agent 会话无前台权（SetForegroundWindow / 最小化+恢复均 FOREGROUND=False），
  `mouse_event`/`SetCursorPos` 注入的点击不落目标窗口（两截图 MD5 相同实证）。可行/不可行
  分界：**PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT=3) 可离屏渲染 WebView2 内容**
  （窗口无需前台）；交互类验证需 computer-use 技能的 SDK 注入，或改 UI 支持状态入口
  （如 `location.hash=#expanded`）再重启进程截图。CopyFromScreen 会被遮挡窗口污染（弃）。
- 另：mklink 经 Git Bash 传 `src-tauri\target` 反斜杠会被吃成根目录杂名 junction——建
  junction 用正斜杠命名参数；junction（node_modules）须在 `git worktree remove` 前拆除，
  且 `git add -A` 前先查 `git status`（junction 会被当目录展开暂存）。
- 出处：RR09 会话 S1011-0713 实测（task_logs/RR09_done.md 排障遗产节）。
- 〔补记 2026-10-11 S1011-0843〕上条"先拆 junction"是**硬前提，违反即事故**：RR11 合入时
  `git worktree remove` 在 junction 尚在的情况下执行，git 递归**进入 junction 把目标
  （主仓 node_modules）内容当 worktree 文件删除**（主仓 .bin/部分包被删，报
  `failed to delete ... Invalid argument` 后中止）。次生坑：经 junction 加载过主仓原生模块
  的遗留进程（本例 RR09 会话 07:21 起的 vite/esbuild 僵尸进程）会令修复时 `npm ci` 连环
  EPERM——先 `pwsh Get-CimInstance Win32_Process` 找 reset-radar 路径进程杀净再 `npm ci`。
  正确拆除顺序：①确认/拆除 junction（cmd rmdir，只删链接）②杀经 junction 加载模块的进程
  ③`git worktree remove`。事故已当场修复（npm ci 重装，86/86+tsc 复绿）。

### B10 gnu 自建 exe 内嵌 manifest 无 dpiAware 声明——200% 缩放下 CSS 视口=窗宽/2（RR13 会话实测 2026-10-11）
- 机制：B08 正规化所嵌的 manifest 只含 Common-Controls v6 依赖，未保留 Tauri 默认 manifest 的
  `dpiAware`（PerMonitorV2）声明 → 进程 DPI 无感知 → 窗口按**物理像素**创建，WebView2 的
  CSS 视口 = 窗宽 ÷ 系统缩放比。本机 AppliedDPI=192（200%）：`width:460` 的窗口 CSS 视口
  仅 230px，胶囊（浏览器实测自然宽 421 CSS px）必然右截断；420/460 两窗宽截图的切点位置
  与 210/230 CSS 视口模型逐字符吻合（识图子代理两轮实证）。
- 推论：任何"窗宽 X 能放下胶囊"的裁决在缩放比 ≠100% 的机器上都不成立，UI 尺寸问题先查
  本锚点再谈像素；根治=manifest 补 dpiAware（RR20，data-layer 域）。
- 排查工具链：IAB 浏览器 vite preview 实测组件自然宽（注入文案量 scrollWidth）+ 注册表
  AppliedDPI + exe 内嵌 manifest 直接 dump（python 读 `<assembly` 段）。
- 出处：RR13 会话 S1011-0913 实测（task_logs/RR13_wip.md 证据链节）。

## §8 黑名单（已证伪/已知坑——绝不重踩）

> 以下均初始化会话实测踩过，任何会话不得以任何理由重新引入；确有新证据要翻案，先立挖卡。

1. **裸 `cargo build --release` 出可运行 exe** —— 假（见 B01）。
2. **windows-gnu 下 `cargo test` 全量** —— cdylib 链接 `export ordinal too large` 失败；用
   `cargo test --lib` 或 `cargo check --tests`。
3. **Git Bash 传 Windows 风格 PATH 给 rustc** —— 失效（见 B03）。
4. **`powershell.exe`（5.1）** —— 用户环境约定禁用，一律 `pwsh`。
5. **手改 `data/predictions.jsonl` 或夹具数值** —— 数据锁（RUNBOOK §1.5），预测日志只能由代码追加。
6. **在算法里引入 >6 参数曲线/DP 价值表** —— 违反 ARCHITECTURE §5 复杂度红线，直接作废。

## §U 用户裁决记录

### 2026-10-11 项目立项（初始化前）
- 要旨：用户要「属于自己的、发到 GitHub 的」项目；初始化期（当晚）用户离线，一切由 AI 决定；
  任务卡按 perpetual-board 协议分配，末卡为「启动循环迭代」。
- 影响：全部初始化决策（DECISIONS.md D001–D009）与首批卡（RR01–RR12）。

### 2026-10-11 前端重设计阶段裁决（RR26，用户在线指令）
- 阶段1候选与阶段2 UIUX 获用户认可，现进入阶段3。用户原文：“风格配色我不希望会限制到生图AI，只需要告诉他会有什么uiux就行，进入第三阶段，给我提示词”。
- 效力：阶段3提示词只约定UI内容、层级、交互、状态与数据语义；具体配色hex、字体、材质、圆角及风格由图AI探索，选中参考图后才确定实施视觉；覆盖原任务要求的具体配色hex与风格词。
- 阶段4范围：用户先前新增授权“除了改前端，其他卡片的任务也由你来执行”，按看板依赖逐卡执行；仍遵守一次一卡、槽位互斥、参考图停点和不push。
- 文档：docs/design/01-proposals.md、02-spec.md、03-image-prompts.md（agent/RR26统一落档；前两份先前独立审阅草稿保持原件）。

### 2026-10-11 阶段4授权及公告核验（RR22）
- 用户原文：“继续第四阶段”；六张参考PNG已到RR26/ref。本轮复制入RR22/ref，原名/字节保留，逐文件SHA256相等。
- B07回源：task_logs/RR22_artifacts/status-live.json，2026-10-11T04:33:44.170Z；latest_reset.id=2109132167112782291，announced_at=04:01:09Z，reset_type=regular；scheduled_reset与active_watch均null。旧公告不能作为当前计划继续清仓。
- https://codex-resets.com/ 首页解释banked为需主动兑换的保存卡，不自动回满额度；regular未来公告可作为规划情景，未确认落地不能写已重置。决策D022；以API响应原文为当前事实，搜索索引上的旧计划不覆盖它。

### 2026-10-11 RR23 运行时公告实证（B07追加）
- reqwest 0.12.28/rustls通过默认TLS校验实拉/status，Accept:application/json，总超时4s；`task_logs/RR23_artifacts/tls-live.txt`为Rust原始响应与解析结果。成功fetchedAt=2026-10-11T05:03:40.171424200Z，freshUntil=05:18:40.171424200Z；generated_at=05:03:01.289Z。
- latest_reset.id=2109132167112782291、reset_type=regular、announced_at=2026-10-11T04:01:09.000Z；scheduled_reset和active_watch均null。新增15分钟缓存、失败保留旧字段但不用于行动的契约，详见docs/runtime-status-20261011.md及D024。
- 单测24通过/1手动网络测试默认忽略；显式网络测试1通过。轮询900秒误改60秒令缓存边界及freshUntil测试失败，原字节恢复24通过。
- GNU release带custom-protocol实跑：`task_logs/RR23_artifacts/production-cache-smoke.json`，owned PID32568启动于05:05:10Z且已关闭；额度status=ok、observedAt=05:05:13.773898400Z；公告status=ok、fetchedAt=05:05:12.553657700Z，成功落于app.resetradar.desktop/last-snapshots.json，两时钟分开。

### 2026-10-11 RR15 生产预测日志汇流实证
- 路径回源：Tauri2.12.2安装源码src/path/desktop.rs:239（dirs::config_dir/identifier）与官方https://v2.tauri.app/reference/javascript/api/namespacepath/#appconfigdir，当前tauri.conf.json:5 identifier=app.resetradar.desktop，无override。Windows生产落APPDATA/app.resetradar.desktop/predictions.jsonl，与last-snapshots同目录；其他平台仅分支单测。
- 本卡app真实生成首条记录，文件创建时刻2026-10-11T05:17:20.7454402Z、row fetchedAt=05:17:20.742Z、date=2026-10-11、predictedRisk=44；CDP只读main.dataset.predictionLogState=ok且tauri=true，未调用写命令造数据。此前运行目录文件不存在；证据production-log-first-verified.json与production-dom-first.json。
- 重启ownedPID30192：05:18:12Z重新采集成功，日志188bytes→188bytes完全相同，无遗留.lock；production-restart-idempotent.json。默认calibrate实际同时读取仓内1行+应用1行，--path生产文件仅读1行；今日未完结，计分n=0，未伪造命中率。两份报告在RR15_artifacts。
- TS137/137、Rust29passed+1手动网络ignored、Node6/6；目标日/额度独立/路径/CAS变异均红且原字节恢复绿。完整门禁与借鉴出处见RR15_done.md；新幂等业务仍唯一src/lib/predictions.ts，不在Rust复算。
- RR15最终复验补记：Node补测未知/重复参数和读失败，8/8绿；最终release ownedPID31512在05:21:45Z启动，重新采集来源ok，刷新前后CDP hook=ok、日志188字节完全不变、锁已释放（production-verified-idempotent.json）。首轮时间探针用ConvertFrom-Json默认DateTime转换丢原ISO时区，已改-DateKind String；新鲜缓存可先完成风险记录，探针必须另等实际后台新采集，不能将一次早观察当采集失败。

### 2026-10-11 RR18 历史刷新实证（B07追加）
- REVIEW入口真实拉两个HTTPS API后生成data/resets-history.json，fetchedAt=2026-10-11T05:33:27.738Z；60条原始事件（54regular、6banked），最新regular.id=2109132167112782291、announcedAt=2026-10-11T04:01:09.000Z；regular北京星期Sun..Sat=[10,4,10,10,7,5,8]。原始status与sources随夹具保留，诊断及核心消费结果见RR18_artifacts/review-refresh.txt、consumer-live.json。
- 采集前原始59条夹具原字节复制src/lib/__tests__/fixtures/resets-history-20261010.json，SHA256=D3E54A8F986FC8E0E214DF5D2F4A089AA0EF4FD80E7BA1F1BFD3FD8A27F347D5，旧golden统计不因联网更新而重写。
- 当前calibrate双源各1行、今日未完结计分n=0；7日严格边界/非法覆盖/排除banked的实际报告测试通过。说明docs/history-refresh-20261011.md、D026；门禁与生产实证最终见RR18_done。
- RR18生产补验：GNU custom-protocol ownedPID26652，新来源fetchedAt=2026-10-11T05:36:33.524549900Z、quota/source均ok；只读CDP风险32.1%、hook=ok。输入变化后自然追加32.1，日志188→361字节，44的旧行及原前缀不变，无锁残留， owned进程已关闭。最终报告归档1+应用2行仍n=0；production-history-verified.json、production-dom-fresh.json。

### 2026-10-11 RR19 脚本门禁实证
- CI/release都新增npm run test:node，入口递归发现5个测试文件（包含scripts/tests/prediction-log.node.mjs），本机Nodev22.23.1真实34/34通过；既有CI Node24配置未改，官方类型擦除文档登记§1。清单node-inventory.json，原文node-restored.txt。
- 两YAML actionlint1.7.12退出0，check-ci/release结构守卫通过；删除步骤/软失败/遗漏嵌套/吞退出码4变异均红且原字节恢复复绿，mutation-proof.txt。前端/核心147/147与tsc退出0。版本保持0.1.0、13个README相对链接有效；没有远端runner运行或发布动作。


### RR16 watch来源复核（2026-10-11）
- MIT reset_forecast.rs:8,76-83,229-265定义5min容差、watch字段、25%融合和active校验；本卡src/lib/watchSignal.ts复用源约束，risk.ts仅导出既有weight并保存counterfactual，不增加新权重。
- /api/v1/status现场原文见task_logs/RR16_artifacts/status-live.json，fetchedAt记录实际抓取，active_watch:null；合成80%测试不能作为生产watch证据。当前watch同样本比较n=0，两列指标null。
- 前瞻窗口来自本项目risk.ts未来24h定义；旧四字段日志没有窗口/无watch基线，禁止倒填。通用旧calendar join待RR17修复，不据本卡报告宣称历史权重提升。

### 2026-10-11 用户 UI 反馈（RR31，用户在线指令）
- 原文要点：①不想要展开面板右侧滚动条，「多做几个模块点进去看就不用划了」；②04b-light-bottom 最顶上一行小字疑似爆出；③demo-credits-unknown 顶上同样疑似爆出；④疑问：收益越往后越高是否意味着全建议自然重置前一天用卡（担心亏爆）。
- 裁决：展开面板信息架构从「单页纵向滚动」改为「页签分模块」，覆盖 02-spec §3.4 的单页滚动线框（用户指令为最高层级）。
- 算法疑问核查结论（无缺陷，不立卡）：期望收益=用卡后至下次重置的可消耗增量（resetCard.ts consumed() 封顶）× 强制重置存活折价；补给规模本身不入账。短视界（临重置1-2天）曲线单调上升、满周视界中间隆起均属真实形状；当前真实数据（84%余量）收益全 0、决策 hold-until-depleted。
