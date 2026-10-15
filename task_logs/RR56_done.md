# RR56 done — 性能（风扇）+「今日建议量」选不了 + 人话文案

- 会话 S1014-arena-rr56（Arena 代理经 Local Bridge 直接在主仓 main @7e6f3f2 工作目录改动，**未提交、未 push**，留给用户审阅后自行提交）。用户点单三项必修：①一打开风扇就转；②「今日建议量」选不了；③说明太专业、看不出哪天用卡。授权任意做法。
- 根因与修法：
  1. 风扇：规划 worker `planActions` 每 60 秒被重启一次（模型时钟每分钟变 → VM/签名变），而真实数据下一次规划在本机要跑约 115 秒（1 张可用卡 × 27 组参数 × 96 个情景 × 256 条路径 × 2 个视野 ≈ 270 万次仿真）；另外每分钟向 16 MB 的 card-decisions.jsonl 追加 8 行，每行都把整份日志在 IPC 上搬两遍；且 WebView 设了 backgroundThrottling disabled。
     - 规划器提速（结果逐位不变，4 个 golden SHA + 新增等价测试）：simulator.ts 按 world 缓存固定时间轴/查看时刻/补给顺序/卡截止，游标代替每步集合查找与全量过滤，手工浅复制代替 structuredClone，窗口到期原地改写；planning.ts 预测段按时刻复用、视野内无后续查看时段时同首动作共享结果。沙箱基准：1 卡/仅起点查看 171.8 s → 4.7 s；1 卡/3 查看 83 s → 20 s；2 卡/2 查看 125 s → 25.6 s（哈希全部相同）。
     - modelClock.ts：模型时间 15 分钟一桶（收起 60 分钟）；planningSignature.ts + useV3Planning.ts：按输入签名缓存规划结果（localStorage rr.planning.cache.v1），签名不变不重跑。
     - useV3Journal.ts + observations.rs/lib.rs：日志追加改为 SHA-256 指纹 CAS（stat_observation_log / append_observation_log_by_hash / rewrite_observation_log，旧命令保留回退）+ 前端内存缓存；预测行只在每小时 / 输入实质变化 / 北京 09:00 写；journalCompact.ts 首次启动把从不回读的规划大行压成摘要（节省 ≥1 MB 才做，原文件 .bak 备份，原子改名，概览页出现一次「已整理」提示）；陈旧锁（>120 s）自动回收。tauri.conf.json 去掉 backgroundThrottling disabled。
  2. 选不了：原生下拉/日期控件一弹出，外壳失焦 → 600 ms 后自动缩圆。appState.ts `shouldDeferAutoCollapse`：指针仍在窗口内或焦点在输入控件上不收起；「今天忙不忙」改成概览页直接点的三档按钮（aria-pressed）。
  3. 文案：plainAdvice.ts 把模型输出翻成三句话（今天最多用约 X% / 卡现在用还是留着、最晚哪天 / 照这个用法撑到几号）+ 未来 7 天小日历（用卡日/到期日/恢复日/可能用完）；模型原话收进「专业细节」折叠区；页签改为 今天怎么用 / 平台动态 / 我的设置 / 准不准；小日历芯片用 2–4 字短标签，完整说明在 title。
- 门禁（本机，用户 PC）：tsc 0；vite build 通过；vitest 64 文件 546 项 0 failed（含 planning.memory 4 个 golden SHA 与 128 MB 护栏）；`cargo test --lib` 45 通过 / 1 ignored（完整 `cargo test` 仍是 RUNBOOK §5 已知的 gnu 链接错误）；GNU release 构建带 `--features tauri/custom-protocol`。
- 原生 QA（scripts/rr56-qa.mjs，CDP 直连真实数据实例）：四个页签无横向溢出、人话文案全部命中、「很忙」按钮点后 aria-pressed=true 且 1.5 s 后面板仍展开、peek 文案正确；截图 release-qa/RR56-qa/rr56-{overview,risk,planner,data}-dark.png、rr56-overview-light.png、rr56-peek-dark.png，报告 rr56-report.json。
- 性能实测（scripts/rr56-diag.mjs，按进程拆分 Win32_Process CPU 增量，真实数据、默认收起）：修规划器前 renderer 持续 1.02–1.09 核约 115 秒（worker v3Planning 常驻），修后启动约 10 秒内算完、之后 120 秒所有进程 CPU 为 0；rr56-qa 两个 60 秒窗口 A/B 由 1.28/1.12 核 → 0.06/0.00 核（启动以来合计 11.8 CPU 秒，含 4 个页签导航与截图）。
- 交付：release-qa/RR56-package/{reset-radar.exe, WebView2Loader.dll, 使用说明.txt}、release-qa/reset-radar-RR56.zip；版本号保持 0.2.0，不是远端发布。
- 用户数据：QA 首次启动已对真实 card-decisions.jsonl 执行一次压缩（备份 card-decisions.jsonl.bak 在同目录）；其余数据未动。
- 新增脚本：scripts/rr56-cargo.mjs（代理 cargo）、rr56-package.mjs（打包+说明+zip）、rr56-qa.mjs（原生 QA）、rr56-diag.mjs（CPU 诊断）、rr56-b64.mjs / rr56-sha.mjs（取回文件 / 校验）、data-dir-report.mjs（数据目录体检）。新借鉴外部代码：无。
- →下轮：建议用户试用一两天后决定是否提交；若确认「常用查看时段」（每天 1–2 个）规划一次约 30–60 秒（已较原来快 5 倍），仍可继续优化。
