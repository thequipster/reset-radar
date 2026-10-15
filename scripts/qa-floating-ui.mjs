// Headless-only visual QA. Uses an isolated demo browser profile; never attaches to the user's browser.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'release-qa','floating-ui');mkdirSync(out,{recursive:true});
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
 await cdp('Runtime.enable');await cdp('Page.enable');
 await cdp('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear()}catch{};window.__qaWorkers=0;const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.__qaWorkers++}};`});
 await cdp('Emulation.setDefaultBackgroundColorOverride',{color:{r:0,g:0,b:0,a:0}});
 for(const theme of ['dark','light'])for(const mode of ['orb','bar','peek']){
  const width=mode==='orb'?72:460,height=mode==='orb'?72:mode==='bar'?76:212;
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:2,mobile:false});
  const hash=mode==='orb'?'form=orb&demo=healthy':mode==='bar'?'form=bar&demo=healthy':'peek&form=bar&demo=healthy';
  await cdp('Page.navigate',{url:'about:blank'});
  await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/?theme=${theme}&qa=${mode}#${hash}`});await pause(1200);await evaluate('document.fonts.ready.then(()=>true)');
  const metrics=await evaluate(`(()=>{const elements=Array.from(document.querySelectorAll('[data-floating-surface]'));const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right}};return{surfaces:elements.map(e=>e.dataset.floatingSurface),bounds:elements.map(rect),overflow:elements.some(e=>{const r=e.getBoundingClientRect();return r.bottom>innerHeight+.5||r.right>innerWidth+.5}),fonts:Array.from(document.fonts).map(f=>({family:f.family,status:f.status})),progress:Array.from(document.querySelectorAll('[data-floating-surface="bar"] [aria-hidden="true"] i')).map(e=>getComputedStyle(e).width),value:document.querySelector('[data-orb-metric]')?.getAttribute('aria-label'),text:document.body.innerText,images:Array.from(document.images).map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0}))}})()`);
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`${mode}-${theme}.png`),Buffer.from(shot.data,'base64'));
  const expected=mode==='orb'?'orb':mode==='bar'?'bar':'peek';
  if(!metrics.surfaces.includes(expected)||metrics.overflow||metrics.images.some(i=>!i.loaded)||metrics.fonts.some(f=>f.status!=='loaded'))throw Error('Visual/font bounds failure '+mode+'/'+theme+' '+JSON.stringify(metrics));
  report.checks.push({mode,theme,width,height,...metrics});
  const appearance=await evaluate(`({workers:window.__qaWorkers,animations:document.getAnimations().filter(a=>a.playState==='running').length,light:Array.from(document.querySelectorAll('.rr-art-light')).every(i=>getComputedStyle(i).display==='block'),dark:Array.from(document.querySelectorAll('.rr-art-dark')).every(i=>getComputedStyle(i).display==='none')})`);
  report.checks.at(-1).appearance=appearance;
  if(theme==='light'&&(!appearance.light||!appearance.dark))throw Error('Wrong light artwork '+mode);
  if(mode==='orb'){
   if(appearance.workers!==0||appearance.animations!==0)throw Error('Collapsed quota orb started background work '+JSON.stringify(appearance));
   const before=await evaluate(`document.querySelector('[data-orb-metric]').dataset.orbMetric`);
   await evaluate(`document.querySelector('[data-orb-metric]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))`);await pause(100);
   const after=await evaluate(`document.querySelector('[data-orb-metric]').dataset.orbMetric`);if(before===after)throw Error('Orb metric cycling failed');
   await evaluate(`document.querySelector('[data-orb-metric]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await pause(100);
   if(!await evaluate(`!!document.querySelector('[data-floating-surface="bar"]')`))throw Error('Orb expansion failed');
  }else{
   await evaluate(mode==='bar'?`document.querySelector('[aria-label="展开完整面板"]').click()`:`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('看今天怎么用')).click()`);await pause(100);
   if(!await evaluate(`!!document.querySelector('[aria-label="reset-radar 展开面板"]')`))throw Error('Panel expansion failed '+mode);
  }
 }
 try{await cdp('Browser.close')}catch{};
 console.log(JSON.stringify(report,null,2));writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 if(report.exceptions.length)process.exitCode=1;
}catch(e){console.error(String(e.stack||e));process.exitCode=1}finally{try{socket?.close()}catch{};browser.kill();server.close();}
