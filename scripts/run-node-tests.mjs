import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');

// 递归收集 scripts 下的 Node 测试文件，并按绝对路径稳定排序。
export function discoverNodeTests(root = defaultRoot) {
  const scriptsDir = join(resolve(root), 'scripts');
  const files = [];

  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.node.mjs'))) {
        files.push(resolve(path));
      }
    }
  }

  visit(scriptsDir);
  return files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// 统一从 Node 子进程运行，便于注入 spawn 做行为测试。
export function runNodeTests({ root = defaultRoot, spawn = spawnSync } = {}) {
  const files = discoverNodeTests(root);
  if (files.length === 0) {
    process.stderr.write('未发现 scripts 下的 Node 测试文件。\n');
    return 1;
  }

  let result;
  try {
    result = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  } catch (error) {
    process.stderr.write(`启动 Node 测试失败：${error.message}\n`);
    return 1;
  }
  if (result.error) {
    process.stderr.write(`启动 Node 测试失败：${result.error.message}\n`);
    return 1;
  }
  if (result.signal) {
    process.stderr.write(`Node 测试进程被信号终止：${result.signal}\n`);
    return 1;
  }
  return Number.isInteger(result.status) ? result.status : 1;
}

// 仅直接执行此文件时启动测试；作为模块导入不产生副作用。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = runNodeTests();
}
