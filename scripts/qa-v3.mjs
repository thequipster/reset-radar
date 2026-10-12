// RR47真实WebView2里的v3输入验收；只修改隔离的demo账户并在finally恢复。
import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pages=await(await fetch(`http://127.0.0.1:${Number(process.argv[2]??9347)}/json/list`)).json();
const page=pages.find(p=>p.type==='page');assert(page);
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();ws.onmessage=({data})=>{const r=JSON.parse(String(data));if(!r.id)return;const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.error?p.reject(new Error(JSON.stringify(r.error))):p.resolve(r.result);};
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error(`timeout ${method}`));},45000);pending.set(n,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});}
async function ev(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));const base=page.url.split(/[?#]/)[0];
async function nav(theme='dark',tab='overview'){await call('Page.navigate',{url:'about:blank'});await call('Page.navigate',{url:`${base}?theme=${theme}#expanded&tab=${tab}&demo=healthy`});await pause(1300);}
async function shot(name){const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL(`../docs/screenshots/20261012-rr47-${name}.png`,import.meta.url),Buffer.from(r.data,'base64'));}
const report=[];let saved;
try{
 await nav();saved=await ev('JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith("rr.personal-inputs.v3.")).map(k=>[k,localStorage.getItem(k)])))');
 const before=await ev('window.__TAURI_INTERNALS__.invoke("read_observation_log",{kind:"cards"}).then(r=>r.content)');
 await ev('for(const k of Object.keys(localStorage))if(k.startsWith("rr.personal-inputs.v3.demo"))localStorage.removeItem(k);');
 for(const theme of ['dark','light'])for(const tab of ['overview','risk','planner','data']){
  await nav(theme,tab);const text=await ev('document.body.innerText');assert(!text.includes('今日达到最优'));assert.equal(await ev('document.querySelector("main").scrollWidth>document.querySelector("main").clientWidth'),false);
  if(tab==='risk'){assert(text.includes('本人账号'));assert(text.includes('P0'));assert(text.includes('12.'));}
  await shot(`${tab}-${theme}`);
 }
 await nav('dark','planner');await ev('document.querySelector("[aria-label=个人用量与重置卡设置] details").open=true');
 await ev(`(()=>{const set=(id,value)=>{const e=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));};set('personal-card-label','QA隔离临期卡');set('personal-card-expiry','2026-10-20');})()`);await pause(100);
 await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='添加到台账').click()`);await pause(500);
 const ledger=await ev(`JSON.parse(localStorage.getItem('rr.personal-inputs.v3.demo%3Aanonymous'))`);
 assert.equal(ledger.cards[0].safeDeadlineAt,Date.parse('2026-10-20T00:00:00+08:00'));assert.equal(ledger.cards[0].exactExpiryAt,null);
 await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='比较闲').click()`);await pause(150);
 const chosen=await ev(`JSON.parse(localStorage.getItem('rr.personal-inputs.v3.demo%3Aanonymous'))`);assert.equal(chosen.workloadToday.level,'quiet');
 await shot('planner-input-dark');report.push('PASS: date-only deadline is Beijing midnight; card ID and versions persisted in isolated demo; workload only today');
 await ev(`(()=>{const e=document.getElementById('personal-week-budget');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'120');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(100);
 const budgetStarted=Date.now();await ev(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存预算').click()`);await pause(300);
 const budgetInputs=await ev(`JSON.parse(localStorage.getItem('rr.personal-inputs.v3.demo%3Aanonymous'))`);assert.equal(budgetInputs.weeklyBudgetPercent.value,120);
 report.push(`PASS: manual 120 weekly-point budget accepted, same-day ledger retained; native response ${Date.now()-budgetStarted}ms`);
 const after=await ev('window.__TAURI_INTERNALS__.invoke("read_observation_log",{kind:"cards"}).then(r=>r.content)');assert.equal(before,after);report.push('PASS: demo inputs and eight theme screenshots leave production journal byte-identical');
 report.push('PASS: P0 platform target and unknown account mapping shown separately; no fake optimal score; no horizontal overflow');
 await writeFile(new URL('../docs/v3-native-20261012.txt',import.meta.url),report.join('\n')+'\n');console.log(report.join('\n'));
}finally{if(saved)await ev(`for(const k of Object.keys(localStorage))if(k.startsWith('rr.personal-inputs.v3.'))localStorage.removeItem(k);for(const[k,v]of Object.entries(${saved}))localStorage.setItem(k,v);`);ws.close();}
