// scripts/fetch-history.test.mjs —— RR03 域测试（node:test 零依赖；RR01 脚手架合入前 scripts 域以本套替代 vitest，见 DECISIONS D010）
// 运行：node --test scripts/
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  parseIsoMs,
  normalizeEvent,
  sanitizeEvents,
  fetchAllResetPages,
  summarize,
  weekdayBeijing,
  buildDocument,
} from './fetch-history.mjs';

const AS_OF = Date.parse('2026-10-11T00:00:00.000Z');
const MIN = 60_000;
const ev = (announced_at, id = `id-${announced_at}`) => ({
  id,
  reset_type: 'regular',
  announced_at,
  text: 't',
  source: { type: 'x_post', author: 'a', url: 'https://x.com/a/1' },
});

describe('parseIsoMs', () => {
  test('合法 ISO（毫秒/Z）→ epoch 毫秒', () => {
    assert.equal(parseIsoMs('2026-10-08T03:44:55.000Z'), Date.parse('2026-10-08T03:44:55.000Z'));
  });
  test('非法输入 → null', () => {
    for (const bad of ['', 'not-a-date', 123, null, '2026-10-08', '2026-13-45T99:99:99.000Z']) {
      assert.equal(parseIsoMs(bad), null, `应拒绝：${String(bad)}`);
    }
  });
});

describe('normalizeEvent', () => {
  test('snake_case → camelCase，缺 source 容错', () => {
    const out = normalizeEvent(ev('2026-10-08T03:44:55.000Z'));
    assert.equal(out.resetType, 'regular');
    assert.equal(out.announcedAt, '2026-10-08T03:44:55.000Z');
    assert.equal(out.sourceType, 'x_post');
    const bare = normalizeEvent({ id: 'x', announced_at: '2026-10-08T03:44:55.000Z' });
    assert.equal(bare.sourceType, null);
    assert.equal(bare.sourceUrl, null);
  });
});

describe('sanitizeEvents（按 ID 清洗历史事件）', () => {
  test('不可解析日期被丢弃', () => {
    const out = sanitizeEvents([ev('garbage'), ev('2026-10-08T03:44:55.000Z')], AS_OF);
    assert.equal(out.length, 1);
    assert.equal(out[0].announcedAt, '2026-10-08T03:44:55.000Z');
  });
  test('未来容差：as_of+5min 整保留（<=，参考 :112），+5min01s 丢弃', () => {
    const edge = new Date(AS_OF + 5 * MIN).toISOString();
    const over = new Date(AS_OF + 5 * MIN + 1000).toISOString();
    const out = sanitizeEvents([ev(edge), ev(over)], AS_OF);
    assert.deepEqual(out.map((e) => e.announcedAt), [edge]);
  });
  test('倒序输出（最新在前）', () => {
    const out = sanitizeEvents([ev('2026-09-01T00:00:00.000Z'), ev('2026-10-01T00:00:00.000Z')], AS_OF);
    assert.deepEqual(out.map((e) => e.announcedAt), ['2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']);
  });
  test('同 ID 的修订只算一个事件，不同 ID 的近时 regular 全部保留', () => {
    const a = new Date(AS_OF - 10 * MIN).toISOString();
    const b = new Date(AS_OF - 7 * MIN).toISOString();
    const out = sanitizeEvents([ev(a, 'same'), ev(b, 'near-distinct'), ev(new Date(AS_OF - MIN).toISOString(), 'same')], AS_OF);
    assert.deepEqual(out.map((e) => e.id), ['near-distinct', 'same']);
    assert.deepEqual(out.map((e) => e.announcedAt), [b, a]);
  });
  test('缺少 ID 时不按近时或同时间猜测合并', () => {
    const a = { ...ev(new Date(AS_OF - MIN).toISOString()), id: undefined };
    const b = { ...ev(new Date(AS_OF - MIN).toISOString()), id: undefined };
    const out = sanitizeEvents([a, b], AS_OF);
    assert.equal(out.length, 2);
  });
  test('不同 resetType 的邻近事件均保留；同 ID 跨记录去重', () => {
    const newer = new Date(AS_OF - 10 * MIN).toISOString();
    const older = new Date(AS_OF - 12 * MIN).toISOString();
    const regularNew = ev(newer, 'regular-new');
    const regularNewer = { ...regularNew, id: 'regular-duplicate', announced_at: new Date(AS_OF - 9 * MIN).toISOString() };
    const banked = { ...ev(older, 'banked'), reset_type: 'banked' };
    const out = sanitizeEvents([banked, regularNew, regularNewer], AS_OF);
    assert.deepEqual(out.map(({ id, resetType }) => [id, resetType]), [
      ['regular-duplicate', 'regular'],
      ['regular-new', 'regular'],
      ['banked', 'banked'],
    ]);
  });
});

describe('buildDocument（上游封装校验）', () => {
  test('跨类型近时记录不按时间距离合并', () => {
    const newest = ev(new Date(AS_OF - 10 * MIN).toISOString(), 'regular-new');
    const middle = { ...ev(new Date(AS_OF - 11 * MIN).toISOString(), 'banked'), reset_type: 'banked' };
    const older = ev(new Date(AS_OF - 13 * MIN).toISOString(), 'regular-old');
    assert.deepEqual(sanitizeEvents([older, middle, newest], AS_OF).map((e) => e.id), ['regular-new', 'banked', 'regular-old']);
  });
  const valid = () => ({
    resets: { data: [], meta: { api_version: 'v1', generated_at: '2026-10-11T00:00:00Z' } },
    status: { data: { latest_reset: null, scheduled_reset: null, active_watch: null }, meta: {} },
    fetchedAtIso: '2026-10-11T00:00:00.000Z',
  });

  test('缺字段或坏形状直接 reject', () => {
    const cases = [
      (x) => { x.resets.data = {}; },
      (x) => { x.resets.meta = null; },
      (x) => { x.status.data = null; },
      (x) => { x.status.meta = []; },
      (x) => { delete x.status.data.latest_reset; },
      (x) => { x.status.data.latest_reset = []; },
      (x) => { x.status.data.scheduled_reset = false; },
      (x) => { x.status.data.active_watch = []; },
      (x) => { x.fetchedAtIso = 'not-a-date'; },
    ];
    for (const corrupt of cases) {
      const input = valid();
      corrupt(input);
      assert.throws(() => buildDocument(input), TypeError);
    }
  });

  test('兼容真实 API 的 object/null 可选字段并保留 status 原形', () => {
    const input = valid();
    input.status.data.scheduled_reset = { announced_at: null };
    delete input.status.data.active_watch;
    const doc = buildDocument(input);
    assert.deepEqual(doc.status, input.status.data);
    assert.equal(doc.events.length, 0);
    assert.equal(doc.fetchedAt, input.fetchedAtIso);
  });
});

describe('fetchAllResetPages（分页完整性）', () => {
  test('沿 next_cursor 翻完所有页并按 ID 合并重复记录，明确输出完整覆盖', async () => {
    const calls = [];
    const pages = [
      { data: [ev('2026-10-10T00:00:00.000Z', 'new'), ev('2026-10-09T00:00:00.000Z', 'dup')], meta: { api_version: 'v1' }, pagination: { has_more: true, next_cursor: 'cursor_token-2' } },
      { data: [ev('2026-10-09T00:00:00.000Z', 'dup'), ev('2026-10-01T00:00:00.000Z', 'old')], meta: { api_version: 'v1' }, pagination: { has_more: false, next_cursor: null } },
    ];
    const result = await fetchAllResetPages(async (url) => { calls.push(url); return pages.shift(); });
    assert.equal(calls.length, 2);
    assert.match(calls[1], /cursor=cursor_token-2/);
    assert.deepEqual(result.data.map((x) => x.id), ['new', 'dup', 'old']);
    assert.deepEqual(result.pagination, { has_more: false, next_cursor: null, complete: true, pages_fetched: 2 });
  });
  test('has_more 缺游标、重复游标或页数溢出时拒绝写出不完整数据', async () => {
    await assert.rejects(fetchAllResetPages(async () => ({ data: [], meta: {}, pagination: { has_more: true, next_cursor: null } })), /without next_cursor/);
    await assert.rejects(fetchAllResetPages(async () => ({ data: [], meta: {}, pagination: { has_more: false, next_cursor: 'unexpected' } })), /has_more=false with a next_cursor/);
    let call = 0;
    await assert.rejects(fetchAllResetPages(async () => ({ data: [], meta: {}, pagination: { has_more: true, next_cursor: call++ === 0 ? 'again' : 'again' } })), /repeated resets cursor/);
    call = 0;
    await assert.rejects(fetchAllResetPages(async () => ({ data: [], meta: {}, pagination: { has_more: true, next_cursor: `cursor-${call++}` } })), /exceeded 100 pages/);
  });
});

describe('weekdayBeijing（D004 北京零点边界）', () => {
  test('北京 16:00:00Z 恰跨零点 → 次日星期', () => {
    assert.equal(weekdayBeijing('2026-10-08T16:00:00.000Z'), 'Fri'); // 北京 2026-10-09 00:00
  });
  test('15:59:59Z 仍属北京当日', () => {
    assert.equal(weekdayBeijing('2026-10-08T15:59:59.000Z'), 'Thu'); // 北京 23:59:59
  });
  test('实测锚点 2026-10-08T03:44:55Z → 北京周四', () => {
    assert.equal(weekdayBeijing('2026-10-08T03:44:55.000Z'), 'Thu');
  });
});

describe('summarize', () => {
  test('count/earliest/latest/星期直方图', () => {
    const events = [
      { announcedAt: '2026-10-08T16:00:00.000Z' }, // 北京周五
      { announcedAt: '2026-10-08T03:44:55.000Z' }, // 北京周四
      { announcedAt: '2025-09-17T04:02:52.000Z' }, // 北京周三
    ];
    const s = summarize(events);
    assert.equal(s.count, 3);
    assert.equal(s.earliest, '2025-09-17T04:02:52.000Z');
    assert.equal(s.latest, '2026-10-08T16:00:00.000Z');
    assert.equal(s.byWeekdayBeijing.Wed, 1);
    assert.equal(s.byWeekdayBeijing.Thu, 1);
    assert.equal(s.byWeekdayBeijing.Fri, 1);
    assert.equal(Object.keys(s.byWeekdayBeijing).length, 7); // 键序 Mon..Sun 固定
  });
  test('空输入 → count 0 且两端为 null', () => {
    const s = summarize([]);
    assert.equal(s.count, 0);
    assert.equal(s.earliest, null);
    assert.equal(s.latest, null);
  });
});
