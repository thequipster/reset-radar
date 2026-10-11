#!/usr/bin/env node
// RR17：用仓内历史与只读预测日志刷新可机读快照及最近校准报告。
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCalibrationSnapshot } from '../src/lib/calibrationSnapshot.ts';
import { generateCalibrationReport } from './calibration-report.mjs';
import { canonicalPredictionPath, readPredictionFiles, resolvePredictionPaths } from './prediction-files.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function atomicWrite(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, contents, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function refreshCalibration({ root = defaultRoot, generatedAt = new Date(), predictionSources } = {}) {
  const repoRoot = resolve(root);
  const historyPath = join(repoRoot, 'data', 'resets-history.json');
  const history = JSON.parse(await readFile(historyPath, 'utf8'));
  const sources = predictionSources ?? resolvePredictionPaths({
    archivePath: join(repoRoot, 'data', 'predictions.jsonl'),
    canonicalPath: canonicalPredictionPath(),
  });
  // 读取失败时直接抛错；预测日志始终只读。
  const predictions = readPredictionFiles(sources);
  const snapshot = buildCalibrationSnapshot(history, predictions.rows, generatedAt);
  if (snapshot.state === 'invalid') throw new Error('历史来源无效，未刷新校准产物');

  const sourceMetadata = {
    read: predictions.rows.length,
    skipped: predictions.skipped,
    files: predictions.files.map((file) => ({ ...file, path: resolve(file.path) })),
  };
  const artifact = { ...snapshot, predictionSources: sourceMetadata };
  const markdown = generateCalibrationReport({
    history,
    predictions,
    generatedAt: generatedAt.toISOString(),
  });
  await atomicWrite(join(repoRoot, 'data', 'calibration.json'), `${JSON.stringify(artifact, null, 2)}\n`);
  await atomicWrite(join(repoRoot, 'docs', 'calibration-latest.md'), markdown);
  return artifact;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  refreshCalibration().then((artifact) => {
    console.log(`[refresh-calibration] ${artifact.state}；预测 ${artifact.predictionSources.read} 行，计分 ${artifact.score.n} 个24h窗口`);
  }).catch((error) => {
    console.error(`[refresh-calibration] 失败：${error?.message ?? error}`);
    process.exitCode = 1;
  });
}
