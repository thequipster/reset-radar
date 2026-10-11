// 只读CDP探针，沿RR14落盘验收机制；不调用写盘命令，不改变页面。
const port = process.argv[2];
let page;
for (let i=0;i<40;i++) {
  try { const pages=await (await fetch(`http://127.0.0.1:${port}/json`)).json(); page=pages.find(p=>p.type==="page"&&p.webSocketDebuggerUrl); if(page) break; } catch {}
  await new Promise(r=>setTimeout(r,250));
}
if (!page) throw new Error("No owned WebView CDP page");
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.addEventListener("open",resolve,{once:true});ws.addEventListener("error",reject,{once:true});});
let id=0; const pending=new Map();
ws.addEventListener("message",e=>{const v=JSON.parse(e.data);if(pending.has(v.id)){pending.get(v.id)(v);pending.delete(v.id);}});
async function evaluate(expression) {
 const callId=++id;
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(callId);reject(new Error("CDP response timed out"));},3000);pending.set(callId,v=>{clearTimeout(timer);resolve(v);});ws.send(JSON.stringify({id:callId,method:"Runtime.evaluate",params:{expression,returnByValue:true}}));});
 return result.result?.result?.value;
}
try {
 let state;
 for(let i=0;i<60;i++) {
  state=await evaluate(`({url:location.href,tauri:!!window.__TAURI_INTERNALS__,logState:document.querySelector('main')?.dataset.predictionLogState,text:document.querySelector('main')?.innerText.slice(0,100)})`);
  if(state?.logState==="ok" || state?.logState==="error")break;
  await new Promise(r=>setTimeout(r,250));
 }
 console.log(JSON.stringify(state,null,2));
 if(!state?.tauri || state.logState!=="ok")process.exitCode=1;
} finally {ws.close();}
