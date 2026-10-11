// 预测日志的文件路径、来源读取与跨进程追加锁。
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, fsyncSync } from "node:fs";
import { dirname, resolve, win32, posix } from "node:path";
import { homedir } from "node:os";

// 来源：src-tauri/tauri.conf.json:5 identifier，app_config_dir为config_dir/identifier。
const APP_ID = "app.resetradar.desktop";

export function parsePredictionPathArg(args, cwd = process.cwd(), pathApi = process.platform === "win32" ? win32 : posix) {
  const index = args.indexOf("--path");
  if (args.length === 0) return null;
  if (index < 0) throw new Error("未知参数；用法：--path <文件路径>");
  if (index !== 0 || args.length > 2) throw new Error("仅支持一个 --path <文件路径> 参数");
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("--path 后需要一个文件路径");
  return pathApi.isAbsolute(value) ? pathApi.normalize(value) : pathApi.resolve(cwd, value);
}

export function canonicalPredictionPath({ platform = process.platform, env = process.env, home = homedir(), pathApi } = {}) {
  const api = pathApi ?? (platform === "win32" ? win32 : posix);
  if (platform === "win32") {
    const base = env.APPDATA || api.join(home, "AppData", "Roaming");
    return api.join(base, APP_ID, "predictions.jsonl");
  }
  if (platform === "darwin") return api.join(home, "Library", "Application Support", APP_ID, "predictions.jsonl");
  const base = env.XDG_CONFIG_HOME || api.join(home, ".config");
  return api.join(base, APP_ID, "predictions.jsonl");
}

export function resolvePredictionPaths({ override, archivePath, canonicalPath }) {
  if (override) return [{ path: override, label: "指定文件" }];
  const paths = [{ path: archivePath, label: "仓内归档" }, { path: canonicalPath, label: "应用日志" }];
  const seen = new Set();
  return paths.filter(({ path }) => {
    const key = process.platform === "win32" ? path.toLowerCase() : path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function readPredictionFiles(sources) {
  const rows = [];
  const files = [];
  let skipped = 0;
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex];
    let raw;
    try {
      raw = readFileSync(source.path, "utf8");
    } catch (err) {
      if (err?.code === "ENOENT") {
        files.push({ ...source, missing: true, rows: 0 });
        continue;
      }
      throw new Error(`读取预测日志失败 ${source.path}: ${err.message}`, { cause: err });
    }
    let count = 0;
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim();
      if (!text) continue;
      try {
        const obj = JSON.parse(text);
        if (typeof obj?.date === "string" && Number.isFinite(obj?.predictedRisk)) {
          rows.push({ date: obj.date, predictedRisk: obj.predictedRisk, fetchedAt: obj.fetchedAt,
            ...(obj.windowStart !== undefined ? { windowStart: obj.windowStart } : {}),
            ...(obj.windowEnd !== undefined ? { windowEnd: obj.windowEnd } : {}),
            ...(obj.watchComparison !== undefined ? { watchComparison: obj.watchComparison } : {}),
            source: source.label, sourceIndex, rowIndex: count });
          count += 1;
        } else skipped += 1;
      } catch { skipped += 1; }
    }
    files.push({ ...source, missing: false, rows: count });
  }
  rows.sort((a, b) => {
    const ta = Date.parse(a.fetchedAt ?? "");
    const tb = Date.parse(b.fetchedAt ?? "");
    const va = Number.isFinite(ta), vb = Number.isFinite(tb);
    if (va && vb && ta !== tb) return ta - tb;
    if (va !== vb) return va ? -1 : 1;
    return a.sourceIndex - b.sourceIndex || a.rowIndex - b.rowIndex;
  });
  return { rows: rows.map(({ source, sourceIndex, rowIndex, ...row }) => row), skipped, files };
}

export function appendPredictionFile(path, decide) {
  mkdirSync(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lockFd;
  try {
    lockFd = openSync(lockPath, "wx");
  } catch (err) {
    if (err?.code === "EEXIST") throw new Error(`预测日志正被其他进程写入（锁文件：${lockPath}）`);
    throw err;
  }
  try {
    // 留下持有者供崩溃后诊断，不自动清理未知锁。
    writeFileSync(lockFd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }) + "\n");
    // 锁内读取并调用 src/lib 幂等函数判断，避免并发进程覆盖对方新行。
    let raw = "";
    try { raw = readFileSync(path, "utf8"); }
    catch (err) { if (err?.code !== "ENOENT") throw err; }
    const current = raw.split(/\r?\n/).filter((line) => line.trim());
    const refreshed = decide(current);
    if (!refreshed.appended) return refreshed;
    const needsSeparator = raw.length > 0 && !raw.endsWith("\n");
    const fd = openSync(path, "a");
    try {
      writeFileSync(fd, `${needsSeparator ? "\n" : ""}${refreshed.lines[refreshed.lines.length - 1]}\n`);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    return refreshed;
  } finally {
    closeSync(lockFd);
    unlinkSync(lockPath);
  }
}

