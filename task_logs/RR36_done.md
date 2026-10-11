# RR36 done — README 状态行刷新（发布门面刷新到当前实况）

- 会话：S1011-1904｜LIGHT｜2026-10-11（看板时间约 20:05 收工）
- 分支/commit：agent/RR36 @ **ad72bd0**（单 commit，基于 main a9f244c；2 文件 +19/−7）
- patch 备份：task_logs/RR36.patch（4575B，对 main `git apply --check` 干净适用✅）

## 已落

1. **状态行刷新**（卡面指名，README 末行）：
   `v0.1.0 发布就绪（RR01–RR11 已闭环）` → `v0.1.0 发布就绪（RR01–RR35 除 RR30 待用户
   CI 首跑外已全部闭环，REVIEW 已 3 轮）`。版本叙述 0.1.0 两处不动（RUNBOOK §6 版本戳只许
   发布卡变）。
2. **「界面」节刷新**（D030 扩界裁决，同根因顺带修，沿 D029 先例）：
   - 引图换最新实证图：胶囊 `20261011-rr32-capsule-dark.png`、展开
     `20261011-rr35-expanded-dark.png`（原图为 RR21 时代：胶囊在三态重构+logo 换装前、
     展开在 RR31 分页改造前）；
   - 「三块面板」叙述 → 四页签（概览=公告/余额/今日建议、风险、用卡、数据=采集状态与
     校准摘要）；
   - 删过时注记「右侧列溢出需横向滚动」（该缺陷已被 RR21 窄窗自适应 + RR31 分页重构消除），
     保留并补强 hash 入口复现说明（`#expanded&tab=risk`、`-Theme light`）。

## 真值出处（证据铁律）

- 状态行事实：BOARD/BACKLOG 状态行 + `git log main`（RR01–RR35 逐卡闭环，RR30 🟠待领
  依赖用户 CI 首跑，REVIEW 3 轮见 docs/review-20261011{,-round2,-round3}.md）。
- 四页签与页面内容：`src/ui/panelTabs.ts:5-10`（概览/风险/用卡/数据 label）+
  `src/ui/DashboardPanel.tsx:1-2` 页结构注释 + 概览页/「数据来源与校准」节源码节标题。
- 截图脚本参数：`scripts/shot-expanded.ps1` param 块（-Hash/-ClickTab/-Theme；默认主题 dark）。
- 引图可用性：docs/screenshots/ 目录实存文件；两图均过此前识图子代理审计
  （rr32：RR32_done 6 图 PASS；rr35：RR35_done 两轮 PASS）。
- 过时注记消除依据：RR21_done（识图 PASS 无横滚，RR14 遗产① 消除）+ RR31（用户反馈①
  页签分模块无滚动条，main a89369c）。

## 门禁证据（四绿 + 附加）

1. `npx tsc --noEmit` ✅（worktree 根，零输出通过）
2. 域测试：docs 卡无 src/lib 域，全量即覆盖 ✅
3. 全量 `npx vitest run`：**266/266 passed 0 failed**（28 文件，与基线 266 持平只许持平）✅
4. **变异红验（真做，超卡面 RR33 口径）**：改坏状态行链接 `[RUNBOOK.md](RUNBOOK.md)` →
   `RUNBOOKX.md` → `node scripts/check-release.mjs` **exit 1「README 链接不可达：RUNBOOKX.md」**
   （红在 check-release.mjs:36-43 ③ 链接存在性检查）→ sed 复原 → 复跑 **OK 13 条链接全部
   可达 exit 0** ✅
5. 附加：`npm run test:node` **38/38 pass 0 fail**（scripts 侧无 README 断言，grep 核实）✅；
   `check-release` 版本同步 0.1.0 ✅（链接 14→13 = 删除过时注记内 ROADMAP 链接所致，门禁
   只验可达性不锁条数）
6. Rust 不适用：未触 src-tauri/。

## 卡内裁决

- **D030**（docs/DECISIONS.md）：卡面修向只点名状态行，实读发现同文件「界面」节同根因冻结
  （旧图/旧叙述/已消除缺陷的注记），同文件顺带修；「应用内校准面板」复选项半真半假
  （RR28 校准摘要已入 app、预测自动落盘未接 D019）不属本卡，留 REVIEW。

## 待用户清单

- 无新增。既有：RR30 仍等用户首次 push 触发 CI（发布三步见 README「发布」节）。

## 排障遗产 / REVIEW 取材

- README:42 功能清单末项「应用内校准面板 / 预测自动落盘到应用数据目录」复选项口径需 REVIEW
  定夺（校准摘要已由 RR28 入 app 数据页，自动落盘 D019 明确不接——勾一半还是拆两项）。
- check-release 链接计数 13（原 14）：若后续卡把链接数写进断言，以现值为基线。

## →下轮

- 本卡 🟡待合入（worktree `../reset-radar_wt/RR36` 留 MERGE 班拆；**node_modules junction
  在，拆前先 `cmd //c rmdir` 非递归拆链**，B09）。
- MERGE 后：无🟠无🟡 → REVIEW 第 4 轮（RR30 仍依赖用户 CI 首跑）。
