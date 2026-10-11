# RR39 done — README:42 复选项口径诚实化（docs）

- 会话：S1011-1950（2026-10-11 19:51 领卡 → 19:55 交付）
- 分支/commit：`agent/RR39` @ **d0c8158**（单 commit，基于 main ab47c15）
- diffstat：1 文件 +5/−2（README.md）；patch 备份 `task_logs/RR39.patch`（2339B，
  对 main `git apply --check` 干净适用✅）
- worktree：`../reset-radar_wt/RR39`（含 node_modules junction，拆前先 `cmd //c rmdir`，B09；
  留 MERGE 班拆）

## 真值出处（证据铁律回源）

| 事实 | 出处 |
|------|------|
| 校准摘要已入 app（三态） | `src/ui/useCalibrationSummary.ts:21-36`（view.status missing/invalid/ok）；`src/ui/DashboardPanel.tsx:495`「数据与校准」页 + :637 校准行注释「零样本如实『数据积累中』，不伪造指标」；BACKLOG RR28 交付行（refresh-calibration 写应用目录 calibration.json → Rust 只读命令 → TS 纯映射三态） |
| 预测自动落盘应用内不接 | `docs/DECISIONS.md:161-174` D019 原文：app 只拿得到 %APPDATA% 与仓库内 data/predictions.jsonl 断链，证据层归档归脚本（scripts/log-prediction.mjs 薄壳）；README:47-48 代码块同口径（`npm run log-prediction` 建议挂定时任务） |
| 本口径为何归本卡 | `docs/DECISIONS.md:271-272` D030 弃项：「复选项半真半假……勾选口径需 REVIEW 定夺，本卡不动、done 留观察」→ REVIEW 第4轮立 RR39 |
| 三态中文措辞 | 对齐 RR28 契约语义：missing=缺失 / invalid=无效 / ok=正常 |

## 改动内容

1. **README:42 拆两条如实描述**（卡面修向）：
   - `[x] 🖥️ 应用内校准摘要`：「数据与校准」页只读展示应用目录 `calibration.json` 摘要
     （正常/缺失/无效三态，零样本如实标注"数据积累中"，RR28）。
   - `[ ] 🗃️ 预测自动落盘到应用数据目录`：如实改述——现为脚本管线
     （`npm run log-prediction`）落盘 `data/predictions.jsonl`，应用内暂不接入
     （[ROADMAP.md](ROADMAP.md) v0.2+）。
2. **README:38 括注同根因顺带同步**（沿 D030 先例，卡内裁决记 BOARD/此处于案）：
   「应用内校准面板在 ROADMAP v0.2」→「应用内校准摘要已入『数据与校准』页；深化面板
   见 ROADMAP v0.2」——原括注与本卡拆项后的实况矛盾（摘要已入 app），同文件同根因。
3. 版本 0.1.0 不动（RUNBOOK §6 版本戳只在发布卡变动）；README 链接数 13 不变
   （拆项后 ROADMAP 引用仍 1 处，[x] 项纯文字无链接）。

## 门禁证据（docs 卡口径沿 RR36/RR33）

| 门 | 结果 |
|----|------|
| ① npx tsc --noEmit | ✅ 0 错误（worktree 根） |
| ② 域测试 | 不适用——docs 级零代码变更（无 src/ 改动），全量即覆盖（RR36 先例） |
| ③ npx vitest run 全量 | ✅ 269/269 0 failed（=main ab47c15 基线，只平不升） |
| ④ 变异红验（真做） | ✅ 三要素：改 README:45 ROADMAP 链接目标→ROADMAP-mutant.md（改了什么）→ `node scripts/check-release.mjs` exit 1 且点名「README 链接不可达：ROADMAP-mutant.md」（哪条红/红在哪——正是本卡咬合门）→ sed 复原 grep 残留=0 → 复跑 exit 0 十三链接全可达（复绿） |
| 咬合门 check-release | ✅ 版本同步 0.1.0 + README 相对链接 13 条全部可达 |
| Node 测试 | ✅ npm run test:node 38/38 0 fail |
| Rust cargo check | 不适用——未触 src-tauri/ |

## 卡内裁决

- **README:38 括注顺带修**：同文件同根因（校准能力口径），沿 D030「同根因顺带修避免单开
  2 行小卡」先例，不另立卡。
- **不扩界项**：README:107 状态行滞后（写 RR01–RR35/REVIEW 3 轮，实况 RR01–RR38 已闭环、
  REVIEW 4 轮）——属 RR36 域（状态行刷新）非本卡复选项口径根因，不扩界；留 REVIEW 第 5 轮
  取材（BOARD 建议顺序第 3 条本就排了第 5 轮）。
- **弃用「校准管线自动落盘」卡面原措辞中的「自动」**：D019 证据链里 data/predictions.jsonl
  由 `npm run log-prediction` 手动/定时触发（README:47 自述「建议挂定时任务」），README
  措辞用「脚本管线」避免「自动」歧义（真正的「自动落盘」恰是未接项本体）。

## 待用户清单

- 无（纯 docs 诚实化）。

## 排障遗产

- format-patch 自动文件名在 ~70 字符处截断（…into-honest-.patch），与 mv 预期名不符 →
  用实际名重命名即可，非阻塞。

## →下轮

- MERGE 合入 d0c8158（本会话时间盒余量充足拟自合入；若本行被读时仍未合，按 §8 走）。
- 合入后无 🟠 无 🟡（RR30 依赖用户 CI 面首跑不可领）→ **REVIEW 第 5 轮**（§9.1 全量；
  取材提示：README:107 状态行刷新 + v0.3 维持留点单见 D031 用户门控期）。
