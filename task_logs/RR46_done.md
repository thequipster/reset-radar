# RR46 — v0.2.0 发布前 QA

- 本卡 worktree agent/RR46，base main 5555158；吸收 RR45 已收工的 4bed01a/8c2cc89/7da82fb，最终 6d11e4d。合入 main ab9b086，源码路径树恒等（diff 0）。84文件 +2341/-1947；patch RR46.patch。
- 用户 2026-10-12 明确要求修 QA 六项、负责审美、正式 GitHub 发布、简单任务交 Luna。本次发布授权覆盖 RUNBOOK §1.7 的默认禁发布规则；不 force、不修改协议。
- 四绿：tsc 0；域/全量 Vitest 37文件342通过；Node 38通过；三处变异均RED后恢复GREEN（docs/qa-mutations-20261012.md）。main 合入后再跑 tsc/全量。
- Rust cargo check --tests通过；cargo test --lib 41通过、1手动网络用例忽略；GNU custom-protocol正式资源构建通过（已知manifest警告保留）。GitHub以MSVC构建正式安装包。
- 原生四边几何/工作区/两级交互/DOM松手、cancel、lostcapture三路径通过；十图Luna复核通过；demo不写生产预测日志的字节恒等检查通过。真实额度最终5/5成功，耗时9124/4998/2771/3018/2688ms。
- 真值出处：用户QA-REPORT.md P1-1..P2-3与本次明确授权（TRUTH §U）；Tauri2.12.2本机Monitor::work_area源码；参考MIT codex-cockpit/src-tauri/src/codex.rs initialize握手；本机account/rateLimits/read真实实测（docs/qa-quota-20261012.md）；TRUTH B01/B02/B08；v2规格docs/DECISIONS.md D033；需求聚合15min覆盖阈值是D034显式模型假设，不宣称官方值。
- 已修：半圆中心与拖拽竞态，工作区内展开，采集握手/有界timeout，仅浅深主题，圆→条→面板；v2接线、账户隔离日耗和用卡日志；环心对比、低风险颜色、规划空态和行距。
- 排障遗产：旧6s timeout在新exe9.124s成功响应中证实可能误报，但无历史RPC原文，不能断言闪烁唯一根因。GNU重编test可能需manifest，勿吞并行中途失败。截图库必须有效demo=healthy，invalid demo此前导致实际数据混入，已重拍。
- 待用户清单：无阻塞项。自动化DOM拖拽不能替代混合DPI、多显示器、真实鼠标边界/托盘实机验证，已如实留在QA报告。
- 发布：正常push main+v0.2.0 tag，等待Release及CI；最终结果按下方追加行记录。
- RR45原worktree和wip历史保留，本卡吸收其产物；RR46 worktree因正在运行原生QA暂留供复核，关闭进程后拆除。
