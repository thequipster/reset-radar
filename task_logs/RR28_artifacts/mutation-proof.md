# RR28 变异红验记录（2026-10-11，S1011-RR28）

## M1 TS 映射器：删 schema 校验
- 改动：删 `if (snapshot.schema !== CALIBRATION_SNAPSHOT_SCHEMA) return { status: "invalid" };`
- 结果：红 1（「坏JSON或契约不符=invalid」组：schema@2 快照被放行为 ok）；复原后 5/5 绿。

## M2 TS 映射器：删 n>0 必须有指标规则
- 改动：删 `if (scoreRecord.n > 0 && (brier === null || hitRate === null)) return invalid;`
- 结果：红 1（golden n=1+brier→null 变异样本被放行）；复原后绿。

## M3 Rust：读失败吞成空内容
- 改动：read_summary 的非 NotFound 错误分支改为返回 String::new()（把读失败冒充 missing）
- 结果：cargo test --lib calibration_summary **FAILED 1**（read_failure_is_not_reported_as_missing）；
  原字节复原后 3/3 绿（全量 32 passed）。
