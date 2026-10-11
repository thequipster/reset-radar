# REVIEW 第 8 轮验收报告 — 2026-10-11（会话 S1011-2120，锚卡 RR12）

- 基线：main 67494a2（RR42 闭环后；相对 r7 基线 03c7069 仅 r7 产物批 eba8b42 + RR42 两个 docs commit，`git diff 03c7069..67494a2 -- src/ src-tauri/` 为空=源码零改动）
- 触发：无🟠可领、无🟡待合（RR42 已闭环 main 67494a2；RR30 依赖用户 CI 首跑不可领）→ RUNBOOK §9 REVIEW 第 8 轮
- 轮次背景：D032 落地后的首个门控期复核轮（状态行轮次项自本轮起不再立卡）。本轮增量：①七门全量复跑；②E2E 自采新证——src 恒等性以 git diff 证明后复用 r7 构建的 release exe（20:56，对应同一源码）出双主题新图并独立识图（截图为新采，非复用 r7 图）；③D032 滚动表述实读确认+闭环区间顺带刷新。

## 1. 七门 artifact（命令+结果；artifact 文件在 task_logs/RR12r8_artifacts/）

| # | 门 | 命令 | 结果 | artifact |
|---|---|---|---|---|
| 1 | TS 治理 | `npx tsc --noEmit` | ✅ exit 0 零输出 | tsc.txt |
| 2 | vitest 全量 | `npx vitest run` | ✅ 29 files / **272/272 passed** 0 failed（=r7 基线持平） | vitest-full.txt |
| 3 | 前端构建 | `npm run build` | ✅ tsc && vite build ✓ built in 1.00s | vite-build.txt |
| 4 | Rust 检查 | `cargo check --tests`（工具链 PATH 见 RUNBOOK §10） | ✅ Finished dev profile 0.44s（缓存命中） | cargo-check.txt |
| 5 | Node 套件 | `npm run test:node` | ✅ **38/38** pass 0 fail | test-node.txt |
| 6 | 发布守卫 | `node scripts/check-release.mjs` | ✅ 版本同步 0.1.0；README 相对链接 **13 条全部可达** | check-release.txt |
| 7 | 校准管线 | `node scripts/review-calibration.mjs`（stdout→artifact） | ✅ exit 0；fresh 刷新 60 事件/54 额度重置同 r7（无新增上游事件），计分日 n=0 如实呈现 | calibration-fresh.txt |

数据刷新+README 区间刷新后复跑（r5–r7 先例口径）：vitest 全量 **272/272** ✅（vitest-full-after-refresh.txt）+ node **38/38** ✅（test-node-after-refresh.txt）+ check-release **13 链接** ✅（check-release-after-readme.txt）——刷新仅动 data/calibration.json、data/resets-history.json、docs/calibration-latest.md 三件（git status 对账），README 仅状态行区间一处（RR01–RR41→RR01–RR42，见 G6），此后至落库无代码改动，该三绿即落库前终验。

## 2. E2E 新采 + 识图子代理独立复核

**E2E（本轮新采截图）**：源码恒等性证明（§基线 git diff 为空）→ 复用 r7 会话由当前源码构建的 release exe（`src-tauri/target/release/reset-radar.exe`，构建于 r7 轮 20:56，B01 custom-protocol 口径）→ `scripts/shot-expanded.ps1 -Theme dark/light` 双跑 → PrintWindow 双图落盘 `docs/screenshots/20261011-r8-expanded-{dark,light}.png`。探针证据（shots-e2e.txt）：GetDpiForWindow **192**（PMv2/B10 在位）、物理客户区 **920×1380**、IHDR 字节核验 **920×1380 + pHYs 7559ppm=DPI 192** 双图一致（首次解析两行 152x100 为解析脚本 byte 截断 bug 已注 errata 作废，探针 Saved 920×1380 自始正确）。启动→双主题渲染→离屏截图链路通。

**识图独立复核**（Explore 只读子代理逐图 A–G 七项+记录项，主会话不读图）：

- 图1（深色）：A–G 全 PASS；图2（浅色）：A–G 全 PASS
- **RR40 修复持续在位**：两主题「采集状态」卡副文案全无「·」，断点干净落「最近更新成功」后，「10/11 20:17 北京时间」整段不拆行
- 周额度卡「10/18 11:57 北京时间」整段单行无回归；横幅「+ 18.4 个周额度百分点」主文案单行完整（59.6%/11.1/7.3/28.0 数字齐全）+尾部箭头「›」醒目（RR34/RR35 在位）；右缘元素完整
- 两主题数据同源一致（78%/62%/+18.4/59.6%/11.1/7.3/28.0/10-11 20:17/10-18 11:57）

**E2E 附记（观察，不立卡）**：本轮探针窗内仍未完成新鲜握手——UI 如实呈现「采集状态：过期 / 最近更新成功 10/11 20:17 北京时间」，SWR 过期态诚实显示连续第二轮实证（r7 首证）；同源码 20:17（RR40 会话）曾成功握手，无回归证据。r7 G3 口径续认。

## 3. 差距定夺（逐条不悬空）

**本轮零新卡。** 逐条：

| # | 现象 | 定夺 | 理由 |
|---|---|---|---|
| G1 | 七门+刷新后三绿复跑 | ✅ 确认 | §1；非差距，闭环确认 |
| G2 | RR40 修复持续在位（r8 新图独立复核，非复用 r7 结论） | ✅ 确认 | §2 双图全 PASS；闭环确认 |
| G3 | E2E 过期态如实呈现连续两轮；探针窗内未完成新鲜握手 | 不立卡 | §2 附记：SWR 设计内行为，无回归证据；r7 G3 口径续认，留档观察，若用户日常使用中复现「长时间不更新」再立挖卡 |
| G4 | 子代理再提公告卡「上次尝试」疑半角/全角逗号混用 | 🚫证伪不立卡 | 证据铁律回源复查：`src/ui/DashboardPanel.tsx:224` 模板唯一全角「，」位于时间戳之后，「上次尝试」与时间戳间仅空格；r7 G4 结论复认——小字号识图误读，源码为准 |
| G5 | 公告卡「未/见新计划」行尾悬字+横幅「前/拉」拆词 | 不立卡 | CJK 逐字换行正常形态（浏览器默认断行规则），与「·」孤立符号不同类；r7 G5 口径续认；防御注记维持：未来若调整该文案可顺带评估 nowrap |
| G6 | README:110 闭环区间写 RR01–RR41，RR42 已闭环（滞后 1 卡号） | ✅顺带刷新不立卡 | D032 授权口径「状态行仅在闭环区间变化（新卡闭环）或用户点单时刷新」——RR42 闭环即变化触发；本轮产物批顺带 RR01–RR41→RR01–RR42（一行，滚动表述/版本叙述不动），复跑 check-release 13 链接绿；不为此立微卡 |
| G7 | 环图中心百分比弱化灰（两主题均弱于标题对比度） | 不立卡 | 沿 D031 注脚=第 3 轮用户点单池口径，无新证据不重开 |
| G8 | 展开态下半留白约 40%（内容止于页面 60% 处） | 不立卡 | 审美项，第 3–7 轮连续同裁定；内容量由数据决定 |
| G9 | ROADMAP v0.3 三条 / v0.4 两条 | 不立卡 | v0.3 沿 D031 用户门控期留点单；v0.4 ROADMAP 明示远期先不做 |
| G10 | 校准计分日 n=0 | 不立卡 | 运行时数据积累问题非代码差距，第 3–7 轮同裁定；管线 exit 0 且如实呈现 |
| G11 | RR13/RR21 worktree 空壳句柄占用（r8 再试 cmd rmdir 仍「另一个程序正在使用」） | 不立卡 | 磁盘空壳非 git 状态（主仓 git status 干净）；r4–r7 连续同裁定延续观察；RR26 非空=用户参考图有意保留 |
| G12 | RR30（CI 首跑验证） | 🟣既有 | 等 push 后 CI 首跑（用户动作），非本轮可推进 |

## 4. 结论

- 七门全绿 + 数据刷新/README 区间刷新后复跑三绿；E2E 复用同源 exe 自采双主题新图识图独立复核双 PASS；差距 12 条全部定夺零悬空，**零新卡**（G6 按 D032 顺带刷新，终结逐轮微卡空转的首次实践）。
- 循环状态：**用户门控期维持**（D031）——RR30 等用户 CI 首跑、v0.3 等点单、发布三步（push/tag/release）永远留给用户。下一班：无🟠无🟡则 REVIEW 第 9 轮照 §9.1 全量执行。
- 产物批（本报告+README 区间一行+刷新数据三件+双主题新截图两件+artifact 十一件+RR12r8_done+收编上班 RR42 未跟踪 done/patch 两件+看板协调文件）落库 main。
