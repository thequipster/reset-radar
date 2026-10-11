#!/usr/bin/env node
// scripts/review-calibration.mjs —— REVIEW 入口：先刷新真实历史，再生成校准 Markdown。
// 算法仍由 scripts/calibrate.mjs 与 src/lib/calibration.ts 提供，本文件只编排命令。

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function resultText(result, key) {
  return typeof result?.[key] === 'string' ? result[key] : '';
}

function failed(result) {
  return result?.error || result?.status !== 0;
}

function failureMessage(result) {
  if (result?.error) return `命令启动失败：${result.error.message ?? result.error}`;
  return `命令退出状态：${result?.status ?? 'unknown'}`;
}

// 先拉取并校验真实历史；fetch 诊断始终走 stderr，校准报告仅在成功时交给 stdout。
export function runReviewCalibration({ run = spawnSync } = {}) {
  const fetchResult = run(process.execPath, [join(ROOT, 'scripts/fetch-history.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const fetchDiagnostics = resultText(fetchResult, 'stdout') + resultText(fetchResult, 'stderr');
  if (failed(fetchResult)) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: fetchDiagnostics + `\n[review-calibration] 历史刷新失败；已中止校准。${failureMessage(fetchResult)}\n`,
    };
  }

  const calibrationResult = run(process.execPath, [join(ROOT, 'scripts/calibrate.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (failed(calibrationResult)) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: fetchDiagnostics + resultText(calibrationResult, 'stderr') +
        `[review-calibration] 校准失败。${failureMessage(calibrationResult)}\n`,
    };
  }
  return {
    exitCode: 0,
    stdout: resultText(calibrationResult, 'stdout'),
    stderr: fetchDiagnostics + resultText(calibrationResult, 'stderr'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runReviewCalibration();
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exitCode = result.exitCode;
}
