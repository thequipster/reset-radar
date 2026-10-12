#!/usr/bin/env node
// scripts/fetch-history.mjs —— RR03：拉取 codex-resets.com 强制重置历史并清洗落盘（只采集，不实装算法）
// 数据源（TRUTH §1 来源 2）：
//   GET https://codex-resets.com/api/v1/resets?limit=100&order=desc   （历史事件数组）
//   GET https://codex-resets.com/api/v1/status                         （latest_reset / stats / active_watch）
// 清洗：解析失败丢弃 → 未来容差过滤 → 按上游事件 ID 去重 → 倒序。
// 不按时间接近合并不同 ID：v3 目标是公告事件，近距 regular 也可能是独立事件。
// 完整性来自遍历所有 next_cursor 页面，最后页必须明确 has_more=false；未完成时拒绝落盘。
// 星期统计按 D004 全项目唯一日边界（北京零点，UTC+8 固定偏移、无夏令时）。

import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { refreshCalibration } from './refresh-calibration.mjs';

const RESETS_URL = 'https://codex-resets.com/api/v1/resets?limit=100&order=desc';
const STATUS_URL = 'https://codex-resets.com/api/v1/status';
const USER_AGENT = 'reset-radar/0.1 (reset history fetcher)';
const TIMEOUT_MS = 4_000; // 卡面口径：4s 超时
const FUTURE_TOLERANCE_MIN = 5; // reset_forecast.rs:8
const MAX_RESET_PAGES = 100;
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
    id: typeof raw?.id === 'string' || typeof raw?.id === 'number' ? String(raw.id) : null,
    resetType: typeof raw?.reset_type === 'string' ? raw.reset_type : null,
    announcedAt: typeof raw?.announced_at === 'string' ? raw.announced_at : null,
    text: typeof raw?.text === 'string' ? raw.text : null,
    sourceType: typeof src.type === 'string' ? src.type : null,
    sourceUrl: typeof src.url === 'string' ? src.url : null,
  };
}

// 去重只认事件 ID；同 ID 修订是一条公告，不同 ID 的近时事件均保留。
export function sanitizeEvents(rawEvents, asOfMs) {
  const toleranceMs = FUTURE_TOLERANCE_MIN * 60_000;
  const parsed = [];
  for (const raw of rawEvents) {
    const ev = normalizeEvent(raw);
    const ms = parseIsoMs(ev.announcedAt);
    if (ms === null) continue; // 解析失败丢弃（filter_map parse_utc）
    if (ms > asOfMs + toleranceMs) continue; // 未来容差过滤（<= as_of+5min 才保留）
    parsed.push({ ev, ms: new Date(ms) });
  }
  const byId = new Map();
  const withoutId = [];
  for (const item of parsed) {
    if (item.ev.id === null) withoutId.push(item);
    else if (!byId.has(item.ev.id)) byId.set(item.ev.id, item);
  }
  return [...byId.values(), ...withoutId].sort((a, b) => b.ms - a.ms)
    .map(({ ev, ms }) => ({ ...ev, announcedAt: ms.toISOString() }));
}

/** Fetch every cursor page. Any pagination ambiguity or loop fails closed. */
export async function fetchAllResetPages(fetchPage = fetchJson) {
  const pages = [], seenCursors = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < MAX_RESET_PAGES; pageIndex += 1) {
    const url = new URL(RESETS_URL);
    if (cursor !== null) url.searchParams.set('cursor', cursor);
    const page = await fetchPage(url.toString());
    if (!isObject(page) || !Array.isArray(page.data) || !isObject(page.meta) || !isObject(page.pagination) || typeof page.pagination.has_more !== 'boolean') {
      throw new TypeError(`invalid resets pagination response at page ${pageIndex + 1}`);
    }
    pages.push(page);
    if (!page.pagination.has_more) {
      if (page.pagination.next_cursor != null) throw new TypeError(`resets page ${pageIndex + 1} has_more=false with a next_cursor`);
      const byId = new Map(); const anonymous = [];
      for (const record of pages.flatMap(x => x.data)) {
        const id = record?.id;
        if (typeof id === 'string' || typeof id === 'number') {
          if (!byId.has(String(id))) byId.set(String(id), record);
        } else anonymous.push(record);
      }
      return {
        data: [...byId.values(), ...anonymous], meta: pages[0].meta,
        pagination: { has_more: false, next_cursor: null, complete: true, pages_fetched: pages.length },
      };
    }
    const next = page.pagination.next_cursor;
    if (typeof next !== 'string' || next.length === 0) throw new TypeError(`resets page ${pageIndex + 1} has_more=true without next_cursor`);
    if (seenCursors.has(next) || next === cursor) throw new TypeError(`repeated resets cursor at page ${pageIndex + 1}`);
    seenCursors.add(next); cursor = next;
  }
  throw new Error(`resets pagination exceeded ${MAX_RESET_PAGES} pages; refusing incomplete history`);
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

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function buildDocument({ resets, status, fetchedAtIso }) {
  if (!isObject(resets) || !Array.isArray(resets.data) || !isObject(resets.meta)) {
    throw new TypeError('invalid resets response: expected object data array and meta object');
  }
  if (!isObject(status) || !isObject(status.data) || !isObject(status.meta)) {
    throw new TypeError('invalid status response: expected data and meta objects');
  }
  if (!Object.hasOwn(status.data, 'latest_reset') ||
      (status.data.latest_reset !== null && !isObject(status.data.latest_reset))) {
    throw new TypeError('invalid status.data.latest_reset: expected object or null');
  }
  for (const key of ['scheduled_reset', 'active_watch']) {
    if (Object.hasOwn(status.data, key) && status.data[key] !== null && !isObject(status.data[key])) {
      throw new TypeError(`invalid status.data.${key}: expected object or null`);
    }
  }
  const asOfMs = parseIsoMs(fetchedAtIso);
  if (asOfMs === null) throw new TypeError('invalid fetchedAtIso: expected ISO timestamp');
  // /status 的 latest_reset 并入历史再清洗（参考 reset_forecast.rs:108-110 的 chain 写法）
  const rawEvents = [...resets.data];
  const latest = status?.data?.latest_reset;
  if (latest && typeof latest === 'object') rawEvents.push(latest);
  const events = sanitizeEvents(rawEvents, asOfMs);
  return {
    schema: 'reset-radar/resets-history@1',
    fetchedAt: fetchedAtIso,
    sources: { resets: RESETS_URL, status: STATUS_URL },
    upstream: {
      apiVersion: resets.meta.api_version ?? null,
      generatedAt: resets.meta.generated_at ?? null,
      pagination: resets?.pagination ?? null,
    },
    // /status 侧信息原样保留（RR04 风险模型要用 active_watch.reset_chance_percent 等字段）
    status: status.data,
    events,
    summary: summarize(events),
  };
}

async function main() {
  console.log(`[fetch-history] 拉取 ${RESETS_URL}`);
  const resets = await fetchAllResetPages();
  console.log(`[fetch-history] 拉取 ${STATUS_URL}`);
  const status = await fetchJson(STATUS_URL);
  const fetchedAtIso = new Date().toISOString();
  const doc = buildDocument({ resets, status, fetchedAtIso });
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const outPath = join(outDir, 'resets-history.json');
  await mkdir(outDir, { recursive: true });
  // 原子写：tmp 落盘后 rename 覆盖（与 RR08 快照持久化同款约定，避免半截文件）
  const tmpPath = outPath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  await rename(tmpPath, outPath);
  await refreshCalibration({ root: join(dirname(fileURLToPath(import.meta.url)), '..'), generatedAt: new Date(fetchedAtIso) });
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
