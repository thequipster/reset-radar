# RR33 done — MIT 版权声明如实补齐（用户裁决路线）

用户裁决（2026-10-11，TRUTH §U）：雷同疑问答复后选「如实声明」，不重写移植代码。

## 改动（8 路径，全部注释/文档级，零可执行代码变更）
- THIRD_PARTY_NOTICES.md（新增）：codex-cockpit MIT 许可全文原文保留 + 复用清单表（逐行比对定档数字）。
- src/lib/resetCard.ts、src-tauri/src/codex.rs、src/lib/planner.ts：文件头补原版权行 + 指向 THIRD_PARTY_NOTICES.md。
- src/lib/risk.ts：补「思路重写非逐字复用」声明指引。
- README.md 致谢：补版权行、「部分代码为注明出处的逐行移植」表述与 THIRD_PARTY_NOTICES.md 链接。
- TRUTH.md §U：追加本裁决记录。

## 重叠度实证（立卡依据，主会话实测 2026-10-11）
归一化（去空白/去行内注释/排序）逐行比对 codex-cockpit v0.3.0-beta.5：
- resetCard.ts：原 341 行 / 本仓 331 行 / 同文 263 行（~77%）；git diff --no-index --numstat = 119增/115删。
- codex.rs：原 1242 行 / 本仓 352 行 / 同文约 300 行（握手段）。
- planner.ts vs dynamicQuota.ts：同文 46 行（公式段）。
- risk.ts vs reset_forecast.rs：跨语言重写，无逐行同文。

## 门禁（worktree agent/RR33，全绿）
- npx tsc --noEmit → exit 0
- npx vitest run src/lib → 152/152（14 文件）
- npm test 全量 → 238/238（25 文件，0 failed）
- npm run test:node → pass 38 / fail 0，exit 0
- node scripts/check-release.mjs → OK：版本 0.1.0 同步；README 14 条相对链接全可达（含新增 THIRD_PARTY_NOTICES.md）
- cargo check --tests（gnu 工具链，PATH 按 RUNBOOK §10）→ Finished dev profile 1m21s，无 error/warning 输出
- 变异红验：不适用——无可执行代码变更（注释+markdown），沿 RR12 artifact 批「无代码可变异」口径。

## 出处
- codex-cockpit LICENSE 原文：quota-analysis/codex-cockpit/LICENSE（Copyright (c) 2026 Quota Float contributors）
- TRUTH §1 来源 3；docs/DECISIONS.md D015；README「致谢与许可」节；重叠数字为本会话 comm/归一化实测（命令见心跳）

## 排障遗产
- 无异常。worktree node_modules junction 按 B09 常规拆除。
