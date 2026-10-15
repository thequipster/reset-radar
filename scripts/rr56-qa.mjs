// RR56 原生 WebView2 验收（node 直启 exe + CDP，Bridge 里不能跑 PowerShell/Shell）：
//   node scripts/rr56-qa.mjs [exe=release-qa/RR56-package/reset-radar.exe] [label=rr56] [port=9356] [--perf-only] [--perf-seconds=120]
// 1) 启动 exe（WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 注入调试端口），等 CDP 就绪；
// 2) 演示数据（#demo=healthy）下截取 四个页签 + 预览态，并核对人话文案与“今天忙不忙”按钮可点、面板不自动收起；
// 3) 回到真实数据的默认收起态，分两个 60 s 窗口统计 exe + 其 WebView2 子进程的 CPU 秒数（风扇问题的量化指标）；
// 4) taskkill 收尾。截图与报告写到 release-qa/RR56-qa/。只读真实数据，不改任何个人输入。
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "release-qa", "RR56-qa");
mkdirSync(outDir, { recursive: true });
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const exe = path.resolve(root, positional[0] ?? "release-qa/RR56-package/reset-radar.exe");
const label = positional[1] ?? "rr56";
const port = Number(positional[2] ?? 9356);
const perfOnly = flags.includes("--perf-only");
const perfSeconds = Number((flags.find((f) => f.startsWith("--perf-seconds=")) ?? "--perf-seconds=120").split("=")[1]);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { label, exe: path.relative(root, exe), startedAt: new Date().toISOString(), checks: [], perf: [], errors: [] };
const check = (name, ok, detail = "") => { report.checks.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`); };

function cpuSnapshot(rootPid) {
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='reset-radar.exe' OR Name='msedgewebview2.exe'\" | Select-Object ProcessId,ParentProcessId,Name,UserModeTime,KernelModeTime | ConvertTo-Json -Compress"], { encoding: "utf8" });
  let rows = [];
  try { rows = JSON.parse(ps.stdout || "[]"); } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [rows];
  const children = new Map();
  for (const row of rows) { if (!children.has(row.ParentProcessId)) children.set(row.ParentProcessId, []); children.get(row.ParentProcessId).push(row); }
  const mine = []; const stack = [rootPid]; const seen = new Set();
  while (stack.length) {
    const pid = stack.pop(); if (seen.has(pid)) continue; seen.add(pid);
    const self = rows.find((row) => row.ProcessId === pid); if (self) mine.push(self);
    for (const child of children.get(pid) ?? []) stack.push(child.ProcessId);
  }
  const seconds = mine.reduce((sum, row) => sum + Number(row.UserModeTime || 0) + Number(row.KernelModeTime || 0), 0) / 1e7;
  return { seconds, processes: mine.length };
}

console.log(`[rr56-qa] exe=${exe} label=${label} port=${port}`);
const child = spawn(exe, [], { cwd: path.dirname(exe), env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }, stdio: "ignore", windowsHide: true });
const pid = child.pid;
const t0 = Date.now();
let page = null;
for (let i = 0; i < 60 && !page; i += 1) {
  await pause(700);
  try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = pages.find((item) => item.type === "page") ?? null; } catch { /* not ready */ }
}
if (!page) { report.errors.push("CDP endpoint not ready"); finish(1); }
console.log(`[rr56-qa] CDP ready after ${Date.now() - t0} ms: ${page.url}`);
const base = page.url.split(/[?#]/)[0];
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 0; const pending = new Map();
socket.onmessage = ({ data }) => { const msg = JSON.parse(String(data)); if (!msg.id) return; const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); };
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 20000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function navigate(hash = "", theme = "dark", settle = 1800) {
  await cdp("Page.navigate", { url: "about:blank" });
  await cdp("Page.navigate", { url: `${base}?theme=${theme}${hash}` });
  await pause(settle);
}
async function screenshot(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const file = path.join(outDir, `${label}-${name}.png`);
  writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log(`[rr56-qa] screenshot ${path.relative(root, file)} (${result.data.length} b64 chars)`);
}

try {
  if (!perfOnly) {
    for (const tab of ["overview", "risk", "planner", "data"]) {
      await navigate(`#expanded&tab=${tab}&demo=healthy`, "dark", tab === "overview" ? 2500 : 1800);
      const text = await evaluate("document.body.innerText");
      const overflow = await evaluate('(()=>{const m=document.querySelector("main");return m?m.scrollWidth>m.clientWidth:null})()');
      check(`${tab}: 无横向溢出`, overflow === false, `scrollWidth>clientWidth=${overflow}`);
      if (tab === "overview") {
        for (const needle of ["今天最多用约", "今天忙不忙", "专业细节（模型原话）", "今天怎么用"]) check(`overview 文案「${needle}」`, text.includes(needle));
        check("overview 不再出现旧术语「自然补给」", !text.includes("自然补给"));
        const pressedBefore = await evaluate('Array.from(document.querySelectorAll("button[aria-pressed]")).map(b=>[b.textContent.trim().slice(0,3),b.getAttribute("aria-pressed")])');
        await evaluate('(()=>{const b=Array.from(document.querySelectorAll("button[aria-pressed]")).find(x=>x.textContent.trim().startsWith("很忙"));if(b){b.click();return "clicked"}return "missing"})()');
        await pause(1200);
        const pressedAfter = await evaluate('Array.from(document.querySelectorAll("button[aria-pressed]")).map(b=>[b.textContent.trim().slice(0,3),b.getAttribute("aria-pressed")])');
        const busyOn = pressedAfter.some(([t, v]) => t.startsWith("很忙") && v === "true");
        check("overview: 点「很忙」后按钮进入选中态", busyOn, JSON.stringify({ before: pressedBefore, after: pressedAfter }));
        const headlineAfter = (await evaluate("document.body.innerText")).match(/今天最多用约 [^\n]+/)?.[0] ?? "";
        check("overview: 建议量随工作量档位变化", headlineAfter !== "" , headlineAfter);
        await pause(1500);
        check("overview: 点选后 1.5 s 面板仍展开（未自动缩圆）", (await evaluate('document.querySelectorAll("[role=tablist]").length')) === 1);
        // 恢复：再点一次取消选择（演示账号的个人输入独立保存，仍清理干净）
        await evaluate('(()=>{const b=Array.from(document.querySelectorAll("button[aria-pressed]")).find(x=>x.textContent.trim().startsWith("很忙"));if(b&&b.getAttribute("aria-pressed")==="true")b.click();})()');
        await pause(600);
        await evaluate('for(const k of Object.keys(localStorage))if(k.startsWith("rr.personal-inputs.v3.demo"))localStorage.removeItem(k);');
        await navigate(`#expanded&tab=${tab}&demo=healthy`, "dark", 2500);
      }
      if (tab === "planner") { for (const needle of ["我的设置", "今天忙不忙", "我的卡（到期时间）", "专业细节（规划比较）"]) check(`planner 文案「${needle}」`, text.includes(needle)); }
      if (tab === "risk") check("risk: 专业细节折叠区存在", text.includes("专业细节"));
      if (tab === "data") check("data: 保留「当前参考模型」", text.includes("当前参考模型"));
      await screenshot(`${tab}-dark`);
    }
    await navigate("#expanded&tab=overview&demo=healthy", "light", 2500);
    await screenshot("overview-light");
    await navigate("#peek&form=bar&demo=healthy", "dark", 1800);
    const peekText = await evaluate("document.body.innerText");
    check("peek 文案「今天最多用」+「看今天怎么用」", peekText.includes("今天最多用") && peekText.includes("看今天怎么用"));
    await screenshot("peek-dark");
  }
  // 性能：真实数据、默认收起态（迷你圆），两个窗口各 perfSeconds/2 秒。
  await navigate("", "dark", 1500);
  const half = Math.max(10, Math.round(perfSeconds / 2));
  let prev = cpuSnapshot(pid); let prevAt = Date.now();
  for (const window of ["A", "B"]) {
    await pause(half * 1000);
    const now = cpuSnapshot(pid); const nowAt = Date.now();
    const wall = (nowAt - prevAt) / 1000; const cpu = now.seconds - prev.seconds;
    const entry = { window, wallSeconds: Number(wall.toFixed(1)), cpuSeconds: Number(cpu.toFixed(1)), avgCores: Number((cpu / wall).toFixed(2)), processes: now.processes };
    report.perf.push(entry); console.log(`[rr56-qa] perf ${window}: ${JSON.stringify(entry)}`);
    prev = now; prevAt = nowAt;
  }
  const total = cpuSnapshot(pid);
  report.perf.push({ window: "total-since-launch", wallSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)), cpuSeconds: Number(total.seconds.toFixed(1)), processes: total.processes });
  console.log(`[rr56-qa] perf total: ${JSON.stringify(report.perf.at(-1))}`);
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  console.error(`[rr56-qa] error: ${error}`);
}
finish(report.errors.length || report.checks.some((c) => !c.ok) ? 1 : 0);

function finish(code) {
  try { socket?.close(); } catch { /* ignore */ }
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(outDir, `${label}-report.json`), JSON.stringify(report, null, 2));
  console.log(`[rr56-qa] report → release-qa/RR56-qa/${label}-report.json (exit ${code})`);
  process.exit(code);
}
