#!/usr/bin/env node
// RR11 发布就绪门禁：版本同步 + README 链接可达 +（可选）tag 一致性。
// 口径来源：BACKLOG RR11 验证口径——package.json 与 src-tauri/tauri.conf.json 版本必须一致；
// README 内相对链接必须全部解析到存在的文件（存在性检查）；带 --tag 时（release.yml 调用）
// tag 名必须等于 v{version}。任一失败 exit 1。用法：
//   node scripts/check-release.mjs [--tag v0.1.0 | --tag=v0.1.0]
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (msg) => failures.push(msg);
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

// ① 版本两处同步（RUNBOOK §6：package.json 与 tauri.conf.json 必须同步）
const pkg = readJson('package.json');
const conf = readJson('src-tauri/tauri.conf.json');
if (pkg.version !== conf.version) {
  fail(`版本不同步：package.json=${pkg.version} tauri.conf.json=${conf.version}`);
}

// ② tag 一致性（release.yml 的 Version/tag consistency guard 步骤调用）
const argv = process.argv.slice(2);
let tag = null;
const idx = argv.findIndex((a) => a === '--tag' || a.startsWith('--tag='));
if (idx >= 0) {
  tag = argv[idx].includes('=') ? argv[idx].split('=')[1] : argv[idx + 1];
  if (!tag) fail('--tag 传了开关但没给值（--tag v0.1.0 或 --tag=v0.1.0）');
}
if (tag !== null && tag !== `v${pkg.version}`) {
  fail(`tag 与版本不一致：tag=${tag} 期望=v${pkg.version}`);
}

// ③ README 相对链接存在性（外链/锚点/邮件跳过，只查仓库内路径）
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const targets = [...readme.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
  .map((m) => m[1])
  .filter((t) => !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(t) && !t.startsWith('#') && !t.startsWith('mailto:'));
for (const t of targets) {
  const rel = decodeURI(t.split('#')[0]);
  if (!existsSync(join(ROOT, rel))) fail(`README 链接不可达：${t}`);
}

if (failures.length) {
  console.error(`check-release: ${failures.length} 项失败`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-release OK：版本同步 ${pkg.version}` +
    `${tag ? `（tag=${tag}）` : ''}；README 相对链接 ${targets.length} 条全部可达`,
);
