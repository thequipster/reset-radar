// RR15 文件路径与追加锁验证（node:test，避免被 Vitest 的浏览器配置扫描）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32, posix, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  appendPredictionFile,
  canonicalPredictionPath,
  parsePredictionPathArg,
  readPredictionFiles,
  resolvePredictionPaths,
} from "../prediction-files.mjs";

function withTemp(run) {
  const dir = mkdtempSync(join(tmpdir(), "rr15-predictions-"));
  try { run(dir); } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith("rr15-predictions-"));
    rmSync(dir, { recursive: true });
  }
}

test("--path resolves relative paths and preserves absolute paths", () => {
  assert.equal(parsePredictionPathArg(["--path", "logs/p.jsonl"], "/repo", posix), "/repo/logs/p.jsonl");
  assert.equal(parsePredictionPathArg(["--path", "D:\\logs\\p.jsonl"], "C:\\repo", win32), "D:\\logs\\p.jsonl");
  assert.throws(() => parsePredictionPathArg(["--path"], "/repo", posix), /需要一个文件路径/);
});

test("canonical paths follow Tauri identifier on each platform", () => {
  assert.equal(canonicalPredictionPath({ platform: "win32", env: { APPDATA: "C:\\Users\\u\\Roaming" }, home: "C:\\Users\\u", pathApi: win32 }), "C:\\Users\\u\\Roaming\\app.resetradar.desktop\\predictions.jsonl");
  assert.equal(canonicalPredictionPath({ platform: "darwin", env: {}, home: "/Users/u", pathApi: posix }), "/Users/u/Library/Application Support/app.resetradar.desktop/predictions.jsonl");
  assert.equal(canonicalPredictionPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/tmp/config" }, home: "/home/u", pathApi: posix }), "/tmp/config/app.resetradar.desktop/predictions.jsonl");
});

test("default inputs deduplicate same path and sort by fetchedAt with archive first on ties", () => {
  withTemp((dir) => {
    const archive = join(dir, "archive.jsonl");
    const canonical = join(dir, "app.jsonl");
    writeFileSync(archive, [
      JSON.stringify({ date: "2026-01-02", predictedRisk: 2, fetchedAt: "2026-01-02T00:00:00Z" }),
      "{bad}",
      JSON.stringify({ date: "2026-01-01", predictedRisk: 1, fetchedAt: "2026-01-01T00:00:00Z" }),
    ].join("\n"));
    writeFileSync(canonical, JSON.stringify({ date: "2026-01-03", predictedRisk: 3, fetchedAt: "2026-01-02T00:00:00Z" }));
    assert.equal(resolvePredictionPaths({ archivePath: archive, canonicalPath: archive }).length, 1);
    const data = readPredictionFiles(resolvePredictionPaths({ archivePath: archive, canonicalPath: canonical }));
    assert.deepEqual(data.rows.map((row) => row.date), ["2026-01-01", "2026-01-02", "2026-01-03"]);
    assert.equal(data.files.length, 2);
    assert.equal(data.rows[1].date, "2026-01-02"); // 同时间仓内归档在应用日志之前
    assert.equal(data.skipped, 1);
  });
});

test("append preserves existing bytes and inserts a separator for a missing final newline", () => {
  withTemp((dir) => {
    const path = join(dir, "nested", "predictions.jsonl");
    mkdirSync(join(dir, "nested"));
    const original = '{"date":"2026-01-01","predictedRisk":10}\n{bad-json}';
    writeFileSync(path, original);
    const outcome = appendPredictionFile(path, (rows) => ({ appended: true, lines: [...rows, '{"date":"2026-01-02","predictedRisk":20}'] }));
    assert.equal(outcome.appended, true);
    assert.equal(readFileSync(path, "utf8"), `${original}\n{"date":"2026-01-02","predictedRisk":20}\n`);
    assert.equal(existsSync(`${path}.lock`), false);
  });
});

test("busy lock fails clearly and never removes the other process lock", () => {
  withTemp((dir) => {
    const path = join(dir, "predictions.jsonl");
    writeFileSync(`${path}.lock`, "owner");
    assert.throws(() => appendPredictionFile(path, () => ({ appended: true, lines: ["new"] })), /正被其他进程写入/);
    assert.equal(readFileSync(`${path}.lock`, "utf8"), "owner");
  });
});

test("log CLI --path writes only to the requested temporary file", () => {
  withTemp((dir) => {
    const path = join(dir, "custom", "predictions.jsonl");
    const script = fileURLToPath(new URL("../log-prediction.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, "--path", path], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(readFileSync(path, "utf8").trim().split(/\r?\n/).length, 1);
  });
});

test("unknown or duplicate path options fail instead of writing canonical data", () => {
  assert.throws(() => parsePredictionPathArg(["--paht", "logs/p.jsonl"]), /未知参数/);
  assert.throws(() => parsePredictionPathArg(["--path", "one", "--path", "two"]), /仅支持一个/);
});

test("missing file is labelled but read errors make calibration fail explicitly", () => {
  withTemp((dir) => {
    const missing = join(dir, "missing.jsonl");
    const empty = readPredictionFiles([{ path: missing, label: "指定" }]);
    assert.equal(empty.files[0].missing, true); assert.deepEqual(empty.rows, []);
    assert.throws(() => readPredictionFiles([{ path: dir, label: "不可读文件" }]), /读取预测日志失败/);
    const script = fileURLToPath(new URL("../calibrate.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, "--path", dir], { encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /读取预测日志失败/);
    assert.doesNotMatch(result.stdout, /暂无预测日志/);
  });
});
