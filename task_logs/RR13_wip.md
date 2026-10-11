# RR13 wip — 胶囊溢出小修（ui 域）

- 会话：S1011-0913（2026-10-11 09:17 领卡，LIGHT 槽）
- 分支：agent/RR13（基于 main a562c9b）；worktree ../reset-radar_wt/RR13
- 卡面（BACKLOG RR13）：
  - 现象：窗宽 420（tauri.conf.json:17）下胶囊右侧「重置风险」标签被截断（RR09 截图实证）
  - 证据：src/ui/Capsule.tsx:27 padding 14px 22px / :64 标签；docs/screenshots/20261011-capsule.png
  - 修向：窗宽 420→460 或压缩胶囊内边距（执行会话裁决并在 done 注明理由）；README 上墙截图同步换新
  - 验证口径：release 截图（B01 特性+PrintWindow B09）无截断 + 四绿（ui 域）
- 计划：
  1. 读 Capsule.tsx / tauri.conf.json / App.tsx / 旧截图，量出截断成因
  2. 裁决修法（460 vs 压 padding），落码
  3. 门禁：tsc / ui 域测试 / 全量 / 变异红验
  4. release build（--features tauri/custom-protocol，B01）+ PrintWindow 截图（B09）证无截断
  5. README 截图换新；docs/screenshots/<今日>-capsule.png 落盘
- 状态：09:17 开工，读上下文中
