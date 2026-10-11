# RR17 变异红验记录（2026-10-11，本会话 S1011-RR17b）

目标文件：src/lib/calibrationWindows.ts（本卡核心：统一前瞻窗口选择）

## M1 窗口边界反转：(start,end] → [start,end)
- 改动：`resetTimes.some((event) => event > start && event <= end)` → `>= start && < end`
- 首轮（继承测试）：calibration.core + calibration.auto 22/22 全绿 → **变异存活（盲点）**
  - 原因：既有用例把 start/end 两事件同时给、只断言 realized=true，两种边界语义同答。
  - 修补：该用例拆出「仅 start 事件 → false」「仅 end 事件 → true」两断言。
- 重验：红 1（calibration.core「只接纳窗口起点对应的北京目标日…」）；原字节复原后 17/17 绿。

## M2 删除旧行排除分支
- 改动：删 `if (row?.windowStart === undefined && row?.windowEnd === undefined) { excluded.legacy++; continue; }`
- 结果：红 1（calibration.auto「同日首行按记录时刻选择…」：`{legacy:+0, invalid:1}` vs 期望 `{legacy:1, duplicate:1}`）
- 复原后复绿。

## M3 删除 24h 窗长校验
- 改动：删 `|| end - start !== RESET_RISK_HORIZON_MS`
- 首轮：域 146/146 全绿 → **变异存活（盲点）**
  - 原因：无错长度窗口用例（所有合成行都恰好 24h）。
  - 修补：新增「23h/25h 窗口一律拒收」用例。
- 重验：红 1；原字节复原后 17/17 绿。

## 结论
三组变异均红且复原复绿；两组首轮存活暴露的测试盲点已补钉（见 calibration.core.test.ts），
最终门禁：tsc 0 / 域 147 / 全量 177 / Node 38。
