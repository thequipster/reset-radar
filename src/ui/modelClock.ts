// RR56：模型时钟（纯函数）。界面倒计时仍可每分钟刷新，但“模型 now”只按 15 分钟桶推进：
// 规划 worker、预测日志、重算 VM 都只在桶切换或输入真正变化时触发——风扇问题的根源就是
// 过去每 60 s 把 18–32 s 的规划重跑一遍。桶边界对齐北京时间整分钟（UTC+8 为整小时偏移，
// 因而 09:00 北京时间仍是桶起点，journal 的 primary_daily 槽位不受影响）。
export const MODEL_BUCKET_MS = 15 * 60_000;
export const BEIJING_OFFSET_MS = 8 * 3_600_000;

/** 所属 15 分钟桶的起点（UTC 毫秒）。 */
export function modelBucketStart(now: number, bucketMs: number = MODEL_BUCKET_MS): number {
  return Math.floor(now / bucketMs) * bucketMs;
}

/** 距离下一个桶边界还有多少毫秒（至少 1 s，避免 0 延迟空转）。 */
export function msUntilNextBucket(now: number, bucketMs: number = MODEL_BUCKET_MS): number {
  return Math.max(1_000, modelBucketStart(now, bucketMs) + bucketMs - now);
}

/** 北京时间 HH:mm（两位数字）。 */
export function beijingClockParts(now: number): { hour: number; minute: number } {
  const shifted = new Date(now + BEIJING_OFFSET_MS);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
}

/**
 * 每日固定发布槽：北京时间 09:00 这一桶（09:00–09:14）。journal.predictionGroupAt 只在
 * 09:00 整分把预测记为 primary_daily，因此模型时钟在该桶内必须用桶起点而不是真实时刻。
 */
export function isDailyPublishBucket(now: number, bucketMs: number = MODEL_BUCKET_MS): boolean {
  const { hour, minute } = beijingClockParts(modelBucketStart(now, bucketMs));
  return hour === 9 && minute === 0;
}

/**
 * 模型 now：桶起点。09:00 桶内返回的正是 09:00:00 北京时间，令每日主预测仍能落到
 * primary_daily；其余时间同一桶内的所有渲染/日志共用一个时刻，天然去重。
 */
export function modelNowFor(now: number, bucketMs: number = MODEL_BUCKET_MS): number {
  return modelBucketStart(now, bucketMs);
}
