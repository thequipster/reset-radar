# RR23 交付：运行时公告接线

- 会话：S1011-RR23，2026-10-11；基线1142551，分支agent/RR23，单commit 98d9bbc8643ac46e8f4d8ed3c6089a26fc5a3c0c，34文件+1898/-25。Luna子代理只写reset_status.rs，主会话接线、复审与门禁。
- 运行时/status→独立15min缓存→ProviderSnapshot.resetStatus→核心来源有效性→buildDashboard；额度与公告并行，分别保留成功/尝试/生成/评估时间。失败保留展示数据但停止计划输入，成功null清公告，旧缓存向后兼容；最新regular事件按epoch去重，banked不作为回满事件。watch本卡仅透传。
- patch：task_logs/RR23.patch，原字节导出；主仓预审与合入另追加记录。

## 门禁与实证

- npx tsc --noEmit exit0；域src/lib+新增adapter测试110/110；全量125/125（旧108+新增17）。npm run build退出0。
- cargo check --tests退出0；cargo test --lib 24passed/0failed/1ignored，显式live_status_tls_probe 1passed。初次E0282泛型编译诊断保留于cargo-check-initial.txt，已修复，最终输出cargo-check-final.txt。
- TS变异：删state===ok门槛→7核心+1adapter断言红，过期/失败计划误参与规划；字节恢复→125绿。
- Rust变异：STATUS_POLL_INTERVAL从900秒改60秒→freshUntil及899秒缓存边界两条红；字节恢复→24绿。红绿原输出完整归档。
- 真实reqwest/rustls默认TLS请求成功，latest_reset.regular=2026-10-11T04:01:09.000Z，scheduled/watch均null；TLS原文见tls-live.txt。
- GNU cargo build --release --features tauri/custom-protocol退出0；现有B08多manifest警告，既有DPI/CC测试绿。实际ownedPID32568启动，额度ok+来源ok，05:05:12Z来源与05:05:13Z额度分时钟落盘app.resetradar.desktop/last-snapshots.json；只停止本次自有进程，未干扰其他应用。production-cache-smoke.json为最小字段证据。

## 真值出处

- TRUTH §1公开API、§2 B07；本轮TLS原文及production-cache-smoke.json；不从图稿/搜索缓存抄计划。
- MIT codex-cockpit src-tauri/Cargo.toml:25（reqwest），src-tauri/src/reset_forecast.rs:334（4s超时）；15min来自BACKLOG RR23。参考lib.rs的SWR结构保留。
- 本仓src-tauri/src/reset_status.rs:13/17/69/82/171（来源、缓存、解析），models.rs:43（nullable契约），lib.rs:43/94（并发采集与旧缓存）；src/lib/resetStatus.ts:24/40（来源有效性及历史去重）；src/ui/adapters.ts:59（唯一UI接线）。ARCHITECTURE分层、D022与D024、02-spec来源语义。

## 后续及限制

- UI外观尚未重构，本卡无新视觉截图；RR27将消费来源状态/时间，按用户六图实施三态、主题、SVG与全状态并出截图报告。
- RR15统一预测日志；RR18离线历史regular/banked核对；RR16接watch；RR17/28校准；全部仍为活动总目标的必做余项。无push/force/发布。
- 失败按同15min周期重试，手动额度刷新不会强制重拉公告；启动立即尝试。RR27须定时重算VM避免到期状态冻结，UI不能把来源ok等同额度ok。
- 不改数据夹具或预测历史；初次泛型编译诊断与变异失败是证据，不是最终门禁失败。

## 合入补记 2026-10-11 13:07:13

98d9bbc→main1f676010a116fc10697c27fff1e87010f87eea88，34路径及全树diff=0。主仓tsc/125tests/cargo check --tests通过，新增输出RR23_merge/及RR23_merge-cargo-check.txt；wip已归档为RR23_wip-delivered.md，node_modules junction验证后非递归拆，再移除干净worktree，主仓vitest依赖仍完好。branch保留，不force。LIGHT/MERGE释放。活动总目标仍有余项，本会话依RUNBOOK一次一卡收工。
