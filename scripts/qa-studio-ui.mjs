// Headless-only visual QA. Uses an isolated demo browser profile; never attaches to the user's browser.
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'release-qa','studio-ui');mkdirSync(out,{recursive:true});
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
 for(const width of [1080,460,360])for(const theme of ['dark','light']){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:`http://127.0.0.1:${port}/?theme=${theme}#expanded&demo=healthy&tab=overview`});await pause(1600);
  await evaluate('document.fonts.ready.then(()=>true)');const metrics=await evaluate(`(()=>{const root=document.querySelector('[aria-label="reset-radar 展开面板"]');const nav=document.querySelector('[aria-label="面板模块"]');const strip=document.querySelector('[aria-label="未来七天"]');return{width:innerWidth,rendered:!!root,rootOverflow:document.documentElement.scrollWidth>innerWidth,rootWidth:root?.getBoundingClientRect().width,navTabs:nav?.querySelectorAll('[role="tab"]').length,calendarDays:strip?.children.length,calendarNoSplit:strip?Array.from(strip.querySelectorAll('[title][aria-label]')).every(e=>getComputedStyle(e).whiteSpace==='nowrap'):false,heading:document.querySelector('h1')?.textContent,bodyText:document.body.innerText.slice(0,170)}})()`);
  const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`studio-${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
  const themeControl=await evaluate(`(()=>{const b=document.querySelector('header [aria-label="主题"] button[aria-pressed="true"]');return b?{color:getComputedStyle(b).color,background:getComputedStyle(b).backgroundColor}:null})()`);
  if(!themeControl||themeControl.background==='rgba(0, 0, 0, 0)')throw Error('Selected theme is invisible');
  report.checks.push({theme,...metrics,themeControl});
  const enabled=await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('先选用卡窗口，再安排用量'));if(!b)return false;b.click();return true})()`);await pause(150);if(enabled){const ok=await evaluate(`document.querySelector('[aria-label="这周期一定用卡"] button[aria-pressed="true"]')?.textContent.includes('一定用卡')`);if(!ok)throw Error('Risk-first hero action did not enable planning');}
  for(const tab of ['planner','risk','data']){await evaluate(`document.getElementById('v3-tab-${tab}').click()`);await pause(100);const ok=await evaluate(`!!document.getElementById('v3-${tab}')`);if(!ok)throw Error('Missing tab '+tab)}
 }
 try{await cdp('Browser.close')}catch{};
 console.log(JSON.stringify(report,null,2));writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 if(report.exceptions.length||report.checks.some(c=>!c.rendered||c.rootOverflow||c.navTabs!==4||c.calendarDays!==7||!c.calendarNoSplit))process.exitCode=1;
}catch(e){console.error(String(e.stack||e));process.exitCode=1}finally{try{socket?.close()}catch{};browser.kill();server.close();}
