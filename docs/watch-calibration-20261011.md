# Watch 信号接线与前瞻校准说明（2026-10-11）

## 当前结论

RR16 把经过有效性校验的上游 `active_watch` 接入既有风险评估，并为后续校准保留同一条预测中的无 watch baseline 与含 watch 结果。Watch 继续使用原有 25% 融合权重；没有新增模型参数或权重调节入口。

截至本报告引用的生产状态快照，`active_watch: null`，因此没有生产 watch 信号可用于证明接线已在真实 active watch 下运行，也没有可计分的 watch 配对样本。最新校准报告的 watch 同样本数为 `n=0`，Brier 与命中率均为空值（显示为“暂无可计分日”）。当前不能据此宣称 25% 权重改善了预测。

## 信号与风险接线

`src/lib/watchSignal.ts` 对上游信号做结构、level、百分比和带时区 ISO 时间校验；只接受 `elevated`、`strong` 两种 level，拒绝过期、非法和超出未来容差的信号。无信号、不可用或无效状态不会被推断成概率。

有效百分比传入 `src/lib/risk.ts` 的 `assessResetRisk`。既有 `WATCH_WEIGHT = 0.25` 将 watch 概率与融合前风险做加权融合，并在 `watchComparison` 中留存权重、watch 百分比和融合前 baseline。该常量对应既有模型行为，不是 RR16 新增的校准参数。

实现借鉴的 MIT 参考源码为 `C:\Users\slsjz\.zcode\workspace\default\quota-analysis\codex-cockpit\src-tauri\src\reset_forecast.rs`：第 8 行定义 5 分钟未来容差；第 76–83 行描述 watch 输入字段；第 229–238 行以 25% 融合 watch 概率；第 246–265 行校验 active watch 的 level、百分比、观测时刻及过期时刻。项目证据源登记见 `TRUTH.md` §1“参考实现（MIT）”。

## 前瞻配对口径

`src/lib/watchCalibration.ts` 仅比较同一预测记录中事先保存的 `baselineRisk` 和最终 `predictedRisk`，两列使用完全相同的实际结果样本：

- 预测窗口固定为风险模型定义的未来 24 小时 `(windowStart, windowEnd]`；记录必须同时保留窗口起止时刻及 baseline/watch 对照元数据。
- 预测的 `fetchedAt` 必须不晚于 `windowStart`，且 `windowEnd` 不晚于校准数据的 `as_of`；窗口完整结束并被历史数据覆盖后才计入。
- 每个北京日期先选首条满足窗口、时间与风险格式条件的候选记录，再检查该行是否含有效 watch 对照。若首条合格记录没有 watch，后续补行不能替代它。
- 实际结果只统计 `reset_type=regular` 的重置；banked 事件不算额度强制重置。
- 历史 watch 缺失时不得用当前 watch、四舍五入后的因子或事后信息倒填。没有有效配对样本时 `n=0`，Brier、命中率等指标保持 `null`（报告显示为“暂无可计分日”）。

这些限制避免把窗口完成前的信息、同日后续补行或当前状态混入先前预测。旧日志没有保存窗口和 baseline 时不具备前瞻配对资格；保持原样，不回填或改写。

## 现有证据与边界

- `task_logs/RR16_artifacts/status-live.json` 的状态响应记录 `active_watch: null`。这是当前快照，不代表上游从未发布过 watch。
- `docs/calibration-latest.md` 记录本轮 watch 配对 `n=0`，两种策略的 Brier 与命中率均为空；普通按日校准同样没有已完成样本可计分。
- RR16 的 watch 校验与配对单测使用合成输入，用于验证边界和规则，不能作为真实 active watch 运行证据或真实校准样本。
- 通用旧版日历回测的修正属于后续 RR17 范围。本说明只界定 watch 信号接线与前瞻配对，不声称整个校准流程均已验证正确。

## 证据出处

- 信号验证：`src/lib/watchSignal.ts`；参考实现 `reset_forecast.rs:8,76–83,246–265`。
- 25% 权重与 baseline 留存：`src/lib/risk.ts` 中 `WATCH_WEIGHT`、`watchComparison` 与 `tracker-watch` 融合逻辑；参考实现 `reset_forecast.rs:229–238`。
- 预测窗口和日志字段：`src/lib/predictions.ts` 中 `PredictionRecord`、`buildPredictionRecord`；窗口长度定义于 `src/lib/risk.ts` 的 `RESET_RISK_HORIZON_MS`。
- 前瞻配对和同样本评分：`src/lib/watchCalibration.ts`；展示与 `null` 格式化：`scripts/calibration-report.mjs`。
- 当前上游状态快照：`task_logs/RR16_artifacts/status-live.json`；本轮报告：`docs/calibration-latest.md`。
- 允许引用的证据源目录：`TRUTH.md` §1。


## 完成本卡验证

- tsc退出0；核心及adapter域146/146、全量170/170、Node37/37通过，Vite与GNU custom-protocol release构建通过（既有manifest合并warning仍存在，退出0）。输出见task_logs/RR16_artifacts。
- 权重25%改0、精确到期<=改<、放开事前记录条件、允许后补watch抢占首条，各使对应测试失败并原字节恢复。事前条件首轮变异曾存活，原因是组合样本中前一条非法元数据遮住后续记录；补孤立事后记录断言后重验红，最终全量与Node复绿。未掩盖首轮盲点。
- 实跑owned PID26612，读取真实新鲜/status与额度，watch null、UI风险32.5%、日志钩子ok。生产日志361字节完全不变（SHA256 4A5553BEC97067F643FDC4A8C97888EB4023BEA908C3519E3630FBF705268673），无残留lock；只停止本轮owned进程。没有注入生产watch、没有补历史预测。证据production.json与production-cdp.json。
