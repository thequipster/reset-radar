// RR57 截图核对（node 直启 exe + CDP；Bridge 里不能跑 PowerShell/Shell）：
//   node scripts/rr57-shot.mjs [exe=release-qa/RR56-package/reset-radar.exe] [label=rr57] [port=9358]
// 1) 收起态悬浮条 / 迷你圆（深浅两套）：截 PNG，用于核对外壳阴影不再被窗口边切成方框；
// 2) 总览页打开「一定用卡，告诉我哪天」：截图 + 抓取该区块的文字；再切「12 小时」截一张；
// 3) 复原演示账号的个人输入（只动 demo 命名空间的 localStorage），taskkill 收尾。输出到 release-qa/RR56-qa/。
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "release-qa", "RR56-qa");
mkdirSync(outDir, { recursive: true });
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const exe = path.resolve(root, positional[0] ?? "release-qa/RR56-package/reset-radar.exe");
const label = positional[1] ?? "rr57";
const port = Number(positional[2] ?? 9358);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { label, exe: path.relative(root, exe), startedAt: new Date().toISOString(), shots: [], texts: {}, errors: [] };

console.log(`[rr57-shot] exe=${exe} label=${label} port=${port}`);
const child = spawn(exe, [], { cwd: path.dirname(exe), env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` }, stdio: "ignore", windowsHide: true });
const pid = child.pid;
const t0 = Date.now();
let page = null;
for (let i = 0; i < 60 && !page; i += 1) {
  await pause(700);
  try { const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); page = pages.find((item) => item.type === "page") ?? null; } catch { /* not ready */ }
}
if (!page) { report.errors.push("CDP endpoint not ready"); finish(1); }
console.log(`[rr57-shot] CDP ready after ${Date.now() - t0} ms: ${page.url}`);
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
  const size = await evaluate("JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})");
  report.shots.push({ name, file: path.relative(root, file), b64: result.data.length, viewport: JSON.parse(size) });
  console.log(`[rr57-shot] screenshot ${path.relative(root, file)} (${result.data.length} b64 chars, viewport ${size})`);
}
const clickButton = (prefix) => evaluate(`(()=>{const b=Array.from(document.querySelectorAll("button")).find(x=>x.textContent.trim().startsWith(${JSON.stringify(prefix)}));if(b){b.click();return "clicked"}return "missing"})()`);
async function clearDemoInputs() {
  const removed = await evaluate('(()=>{const ks=Object.keys(localStorage).filter(k=>k.startsWith("rr.personal-inputs.v3.demo"));for(const k of ks)localStorage.removeItem(k);return ks})()');
  await cdp("Page.navigate", { url: "about:blank" }); await pause(400);
  console.log(`[rr57-shot] cleared demo inputs: ${JSON.stringify(removed)}`);
}
const sprintText = () => evaluate('(()=>{const f=Array.from(document.querySelectorAll("fieldset")).find(x=>x.getAttribute("aria-label")==="这周期一定用卡");return f?f.innerText:"(fieldset missing)"})()');

try {
  // ① 收起态外壳（窗口透明边 8px；截图里外壳之外应当几乎全透明/无方框）
  for (const [form, theme] of [["bar", "dark"], ["bar", "light"], ["orb", "dark"]]) {
    await navigate(`#form=${form}&demo=healthy`, theme, 2200);
    const shell = await evaluate('(()=>{const m=document.querySelector("main");const el=m&&(m.firstElementChild);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,shadow:getComputedStyle(el).boxShadow,inner:(el.firstElementChild?getComputedStyle(el.firstElementChild).boxShadow:null)}})()');
    report.texts[`${form}-${theme}-shell`] = shell;
    console.log(`[rr57-shot] ${form}/${theme} shell: ${JSON.stringify(shell)}`);
    await screenshot(`${form}-${theme}`);
  }
  // ② 冲刺模式：先清空演示账号的个人输入，再登记一张 5 天后到期的卡（只写 demo 命名空间，结束时清掉）
  await navigate("#expanded&tab=planner&demo=healthy", "dark", 1500);
  await clearDemoInputs();
  await navigate("#expanded&tab=planner&demo=healthy", "dark", 2500);
  const expiry = new Date(Date.now() + 5 * 86400000); const ymd = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, "0")}-${String(expiry.getDate()).padStart(2, "0")}`;
  report.texts.addCard = await evaluate(`(()=>{const setVal=(el,v)=>{const d=Object.getOwnPropertyDescriptor(el.__proto__,"value")||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");d.set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    const label=document.getElementById("personal-card-label"),prec=document.getElementById("personal-card-precision"),exp=document.getElementById("personal-card-expiry");if(!label||!prec||!exp)return "form missing";
    setVal(label,"演示卡");setVal(prec,"date");return "filled"})()`);
  await pause(300);
  report.texts.addCard += " / " + await evaluate(`(()=>{const exp=document.getElementById("personal-card-expiry");const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value");d.set.call(exp,${JSON.stringify(ymd)});exp.dispatchEvent(new Event("input",{bubbles:true}));exp.dispatchEvent(new Event("change",{bubbles:true}));const b=Array.from(document.querySelectorAll("button")).find(x=>x.textContent.trim()==="加进来");if(!b)return "no add button";b.click();return "added "+exp.value})()`);
  await pause(900);
  report.texts.cardsAfterAdd = await evaluate('(()=>{const t=document.body.innerText;const i=t.indexOf("我的卡（到期时间）");return i<0?"(cards section missing)":t.slice(i,i+200)})()');
  console.log(`[rr57-shot] add demo card: ${report.texts.addCard} → ${JSON.stringify(report.texts.cardsAfterAdd)}`);
  await navigate("#expanded&tab=overview&demo=healthy", "dark", 2500);
  report.texts.sprintOff = await sprintText();
  console.log(`[rr57-shot] sprint(off): ${JSON.stringify(report.texts.sprintOff)}`);
  console.log(`[rr57-shot] click 一定用卡: ${await clickButton("一定用卡")}`);
  await pause(1200);
  report.texts.sprintOn24 = await sprintText();
  console.log(`[rr57-shot] sprint(on,24h): ${JSON.stringify(report.texts.sprintOn24)}`);
  report.texts.cardBox24 = await evaluate('(()=>{const t=document.body.innerText;const i=t.indexOf("重置卡（");return i<0?"(card box missing)":t.slice(i,i+260)})()');
  console.log(`[rr57-shot] card box: ${JSON.stringify(report.texts.cardBox24)}`);
  const overflow = await evaluate('(()=>{const m=document.querySelector("main");return m?m.scrollWidth>m.clientWidth:null})()');
  console.log(`[rr57-shot] overflow after sprint on: ${overflow}`);
  await evaluate('(()=>{const f=Array.from(document.querySelectorAll("fieldset")).find(x=>x.getAttribute("aria-label")==="这周期一定用卡");f?.scrollIntoView({block:"start"});return !!f})()');
  await pause(500);
  await screenshot("sprint-dark");
  console.log(`[rr57-shot] click 12 小时: ${await clickButton("12 小时")}`);
  await pause(1200);
  report.texts.sprintOn12 = await sprintText();
  console.log(`[rr57-shot] sprint(on,12h): ${JSON.stringify(report.texts.sprintOn12)}`);
  await evaluate('(()=>{const f=Array.from(document.querySelectorAll("fieldset")).find(x=>x.getAttribute("aria-label")==="这周期一定用卡");f?.scrollIntoView({block:"start"});return !!f})()');
  await pause(500);
  await screenshot("sprint-12h-dark");
  // 复原演示账号输入（hook 会在任何状态变化时回写，所以清完立刻离开页面，再回来核对）
  console.log(`[rr57-shot] click 按用量算: ${await clickButton("按用量算")}`);
  await pause(600);
  await clearDemoInputs();
  await navigate("#expanded&tab=overview&demo=healthy", "dark", 2000);
  report.texts.afterCleanup = await evaluate('(()=>{const t=document.body.innerText;const i=t.indexOf("重置卡（");return t.slice(i,i+80)})()');
  console.log(`[rr57-shot] after cleanup: ${JSON.stringify(report.texts.afterCleanup)}`);
  await cdp("Page.navigate", { url: "about:blank" }); await pause(400);
} catch (error) {
  report.errors.push(String(error?.stack ?? error));
  console.error(`[rr57-shot] error: ${error}`);
}
finish(report.errors.length ? 1 : 0);

function finish(code) {
  try { socket?.close(); } catch { /* ignore */ }
  spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  report.finishedAt = new Date().toISOString();
  writeFileSync(path.join(outDir, `${label}-shot-report.json`), JSON.stringify(report, null, 2));
  console.log(`[rr57-shot] report → release-qa/RR56-qa/${label}-shot-report.json (exit ${code})`);
  process.exit(code);
}
