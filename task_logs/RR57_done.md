# RR57 — 收起条方框 + 「这周期一定用卡，哪天用」

> 状态：完成。沙盒 + 用户 PC 均通过 tsc / vite build / vitest；release 构建、打包、原生 QA 与截图核对见文末「PC 验证」。未提交、未 push。

## 1. 收起条四周的矩形底色（用户截图）
- 根因：外壳的 `box-shadow`（`--shadow-panel` 0 12px 40px + `--glow-blue`）远超窗口的 8 px 透明边距，
  阴影在窗口矩形边界被硬切，形成一圈半透明方框（截图内约 15–20% 的压暗）。
- 修法：`src/ui/widget.css` 新增 `--shadow-float`（深色 `0 2px 5px rgba(0,0,0,.45)`，浅色 `0 2px 5px rgba(20,40,80,.22)`；
  偏移 + 模糊 ≤ 8 px，阴影在到达窗口边缘前衰减为 0）。
  `CompactBar .shell`、`DashboardPanel .panel`、`PeekCard`、`Orb .orb` 改用它；面板内部元素仍用原 token；窗口边距不变。

## 2. 「这个周期我一定会用卡，告诉我哪天用」
- 口径（用户给的）：一个 5 小时短窗全用完 = 周额度 1/6 ⇒ 连续用约 30 小时用完一整周；与学到的日用量无关。
- 新纯函数 `src/lib/v3/sprintPlan.ts`：速率 = 100/30 %/h × hoursPerDay/24；
  候选用卡时刻 = 现在 / 当前额度用光 / 每次自然恢复后再用光 / 最晚（safeDeadline − 30 min）；
  取净收益 `gain(u) = min(100, rate·(nextReset − u)) − quota(u)` 最大者，并列取最早；
  用卡那刻还剩 >0.5% ⇒ `deadline` 并报 `overwritePercent`；用卡后 quota=100、nextReset=useAt+7d；多张卡按到期顺序接力。
- 结论规则（可手算）：额度刚用光那一刻用卡；若自然恢复离用光不到 30 h（按每天小时数折算），先等恢复、把恢复的额度用完再用；永远不晚于最晚期限。
  净收益并列时选"被覆盖的额度最少"的那个（按最快用法算，用光前任何时刻净收益相同，但真实用量不到最快时越早用白扔得越多）。
- 排不出日程时说明原因：服务端有卡但本地没登记 → 提示去「我的设置 → 我的卡」登记（界面给按钮）。
- 数据：`PersonalInputsData.cardSprint {enabled, hoursPerDay} | null`（inputVersions field `cardSprint`），`usePersonalInputs.setCardSprint`。
- 文案：`plainAdvice` 接 `sprint` 输入 → 覆盖「重置卡」与「撑到几号」两块、7 天条标 `用「卡」HH:MM`、输出 `sprint.lines/note/assumptions`。
- 界面：总览「重置卡」下方新增开关「按用量算 / 一定用卡，告诉我哪天」；开启后选「每天能用 8/12/16/24 小时」，逐卡给出 **哪天用 + 为什么 + 最晚**。
  迷你卡（Peek）标题同口径。规划签名不含该开关 ⇒ 切换不重跑蒙特卡洛。

## 3. 测试
- 新增 `src/lib/__tests__/sprintPlan.test.ts`（8 例：速率、用光即用、等自然恢复、到期强制 + 覆盖百分比、双卡接力、12 小时折算、并列选覆盖最少、无数据/无卡）。
- `src/ui/__tests__/ui.plain-advice.test.ts` +5 例（关/开、12 小时 + 到期约束、额度见底、无卡/未登记）。
- 沙盒：tsc 0 错；vite build OK；vitest 仅 ui.brand-icon 4 例因沙盒缺二进制图标失败（基线即如此）。

## 4. 改动文件
源码 14 个：src/lib/v3/sprintPlan.ts（新）、src/lib/v3/cards.ts、src/ui/usePersonalInputs.ts、src/ui/plainAdvice.ts、src/ui/V3Dashboard.tsx、
src/ui/V3Dashboard.module.css、src/App.tsx、src/ui/widget.css、src/ui/CompactBar.module.css、src/ui/DashboardPanel.module.css、
src/ui/PeekCard.module.css、src/ui/Orb.module.css、src/lib/__tests__/sprintPlan.test.ts（新）、src/ui/__tests__/ui.plain-advice.test.ts。
脚本：scripts/rr57-shot.mjs（新：收起条/迷你圆/冲刺模式截图 + 演示账号登记卡再清理）、scripts/rr56-b64.mjs（分段，read_file_range 每文件只读到 100 行）、
scripts/rr56-package.mjs（使用说明补 RR57 两条）。

## 5. PC 验证（2026-10-14 晚）
- `npm run build`（tsc && vite build）通过；`npx vitest run` 65 文件 / 559 测试全绿。
- `node scripts/rr56-cargo.mjs build --release --features tauri/custom-protocol` 33 s 完成（仅既有 .rsrc 链接警告）。
- `node scripts/rr56-package.mjs` → release-qa/RR56-package/{reset-radar.exe 28,282,968 B, WebView2Loader.dll 160,880 B, 使用说明.txt 3,030 B}，
  release-qa/reset-radar-RR56.zip 8,206,596 B；SHA-256 exe 01CE5A24…330D、zip 995CAEB8…6F5D（scripts/rr56-sha.mjs）。
- `node scripts/rr56-qa.mjs … rr57 9356 --perf-seconds=60`：19/19 PASS；真实数据默认收起 CPU 窗口 A 0.11 核（启动规划尾巴）/ B 0.00 核。
- `node scripts/rr57-shot.mjs`：收起条截图（460×76 CSS px）像素核对——窗口最外 2 个设备像素环 alpha 最大 7/255（深）/ 3/255（浅），
  外壳阴影在边距内衰减到 0，不再有方框；迷你圆边缘 alpha 0。冲刺模式：演示账号登记"演示卡"（10/19 到期）后，
  24 h → 「演示卡」建议 明天 06:34 用（刚好用完）；12 h → 明天 15:11（并列取覆盖最少）；关掉开关并清理 demo 输入后恢复原样。
  截图：release-qa/RR56-qa/rr57-{bar-dark,bar-light,orb-dark,sprint-dark,sprint-12h-dark}.png，报告 rr57-shot-report.json / rr57-report.json。
- 未动用户真实个人输入（只写 demo 命名空间并已清理）；未提交、未 push；版本号保持 0.2.0。
