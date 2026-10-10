// 预测日志（RR10）：把「每日评估」幂等追加进 data/predictions.jsonl——校准闭环的原料
// （消费端：scripts/calibrate.mjs → src/lib/calibration.ts 对答案；参考项目最大遗憾
// 「收集了数据却从不对答案」即本卡要堵的洞，BACKLOG RR10 现象）。
// 本模块纯函数：不读文件、不读钟、不发网络；IO 薄壳在 scripts/log-prediction.mjs
// （先例 calibrate.mjs，D016 node 直载 .ts）。
// 行 schema（卡面四字段，序列化顺序即此）：{date, predictedRisk, factorsDigest, fetchedAt}；
// date=北京日历键（D004 唯一日边界，复用 resetCard.beijingCalendarDateKey）。
// 数据锁（RUNBOOK §1.5）：predictions.jsonl 只追加不修改，唯一写者=落盘器脚本。

import { beijingCalendarDateKey } from "./resetCard.ts";
import type { RiskFactor } from "./risk.ts";

/** 同日补行阈值（0-100 分制）。依据：risk.score 输出固定 1 位小数（risk.ts round1），
 *  0.5=显示精度下界——漂移超 0.5 才是可感知变化，≤0.5 视为噪声不补行。AI 裁决 D019。 */
export const PREDICTION_RISK_CHANGE_THRESHOLD = 0.5;

/** 预测日志行（BACKLOG RR10 卡面四字段）。 */
export interface PredictionRecord {
  date: string; // 北京日历键（评估 as_of 所在日）
  predictedRisk: number; // 0-100，assessResetRisk().score 直传
  factorsDigest: string; // 因子摘要（digestFactors 生成），人可读对账留痕
  fetchedAt: string; // ISO 串，评估执行时刻（溯源）
}

/** 幂等追加结果：lines=追加后完整日志（输入不被修改）；reason 供脚本输出与人读。 */
export interface AppendOutcome {
  lines: string[];
  appended: boolean;
  reason: "first-of-day" | "risk-drift" | "suppressed-noise";
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 因子摘要：`id=delta` 逗号连接（顺序=factors 数组序；delta 取 1 位小数，与 UI 展示
 *  口径一致——risk.ts RiskFactor 注释）。用途=留痕对账，非判等。 */
export function digestFactors(factors: readonly RiskFactor[]): string {
  return factors.map((f) => `${f.id}=${round1(f.delta)}`).join(",");
}

/** 评估 as_of 时刻 → 预测行 date（北京日历键，D004）。 */
export function predictionDateKey(asOf: Date): string {
  return beijingCalendarDateKey(asOf.getTime());
}

/** 日志行 → 记录；坏行（非法 JSON / 缺 date / predictedRisk 非Finite）返回 null。
 *  容错口径与 calibrate.mjs readPredictionRows 同源：跳过不修。 */
function parseRow(line: string): PredictionRecord | null {
  try {
    const obj = JSON.parse(line);
    if (typeof obj?.date === "string" && Number.isFinite(obj?.predictedRisk)) {
      return {
        date: obj.date,
        predictedRisk: obj.predictedRisk,
        factorsDigest: typeof obj.factorsDigest === "string" ? obj.factorsDigest : "",
        fetchedAt: typeof obj.fetchedAt === "string" ? obj.fetchedAt : "",
      };
    }
  } catch {
    // 坏行：跳过（不修不删，数据锁）
  }
  return null;
}

/**
 * 幂等追加一条评估进预测日志（纯函数，卡面规则）：
 * - 同日无行 → 追加（reason=first-of-day，每日首次评估）；
 * - 同日已有行 → 仅 |candidate − 同日最后一行| > threshold 时补行（risk-drift），
 *   否则抑制（suppressed-noise）；
 * - 坏行原样保留在输出中，不参与同日判断。
 */
export function appendPredictionLog(
  existing: readonly string[],
  candidate: PredictionRecord,
  threshold: number = PREDICTION_RISK_CHANGE_THRESHOLD,
): AppendOutcome {
  let lastOfDay: PredictionRecord | null = null;
  for (const line of existing) {
    const row = parseRow(line);
    if (row && row.date === candidate.date) lastOfDay = row;
  }
  if (!lastOfDay) {
    return {
      lines: [...existing, JSON.stringify(candidate)],
      appended: true,
      reason: "first-of-day",
    };
  }
  if (Math.abs(candidate.predictedRisk - lastOfDay.predictedRisk) > threshold) {
    return {
      lines: [...existing, JSON.stringify(candidate)],
      appended: true,
      reason: "risk-drift",
    };
  }
  return { lines: [...existing], appended: false, reason: "suppressed-noise" };
}
