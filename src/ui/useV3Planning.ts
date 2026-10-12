import {useEffect,useState} from 'react';
import type {PlanningInput,PlanningOutput} from '../lib/v3/planning';
export function useV3Planning(input:PlanningInput|null){
 const [state,setState]=useState<{input:PlanningInput|null;result:PlanningOutput|null;error:string|null}>({input:null,result:null,error:null});
 useEffect(()=>{
  if(!input)return;
  const worker=new Worker(new URL('./v3Planning.worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=(event:MessageEvent<{result?:PlanningOutput;error?:string}>)=>setState({input,result:event.data.result??null,error:event.data.error??null});
  worker.onerror=event=>setState({input,result:null,error:event.message});
  worker.postMessage(input);
  return()=>worker.terminate(); // 新快照/偏好立即取消旧任务，不让过时建议覆盖新输入。
 },[input]);
 return{result:state.input===input?state.result:null,error:state.input===input?state.error:null,pending:input!=null&&state.input!==input};
}
