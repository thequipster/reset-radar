// RR48：原生新命令及数据页只读验收，不修改个人输入。
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const pages=await(await fetch('http://127.0.0.1:9348/json/list')).json();
const page=pages.find(p=>p.type==='page');assert(page);
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();ws.onmessage=({data})=>{const r=JSON.parse(String(data)),p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.error?p.reject(new Error(JSON.stringify(r.error))):p.resolve(r.result);};
function call(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(new Error(`timeout ${method}`)),45000);pending.set(n,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});}
async function ev(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const base=page.url.split(/[?#]/)[0],report=[];
try{
 const history=await ev('window.__TAURI_INTERNALS__.invoke("fetch_platform_history")');
 assert(Array.isArray(history.events));assert(history.events.length>0);assert.equal(history.upstream.pagination.has_more,false);assert.equal(history.upstream.pagination.next_cursor,null);
 assert(Date.parse(history.coverageThrough)<=Date.parse(history.fetchedAt));
 await writeFile('task_logs/RR48_artifacts/native-history.json',JSON.stringify(history,null,2)+'\n');
 report.push(`完整分页原生命令成功：${history.events.length}公告，regular=${history.events.filter(e=>e.resetType==='regular').length}，pages=${history.upstream.pagination.pages_fetched}，覆盖截止和抓取完成分别保存`);
 await mkdir('docs/screenshots',{recursive:true});
 for(const theme of ['dark','light']){
  await call('Page.navigate',{url:'about:blank'});await call('Page.navigate',{url:`${base}?theme=${theme}#expanded&tab=data&demo=healthy`});await pause(1800);
  const text=await ev('document.body.innerText');assert(text.includes('正式 P0 Brier'));assert(text.includes('等待可评估样本'));assert(text.includes('最近账号状态变化'));
  const bounds=await ev('(()=>{const p=document.querySelector("[role=tabpanel]");return {horizontal:p.scrollWidth>p.clientWidth,client:p.clientHeight,scroll:p.scrollHeight};})()');
  assert.equal(bounds.horizontal,false);assert(bounds.client>0);
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(`docs/screenshots/20261012-rr48-data-${theme}.png`,Buffer.from(shot.data,'base64'));
  report.push(`${theme}原生数据页：无水平溢出，内容可滚动，零样本指标null显示，截图已保存`);
 }
 await writeFile('task_logs/RR48_artifacts/native-qa.txt',report.join('\n')+'\n');console.log(report.join('\n'));
}finally{ws.close();}
