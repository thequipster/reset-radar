// 仅将同一纯算法移到worker，防256共享路径计算阻塞输入；不改变参数或模型。
import {planActions,type PlanningInput} from '../lib/v3/planning';
self.onmessage=(event:MessageEvent<PlanningInput>)=>{try{self.postMessage({result:planActions(event.data)});}catch(error){self.postMessage({error:String(error)});}};
