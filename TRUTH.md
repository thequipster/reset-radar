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
