# RR08 done — data-layer：Tauri command get_snapshots + 快照持久化 + SWR（D005）

- 领卡：2026-10-11 04:47 S1011-0443（LIGHT）→ 06:47 S1011-0643 §7 接管（双超时：wip 04:57:57 /
  心跳 05:37；对方产物备份 /tmp/takeover/RR08/）
- 分支：agent/RR08 @ **a1f802a**（2 commits：e5f6463 落码 + a1f802a B08 正规化；基于 main dddc641）
- diffstat（dddc641..a1f802a）：7 文件 +924/-8 —— codex.rs(+410)/snapshots.rs(+207)/lib.rs(+143)/
  models.rs(+66)/Cargo.toml(+7)/Cargo.lock(+70/-3)/build.rs(+45/-1)
- patch 备份：task_logs/RR08.patch（2 commits 合并，44.6KB）

## 交付内容

1. **codex.rs**：spawn `codex app-server --stdio` JSON-RPC 握手（initialize → initialized →
   account/rateLimits/read，6s 超时 kill_on_drop + Windows CREATE_NO_WINDOW）+ 解析层
   （bucket=rateLimitsByLimitId.codex ?? rateLimits、周窗 10080min±1 定位、remaining=100-used
   clamp、credits=availableCount、Unix 秒→RFC3339）+ 6 单测（官方夹具原样移植）
2. **snapshots.rs**：last-snapshots.json 原子写（tmp+rename）+ 热启动载入标 stale + 24h 兜底
   + 4 单测
3. **models.rs**：UsageWindow/RateLimitSnapshot/ProviderSnapshot（camelCase serde；裁剪
   monthly/balance——v1 只走 app-server）
4. **lib.rs**：get_snapshots SWR 三段式（TTL 30s 直返 / stale 先返+后台刷新 emit
   background-snapshots-updated / 无缓存 fetch_lock 单飞）+ refresh_snapshots + setup 启动序列
   （stale 载入 + 500ms 首刷 + 5min 循环）
5. **build.rs（B08 正规化）**：embed-resource compile_for_everything 给 gnu 全部产物补
   Common-Controls v6 manifest（选型决策 D017）；Cargo 追加 build-dep embed-resource 3.0.12
   （Cargo.lock 已有，无新版本引入）

## 真值出处（TRUTH §1 证据源）

- 握手序列/解析逻辑/夹具断言：参考实现 codex-cockpit `src-tauri/src/codex.rs`（MIT）
  逐函数注明——codex_program(588-617)/number_with_key(125-129)/integer(130-137)/
  timestamp(139-151)/write_app_server_request(620-628)/read_app_server_rate_limits(630-703)/
  parse_app_server_window(705-717)/find_app_server_bucket(719-725)/find_app_server_window(726-751)/
  parse_app_server_snapshot(753-810)/夹具(1167-1228)
- 快照持久化：参考 codex-cockpit `src-tauri/src/lib.rs:83-441`（原子写+stale 语义）
- 本卡单测夹具数据：上述参考 codex.rs:1168-1198 原样移植（官方 app-server 响应样例）
- build.rs manifest 内容：tauri-build 2.7.1 `src/windows-app-manifest.xml` 逐字一致
- 端到端实证（接管会话）：本机 release app 与真实 `codex app-server` 握手成功
  （plan=PLUS/周窗 remaining 29%/credits 3 落盘）

## 门禁四绿 + Rust 第5门（接管会话复核全过）

- ① `npx tsc --noEmit` ✅（worktree）
- ② 域测试：`cargo test --lib` **10/10** ✅（B08 正规化后无需手工 manifest 补丁；跑前拷
  WebView2Loader.dll 到 target/debug/deps/——运行时依赖，B08/B02）
- ③ 全量：`npx vitest run` **65/65 0 failed** ✅（基线持平）
- ④ 变异红验两轮 ✅：
  - 轮1（S1011-0443）：remaining 公式 `(100-used)`→`used` → 红 4 条
    （official 74.0/snake 60.0/clamp 0.0/byLimitId 74.0）→ 复原绿
  - 轮2（S1011-0643）：find_app_server_window legacy 兜底去 duration 元数据过滤
    （`.is_none()` 条件删除）→ `does_not_mislabel_short_app_server_window_as_weekly`
    红 1（expect_err 收到 Ok——300min 短窗被误收周窗）→ 复原 10/10 再绿
- ⑤ `cargo check --tests` ✅（4.39s）

## 冒烟（卡面验证口径第 3 条，S1011-0643 实测）

`npm run build` ✅ → `cargo build --release --features tauri/custom-protocol` ✅（B01 特性，
2m25s，ld manifest merge warning 无害）→ exe 与 WebView2Loader.dll（B02）同目录 →
启动 10s 后：进程存活（PID 10156，36MB——webview 就绪）且 `%APPDATA%\app.resetradar.desktop\
last-snapshots.json` 出现，内容为**真实握手数据**：`plan=PLUS`、周窗 remaining 29%
（resetsAt 2026-10-14T04:43:55Z）、短窗 100%、`resetCredits=3`、
rateLimitSnapshot.source="app-server"（836 字节）→ 端到端链路（spawn→握手→解析→原子落盘）实证。

## 排障遗产

- TRUTH B08 已勘正（根因链补全+正规化方案）：tauri-build 资源只进 bin（embed-resource
  lib.rs:443 rustc-link-arg-bins）+ gcc spec 无条件链 default-manifest.o；build.rs
  compile_for_everything 根治。选型与"重复 manifest 无害"取舍记 D017。
- 无人值守观察：codex CLI 本机实为 pi-node 安装（PATH 无 codex.exe/codex.cmd 时
  codex_program() 仍命中——实测握手成功，具体命中路径未逐条追，不阻塞）

## 待用户清单

- 无（无删除功能/License/协议变更）

## →下轮

- 待 MERGE 槽合入（patch 对 main 干净适用；cherry-pick 2 commits）；合入后 RR09（UI）数据
  前置就绪（get_snapshots/refresh_snapshots/background-snapshots-updated 事件）
- RR12 REVIEW 可引用本卡冒烟记录作为构建证据材料
