import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { discoverNodeTests, runNodeTests } from './run-node-tests.mjs';

const tempPrefix = 'reset-radar-node-runner-test-';

function withTempRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), tempPrefix));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    fn(root);
  } finally {
    const target = resolve(root);
    const tempRoot = resolve(tmpdir());
    assert.ok(target.startsWith(`${tempRoot}${sep}`), '临时目录必须位于 os.tmpdir() 内');
    assert.ok(target.slice(tempRoot.length + 1).startsWith(tempPrefix), '临时目录必须有本测试专用前缀');
    rmSync(target, { recursive: true, force: true });
  }
}

test('递归发现 Node 测试并忽略普通脚本，结果按绝对路径排序', () => {
  withTempRoot((root) => {
    const scripts = join(root, 'scripts');
    mkdirSync(join(scripts, 'nested', 'deep'), { recursive: true });
    writeFileSync(join(scripts, 'z.test.mjs'), '');
    writeFileSync(join(scripts, 'nested', 'deep', 'a.node.mjs'), '');
    writeFileSync(join(scripts, 'nested', 'ignored.mjs'), '');
    writeFileSync(join(scripts, 'notes.test.js'), '');
    const found = discoverNodeTests(root);
    assert.deepEqual(found, [
      resolve(scripts, 'nested', 'deep', 'a.node.mjs'),
      resolve(scripts, 'z.test.mjs'),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

test('空清单拒绝启动 Node 子进程', () => {
  withTempRoot((root) => {
    let called = false;
    const status = runNodeTests({ root, spawn: () => { called = true; return { status: 0 }; } });
    assert.equal(status, 1);
    assert.equal(called, false);
  });
});

test('透传子进程退出码及启动失败、信号失败', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'scripts', 'sample.node.mjs'), '');
    let invocation;
    assert.equal(runNodeTests({ root, spawn: (...args) => { invocation = args; return { status: 7 }; } }), 7);
    assert.equal(invocation[0], process.execPath);
    assert.equal(invocation[1][0], '--test');
    assert.equal(invocation[1].at(-1), resolve(root, 'scripts', 'sample.node.mjs'));
    assert.equal(runNodeTests({ root, spawn: () => ({ status: null, signal: 'SIGTERM' }) }), 1);
    assert.equal(runNodeTests({ root, spawn: () => ({ status: null, error: new Error('spawn failed') }) }), 1);
  });
});

test('真实 Node 测试进程失败时入口返回非零', () => {
  withTempRoot((root) => {
    writeFileSync(join(root, 'scripts', 'broken.test.mjs'), "import test from 'node:test'; test('故意失败', () => { throw new Error('expected failure'); });\n");
    // node:test 会用该变量标记测试 worker；清除后才能真实启动嵌套 Node 测试进程。
    const runInFreshNodeContext = (command, args, options) => spawnSync(command, args, {
      ...options,
      env: { ...process.env, NODE_TEST_CONTEXT: undefined },
    });
    assert.notEqual(runNodeTests({ root, spawn: runInFreshNodeContext }), 0);
  });
});
