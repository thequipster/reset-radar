import {writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const port=Number(process.argv[2]),out=process.argv[3];
mkdirSync(out,{recursive:true});
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),page=pages.find(p=>p.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
function cdp(method,params={}){const n=++id;return new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression,awaitPromise=true){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
await cdp('Page.enable');
for(const theme of ['dark','light']){
 await cdp('Page.navigate',{url:`http://tauri.localhost/?theme=${theme}#expanded&tab=data`});
 await new Promise(r=>setTimeout(r,8000));
 const dom=await evaluate(`(()=>{const section=document.querySelector('[aria-label="星期影子模型验证"]');if(!section)throw Error('missing weekday section');for(const d of section.querySelectorAll('details'))d.open=true;section.scrollIntoView({block:'center'});return {tauri:!!window.__TAURI_INTERNALS__,text:section.innerText,bodyText:document.body.innerText.slice(0,1000),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},errors:document.querySelector('main').dataset.predictionLogState};})()`);
 const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 writeFileSync(`${out}/20261013-v32-${theme}.png`,Buffer.from(shot.data,'base64'));
 console.log(JSON.stringify({theme,...dom}));assert(dom.text.includes('星期影子'));assert(dom.text.includes('用卡'));assert.equal(dom.errors,'v3');
}
const log=await evaluate(`window.__TAURI_INTERNALS__.invoke('read_observation_log',{kind:'cards'})`);
const rows=log.content.split(/\r?\n/).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
const shadow=rows.filter(r=>r.kind==='prediction'&&r.record.modelVersion==='platform-v3.2:D60-W28-BJT-shadow');
const registry=rows.filter(r=>r.kind==='weekday_experiment');
const versions=[...new Set(rows.filter(r=>r.kind==='prediction'&&r.record.target==='platform_notice').map(r=>r.record.modelVersion))];
assert(shadow.length>0);assert.equal(registry.length,1);assert.equal(versions.length,5);
for(const w of shadow){const d=rows.find(r=>r.kind==='prediction'&&r.record.modelVersion==='platform-v3.1:D60'&&r.record.issuedAt===w.record.issuedAt&&r.record.platformHistorySnapshotId===w.record.platformHistorySnapshotId);assert(d);assert.equal(d.group,w.group);assert.equal(d.record.windowEnd,w.record.windowEnd);assert.equal(d.record.trainingCutoff,w.record.trainingCutoff);assert(w.record.featureContributions[0].counts.length===7);assert.equal(w.record.featureContributions[0].timezone,'Asia/Shanghai');assert.equal(w.record.featureContributions[0].shrinkagePerWeekdayDays,28);assert.equal(w.group,'temporary');}
console.log(JSON.stringify({phase:'journal',path:log.path,platformVersions:versions,registry:registry[0],shadowRows:shadow.length,shadowSample:shadow[0],faults:rows.filter(r=>r.kind==='weekday_fault'),bytes:log.content.length}));
console.log('PASS: native publication and persistence; both themes; no fabricated 09:00 primary');ws.close();
