# reset-radar — AI 工位须知

**你进入的是永续看板循环的工作仓。开工前必读 `RUNBOOK.md`（协议唯一权威），按其 §2 会话流程执行。**

最低限度铁律（全文见 RUNBOOK §1）：

1. 先读 `BOARD.md` 顶部 STOP 区——有 STOP 就只写收工心跳然后结束。
2. 一次会话一张卡；改动只在 worktree 分支 `agent/<卡号>`，主仓只读（看板文件除外）。
3. 门禁四绿 + 变异红验必做；证据出处写进 done（证据源清单在 `TRUTH.md` §1）。
4. **绝不 push 远端、绝不 force**；发布动作永远留给用户。
5. HEARTBEAT/BACKLOG/task_logs 历史只追加不修改。
6. 用户离线期遇事按 `docs/ARCHITECTURE.md` 原则自行裁决并记 `docs/DECISIONS.md`，不阻塞提问；
   只有「删既有功能 / 改 License / 改协议」立 🟣待用户卡搁置。
7. 环境：PowerShell 一律 `pwsh`；Git Bash 给子进程传 PATH 用 `/c/...` 风格；
   Rust/MinGW 工具链路径见 RUNBOOK §10；Tauri gnu 构建必带 `--features tauri/custom-protocol`（TRUTH B01）。
8. 时间盒 50 分钟；到点未完更新 wip 附「→下轮」后收工，不硬撑。

参考实现（MIT 源码，借鉴思路需注明出处文件）：
`C:\Users\slsjz\.zcode\workspace\default\quota-analysis\codex-cockpit`
