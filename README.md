# reset-radar · 重置雷达

> 看得见准头的 Codex 重置风险与用卡规划器。
> A Codex reset-risk & credit planner that **proves its own accuracy**.

[![CI](https://github.com/thequipster/reset-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/thequipster/reset-radar/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 为什么做这个

现有的 Codex 额度悬浮窗会告诉你"明天强制重置风险 70%"，但从来没人回答：**这个 70% 说过几次准几次？**
reset-radar 的核心差异是**校准闭环**——每条风险预测都被落盘记录，事后与实际重置对答案，
命中率与 Brier 分数直接展示在界面上。模型准不准，摆在明面上，而不是藏在公式里。

## 功能（随迭代推进，进度见 [BACKLOG.md](BACKLOG.md)）

- 📡 **重置风险雷达**：星期基线 + 历史校准的强制重置概率，每个数字附带可解释因子
  （"为什么是 70%"一条条列出来）。
- 🏃 **每日配速建议**：把剩余额度按风险摊到每天，公式三行说完，不搞黑盒。
- 🎴 **重置卡规划器**：基于期望增量模型告诉你"今天用卡/等到周几用/这周期别用"，
  并给出"用卡后 24h/48h 撞上强制重置"的概率。
- 🎯 **校准面板**（差异化核心）：预测 vs 实际的命中率、Brier 分数、逐周趋势。
- ⚡ **秒开**：快照持久化 + 热启动，首屏先画上次数据再后台刷新。
- 🔒 **本地优先**：无遥测，无账号，密钥不出系统 keyring。

## 技术栈

Tauri 2 · React · TypeScript（核心算法为零依赖纯函数，100% 单测）· vitest · GitHub Actions

架构详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 开发

```bash
npm install
npm run tauri dev     # 开发运行
npx vitest run        # 全量测试
npm run tauri build   # 构建（注意：gnu 本机构建需 custom-protocol 特性，见 RUNBOOK §10）
```

本项目由「永续看板循环」驱动迭代：AI 工位按 [RUNBOOK.md](RUNBOOK.md) 协议领卡开发，
一切进度与证据见 [BOARD.md](BOARD.md) 与 [task_logs/](task_logs/)。

## 致谢与许可

算法思路部分借鉴自 MIT 许可的 [codex-cockpit](https://github.com/HouSiyuan2001/codex-cockpit)
与 [codex-resets.com](https://codex-resets.com) 的公开数据。本项目基于 [MIT License](LICENSE) 开源。

---

*Status: 🚧 bootstrapping — v0.1.0 目标见 [ROADMAP.md](ROADMAP.md)。此仓库由 AI 工位夜间自主推进。*
