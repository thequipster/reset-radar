import {useEffect,useState} from 'react';
import type {PlanningInput,PlanningOutput} from '../lib/v3/planning';
export function useV3Planning(input:PlanningInput|null){
 const [state,setState]=useState<{input:PlanningInput|null;result:PlanningOutput|null;error:string|null}>({input:null,result:null,error:null});
 useEffect(()=>{
  if(!input)return;
  const worker=new Worker(new URL('./v3Planning.worker.ts',import.meta.url),{type:'module'});
  let active=true;
  const finish=(result:PlanningOutput|null,error:string|null)=>{
   if(!active)return;
   active=false;worker.terminate(); // 结果已拷回主线程，立即释放worker堆，不等下一分钟刷新。
   setState({input,result,error});
  };
  worker.onmessage=(event:MessageEvent<{result?:PlanningOutput;error?:string}>)=>finish(event.data.result??null,event.data.error??null);
  worker.onerror=event=>finish(null,event.message);
  worker.postMessage(input);
  return()=>{active=false;worker.terminate();}; // 新快照/偏好立即取消旧任务，不让过时建议覆盖新输入。
 },[input]);
 return{result:state.input===input?state.result:null,error:state.input===input?state.error:null,pending:input!=null&&state.input!==input};
}
