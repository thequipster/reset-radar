// 核心层入口：纯 TS、零 React / 零 Tauri 依赖（ARCHITECTURE §2 硬约束）。
// RR45 起算法唯一实现源 = v2 五模块（beijing/resetState/riskV2/plannerV2/resetCardV2），
// 旧 risk/planner/resetCard 已删除（用户 RR44 点单授权，RUNBOOK §1.4 单一实现源）。
export * from "./meta";
export * from "./beijing";
export * from "./resetState";
export * from "./riskV2";
export * from "./plannerV2";
export * from "./resetCardV2";
export * from "./calibration";
export * from "./predictions";
export * from "./scheduledReset";
export * from "./resetStatus";
export * from "./watchSignal";
export * from "./watchCalibration";
export * from "./calibrationWindows";
export * from "./calibrationSnapshot";
export * from "./calibrationSummary";
export * from "./historyPrediction";
export * from "./history";
