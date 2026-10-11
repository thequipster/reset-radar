# RR41 done — README:110 状态行刷新（docs）

- 会话：S1011-2030｜LIGHT（交付后续占 MERGE 槽自合入）｜2026-10-11 20:36 交付
- 分支/commit：agent/RR41 @ **454710a**（单 commit，基于 main 918caf8；1 文件 +1/−1）
- patch 备份：task_logs/RR41.patch（1268B，对 main `git apply --check` 干净适用✅）

## 已落

1. **状态行刷新**（卡面指名，README:110 末行）：
   `RR01–RR35 除 RR30 待用户 CI 首跑外已全部闭环，REVIEW 已 3 轮`
   → `RR01–RR40 除 RR30 待用户 CI 首跑外已全部闭环，REVIEW 已 5 轮`。
2. 版本叙述 0.1.0 两处不动（RUNBOOK §6 版本戳只许发布卡变）——全文 grep 5 处 0.1.0
   均未触碰（1 处为状态行行首 v0.1.0 原样保留）。
3. 无其他改动：diffstat 单文件单行，无同根因顺带项（README 其余叙述经 RR36/RR39 刚刷新过，
   无过时残留）。

## 真值出处（证据铁律）

- 状态行原文：README.md:110（worktree base 918caf8 版本，即主仓 HEAD）。
- 闭环区间 RR01–RR40：BOARD 置顶区（RR40 🟢已闭环 main 918caf8←f0f44f0，20:28）+
  `git log main`（RR36→RR40 逐卡闭环 sha 在案）；RR30 🟣待用户 CI 首跑（BOARD 阶段行）。
  区间排除本卡 RR41 自身（RR36 先例：状态行不预支未合入卡）。
- REVIEW 5 轮：docs/review-20261011{,-round2,-round3,-round4,-round5}.md 五份实存
  （ls 实数核对）。
- 写法定式：task_logs/RR36_done.md（上一张状态行刷新卡，RR01–RR35/3 轮 → 同构更新）。

## 门禁证据（四绿 + 附加）

1. `npx tsc --noEmit` ✅（worktree，node_modules junction 经 pwsh New-Item Junction 建，
   RR35 排障遗产口径；B09）。
2. 域测试：docs 卡无 src/lib 域，全量即覆盖（RR36 同口径）。
3. 全量 `npx vitest run`：**272/272 passed 0 failed**（29 文件，= RR40 后基线持平）✅。
4. **变异红验（真做，沿 RR36/RR39 口径）**：sed 把状态行
   `[RUNBOOK.md](RUNBOOK.md)` 改坏为 `(RUNBOOKX.md)`（README 内该链接 2 处均中招）→
   `node scripts/check-release.mjs` **exit 1，2 项失败「README 链接不可达：RUNBOOKX.md」**
   （红在 check-release.mjs ③ 链接存在性检查）→ `git checkout -- README.md` 复原
   （grep RUNBOOKX 无残留）→ 复跑 **OK 13 条链接全部可达 exit 0** ✅。
5. 附加：`npm run test:node` **38/38 pass 0 fail** ✅；check-release 版本同步 0.1.0 ✅。
6. Rust 不适用：未触 src-tauri/（diffstat 单 README 路径自证）。

## 卡内裁决

- 无新决策（卡面修向明确、RR36 先例同构，无需入 DECISIONS.md）。

## 待用户清单

- RR30（🎣 docs+发布）仍等用户 CI 首跑——既有卡，非本卡范围。

## 排障遗产

- 无新增（junction 建法沿用 RR35 实证口径，未再翻车）。

## →下轮

- 本会话时间盒余量充足，续占 MERGE 槽自合入（RUNBOOK §8：cherry-pick → 树恒等 →
  主仓复跑门禁 → 拆 worktree（junction 先拆 B09）→ 回写看板）。
- RR41 合入后无 🟠 无 🟡（RR30 除外）→ 阶段切 REVIEW 第 6 轮（取材提示：v0.3 留点单
  见 D031 用户门控期；RR40 双主题新截图可入识图复核）。
