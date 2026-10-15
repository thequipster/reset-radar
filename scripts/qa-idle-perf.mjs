// Headless-only visual QA. Uses an isolated demo browser profile; never attaches to the user's browser.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'release-qa','idle-perf',process.argv[2]??'after');mkdirSync(out,{recursive:true});
const profile=path.join(out,`headless-profile-${Date.now()}`);mkdirSync(profile);
const server=createServer((req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const file=path.resolve(root,'dist','.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(403);res.end();return}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff')?'font/woff':file.endsWith('.webp')?'image/webp':'text/html');res.end(readFileSync(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:'ignore',windowsHide:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;const report={checks:[],exceptions:[]};
try{
 let debugPort;for(let i=0;i<60;i++){if(existsSync(path.join(profile,'DevToolsActivePort'))){debugPort=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);break}await pause(300)}
 if(!debugPort)throw Error('Headless Edge did not start');
 const pages=await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();const page=pages.find(p=>p.type==='page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
 let id=0;const pending=new Map();socket.onmessage=({data})=>{const m=JSON.parse(String(data));if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.text);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}};
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method))},15000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id:n,method,params}))});
 const evaluate=async expression=>{const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 await cdp('Runtime.enable');
 await cdp('Page.enable');await cdp('Performance.enable');
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`window.__idle={workers:0,ended:0,mutations:0};const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.__idle.workers++}terminate(){window.__idle.ended++;super.terminate()}};addEventListener('DOMContentLoaded',()=>new MutationObserver(rs=>window.__idle.mutations+=rs.length).observe(document.getElementById('root'),{attributes:true,subtree:true,childList:true,characterData:true}));`});
 const version=await(await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();const bs=new WebSocket(version.webSocketDebuggerUrl);await new Promise((r,j)=>{bs.onopen=r;bs.onerror=j});let bid=0;const bp=new Map();bs.onmessage=({data})=>{const m=JSON.parse(String(data));if(m.id){const p=bp.get(m.id);bp.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}};const bcdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++bid;bp.set(id,{resolve,reject});bs.send(JSON.stringify({id,method,params}))});
 const metrics=async()=>Object.fromEntries((await cdp('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const cpu=async()=>(await bcdp('SystemInfo.getProcessInfo')).processInfo.map(p=>({id:p.id,type:p.type,cpu:p.cpuTime}));
 for(const mode of ['orb','bar']){
 await cdp('Emulation.setDeviceMetricsOverride',{width:mode==='orb'?72:460,height:76,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/?theme=light&perf=${mode}#form=${mode}&demo=healthy`});await pause(10000);await evaluate('document.fonts.ready.then(()=>true)');
 const start=await metrics(),c0=await cpu(),s0=await evaluate('({...window.__idle,animations:document.getAnimations().filter(a=>a.playState==="running").map(a=>({name:a.animationName,iterations:a.effect.getTiming().iterations}))})');const t0=performance.now();await pause(15000);
 const end=await metrics(),c1=await cpu(),s1=await evaluate('({...window.__idle,animations:document.getAnimations().filter(a=>a.playState==="running").length})'),seconds=(performance.now()-t0)/1000;
 const cpuDelta=c1.map(p=>({...p,delta:p.cpu-(c0.find(q=>q.id===p.id)?.cpu??p.cpu)}));
 report.checks.push({mode,seconds,initial:s0,final:s1,metricDelta:Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,end[k]-start[k]])),processCPU:cpuDelta,approxBrowserCores:cpuDelta.reduce((n,p)=>n+p.delta,0)/seconds});
 }
 bs.close();console.log(JSON.stringify(report,null,2));writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));try{await cdp('Browser.close')}catch{};if(report.exceptions.length)process.exitCode=1;
}catch(e){console.error(String(e.stack||e));process.exitCode=1}finally{try{socket?.close()}catch{};browser.kill();server.close();}
