// scripts/review-calibration.test.mjs —— REVIEW 命令编排测试（注入 run，零网络）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReviewCalibration } from './review-calibration.mjs';

const ok = (stdout = '', stderr = '') => ({ status: 0, stdout, stderr });
const bad = (status, stdout = '', stderr = '') => ({ status, stdout, stderr });

test('先刷新历史，再运行校准；输出流按用途分流', () => {
  const calls = [];
  const result = runReviewCalibration({
    run: (command, args, options) => {
      calls.push({ command, args, options });
      return calls.length === 1 ? ok('fetch log\n') : ok('# calibration\n');
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].args[0], /scripts[\\/]fetch-history\.mjs$/);
  assert.match(calls[1].args[0], /scripts[\\/]calibrate\.mjs$/);
  assert.equal(calls[0].options.cwd, join(dirname(fileURLToPath(import.meta.url)), '..'));
  assert.equal(calls[1].options.cwd, calls[0].options.cwd);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, 'fetch log\n');
  assert.equal(result.stdout, '# calibration\n');
});

test('fetch 失败时非零退出并且不运行 calibrate', () => {
  let calls = 0;
  const result = runReviewCalibration({
    run: () => {
      calls += 1;
      return bad(1, 'fetch output', 'network error');
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /fetch outputnetwork error/);
  assert.match(result.stderr, /已中止校准/);
});

test('calibrate 失败时非零退出且不输出部分 Markdown', () => {
  let calls = 0;
  const result = runReviewCalibration({
    run: () => (++calls === 1 ? ok() : bad(2, '# incomplete', 'calibration error')),
  });
  assert.equal(calls, 2);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /calibration error/);
  assert.match(result.stderr, /校准失败/);
});
