# RR17 交付档案（统一前瞻24h回测对账 + 自动对答案）

- 卡面：BACKLOG RR17（🧱建卡，core+data采集；首轮 REVIEW G5）＋BOARD 补充口径「统一24h前瞻窗口选择、自动对答案产物、日志评估时点与旧行排除」。
- 会话：S1011-RR17 领卡建 worktree（14:02）未及落码；S1011-RR17b 14:28 接管续作至交付。
- 分支/commit：`agent/RR17 @ 657da35`（单 commit，基于 main 299c1d5）。
- patch 备份：`task_logs/RR17.patch`（对 main `git apply --check` 通过）。

## 改动范围（27 文件 +1440/−155）

- `src/lib/calibrationWindows.ts`（新）：`selectCompletedPredictionWindows` —— 窗口选择唯一实现；
  六类排除计数（legacy/invalid/late/pending/outside-history/duplicate）；(start,end] 事件匹配；
  同日取记录时刻最早合法行。
- `src/lib/calibration.ts`：`joinPredictionsWithResets` 委托上述选择器（删旧同日历对账）；
  `PredictionLogRow` 增 windowStart/windowEnd 可选字段。
- `src/lib/watchCalibration.ts`：`joinProspectivePredictions` 复用同一选择器（删重复实现），
  增 coverageStart 参数。
- `src/lib/calibrationSnapshot.ts`（新）：机读快照 `reset-radar/calibration@1`（计分/watch比较/
  逐窗outcomes/排除计数/分页覆盖）；分页 has_more=true 时早于最早已返回 regular 的窗口按
  超出覆盖排除。
- `src/lib/historyPrediction.ts`（新）：CLI 预测以本次运行时刻开窗，历史 fetchedAt 只验新鲜度。
- `scripts/refresh-calibration.mjs`（新）＋`fetch-history.mjs` 接线：历史刷新后自动生成
  `data/calibration.json` 与 `docs/calibration-latest.md`（原子写，坏历史保留上代产物）。
- `scripts/log-prediction.mjs`：stale/invalid 历史拒绝落盘（原为警告后按 fetchedAt 倒签）。
- `scripts/calibration-report.mjs`：报告改「计分窗口」口径＋排除明细行。
- 测试：`calibration.auto.test.ts`（新，合成序列：自动改答案/银行事件不算/分页截断/stale/
  同日首行/CLI时点）、`refresh-calibration.test.mjs`（新，临时目录端到端＋只读性＋原子性）、
  `calibration.core.test.ts` 重写 join 组＋两个补钉用例、Node 其余同步更新。
- 数据/文档产物：实跑刷新的 `data/resets-history.json`（60 事件）、新 `data/calibration.json`、
  `docs/calibration-latest.md`、完成报告 `docs/backtest-window-20261011.md`。

## 门禁四绿（S1011-RR17b 复跑）

1. `npx tsc --noEmit` 退出 0。
2. 域 `npx vitest run src/lib/` **147/147**。
3. 全量 `npx vitest run` **177/177 0 failed**（基线 170 → 只升）。
4. 变异红验三组全红后复原复绿，记录 `task_logs/RR17_artifacts/mutation-proof.md`：
   M1 边界反转（首轮存活→补单事件断言→红1）、M2 删旧行排除（红1：legacy:0 vs 1）、
   M3 删24h窗长校验（首轮存活→补23h/25h拒收用例→红1）。两组首轮存活=真盲点，已补钉不掩盖。
- Node 门：`npm run test:node` **38/38**（基线 37 → 只升）。

## 真值出处

- 24h horizon：`src/lib/risk.ts` `RESET_RISK_HORIZON_MS`（RR04 起既有）。
- 窗口语义先例：`watchCalibration.ts`（RR16 定档，docs/watch-calibration-20261011.md 移交本卡）。
- 分页 schema：TRUTH §2 B07（`pagination.has_more`）。
- 严格 ISO 解析：`watchSignal.ts` `parseIsoWithZone`（RR16）。
- 北京日边界：D004 `resetCard.beijingCalendarDateKey`。
- 实跑证据：`task_logs/RR17_artifacts/live-refresh-summary.json`（state=fresh、3 行全 legacy、
  n=0、coverageStart=null）＋ `live-calibration-latest.md`。

## 待用户清单

- 无阻塞项。计分样本需自然积累（RR16 后构建的 app / 新版 log-prediction 落盘＋窗口完成＋
  历史覆盖），当前 n=0 为诚实预期，非缺陷。

## 排障遗产

- 变异 M1/M3 首轮存活的教训写进 mutation-proof.md：**边界语义测试必须单事件分别钉**，
  多事件合并断言会同答两种语义；后续卡变异步骤照此自查。
- 继承在制品（上会话 14:02–14:2x 已写完 90% 代码与测试但 wip 仅一行）——接管时先全量审读
  再跑门禁，不要假设 wip 文件反映实际进度。

## →下轮

- 合入后下一卡 RR28（校准摘要只读桥接，data-layer+core）：以 `data/calibration.json` /
  `buildCalibrationSnapshot` 为只读输入，Rust 仅 IO，UI 零评分公式。
- 再下一卡 RR27（照六图 UI 重构），消费 RR28 契约。
