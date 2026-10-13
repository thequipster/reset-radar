import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import type {PlanningInput} from '../../lib/v3/planning';
const react=vi.hoisted(()=>({effect:null as null|(()=>void|(()=>void)),setState:vi.fn()}));
vi.mock('react',()=>({useEffect:(effect:()=>void|(()=>void))=>{react.effect=effect;},useState:()=>[{input:null,result:null,error:null},react.setState]}));
import {useV3Planning} from '../useV3Planning';
class TestWorker{
 static last:TestWorker;
 onmessage:((event:MessageEvent)=>void)|null=null;
 onerror:((event:ErrorEvent)=>void)|null=null;
 terminate=vi.fn();postMessage=vi.fn();
 constructor(){TestWorker.last=this;}
}
beforeEach(()=>{react.setState.mockClear();vi.stubGlobal('Worker',TestWorker);});
afterEach(()=>vi.unstubAllGlobals());
const input={inputSnapshotId:'worker-test'} as PlanningInput;
function start(){useV3Planning(input);const cleanup=react.effect!();return {worker:TestWorker.last,cleanup};}
it('releases the worker immediately when its result is copied back',()=>{
 const {worker}=start();expect(worker.postMessage).toHaveBeenCalledWith(input);
 const result={modelVersion:'test'};
 worker.onmessage!({data:{result}} as MessageEvent);
 expect(worker.terminate).toHaveBeenCalledOnce();
 expect(react.setState).toHaveBeenCalledWith({input,result,error:null});
 worker.onerror!({message:'late'} as ErrorEvent);
 expect(react.setState).toHaveBeenCalledOnce();
});
it.each(['message','error'])('releases the worker on %s failure',kind=>{
 const {worker}=start();
 if(kind==='message')worker.onmessage!({data:{error:'failed'}} as MessageEvent);
 else worker.onerror!({message:'failed'} as ErrorEvent);
 expect(worker.terminate).toHaveBeenCalledOnce();
 expect(react.setState).toHaveBeenCalledWith({input,result:null,error:'failed'});
});
it('cancellation rejects late results from the previous snapshot',()=>{
 const {worker,cleanup}=start();if(typeof cleanup==='function')cleanup();
 worker.onmessage!({data:{result:{}}} as MessageEvent);
 expect(worker.terminate).toHaveBeenCalledOnce();expect(react.setState).not.toHaveBeenCalled();
});
