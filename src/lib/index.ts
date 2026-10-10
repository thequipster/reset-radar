// 核心层入口：纯 TS、零 React / 零 Tauri 依赖（ARCHITECTURE §2 硬约束）。
// 后续核心模块（risk / planner / card / calibration）从这里统一导出。
export * from "./meta";
