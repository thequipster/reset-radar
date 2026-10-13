// 固定公开历史的 v3.2 星期影子模型回放；不读取账号日志，也不改写任何生产日志。
import {readFile, writeFile, mkdir, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const inputPath = join(root, 'docs/v32-history-input-20261013.json');
const outputPath = join(root, 'docs/v32-replay-20261013.json');
const DAY_MS = 86_400_000, BJT_OFFSET_MS = 8 * 3_600_000;
const BJT_MONDAY_EPOCH = Date.parse('1970-01-04T16:00:00.000Z');
const temp = await mkdtemp(join(tmpdir(), 'rr-v32-replay-'));
const modules = new Map();

// 与 scripts/v31-report.mjs 一样，把纯 TS 依赖临时转为 ESM，产物留在 OS 临时目录。
async function pure(file) {
  file = resolve(file);
  if (modules.has(file)) return modules.get(file);
  const out = join(temp, `module-${modules.size}.mjs`);
  modules.set(file, out);
  let code = ts.transpileModule(await readFile(file, 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}
  }).outputText;
  for (const match of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]) {
    if (match[1].startsWith('.')) {
      const dep = await pure(resolve(dirname(file), `${match[1]}.ts`));
      code = code.replace(match[0], `from ${JSON.stringify(pathToFileURL(dep).href)}`);
    }
  }
  await writeFile(out, code);
  return out;
}

const weekday = await import(pathToFileURL(await pure(join(root, 'src/lib/v3/weekday.ts'))).href);
const trend = await import(pathToFileURL(await pure(join(root, 'src/lib/v3/trend.ts'))).href);
const runtime = await import(pathToFileURL(await pure(join(root, 'src/lib/v3/runtime.ts'))).href);
const platform = await import(pathToFileURL(await pure(join(root, 'src/lib/v3/platform.ts'))).href);
const pinnedText = await readFile(inputPath, 'utf8');
const pinned = JSON.parse(pinnedText);
const history = pinned.document;
if (!runtime.completeHistoryDocument(history)) throw new Error('固定输入未通过 runtime.completeHistoryDocument');

const to = Date.parse(history.coverageThrough ?? history.fetchedAt);
const times = history.events.filter(e => e.resetType === 'regular')
  .map(e => typeof e.announcedAt === 'number' ? e.announcedAt : Date.parse(e.announcedAt))
  .filter(Number.isFinite).filter(t => t <= to);
if (!times.length) throw new Error('覆盖截点前没有 regular 公告');
const from = Math.min(...times);
const coverage = [{from, to, complete: true}];
const baseInput = {events: history.events, coverage, trainingCutoff: to};
const bjtDate = ms => new Date(ms + BJT_OFFSET_MS).toISOString().slice(0, 10);
const firstAtOrAfter09 = ms => {
  const shifted = ms + BJT_OFFSET_MS;
  const day = Math.floor(shifted / DAY_MS) * DAY_MS;
  const at09 = day + 9 * 3_600_000;
  return at09 >= shifted ? at09 - BJT_OFFSET_MS : at09 + DAY_MS - BJT_OFFSET_MS;
};
const clamp = p => Math.min(1 - 1e-15, Math.max(1e-15, p));
function score(rows, key) {
  const n = rows.length, positives = rows.filter(r => r.label === 1).length;
  if (!n) return {n: 0, positiveCount: 0, brier: null, logLoss: null, predicted: null, actual: 0, predictedActualRatio: null};
  const predicted = rows.reduce((sum, r) => sum + r[key], 0);
  return {n, positiveCount: positives,
    brier: rows.reduce((sum, r) => sum + (r[key] - r.label) ** 2, 0) / n,
    logLoss: rows.reduce((sum, r) => sum - (r.label ? Math.log(clamp(r[key])) : Math.log(clamp(1 - r[key]))), 0) / n,
    predicted, actual: positives, predictedActualRatio: positives ? predicted / positives : null};
}
function bjtMondayStart(ms) {
  const bjtDay = Math.floor((ms + BJT_OFFSET_MS) / DAY_MS);
  const mondayDay = Math.floor((bjtDay + 3) / 7) * 7 - 3;
  return mondayDay * DAY_MS - BJT_OFFSET_MS;
}
function summarize(rows) {
  const blockBootstrap = days => platform.bootstrapWeeklyBrierImprovement(rows.map(r => ({
    week: Math.floor((bjtMondayStart(r.issuedAt) - BJT_MONDAY_EPOCH) / (days * DAY_MS)), label: r.label, p0: r.d60, p1: r.w28
  })));
  return {sameSample: true, n: rows.length, positiveCount: rows.filter(r => r.label).length,
    d60: score(rows, 'd60'), w28: score(rows, 'w28'),
    pairedImprovementD60MinusW28: score(rows, 'd60').brier == null || score(rows, 'w28').brier == null ? null : score(rows, 'd60').brier - score(rows, 'w28').brier,
    bootstrap7d: {...blockBootstrap(7), blockDefinition: '固定 BJT 周一 00:00 锚点的连续 7 日块；覆盖首尾不完整块保留'},
    bootstrap14d: {...blockBootstrap(14), blockDefinition: '固定 BJT 周一 00:00 锚点的连续 14 日块；覆盖首尾不完整块保留'},
    bootstrapInterpretation: '复用 platform.bootstrapWeeklyBrierImprovement；正值表示 W28 相对 D60 的 Brier 改善；区间为描述性区块重采样，不是升级门槛。'};
}

function canonicalEvents() {
  return history.events.map(e => e.firstSeenAt == null ? {...e, versionSeenAt: null} : e);
}
function visibleEvents(delayHours) {
  const canonical = canonicalEvents();
  if (delayHours === 0) return canonical;
  const delay = delayHours * 3_600_000;
  return canonical.map(e => {
    const announcedAt = typeof e.announcedAt === 'number' ? e.announcedAt : Date.parse(String(e.announcedAt));
    const firstSeenAt = e.firstSeenAt == null ? announcedAt : typeof e.firstSeenAt === 'number' ? e.firstSeenAt : Date.parse(String(e.firstSeenAt));
    return {...e, firstSeenAt: Math.max(firstSeenAt, announcedAt) + delay};
  });
}
function replay(delayHours) {
  const events = visibleEvents(delayHours);
  const finalCanonical = platform.fitPlatformModel({events: canonicalEvents(), coverage: [], trainingCutoff: to}).events;
  const rows = [];
  for (let issuedAt = firstAtOrAfter09(from); issuedAt + DAY_MS <= to; issuedAt += DAY_MS) {
    const trainingCoverageDays = trend.reliableCoverage(coverage, issuedAt).reduce((sum, c) => sum + (c.to - c.from) / DAY_MS, 0);
    if (trainingCoverageDays < 60 || !coverage.some(c => c.from <= issuedAt && c.to >= issuedAt + DAY_MS)) continue;
    const input = {events, coverage, trainingCutoff: issuedAt};
    const d60 = trend.fitTrendModel(input).probability24h;
    const w28 = weekday.fitWeekdayModel(input);
    const pred = weekday.predictWeekday(w28, issuedAt, DAY_MS);
    if (d60 == null || pred == null) continue;
    const label = finalCanonical.some(e => e.announcedAt > issuedAt && e.announcedAt <= issuedAt + DAY_MS) ? 1 : 0;
    rows.push({issuedAt, issuedAtBjt: `${bjtDate(issuedAt)}T09:00:00+08:00`, windowStartExclusive: issuedAt,
      windowEndInclusive: issuedAt + DAY_MS, label, d60, w28: pred.probability});
  }
  const inWindow = days => rows.filter(r => days == null || r.issuedAt > to - days * DAY_MS);
  const byRange = Object.fromEntries([['all', null], ['recent180', 180], ['recent90', 90]].map(([name, days]) => {
    const sample = inWindow(days);
    return [name, {...summarize(sample), rows: sample}];
  }));
  return {delayHours, delayMeaning: delayHours === 0 ? '不延迟假设；无 firstSeenAt 按公告即时可知理想化' : `${delayHours} 小时统一可见性压力假设，不是实测延迟`, ...byRange};
}

const onlineD60 = trend.fitTrendModel(baseInput);
const onlineW28 = weekday.fitWeekdayModel(baseInput);
const idealizedEvents = history.events.map(e => e.firstSeenAt == null ? {...e, versionSeenAt: null} : e);
const idealInput = {...baseInput, events: idealizedEvents};
const idealizedD60 = trend.fitTrendModel(idealInput);
const idealizedW28 = weekday.fitWeekdayModel(idealInput);
const finalMidnight = Math.ceil((to + BJT_OFFSET_MS) / DAY_MS) * DAY_MS - BJT_OFFSET_MS;
const futureDaily = Array.from({length: 7}, (_, i) => {
  const start = finalMidnight + i * DAY_MS;
  const d60p = onlineD60.ratePerDay == null ? null : -Math.expm1(-onlineD60.ratePerDay);
  const wp = weekday.predictWeekday(onlineW28, start, DAY_MS);
  return {dateBjt: bjtDate(start), windowStartExclusive: start, windowEndInclusive: start + DAY_MS,
    d60FrozenProbability24h: d60p, w28FrozenProbability24h: wp?.probability ?? null};
});
const cutoffForecast = {d60: onlineD60.probability24h, w28: weekday.predictWeekday(onlineW28, to, DAY_MS)?.probability ?? null};
const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const report = {
  source: pinned.source,
  method: {reproductionCommand: 'node scripts/v32-replay.mjs', inputFile: 'docs/v32-history-input-20261013.json', inputSha256: createHash('sha256').update(pinnedText).digest('hex'),
    model: 'D60 对固定候选 W28；星期效应为 Asia/Shanghai/BJT；不搜参', cutoffRule: 'coverageThrough ?? fetchedAt；coverage=[最早 regular 公告, 截点]，依据 completeHistoryDocument 完整分页校验',
    replayIssueTime: '每日 09:00 BJT；需训练期 >=60 个完整覆盖日；评分窗口 (t,t+24h] 必须完整覆盖；拟合严格只见 t 时刻可见事件；结果标签用截点前最终规范事件',
    delayGroups: '0/6/24 小时为统一可见性压力组，不代表历史实测延迟；沿用 replayTrend：缺 firstSeenAt 先清 versionSeenAt 作理想化处理，延迟组按 max(firstSeenAt, announcedAt)+delay 控制可见时刻，其他版本可见时间戳原样保留',
    metrics: 'all/recent180/recent90 分别在每个延迟组内部对 D60/W28 使用同一评分样本；pairedImprovementD60MinusW28 = Brier(D60)-Brier(W28)，正值表示 W28 较好',
    bootstrap: '复用 platform.bootstrapWeeklyBrierImprovement，按 BJT 周一 00:00 锚定 7/14 日块；首尾不完整块保留；描述性区间非显著性/上线门槛',
    future: '最终在线拟合的冻结费率；七个独立 BJT 00:00 起的 24h 窗口概率，另列截点起未来 24h 概率'},
  history: {fetchedAt: history.fetchedAt, coverageThrough: history.coverageThrough ?? null,
    cutoffUtc: new Date(to).toISOString(), cutoffBjt: `${bjtDate(to)} ${new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Shanghai', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'}).format(new Date(to))}+08:00`,
    earliestRegularUtc: new Date(from).toISOString(), regularEventCountThroughCutoff: times.length, coverageDays: (to - from) / DAY_MS,
    completeHistoryDocument: true, completenessValidator: 'src/lib/v3/runtime.ts completeHistoryDocument'},
  finalFit: {onlineAsStored: {d60: onlineD60, w28: onlineW28,
      eventFirstSeenMissingCount: history.events.filter(e => e.firstSeenAt == null).length,
      eventVersionSeenMissingCount: history.events.filter(e => e.versionSeenAt == null).length,
      note: 'firstSeenAt/versionSeenAt 均按输入原样保留；缺失字段不补造。'},
    idealizedMissingFirstSeen: {d60: idealizedD60, w28: idealizedW28,
      note: '缺 firstSeenAt 的事件将 versionSeenAt 显式清为 null；回放延迟组将其可见时刻理想化为 announcedAt+delay。'},
    weekdayTable: weekNames.map((name, weekdayIndex) => ({weekdayIndex, weekday: name,
      count: onlineW28.counts[weekdayIndex], exposureDays: onlineW28.exposures[weekdayIndex], multiplier: onlineW28.multipliers[weekdayIndex], ratePerDay: onlineW28.rates[weekdayIndex]})),
    cutoffFuture24h: cutoffForecast, nextSevenBjtMidnightFrozen24h: futureDaily},
  replay: [0, 6, 24].map(replay),
  caveats: ['公开历史最早 regular 事件之前没有被证明覆盖；报告按请求将其作为覆盖起点，不声称更早完整。',
    '延迟组是压力假设，不是实际采集延迟估计。',
    '缺少 firstSeenAt 的历史版本按公告即时可知，可能乐观；理想化处理已单独标记。',
    '同一历史同时用于固定参数选择背景与回放评估，近期结果是描述性证据，不是独立留出集。']
};
await mkdir(join(root, 'docs'), {recursive: true});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({outputPath, cutoff: report.history.cutoffUtc, coverageDays: report.history.coverageDays,
  final: cutoffForecast, futureSeven: futureDaily.map(x => ({dateBjt: x.dateBjt, d60: x.d60FrozenProbability24h, w28: x.w28FrozenProbability24h})),
  replay: report.replay.map(x => ({delayHours: x.delayHours, all: {n: x.all.n, positiveCount: x.all.positiveCount, d60Brier: x.all.d60.brier, w28Brier: x.all.w28.brier}, recent90: {n: x.recent90.n, positiveCount: x.recent90.positiveCount, d60Brier: x.recent90.d60.brier, w28Brier: x.recent90.w28.brier}}))}, null, 2));
