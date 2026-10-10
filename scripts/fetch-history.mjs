#!/usr/bin/env node
// scripts/fetch-history.mjs —— RR03：拉取 codex-resets.com 强制重置历史并清洗落盘（只采集，不实装算法）
// 数据源（TRUTH §1 来源 2）：
//   GET https://codex-resets.com/api/v1/resets?limit=100&order=desc   （历史事件数组）
//   GET https://codex-resets.com/api/v1/status                         （latest_reset / stats / active_watch）
// 清洗规则移植自参考实现 codex-cockpit（MIT）src-tauri/src/reset_forecast.rs 的 sanitize_history
// （函数体 :103-132；FUTURE_TOLERANCE_MINUTES=5、DUPLICATE_WINDOW_MINUTES=5 定义于 :8-9）：
//   解析失败丢弃 → 未来容差过滤 → 倒序 → 相邻 5 分钟窗口去重；/status 的 latest_reset 并入再清洗。
// 星期统计按 D004 全项目唯一日边界（北京零点，UTC+8 固定偏移、无夏令时）。

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESETS_URL = 'https://codex-resets.com/api/v1/resets?limit=100&order=desc';
const STATUS_URL = 'https://codex-resets.com/api/v1/status';
const USER_AGENT = 'reset-radar/0.1 (reset history fetcher)';
const TIMEOUT_MS = 4_000; // 卡面口径：4s 超时
const FUTURE_TOLERANCE_MIN = 5; // reset_forecast.rs:8
const DUPLICATE_WINDOW_MIN = 5; // reset_forecast.rs:9
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000; // D004：北京零点边界
const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// 解析 ISO 时间串 → epoch 毫秒；非法返回 null（Date.parse 对非 ISO 字符串不可靠，双重校验）
export function parseIsoMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// 上游事件 → 本项目规范形（字段名 camelCase，纯数据无格式串）
export function normalizeEvent(raw) {
  const src = raw?.source ?? {};
  return {
    id: typeof raw?.id === 'string' ? raw.id : null,
    resetType: typeof raw?.reset_type === 'string' ? raw.reset_type : null,
    announcedAt: typeof raw?.announced_at === 'string' ? raw.announced_at : null,
    text: typeof raw?.text === 'string' ? raw.text : null,
    sourceType: typeof src.type === 'string' ? src.type : null,
    sourceUrl: typeof src.url === 'string' ? src.url : null,
  };
}

// sanitize_history 的 TS 移植：丢弃不可解析与超未来容差 → 按 announcedAt 倒序 → 相邻 5 分钟窗口去重
// （参考 reset_forecast.rs:103-132；去重保留更晚的一条，与参考实现"倒序遍历、跳过与上一保留项过近者"一致）
export function sanitizeEvents(rawEvents, asOfMs) {
  const toleranceMs = FUTURE_TOLERANCE_MIN * 60_000;
  const parsed = [];
  for (const raw of rawEvents) {
    const ev = normalizeEvent(raw);
    const ms = parseIsoMs(ev.announcedAt);
    if (ms === null) continue; // 解析失败丢弃（filter_map parse_utc）
    if (ms > asOfMs + toleranceMs) continue; // 未来容差过滤（<= as_of+5min 才保留）
    parsed.push({ ev, ms: new Date(ms) }); // 统一转回标准 ISO（毫秒级），等价参考实现的 to_rfc3339_opts(Millis)
  }
  parsed.sort((a, b) => b.ms - a.ms); // 倒序（right.cmp(left)）
  const windowMs = DUPLICATE_WINDOW_MIN * 60_000;
  const kept = [];
  for (const item of parsed) {
    const prev = kept[kept.length - 1];
    if (prev !== undefined && Math.abs(prev.ms - item.ms) <= windowMs) continue; // 5 分钟窗口去重
    kept.push(item);
  }
  return kept.map(({ ev, ms }) => ({ ...ev, announcedAt: ms.toISOString() }));
}

// 北京日历星期（D004：UTC+8 后取星期；北京无夏令时，固定偏移即严格正确）
export function weekdayBeijing(isoOrMs) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : parseIsoMs(isoOrMs);
  if (ms === null) return null;
  return WEEKDAY_KEYS[(new Date(ms + BEIJING_OFFSET_MS).getUTCDay() + 6) % 7];
}

// 汇总统计（写入夹具 summary 字段；星期直方图键序固定 Mon..Sun 保证输出确定性）
export function summarize(events) {
  const byWeekday = Object.fromEntries(WEEKDAY_KEYS.map((k) => [k, 0]));
  const times = [];
  for (const ev of events) {
    const ms = parseIsoMs(ev.announcedAt);
    if (ms === null) continue;
    times.push(ms);
    byWeekday[weekdayBeijing(ms)] += 1;
  }
  times.sort((a, b) => a - b);
  return {
    count: times.length,
    earliest: times.length ? new Date(times[0]).toISOString() : null,
    latest: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    byWeekdayBeijing: byWeekday,
  };
}

// 带超时与 UA 的 JSON GET（卡面口径；非 2xx 或解析失败直接抛错，不静默降级）
export async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildDocument({ resets, status, fetchedAtIso }) {
  const asOfMs = Date.parse(fetchedAtIso);
  // /status 的 latest_reset 并入历史再清洗（参考 reset_forecast.rs:108-110 的 chain 写法）
  const rawEvents = [...(Array.isArray(resets?.data) ? resets.data : [])];
  const latest = status?.data?.latest_reset;
  if (latest && typeof latest === 'object') rawEvents.push(latest);
  const events = sanitizeEvents(rawEvents, asOfMs);
  return {
    schema: 'reset-radar/resets-history@1',
    fetchedAt: fetchedAtIso,
    sources: { resets: RESETS_URL, status: STATUS_URL },
    upstream: {
      apiVersion: resets?.meta?.api_version ?? null,
      generatedAt: resets?.meta?.generated_at ?? null,
      pagination: resets?.pagination ?? null,
    },
    // /status 侧信息原样保留（RR04 风险模型要用 active_watch.reset_chance_percent 等字段）
    status: status?.data ?? null,
    events,
    summary: summarize(events),
  };
}

async function main() {
  const fetchedAtIso = new Date().toISOString();
  console.log(`[fetch-history] 拉取 ${RESETS_URL}`);
  const resets = await fetchJson(RESETS_URL);
  console.log(`[fetch-history] 拉取 ${STATUS_URL}`);
  const status = await fetchJson(STATUS_URL);
  const doc = buildDocument({ resets, status, fetchedAtIso });
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const outPath = join(outDir, 'resets-history.json');
  await mkdir(outDir, { recursive: true });
  // 原子写：tmp 落盘后 rename 覆盖（与 RR08 快照持久化同款约定，避免半截文件）
  const tmpPath = outPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  await rename(tmpPath, outPath);
  const s = doc.summary;
  console.log(`[fetch-history] 写入 ${outPath}`);
  console.log(
    `[fetch-history] 事件 ${s.count} 条，跨度 ${s.earliest} → ${s.latest}；北京星期分布 ` +
      WEEKDAY_KEYS.map((k) => `${k}:${s.byWeekdayBeijing[k]}`).join(' '),
  );
}

// 直接运行才执行 main；被测试 import 时不发网络请求（Windows 盘符路径必须 pathToFileURL 对齐）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`[fetch-history] 失败：${err?.message ?? err}`);
    process.exit(1);
  });
}
