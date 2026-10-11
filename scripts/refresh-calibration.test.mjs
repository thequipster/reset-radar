import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { refreshCalibration } from './refresh-calibration.mjs';

test('refreshCalibration writes deterministic outcomes without changing prediction logs or production files', async () => {
  const tempBase = resolve(tmpdir());
  const root = await mkdtemp(join(tempBase, 'reset-radar-rr17-'));
  assert.equal(resolve(root).startsWith(`${tempBase}${sep}`), true, 'test directory must stay under os.tmpdir');
  const predictionPath = join(root, 'archive.jsonl');
  const canonicalPath = join(root, 'canonical.jsonl');
  const predictionBytes = `${JSON.stringify({
    date: '2026-10-01', predictedRisk: 75, fetchedAt: '2026-09-30T23:00:00.000Z',
    windowStart: '2026-10-01T00:00:00.000Z', windowEnd: '2026-10-02T00:00:00.000Z',
  })}\n`;
  const historyPath = join(root, 'data', 'resets-history.json');
  const sources = [{ path: predictionPath, label: '仓内归档' }, { path: canonicalPath, label: '应用日志' }];
  const generatedAt = new Date('2026-10-03T00:00:00.000Z');
  // finally 清理也要引用：声明在 try 之外（应用目录副本的重定向路径）。
  const summaryOutPath = join(root, 'appdir', 'calibration.json');
  try {
    await mkdir(join(root, 'data'), { recursive: true });
    await writeFile(predictionPath, predictionBytes, 'utf8');
    const makeHistory = (events) => ({
      schema: 'reset-radar/resets-history@1', fetchedAt: '2026-10-03T00:00:00.000Z',
      upstream: { pagination: { has_more: false } }, events,
    });
    await writeFile(historyPath, JSON.stringify(makeHistory([])), 'utf8');
    const withoutReset = await refreshCalibration({ root, generatedAt, predictionSources: sources, summaryOutPath });
    assert.deepEqual(withoutReset.outcomes.map((row) => row.realized), [false]);
    assert.equal(withoutReset.score.brier, 0.75 ** 2);

    await writeFile(historyPath, JSON.stringify(makeHistory([
      { resetType: 'regular', announcedAt: '2026-10-01T12:00:00.000Z' },
    ])), 'utf8');
    const withReset = await refreshCalibration({ root, generatedAt, predictionSources: sources, summaryOutPath });
    assert.deepEqual(withReset.outcomes.map((row) => row.realized), [true]);
    assert.equal(withReset.score.brier, 0.25 ** 2);
    const artifactPath = join(root, 'data', 'calibration.json');
    const reportPath = join(root, 'docs', 'calibration-latest.md');
    const artifactBytes = await readFile(artifactPath);
    const reportBytes = await readFile(reportPath);
    await refreshCalibration({ root, generatedAt, predictionSources: sources, summaryOutPath });
    // RR28：应用目录副本与仓内快照逐字节相同，且同样确定性重写。
    assert.deepEqual(await readFile(summaryOutPath), artifactBytes);
    assert.deepEqual(await readFile(artifactPath), artifactBytes);
    assert.deepEqual(await readFile(reportPath), reportBytes);
    assert.deepEqual(await readFile(predictionPath), Buffer.from(predictionBytes));
    assert.equal(withReset.predictionSources.read, 1);
    assert.equal(withReset.predictionSources.skipped, 0);
    assert.equal(withReset.predictionSources.files.length, 2);

    await writeFile(historyPath, JSON.stringify({ ...makeHistory([]), fetchedAt: 'invalid' }), 'utf8');
    await assert.rejects(refreshCalibration({ root, generatedAt, predictionSources: sources }), /历史来源无效/);
    assert.deepEqual(await readFile(artifactPath), artifactBytes);

    await writeFile(historyPath, JSON.stringify(makeHistory([])), 'utf8');
    const stale = await refreshCalibration({ root, generatedAt: new Date('2026-10-11T00:00:00Z'), predictionSources: sources, summaryOutPath });
    assert.equal(stale.state, 'stale');
    assert.equal(stale.historySource.asOf, '2026-10-03T00:00:00.000Z');
    assert.match(await readFile(reportPath, 'utf8'), /历史数据已过期/);
    // 恢复相同源生成，随后坏JSON必须保留这一代完整产物。
    await writeFile(historyPath, JSON.stringify(makeHistory([{ resetType: 'regular', announcedAt: '2026-10-01T12:00:00.000Z' }])), 'utf8');
    await refreshCalibration({ root, generatedAt, predictionSources: sources, summaryOutPath });

    await writeFile(historyPath, '{bad json', 'utf8');
    await assert.rejects(refreshCalibration({ root, generatedAt, predictionSources: sources }));
    assert.deepEqual(await readFile(artifactPath), artifactBytes, 'invalid history must preserve prior artifact');
    assert.deepEqual(await readFile(reportPath), reportBytes, 'invalid history must preserve prior report');
    assert.deepEqual(await readFile(predictionPath), Buffer.from(predictionBytes));
  } finally {
    // 只删除该测试显式创建的文件，并在递归清理前复核安全前缀。
    assert.equal(resolve(root).startsWith(`${tempBase}${sep}reset-radar-rr17-`), true);
    const files = [predictionPath, canonicalPath, historyPath, join(root, 'data', 'calibration.json'), join(root, 'docs', 'calibration-latest.md'), summaryOutPath];
    for (const path of files) await rm(path, { force: true });
    for (const path of [join(root, 'data'), join(root, 'docs'), join(root, 'appdir')]) {
      try { await rmdir(path); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    assert.deepEqual(await readdir(root), []);
    await rmdir(root);
  }
});
