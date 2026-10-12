// RR46 原生 WebView2 发布验收；只连显式指定的本机调试端口。
// 启动 exe 时需 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9346。
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const port = Number(process.argv[2] ?? 9346);
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((item) => item.type === 'page');
assert(page, 'WebView2 page missing');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let next = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const response = JSON.parse(String(data));
  if (!response.id) return;
  const promise = pending.get(response.id);
  if (!promise) return;
  pending.delete(response.id);
  if (response.error) promise.reject(new Error(JSON.stringify(response.error)));
  else promise.resolve(response.result);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const base = page.url.split(/[?#]/)[0];
const output = new URL('../docs/screenshots/', import.meta.url);
await mkdir(output, { recursive: true });
async function navigate(hash = '', theme = 'dark') {
  await call('Page.navigate', { url: 'about:blank' });
  await call('Page.navigate', { url: `${base}?theme=${theme}${hash}` });
  await pause(1400);
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(new URL(`20261012-rr46-${name}.png`, output), Buffer.from(result.data, 'base64'));
}
const report = [];
try {
  // 验收期偏好仅临时覆盖，最后恢复；不触历史/真实额度数值。
  await navigate();
  const saved = await evaluate('JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith("rr.shell.")||k==="reset-radar.theme").map(k=>[k,localStorage.getItem(k)])))');
  try {
    await evaluate('localStorage.setItem("rr.shell.form","orb");localStorage.setItem("rr.shell.dockEdge","");');
    await navigate();
    assert.equal(await evaluate('document.querySelector("main").dataset.shellForm'), 'orb');
    await evaluate('document.querySelector("[data-orb-metric]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
    await pause(500);
    assert.equal(await evaluate('document.querySelector("main").dataset.shellForm'), 'bar');
    assert.equal(await evaluate('document.querySelectorAll("[role=tabpanel]").length'), 0);
    await evaluate(`document.querySelector('[aria-label="展开完整面板"]').click()`);
    await pause(500);
    assert.equal(await evaluate('document.querySelectorAll("[role=tabpanel]").length'), 1);
    report.push('PASS: orb → bar → expanded; native shell resized');
    for (const ending of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      await evaluate('localStorage.setItem("rr.shell.dockEdge","");localStorage.setItem("rr.shell.form","orb");localStorage.setItem("rr.shell.x","200");localStorage.setItem("rr.shell.y","200");');
      await navigate();
      await evaluate(`(() => {
        const orb=document.querySelector('[data-orb-metric]');
        orb.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:7,button:0,screenX:236,screenY:236}));
        orb.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:7,buttons:1,screenX:46,screenY:236}));
        ${ending === 'pointerup' ? 'window' : 'orb'}.dispatchEvent(new PointerEvent('${ending}',{bubbles:true,pointerId:7,button:0,screenX:46,screenY:236}));
      })()`);
      await pause(800);
      assert.equal(await evaluate('document.querySelector("main").dataset.shellDock'), 'left', `release via ${ending} docks immediately`);
      assert.equal(await evaluate('document.querySelector("main").dataset.shellForm'), 'orb');
      report.push(`PASS: native geometry + DOM ${ending} fallback docks on release, no follow-up click`);
    }

    // 四方向：贴边几何真由运行中的 App 消费，展开后完整落在原生工作区。
    for (const edge of ['left', 'right', 'top', 'bottom']) {
      await evaluate(`localStorage.setItem("rr.shell.dockEdge",${JSON.stringify(edge)});localStorage.setItem("rr.shell.form","orb");`);
      await navigate();
      const docked = await evaluate('window.__TAURI_INTERNALS__.invoke("shell_geometry")');
      const center = ['left', 'right'].includes(edge) ? docked.x + docked.width / 2 : docked.y + docked.height / 2;
      const expected = edge === 'left' ? docked.monitor.x : edge === 'right' ? docked.monitor.x + docked.monitor.width : edge === 'top' ? docked.monitor.y : docked.monitor.y + docked.monitor.height;
      assert(Math.abs(center - expected) <= 1, `${edge} circle center must be on work area edge`);
      assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-orb-metric]").parentElement).transform'), 'none');
      await evaluate('document.querySelector("[data-orb-metric]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))');
      await pause(500);
      await evaluate(`document.querySelector('[aria-label="展开完整面板"]').click()`);
      await pause(500);
      const expanded = await evaluate('window.__TAURI_INTERNALS__.invoke("shell_geometry")');
      assert(expanded.x >= expanded.monitor.x - 1 && expanded.y >= expanded.monitor.y - 1);
      assert(expanded.x + expanded.width <= expanded.monitor.x + expanded.monitor.width + 1);
      assert(expanded.y + expanded.height <= expanded.monitor.y + expanded.monitor.height + 1);
      report.push(`PASS: ${edge} dock center=${center}; expanded inside work area ${expanded.width}×${expanded.height}`);
    }
    await evaluate('localStorage.setItem("rr.shell.dockEdge","")');
    const productionLog = await evaluate('window.__TAURI_INTERNALS__.invoke("read_prediction_log").then(r=>r.content)');
    for (const theme of ['dark', 'light']) {
      for (const tab of ['overview', 'risk', 'planner', 'data']) {
        await navigate(`#expanded&tab=${tab}&demo=healthy`, theme);
        const overflow = await evaluate('document.querySelector("main").scrollWidth>document.querySelector("main").clientWidth');
        assert.equal(overflow, false);
        await screenshot(`${tab}-${theme}`);
      }
      await navigate('#form=bar&demo=healthy', theme);
      await screenshot(`bar-${theme}`);
    }
    assert.equal(await evaluate('window.__TAURI_INTERNALS__.invoke("read_prediction_log").then(r=>r.content)'), productionLog, 'demo must never append production predictions');
    report.push('PASS: demo navigation leaves production prediction log byte-identical');
    await navigate('#expanded');
    const real = await evaluate('({text:document.body.innerText,themeButtons:document.querySelectorAll("[aria-label=主题] button").length,geometry:null})');
    assert.equal(real.themeButtons, 2);
    report.push('PASS: four pages × two themes captured; two explicit theme buttons');
  } finally {
    await evaluate(`for(const k of Object.keys(localStorage))if(k.startsWith("rr.shell.")||k==="reset-radar.theme")localStorage.removeItem(k);for(const [k,v] of Object.entries(JSON.parse(${JSON.stringify(saved)})))localStorage.setItem(k,v);`);
  }
  await writeFile(new URL('../docs/qa-native-20261012.txt', import.meta.url), report.join('\n') + '\n');
  console.log(report.join('\n'));
} finally { socket.close(); }
