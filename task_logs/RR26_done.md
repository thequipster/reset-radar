# RR26 done — 三阶段设计文档与UIUX生图提示词

- 会话：S1011-design3；分支 agent/RR26；worktree C:/Users/slsjz/Desktop/reset-radar_wt/RR26。
- 基线 main bcb3b5a8ad11e7a57f7d5d6038445cefb39e1120；单commit 961fdfb01c8a864b0502cd719b6e1d579b3814e1。
- Diffstat：12文件、752行新增；无业务代码、Rust、窗口配置、数据夹具或版本变更。
- Patch：task_logs/RR26.patch（76147字节），交付时主仓git apply --check通过，未应用。未合入、未push。

## 内容与用户裁决
- 正式落档docs/design/01-proposals.md（42候选）、02-spec.md（IA/三态/全状态/阶段4清单）、03-image-prompts.md（6组独立可复制prompt）；ref/README.md交接目录已创建，没有参考图片。
- 用户阶段3新裁决仅约束UIUX，撤销原任务的hex/风格词要求；02撤销固定风格/字体/材质/默认主题，深浅主题切换与本地记忆的UX保留。TRUTH §U追加原话。
- 六图：展开态、悬浮条、迷你预览、组件解释、全状态、深浅主题。每组均有场景/视角、区域、交互/语义、视觉自由和建议画幅。
- RR24/RR25落档事项由本卡统一交付，随本卡合入后处理闭环，不再另领重复卡。
- Luna拷贝/调整01与02并只读复核03；主会话保留主题功能、补收益单位、完成门禁与交付。前两阶段外部草稿保持原件；03另有外部审阅副本。

## 门禁与输出（RR26 worktree）
| 项 | 命令 | 结果 | artifact |
|---|---|---|---|
| 治理 | npx tsc --noEmit | exit0，无诊断 | tsc.txt |
| UI回归域 | npx vitest run src/ui | exit0，11/11 | vitest-ui.txt |
| 文档验收域 | node task_logs/RR26_artifacts/check-design.mjs | exit0，6prompt/42候选/状态语义/无固定hex/阶段4范围 | document-green.txt |
| 全量 | npx vitest run | exit0，89/89，0failed | vitest-full.txt |
| 变异红验 | 同文档验收器，03状态05未知卡改成零 | exit1，unknown/zero语义断言红 | document-mutant-red.txt |
| 复原复绿 | 字节级恢复原03后重跑 | exit0 | document-restored-green.txt |
| Git检查 | git diff --cached --check | exit0 | 会话输出 |

artifact均在task_logs/RR26_artifacts/。基线主仓未合RR21，因此全量89，不是RR21待合分支的93；本卡未减少测试。文档域变异针对本卡行为，不拿无关业务变异冒充。Rust无改动，无Rust追加门。

## 变异三要素
1. 改了什么：状态05“卡数未知 / 卡 —”→“无可用重置卡 / 卡 ×0”，故意把未知变成零。
2. 哪条红：check-design.mjs:27，state 05 must distinguish unknown credits from known zero。
3. 红在哪：assert.match匹配不到未知状态的呈现，exit1；按原字节恢复后exit0。后续补收益单位/条形比例亦经过文档验收。

## 真值与借鉴出处
- TRUTH.md:141起§U：用户最新裁决原文；当前用户允许阶段3、阶段4执行其它卡的授权仍生效。
- src/ui/adapters.ts:17 DashboardViewModel；:26 resetCredits可空；:32–34 risk/dailyPlan/cardPlan；:62–87计划缺失条件、未知过期时刻与日需兜底。
- src/lib/planner.ts:25–31每日追加建议单位；src/lib/resetCard.ts:42–74期望收益/日期/公告模型展示的字段边界。
- ARCHITECTURE§2/§4、RUNBOOK§1/§5/§6、BACKLOG各相关卡提供分层、验收与依赖约束。
- docs/screenshots三图的只读底稿与原独立01/02草稿为设计依据（01内详列）；本轮未改UI，所以无新增实跑截图。
- 未复制参考实现代码；01/02窗口方向的历史出处仍记MIT codex-cockpit/src-tauri/tauri.conf.json（TRUTH§1来源3）。此次提示词/IA呈现是本轮设计。

## 限制、排障与→下轮
- 没有生成图片或跨图片模型评测。静态文档验收不能保证图片排版/中文拼写，不给虚构成功率；用户生成并选中图后再审。
- 补丁首轮通过PowerShell文本管道写出时CRLF转换导致TRUTH上下文不匹配；保留异常产物RR26.powershell-crlf.patch，改以subprocess原始字节导出标准RR26.patch，主仓apply --check通过。合入只用标准RR26.patch或commit，不用异常备份。
- 等用户图放docs/design/ref/后，阶段4按清单逐卡执行UI及其它看板任务；当前仅交付阶段3文档。
- worktree有node_modules junction，拆除前先核实并拆链接；本轮保留分支供用户读取/放图，未拆worktree。
- 当前wip将归档为RR26_wip.archive.md保留历史，不继续占槽；done/patch完成后看板转待合入。
