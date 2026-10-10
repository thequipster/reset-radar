# ARCHITECTURE — reset-radar 架构定稿

> 本文件是本项目的架构宪法。夜间 AI 会话拿不准时以本文件原则裁决，并记入 docs/DECISIONS.md。
> 修改本文件 = 架构变更，需在文末追加变更行。

## 1. 一句话

**看得见准头的 Codex 重置风险与用卡规划器**：本地优先的桌面小工具，预测强制重置风险、
给出每日配速与重置卡使用时机，并**持续校准自己的预测**（命中率/Brier 分数对用户可见）。

## 2. 分层（依赖只能向下）

```
┌────────────────────────────────────────────┐
│ UI 层  src/ (React + Tauri webview)        │  薄壳：只做展示与交互，零业务规则
├────────────────────────────────────────────┤
│ 核心层  src/lib/ (纯 TS, 零 React/零 Tauri) │  risk / planner / card / calibration
│  全部函数可解释：输出必带 factors[]          │  100% vitest 覆盖率目标
├────────────────────────────────────────────┤
│ 数据层  src-tauri/src/ (Rust)              │  采集 codex app-server / 官方接口 /
│  快照持久化 + 热启动（SWR）                  │  codex-resets.com 历史；出站全部带超时
├────────────────────────────────────────────┤
│ 证据层  data/ + docs/                       │  真实历史夹具、预测日志、校准报告
└────────────────────────────────────────────┘
```

硬约束：
- 核心层不 import 任何 UI/框架模块（和参考项目 dynamicQuota.ts 同构）。
- UI 层不许出现业务公式；数字只能来自核心层。
- 数据层输出必须是核心层可消化的纯数据（无格式字符串拼接）。

## 3. 目录规划

```
reset-radar/
├── BOARD/BACKLOG/HEARTBEAT/RUNBOOK/TRUTH.md   # 看板五件套（协议见 RUNBOOK）
├── ROADMAP.md                                  # 想法池（REVIEW 拍取材处）
├── docs/ARCHITECTURE.md  docs/DECISIONS.md     # 本文件 + 决策日志
├── docs/calibration-latest.md                  # 最近一轮校准报告（REVIEW artifact）
├── docs/screenshots/                           # UI 截图（REVIEW artifact）
├── src/lib/                                    # 核心层：risk/planner/card/calibration
├── src/                                        # UI 层（RR01 脚手架生成）
├── src-tauri/                                  # 数据层（Rust）
├── data/                                       # 真实数据夹具 + 预测日志（JSONL）
├── scripts/                                    # 数据采集/校准脚本
└── .github/workflows/ci.yml                    # CI（MSVC 构建发布）
```

## 4. 数据流

```
codex app-server ──┐
官方 credits 接口 ──┼→ Rust 采集 → 快照(内存+last-snapshots.json) → 事件 → UI
codex-resets.com ──┘                                                      │
                            每日预测落盘 data/predictions.jsonl ◄──────────┤
                                          │                                │
校准报告 docs/calibration-latest.md ◄── core/calibration 回测 ◄───────────┘
```

## 5. 核心算法边界（复杂度红线）

- 风险模型 = 星期基线 + 历史间隔校准 + 可解释因子叠加（参考 reset_forecast.rs 量级）。
  **禁止**引入：动态规划价值表、多维先验数组、超过 6 个可调参数的曲线。
- 每日建议 = 均匀配速 + 风险²前拉 + 软上限（三个公式内说完）。
- 用卡规划 = 期望增量模型（min(max(0, 消耗−剩余), 回满量) 逐日求和，参考实现见 TRUTH §1）。
- **一切常数必须带出处注释**（来源文件/推导），违反 = 门禁不过。

## 6. 里程碑（对应 BACKLOG 首批卡）

- M0 地基：RR01 脚手架 / RR02 CI / RR03 真实数据
- M1 核心：RR04 风险 / RR05 配速 / RR06 用卡 / RR07 校准器
- M2 成品：RR08 数据层 / RR09 UI / RR10 预测日志
- M3 发布：RR11 打磨 → 用户手动 push 发布
- M4 循环：RR12 首轮 REVIEW → 进入永续迭代（修→融→测→猜→挖→修）

## 变更记录

- 2026-10-11 初始化会话定稿（AI 决定，见 DECISIONS.md D001-D009）。
