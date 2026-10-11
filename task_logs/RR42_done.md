# RR42 done — README:110 状态行去易腐（D032）

- 会话：S1011-2110｜交付 2026-10-11 21:20｜base main eba8b42
- 分支/commit：agent/RR42 @ **25251d5**（单 commit；patch 备份 task_logs/RR42.patch 1412B，对 main 干净适用✅）
- diffstat：1文件 +1/−1（README.md 单路径——docs 级零代码变更，Rust 不适用自证）

## 真值出处

| 改动 | 出处 |
|---|---|
| 闭环区间 RR01–RR41（除 RR30） | git log main：RR41 已闭环 354ce7d；r6 03c7069 / r7 eba8b42 均落库；RR30 仍🟣待用户 CI 首跑（BOARD 建议顺序区原文）。沿 RR36/RR41 先例写到最新已闭环卡号、排除本卡自身 |
| 「REVIEW 已 N 轮」→ 滚动表述 | docs/DECISIONS.md D032 原文：「REVIEW 验收循环持续滚动，历轮报告见 docs/review-*.md——glob 指向不随轮次腐化」；行内代码非链接（D032 门禁影响节：check-release 13 条相对链接口径不变） |
| 版本叙述 0.1.0 不动 | RUNBOOK §6 版本戳只许发布卡变；README 0.1.0 共 4 处（行6徽章/行28/行93/行110）均未触碰 |

## 改动内容（README.md:110 单行两处）

- ① 闭环区间 `RR01–RR40` → `RR01–RR41`（除 RR30 待用户 CI 首跑外已全部闭环——此项只在卡片闭环时变化，变化有界）
- ② `REVIEW 已 5 轮` → `REVIEW 验收循环持续滚动，历轮报告见 \`docs/review-*.md\``（终止逐轮滞后空转，D032 裁决**此后 REVIEW 轮不再为状态行轮次滞后立卡**）

## 门禁（docs 卡沿 RR41 口径）

1. `npx tsc --noEmit` ✅（worktree RR42 根）
2. `npx vitest run` 全量 **272/272 0 failed** ✅（=基线；docs 卡无新增测试，域门由全量覆盖）
3. `node scripts/check-release.mjs` ✅（版本同步 0.1.0 + README 相对链接 **13 条**全部可达——滚动表述用行内代码非链接，口径与 D032 预期一致）
4. **变异红验真做（沿 RR36/RR39/RR41 口径）**：sed 把 README 两处 `[RUNBOOK.md](RUNBOOK.md)` 改坏为 `(RUNBOOKX.md)` → check-release **exit 1，2 项失败「README 链接不可达：RUNBOOKX.md」**（红在 check-release.mjs ③ 链接存在性检查，状态行 RUNBOOK 链接在 2 处中招之列）→ `git checkout -- README.md` 复原（grep RUNBOOKX=0 残留，行110 RR42 改动在位）→ 复跑 **OK 13 条链接全部可达 exit 0** ✅。三要素：改了什么=状态行所在 README 的 RUNBOOK 链接目标；哪条红=check-release 链接存在性检查 2 项；红在哪=exit1 点名 RUNBOOKX.md
5. `npm run test:node` **38/38 pass 0 fail** ✅
6. Rust 不适用：未触 src-tauri/（diffstat 单 README 路径自证）

## 待用户清单

- RR30 仍等用户 push 触发 CI 首跑（状态行如实保留「除 RR30 待用户 CI 首跑外」）
- v0.3 三条点单（系统通知/配速联动开关/窗口布局记忆）维持留点单（D031 用户门控期）
- 发布三步（push/tag/release）永远留用户

## 排障遗产

- 本会话首轮变异循环曾以 `git checkout -- README.md` 复原，连带把未提交的本卡改动一并还原（RR41 done 的复原步骤隐含其改动已提交的时序）；本轮已改为**先提交 25251d5 再做变异循环**，复原可证干净。后续 docs 卡变异循环请沿用「先提交再变异」时序。

## →下轮

- 本卡 🟡待合入（若时间盒余量充足本会话续占 MERGE 槽自合入）；合入后无🟠无🟡 → 阶段切 REVIEW 第 8 轮（§9.1 全量；状态行轮次项从此不再立卡——D032）
