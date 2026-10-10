# DECISIONS — 初始化决策日志（AI 决定，全部留痕）

> 规则：初始化期用户离线，所有决策由 AI 依据 docs/ARCHITECTURE.md 的原则做出，逐条编号记录。
> 用户回来后任何一条都可以用「用户裁决」推翻：在 TRUTH.md §U 登记即生效，并立卡执行。

## D001 项目名与定位（2026-10-11）

- 名：**reset-radar**；中文名「重置雷达」。
- 定位：**看得见准头的 Codex 重置风险与用卡规划器**。不是又一个额度悬浮窗——核心差异是
  「校准闭环」：每条风险预测都被记录、事后对答案（Brier 分数/命中率），模型准不准摆在明面上。
- 决定依据：用户明确要「属于自己的、可发布的」项目；对参考项目的批评共识是
  「模型复杂度超过了信号质量」，本项目反其道行之：可验证优先于精巧。

## D002 技术栈（2026-10-11）

- Tauri 2 + React + TypeScript + Vite（UI 薄壳）；核心算法全部放 `src/lib/` 纯函数（零 React 依赖）；vitest 单测。
- 决定依据：参考项目验证过这条路的可行性（21MB 单文件、低内存）；纯函数核心使其 493 个测试可维护。

## D003 仓库即主仓（2026-10-11）

- 本仓库根 = 永续看板主仓（看板五件套 + 源码同仓），worktree 建在仓库外 `../reset-radar_wt/`。
- 决定依据：单人+AI 工位场景，单仓降低协调成本；perpetual-board 协议要求看板读写主仓绝对路径。

## D004 唯一日边界：北京零点（2026-10-11）

- 全项目只允许一种「天」的边界：北京时间 00:00。禁止引入 04:00 记账日等第二套边界。
- 决定依据：参考项目双边界并存导致日期标签差一天的实测 bug（见 TRUTH §8 黑名单）。

## D005 首屏 stale-while-revalidate 内建进 v1（2026-10-11）

- 快照持久化（last-snapshots.json）+ 热启动先画旧值 + 后台刷新，从第一张数据卡就做，不后补。
- 决定依据：参考项目的启动慢根因即为此，后补成本高（我实测修复过整个链路）。

## D006 算法可解释性为强制接口（2026-10-11）

- 任何输出「建议/风险/决策」的函数必须返回 factors 数组（id/label/delta/note），UI 必须展示。
- 决定依据：参考项目 reset_forecast 的可解释因子是它最值得继承的设计。

## D007 MIT License，版权人 thequipster（2026-10-11）

- 参考：借鉴自 MIT 项目 codex-cockpit 的算法思路，落地时在 done/task_logs 注明出处文件，法律与道义双合规。

## D008 单工位起步（2026-10-11）

- LIGHT 槽 ×1（定时任务每 45 分钟唤醒一个会话，一次一卡）。协议本身支持多工位，等首版跑顺再扩。

## D009 构建与发布路径（2026-10-11）

- 本机开发验证：windows-gnu 工具链（已装好，见 RUNBOOK §10）；正式发布：GitHub Actions
  windows-latest（MSVC）构建。gnu 产物需带 WebView2Loader.dll 的坑已登记 TRUTH，发布以 CI 为准。

## D010 RR01 合入前 scripts 域卡的门禁等价口径（2026-10-11，会话 S1011-0113）

- 现象：RUNBOOK §5 门禁①②③ 以 tsc/vitest 为工具，但二者要等 RR01（脚手架）合入主仓才存在；
  RR03（scripts 域、零 TS、仅依赖 node）按建议顺序先于 RR01 合入开工，字面上无法执行 §5 ①②③。
- 决定：RR01 合入前的 scripts 域卡，以「**卡面验证口径 + node:test（node 22 内建测试器，零 npm 依赖）
  + 变异红验**」作为门禁四绿的等价物；不为跑测试引入任何 npm 依赖（避免与 RR01 脚手架的
  package.json/lock 产生路径冲突）。RR01 合入后本条款即失效，后续一切卡回到 §5 全口径。
- 依据：ARCHITECTURE §2 分层——scripts/ 属证据层（数据采集），不属核心层 TS，用 node 内建测试器
  与其依赖极简定位一致；RUNBOOK §1.11 无人值守决策权。本决定不引用 §5 降级条款（该条款仅 RR01 专属）。
- 实施例：RR03 以 `node --test scripts/fetch-history.test.mjs`（12 用例）作域/全量门禁，
  变异红验两轮（去重窗口 5→0、未来容差 5→0）均如期转红、复原转绿，证据见 task_logs/RR03_done.md。

## D011 RR01 合入前 docs+发布域（纯 yaml/md）卡的门禁等价口径（2026-10-11，会话 S1011-0143）

- 现象：RR02（CI 建卡）基于 main 开工时主仓尚无 package.json（RR01 未合入），tsc/vitest 无对象，
  字面无法执行 RUNBOOK §5 ①②③；D010 仅覆盖 scripts 域。
- 决定：纯 yaml/md 卡以「actionlint + PyYAML 双语法校验 + 结构断言脚本 `scripts/check-ci.py`
  （把卡面『步骤结构与修向逐条对照』实现为可复现断言，兼作变异红验靶）+ 变异红验」作为门禁
  四绿的等价物；全量 vitest 基线以 RR01 worktree 复跑复核（本卡零 TS 改动）。RR01 合入后失效。
- 依据：D010 同构延伸；RUNBOOK §1.11 无人值守决策权。
- 实施例：RR02 以 actionlint 1.7.12（exit 0）+ PyYAML 6.0.3 parse OK + check-ci.py 绿 +
  三变异红验（删 vitest 步骤/改 ubuntu-latest/撤徽章均红→复原绿）交付，RR01 worktree 基线 4/4 绿。

## D012 CI 徽章 owner 取 thequipster（2026-10-11，会话 S1011-0143）

- 现象：Actions 徽章 URL 需完整 owner/repo，而 GitHub 仓库尚未创建（发布留给用户，RUNBOOK §1.7）。
- 决定：徽章指向 `thequipster/reset-radar`；依据 git config user.name=thequipster + D007 版权人
  同名先例。若实际 GitHub 用户名不同，RR11「README 内链接全部可达」检查兜底替换。
- 依据：RUNBOOK §1.11 无人值守决策权。
