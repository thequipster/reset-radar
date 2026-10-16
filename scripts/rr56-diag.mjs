// RR56 诊断：真实数据、默认收起态下，谁在吃 CPU？按进程类型拆分 CPU 增量 + CDP 指标 + 规划 worker 是否常驻。
// 用法：node scripts/rr56-diag.mjs [exe] [port=9357] [seconds=90] [hash=""]
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exe = path.resolve(root, process.argv[2] ?? "release-qa/RR56-package/reset-radar.exe");
const port = Number(process.argv[3] ?? 9357);
const seconds = Number(process.argv[4] ?? 90);
const hash = process.argv[5] ?? "";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function procs(rootPid) {
  const ps = spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='reset-radar.exe' OR Name='msedgewebview2.exe'\" | Select-Object ProcessId,ParentProcessId,Name,UserModeTime,KernelModeTime,CommandLine | ConvertTo-Json -Compress"], { encoding: "utf8" });
  let rows = []; try { rows = JSON.parse(ps.stdout || "[]"); } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [rows];
  const children = new Map();
  for (const r of rows) { if (!children.has(r.ParentProcessId)) children.set(r.ParentProcessId, []); children.get(r.ParentProcessId).push(r); }
  const mine = new Map(); const stack = [rootPid];
  while (stack.length) { const pid = stack.pop(); if (mine.has(pid)) continue; const self = rows.find((r) => r.ProcessId === pid); if (self) mine.set(pid, self); for (const c of children.get(pid) ?? []) stack.push(c.ProcessId); }
  const out = {};
  for (const [pid, r] of mine) {
    const type = r.Name === "reset-radar.exe" ? "host" : (String(r.CommandLine ?? "").match(/--type=([a-z-]+)/)?.[1] ?? "browser");
    out[`${type}#${pid}`] = (Number(r.UserModeTime || 0) + Number(r.KernelModeTime || 0)) / 1e7;
  }
  return out;
}
const child = spawn(exe, [], { cwd: path.dirname(exe), env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }, stdio: "ignore", windowsHide: true });
const pid = child.pid; const t0 = Date.now();
let page = null;
for (let i = 0; i < 60 && !page; i += 1) { await pause(700); try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = pages.find((p) => p.type === "page") ?? null; } catch { /* wait */ } }
if (!page) { spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"]); console.error("CDP not ready"); process.exit(1); }
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; });
let nextId = 0; const pending = new Map();
socket.onmessage = ({ data }) => { const m = JSON.parse(String(data)); if (!m.id) return; const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); };
const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, 15000); pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } }); socket.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => { const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
try {
  if (hash) { const base = page.url.split(/[?#]/)[0]; await cdp("Page.navigate", { url: "about:blank" }); await cdp("Page.navigate", { url: `${base}${hash}` }); await pause(1500); }
  await cdp("Performance.enable");
  let prevProcs = procs(pid); let prevAt = Date.now(); let prevMetrics = null;
  const metricNames = ["ScriptDuration", "TaskDuration", "LayoutDuration", "RecalcStyleDuration", "JSHeapUsedSize"];
  for (let elapsed = 0; elapsed < seconds; elapsed += 10) {
    await pause(10000);
    const nowProcs = procs(pid); const nowAt = Date.now(); const wall = (nowAt - prevAt) / 1000;
    const deltas = Object.fromEntries(Object.entries(nowProcs).map(([k, v]) => [k, Number(((v - (prevProcs[k] ?? 0)) / wall).toFixed(2))]).filter(([, v]) => v > 0.02));
    const targets = await cdp("Target.getTargets");
    const workers = targets.targetInfos.filter((t) => t.type === "worker" || t.type === "shared_worker" || t.type === "service_worker").map((t) => `${t.type}:${t.url.split("/").pop()}`);
    const metrics = Object.fromEntries((await cdp("Performance.getMetrics")).metrics.filter((m) => metricNames.includes(m.name)).map((m) => [m.name, m.value]));
    const md = prevMetrics ? Object.fromEntries(metricNames.slice(0, 4).map((n) => [n, Number((metrics[n] - prevMetrics[n]).toFixed(2))])) : null;
    let cache = null; try { cache = await evaluate('(()=>{const raw=localStorage.getItem("rr.planning.cache.v1");if(!raw)return null;const p=JSON.parse(raw);const e=Array.isArray(p)?p:(p.entries??Object.values(p));return {entries:(e?.length??Object.keys(p).length),chars:raw.length}})()'); } catch (e) { cache = String(e).slice(0, 80); }
    let modelInfo = null; try { modelInfo = await evaluate('(()=>{const m=document.querySelector("main");return m?{form:m.dataset.shellForm,log:m.dataset.predictionLogState,tablist:document.querySelectorAll("[role=tablist]").length}:null})()'); } catch { /* ignore */ }
    console.log(JSON.stringify({ t: Math.round((nowAt - t0) / 1000), coresByProcess: deltas, workers, mainThreadSecondsPer10s: md, heapMB: Number((metrics.JSHeapUsedSize / 1048576).toFixed(1)), planningCache: cache, shell: modelInfo }));
    prevProcs = nowProcs; prevAt = nowAt; prevMetrics = metrics;
  }
} catch (error) { console.error(String(error)); }
finally { try { socket.close(); } catch { /* ignore */ } spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); }
