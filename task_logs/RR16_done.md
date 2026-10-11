# RR16 done

- 2026-10-11 14:00:37 agent/RR16 @f7890a53436ec95c5216ece09dd58e974351f5a3，base17fc22c；39路径+1711/-14；patch RR16.patch。
- 范围：watch有效性门控、adapter/CLI已有25%融合、前瞻窗口/baseline日志、同样本报告；无视觉重构、无Rust规则重复、无新模型调参。
- 四绿：tsc exit0，域146/146，全170/170，Node37/37；Vite及gnu custom-protocol release exit0。artifact都在task_logs/RR16_artifacts。日志EOF原始空行保留，源文件diff --check绿，不编辑历史输出。
- 变异：WATCH_WEIGHT .25→0导致UI27.5断言红；expires<=now→<now导致exact-expiry红；fetched>start移除导致孤立事后记录n0断言红；仅含watch才抢首行导致首条无watch禁止后补断言红。各原字节恢复，全量170与Node37复绿。
- 首轮prospective变异曾存活：组合非法元数据样本遮住事后记录，增加独立且正负对照测试后重验红；失败输出一并归档不掩盖。
- 生产：owned PID26612，05:59:31Z启动，全新/status成功、watch null、额度成功；UI风险32.5，hook ok。生产日志361字节SHA2564A5553BEC97067F643FDC4A8C97888EB4023BEA908C3519E3630FBF705268673完全不变，无lock；只停止自有进程。active分支80%是合成测试，不能冒称真实watch。
- 真值出处：TRUTH §1 MIT codex-cockpit/src-tauri/src/reset_forecast.rs:8（5min）,76-83（watch字段）,229-238（25%融合）,246-265（active校验）；本项目risk.ts定义未来24h，predictions.ts保留baseline/window，watchCalibration.ts共用calibration.ts::scorePredictions。上游现场/status原文status-live.json；设计来源02-spec/04-progress，D028。
- 待用户清单：无；不push/tag/release。
- 排障遗产：GNU已有manifest merge warning但构建退出0；生产无active watch，真实配对n0指标null；通用旧日历join/CLI历史评估时点待RR17正确化。下一RR17提取统一前瞻窗口selector供通用与watch比较，避免第二份规则；旧四字段不回填。
- →下轮：RR17→RR28→RR27→RR12最终有限验收，阶段4未完成。


## 合入闭环
2026-10-11 14:01:31 f7890a5→main299c1d5；全树diff0，主仓tsc/170Vitest/37Node/calibrate绿。junction目标验证main/node_modules后非递归拆除，worktree安全移除，main依赖完好；wip移档，agent/RR16分支保留，无push。
