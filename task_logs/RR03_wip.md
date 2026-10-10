# RR03 wip — 🎣挖卡：拉取 codex-resets.com 真实重置历史（会话 S1011-0113）

- 领卡时间：2026-10-11 01:16（心跳已写领卡行）
- 分支/worktree：agent/RR03 @ ../reset-radar_wt/RR03（自 main a0af473）
- 卡面修向：`scripts/fetch-history.mjs`（node 零依赖，4s 超时 + UA）拉
  `https://codex-resets.com/api/v1/resets?limit=100&order=desc` + `/api/v1/status`，
  清洗（去未来日期、5 分钟去重，参考 reset_forecast.rs sanitize_history 并注明出处）后存
  `data/resets-history.json`（含 fetchedAt）。只采集不实装算法。
- 验证口径：脚本可重复运行幂等；JSON schema 写进 TRUTH §2 新锚点；
  条数/时间跨度/星期分布统计表附 done。
- 进行中步骤：
  1. [ ] curl 探活两个端点，核实真实响应字段（证据铁律：回源核实）
  2. [ ] 读参考实现 reset_forecast.rs sanitize_history（注明出处）
  3. [ ] 写脚本 + node --test 单测（零依赖）
  4. [ ] 跑脚本出 data/resets-history.json，复跑验幂等
  5. [ ] 统计表 + TRUTH §2 锚点 + done 交付
