# RR28 交付档案（校准摘要只读桥接）

- 卡面：BACKLOG RR28（🧱建卡，data-layer+core；S1011-design4 立卡）。
- 会话：S1011-RR28（本会话，base main 971be17）。
- 分支/commit：`agent/RR28 @ c53fc42`（单 commit）；patch 备份 `task_logs/RR28.patch`（对 main 干净适用）。

## 改动范围（12 文件 +429/−15）

- `scripts/refresh-calibration.mjs`：同一快照原子写入**应用配置目录** `calibration.json`
  （与 canonical 预测日志同目录）；测试可用 `summaryOutPath` 重定向（卡面「若脚本先生成摘要，
  用只读Tauri命令取真实文件并标明生成时刻」的落地点）。
- `src-tauri/src/calibration_summary.rs`（新）：`read_summary` 只读IO——文件缺失=空内容，
  其他读失败报Err不冒充缺失（predictions.rs 同款口径）；3 条 Rust 单测。
- `src-tauri/src/lib.rs`：注册 `read_calibration_summary` 命令（固定 app_config_dir，不接受传路径）。
- `src/lib/calibrationSummary.ts`（新）：纯映射 `parseCalibrationSummary` —— missing/invalid/ok
  三态；ok 字段=state/generatedAt/historyAsOf/coverageStart/sampleCount/realizedWindows/
  brier/hitRate/thresholdPercent/watchPairedSamples/excluded 六计数；任何契约不符整体判
  invalid 不做部分修补；n>0 必须有有限指标、n=0 指标必须为 null（防脏数据虚报）。
  注意：excluded 原文键是 kebab-case `outside-history`（WindowExclusion 序列化形）。
- `src/ui/adapters.ts`：VM 增必填字段 `calibrationSummary: CalibrationSummaryView`；
  `buildDashboard(..., calibrationSummaryContent?)` 纯透传映射（缺参=missing）。RR27 消费。
- `src/lib/index.ts` 导出；测试 +5（`calibration.summary.test.ts`：三态判定/坏契约矩阵/
  golden 回灌对账〔buildCalibrationSnapshot 真实输出序列化→映射逐项相等〕/零样本生产形态/
  stale与分页截断透传）；Node refresh-calibration.test.mjs 增应用目录副本逐字节相等断言。

## 门禁

1. tsc 退出 0。
2. 域（src/lib+src/ui）182/182（全量口径同跑）。
3. 全量 vitest **182/182 0 failed**（基线 177 → +5 只升）；Node **38/38**。
4. Rust：`cargo check --tests` 绿；`cargo test --lib` **32/32**（基线 29 → +3 只升）。
5. 变异红验三组（`task_logs/RR28_artifacts/mutation-proof.md`）：TS 删 schema 校验→红1；
   TS 删 n>0 指标规则→红1；Rust 读失败吞成空→红1。全部原字节复原复绿。

## 真值出处

- 快照 schema 与字段：`src/lib/calibrationSnapshot.ts`（RR17，唯一生产者链
  scripts/refresh-calibration.mjs → buildCalibrationSnapshot）。
- 只读IO先例：`src-tauri/src/predictions.rs` read_log（RR15/D025；缺失=空、失败=Err）。
- 02-spec §字段表：「校准只读摘要：计分样本数、Brier、命中率、报告时刻/覆盖范围、来源状态；
  可空且后向兼容；不在React实现另一份评分算法」。
- 实跑证据：`task_logs/RR28_artifacts/appdir-calibration-live.json`（真实应用目录
  %APPDATA%/app.resetradar.desktop/calibration.json 副本：fresh/n=0/legacy=3）。

## 待用户清单

- 无。生产 release exe 内 read_calibration_summary 的端到端实跑并入 RR27（其本就要
  release 构建截图三态）。

## 排障遗产

- excluded 键 kebab-case 陷阱：golden 回灌首轮全 invalid，根因=映射器按 camelCase 读
  `outsideHistory` 而快照原文是 `outside-history`。教训：跨层契约测试必须用真实生成器
  输出回灌（本卡 golden 组即为此设计），手造夹具测不出序列化形差。

## →下轮

- RR27（照六图 UI 重构）：消费 `vm.calibrationSummary`（missing→提示生成、invalid→提示
  重生成、ok+n=0→「数据积累中」、ok+n>0→真实指标）；hook 侧接线
  invoke("read_calibration_summary")（snake_case，与 read_prediction_log 同口径）。
