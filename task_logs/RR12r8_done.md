# RR12 第 8 轮 REVIEW — done（会话 S1011-2120，2026-10-11）

- 基线：main 67494a2（r7 批+RR42 后；`git diff 03c7069..67494a2 -- src/ src-tauri/` 为空=自 r7 基线源码零改动）
- 产物批落库 commit：见 BOARD/BACKLOG 状态行（本 done 随批入库）
- 报告：docs/review-20261011-round8.md（差距 12 条零悬空，零新卡）

## 七门证据（task_logs/RR12r8_artifacts/）

1. tsc.txt：exit 0 零输出
2. vitest-full.txt：29 files 272/272 0 failed（=r7 基线）
3. vite-build.txt：built in 1.00s
4. cargo-check.txt：Finished dev 0.44s（缓存命中）
5. test-node.txt：38/38 0 fail
6. check-release.txt：版本同步 0.1.0 + 13 链接可达
7. calibration-fresh.txt：exit 0，60 事件/54 额度重置同 r7，n=0 如实
- 复跑三件（after-refresh/after-readme）：vitest 272/272 + node 38/38 + check-release 13 = 落库前终验（此后至落库无代码改动）
- shots-e2e.txt：双主题探针（PMv2 True/DPI 192/920×1380/PrintWindow True）+ IHDR/pHYs 字节核验（920×1380/7559ppm=DPI 192）+ 首次解析 byte 截断 bug errata 注记

## E2E 口径（与 r7 差异，卡内裁决）

r7 为「重建 exe」；本轮源码恒等性已由 git diff（03c7069..67494a2 -- src/ src-tauri/ 空）证明 → 复用 r7 构建 exe（20:56，同源码）出新采截图（非复用 r7 图，识图为新证据）。exe 若与源码不恒等则必须重建——本轮已证恒等故免。

## 识图独立复核（Explore 子代理，主会话不读图）

双图 A–G 全 PASS：RR40 修复持续在位（无「·」/断点干净/北京时间整段）/周额度卡整段/横幅单行+箭头醒目/主题正确/数字同源。记录项 12 条均已定夺（报告 §3 G3–G8）。

## 卡内裁决与口径沿用

- G6 顺带刷新：README:110 区间 RR01–RR41→RR01–RR42（D032「闭环区间变化时刷新」授权；不立卡；滚动表述与版本叙述 0.1.0 不动；check-release 复跑 13 绿）。
- G4 逗号疑点回源复查：DashboardPanel.tsx:224 唯一全角「，」在时间戳后，「上次尝试」后仅空格——r7 证伪结论复认。
- G11 空壳：cmd rmdir RR13/RR21 仍句柄占用，延续观察（git status 干净）。

## 产物批清单

docs/review-20261011-round8.md（新）/ README.md（区间一行）/ data/calibration.json + data/resets-history.json + docs/calibration-latest.md（脚本刷新三件）/ docs/screenshots/20261011-r8-expanded-{dark,light}.png（新两件）/ task_logs/RR12r8_artifacts/（11 件）/ 本 done / 收编上班未跟踪 task_logs/RR42_done.md + RR42.patch / 看板协调（BOARD/HEARTBEAT/BACKLOG）。

## 待用户清单（不变，D031 门控期）

push 触发 CI 首跑（→RR30 可领）/ v0.3 三条点单（系统通知/配速联动开关/窗口布局记忆）/ 发布三步（push/tag/release）。

## →下轮

无🟠无🟡 → REVIEW 第 9 轮照 §9.1 全量执行；若用户已 push 且 CI 首跑完成 → RR30 可领（挖卡：CI 首跑验证）。
