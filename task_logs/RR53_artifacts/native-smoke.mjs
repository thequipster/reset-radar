import {stressInput} from './input.mjs';
import {writeFileSync,appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const port=Number(process.argv[2]),rootPid=Number(process.argv[3]),worker=process.argv[4],rounds=8;
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page=pages.find(p=>p.type==='page');if(!page)throw Error('no page');
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
function cdp(method,params={}){const n=++id;return new Promise((resolve,reject)=>{pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await cdp('Runtime.evaluate',{expression,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const before=await evaluate('({url:location.href,title:document.title,text:document.body.innerText.slice(0,300),tauri:!!window.__TAURI_INTERNALS__})');
console.log(JSON.stringify({phase:'start',rootPid,worker,...before}));
const expression=`(()=>{const input=${JSON.stringify(stressInput)};window.rr53Smoke={ticks:0,round:0,runs:[],errors:[]};const s=window.rr53Smoke;const clock=setInterval(()=>s.ticks++,100);function run(){s.round++;const start=performance.now();const w=new Worker(new URL(${JSON.stringify(worker)},location.href),{type:'module'});w.onmessage=e=>{w.terminate();if(e.data.error)s.errors.push(e.data.error);else s.runs.push({round:s.round,ms:Math.round(performance.now()-start),metrics:e.data.result.comparisons[0].scenarios.length,horizons:e.data.result.horizons.map(h=>h.days)});if(s.round<${rounds})setTimeout(run,Math.max(0,60000-(performance.now()-start)));else{clearInterval(clock);s.done=true;}};w.onerror=e=>{w.terminate();s.errors.push(e.message);s.done=true;clearInterval(clock);};w.postMessage({...input,inputSnapshotId:'webview-refresh-'+s.round});}run();return 'started';})()`;
await evaluate(expression);
const memoryCommand=`$all=Get-CimInstance Win32_Process; $ids=[System.Collections.Generic.HashSet[int]]::new(); [void]$ids.Add(${rootPid}); do { $added=$false; foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)-and -not $ids.Contains([int]$p.ProcessId)){[void]$ids.Add([int]$p.ProcessId);$added=$true}} } while($added); @($all | Where-Object {$ids.Contains([int]$_.ProcessId)} | ForEach-Object { $m=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; @{pid=$_.ProcessId;name=$_.Name;renderer=($_.CommandLine -match '--type=renderer');rss=$m.WorkingSet64;private=$m.PrivateMemorySize64} }) | ConvertTo-Json -Compress`;
const start=Date.now();
while(Date.now()-start<600000){
 await new Promise(r=>setTimeout(r,15000));
 const state=await evaluate('window.rr53Smoke');
 const usage=spawnSync('pwsh',['-NoProfile','-Command',memoryCommand],{encoding:'utf8',timeout:15000});
 const heap=await cdp('Runtime.getHeapUsage');
 console.log(JSON.stringify({elapsedMs:Date.now()-start,state,heap,processes:JSON.parse(usage.stdout)}));
 if(state.done){if(state.errors.length||state.runs.length!==rounds||state.runs.some(r=>r.metrics!==1728))throw Error('smoke failed');console.log('PASS: 8 minute-spaced worker refreshes; renderer responsive');ws.close();process.exit(0);}
}
throw Error('smoke timed out');
