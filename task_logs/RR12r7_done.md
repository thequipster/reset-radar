# RR12 第7轮 REVIEW done（锚卡永续）

- 会话：S1011-2050｜开工 20:52+08，闭环 ~21:1x+08（本机钟 bash/pwsh 双源核；上班会话钟快 13 分钟之注记见开工行）
- base：main 03c7069 → 本轮产物批落库（commit sha 见看板条目/BACKLOG 状态行）

## 七门证据（artifact 九件 task_logs/RR12r7_artifacts/）

1. tsc ✅ exit 0 零输出（tsc.txt，20:53:02→20:53:17）
2. vitest 全量 ✅ 29 files 272/272 0 failed（vitest-full.txt）＝r6 基线持平
3. vite build ✅ built in 1.67s（vite-build.txt）
4. cargo check --tests ✅ Finished dev 10.45s（cargo-check.txt；工具链 PATH 按 RUNBOOK §10 /c/ 风格）
5. test:node ✅ 38/38（test-node.txt）
6. check-release ✅ 版本同步 0.1.0 + README 13 链接全可达（check-release.txt）
7. review-calibration ✅ exit 0（calibration-fresh.txt；stdout→artifact 未指向 calibration-latest.md 防 EPERM）
- 刷新后复跑：vitest 272/272 ✅（vitest-full-after-refresh.txt）+ node 38/38 ✅（test-node-after-refresh.txt）；刷新仅动 data/calibration.json / data/resets-history.json / docs/calibration-latest.md 三件（git status 对账，60 事件无新增仅时间戳变化）；此后至落库零代码改动，该双绿即落库前终验（沿 r5/r6 口径）。

## E2E 重验（本轮新采）

- 当前 main 源 `cargo build --release --features tauri/custom-protocol` 42.31s（1 条良性 linker 警告；B01 特性必带防白屏）。
- shot-expanded.ps1 -Theme dark/light 双跑：GetDpiForWindow 192（PMv2/B10 在位）、物理客户区 920×1380、PrintWindow True。
- 新图 docs/screenshots/20261011-r7-expanded-{dark,light}.png：IHDR 920×1380、pHYs 7559ppm=DPI 192（node 字节核验）。
- 识图独立复核（Explore 只读子代理，主会话不读图）：双图 A–E 全 PASS——RR40「·」修复持续在位、时间段整段、周额度卡/横幅箭头无回归、「59.6% · 均匀 11.1」单行（r6 G3 防御注记复查通过）。
- 过期态观察：last-snapshots.json mtime 仍 20:17:45（RR40 会话写入），本轮探针窗内未完成新鲜握手，UI 如实显示「采集状态：过期/基于上次观测」——SWR 设计内诚实显示，无回归证据，不立卡（报告 §3 G3）。

## 差距定夺（12 条零悬空，详见 docs/review-20261011-round7.md §3）

- 立卡 1 张：**RR42**（P3 docs，README:110 状态行去易腐刷新；D032 终止逐轮滞后空转）。
- 证伪 1 条：识图半角逗号观察——回源 DashboardPanel.tsx:224 / copySummary.ts:30 全为全角「，」，小字号误读。
- 其余不立卡理由见报告（D031 点单池续认/CJK 断行正常/审美续裁/n=0 运行时/空壳延续观察/RR30 🟣既有）。

## 真值出处

- 门禁命令与口径：RUNBOOK §5/§9.1/§10；截图机制：TRUTH §2 B09/B10（PrintWindow/PMv2），探针 scripts/shot-expanded.ps1 param 块实读。
- README:110 原文、DashboardPanel.tsx:224、copySummary.ts:30、%APPDATA%/app.resetradar.desktop/last-snapshots.json mtime——全部本会话实读/实测。

## 待用户清单（不变，D031 用户门控期）

- push 触发 CI 首跑（→RR30 可领）；v0.3 三条点单（系统通知/配速联动开关/窗口布局记忆）；发布三步（push/tag/release）。

## 排障遗产

- 组重定向陷阱：`{ ...; cd x; } > 相对路径` 的重定向在组启动时按原 cwd 求值，且组内 cd 持久影响后续命令——artifact 输出一律用绝对路径。
- pHYs 解析须按 chunk 遍历（IHDR 后下一 chunk 起），固定偏移 28 读到的是 IHDR 数据区。

## →下轮

- 下一班按 BOARD 建议领 RR42（docs：README:110 去易腐）；RR42 闭环后若无新卡则 REVIEW 第 8 轮照 §9.1 全量执行（D031 不减省 artifact 义务）。
