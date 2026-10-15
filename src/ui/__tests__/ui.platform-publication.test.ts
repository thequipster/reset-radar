import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {isDailyPublishBucket} from '../modelClock';

// 运行App实际发布effect，隔离React壳与磁盘写入；防止只测试一个未接线的辅助函数。
const path=new URL('../../App.tsx',import.meta.url);
const source=ts.createSourceFile(path.pathname,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let publicationEffect:ts.Expression|undefined;
function visit(node:ts.Node){
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('journal.appendPrediction'))publicationEffect=node.arguments[0];
  ts.forEachChild(node,visit);
}
visit(source);
if(!publicationEffect)throw new Error('App platform publication effect not found');
const executable=ts.transpileModule(`const publicationEffect=${publicationEffect.getText(source)}; publicationEffect;`,
  {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
type Published={target:string;modelVersion:string;probability:number|null;issuedAt:number};
type Gate={current:{key:string;at:number;dailyDate:string|null}};
const freshGate=():Gate=>({current:{key:'',at:0,dailyDate:null}});
async function publish(status:string,options:{live?:boolean;demo?:boolean;shadow?:'valid'|'missing'|'unavailable'|'invalid'|'write-error';gate?:Gate;now?:number}={}){
  const predictions:Published[]=[],planning:unknown[]=[],mappings:unknown[]=[],errors:unknown[]=[];
  const weekdayPairs:Published[][]=[],faults:unknown[]=[];
  const forecast={probability24h:.2,factors:[],shadow:{probability24h:.3},shadowFactors:[]};
  const now=options.now??Date.parse('2026-10-13T09:00:00+08:00');
  const shadow=options.shadow==='missing'?null:{
    model:{version:'platform-v3.2:D60-W28-BJT-shadow',timezone:'Asia/Shanghai',shrinkagePerWeekdayDays:28,
      counts:Array(7).fill(0),exposures:Array(7).fill(1),multipliers:Array(7).fill(1),rates:Array(7).fill(.4),base:{ratePerDay:.4}},
    forecast:options.shadow==='unavailable'?null:{probability:options.shadow==='invalid'?Number.NaN:.35,integratedHazard:.43,segments:[]},
    differencePoints:15,status:options.shadow==='unavailable'?'unavailable':'shadow',reason:'固定D60上的星期候选',
  };
  // RR56：effect 内多了小时级节流（journalGateRef + isDailyPublishBucket），测试按真实接线提供同名依赖。
  const context={live:options.live??true,demo:options.demo??false,DAY_MS:86400000,setJournalWriteError:(value:unknown)=>errors.push(value),
    WEEKDAY_VERSION:'platform-v3.2:D60-W28-BJT-shadow',journalGateRef:options.gate??freshGate(),isDailyPublishBucket,
    codex:{status,accountKey:'test-account',updatedAt:new Date(now).toISOString(),rateLimitSnapshot:null},
    vm:{now,accountKey:'test-account',mapping:[],platform:forecast,platformLongTerm:forecast,platformModel:{cutoff:now},platformReference:{decay:{probability24h:.4}},weekdayShadow:shadow,r90Probability:.5,
      recommendation:{assumptions:[],action:'keep_card',cardId:null},remainingPercent:42,coldContext:{selectedTier:'normal'},evidenceQuality:['complete platform history'],ledgerVersion:'test',preferenceVersion:'test',
      planning:{seed:123,comparisons:[],selected:null},supply:{accountProbability24h:null},demand:null},
    journal:{historyDocument:{fetchedAt:'2026-10-13T08:00:00.000+08:00'},appendPrediction:async(row:Published)=>{predictions.push(row);},
      appendWeekdayPair:async(d60:Published,weekday:Published)=>{
        weekdayPairs.push([d60,weekday]);
        if(options.shadow==='write-error')throw new Error('shadow append failed');
        predictions.push(d60,weekday);
        return {error:null};
      },
      stopWeekdayShadow:async(error:unknown,at:number)=>{faults.push({error,at});},
      appendPlanning:async(row:unknown)=>{planning.push(row);},appendAccountMapping:async(...rows:unknown[])=>{mappings.push(rows);}}};
  const effect=runInNewContext(executable,context) as ()=>unknown;
  effect();await new Promise<void>(resolve=>setImmediate(resolve));
  return {predictions,planning,mappings,weekdayPairs,faults,errors};
}
const platformVersions=['platform-v3:P0','platform-v3.1:D60','platform-v3.2:D60-W28-BJT-shadow','platform-v3.1:R90-shadow','platform-v3:P1-shadow'];
describe('平台发布独立于账号读取',()=>{
  it.each(['error','stale'])('账号%s仍发布五个平台目标，保留概率与09:00发布时刻',async status=>{
    const actual=await publish(status),healthy=await publish('ok');
    expect(actual.predictions.map(row=>row.modelVersion)).toEqual(platformVersions);
    expect(actual.predictions).toEqual(healthy.predictions.filter(row=>row.target==='platform_notice'));
    expect(actual.errors.filter(error=>error!=null)).toEqual([]);
    expect(actual.weekdayPairs).toHaveLength(1);
    expect(actual.weekdayPairs[0].map(row=>row.modelVersion)).toEqual(['platform-v3.1:D60','platform-v3.2:D60-W28-BJT-shadow']);
    expect(actual.weekdayPairs[0][0].issuedAt).toBe(actual.weekdayPairs[0][1].issuedAt);
    expect(actual.planning).toEqual([]);expect(actual.mappings).toEqual([]);
  });
  it('账号成功时保留账号/需求目标以及规划与观测链路',async()=>{
    const actual=await publish('ok');
    expect(actual.predictions.map(row=>row.target)).toEqual(['platform_notice','platform_notice','platform_notice','platform_notice','platform_notice','account_external_reset','demand']);
    expect(actual.planning).toHaveLength(1);expect(actual.mappings).toHaveLength(1);
  });
  it.each(['missing','unavailable','invalid'] as const)('星期影子%s时不写入候选且保留四个旧平台目标',async shadow=>{
    const actual=await publish('ok',{shadow});
    expect(actual.predictions.filter(row=>row.target==='platform_notice').map(row=>row.modelVersion)).toEqual(['platform-v3:P0','platform-v3.1:D60','platform-v3.1:R90-shadow','platform-v3:P1-shadow']);
    expect(actual.weekdayPairs).toEqual([]);
    expect(actual.errors.filter(error=>error!=null).length).toBe(shadow==='invalid'?1:0);
    expect(actual.faults.length).toBe(shadow==='invalid'?1:0);
    expect(actual.planning).toHaveLength(1);expect(actual.mappings).toHaveLength(1);
  });
  it('星期候选写入失败时保留D60、其他平台与个人链路',async()=>{
    const actual=await publish('ok',{shadow:'write-error'});
    expect(actual.predictions.map(row=>row.modelVersion)).toEqual(['platform-v3:P0','platform-v3.1:D60','platform-v3.1:R90-shadow','platform-v3:P1-shadow','account-v3:learning','demand-v3:empirical']);
    expect(actual.weekdayPairs).toHaveLength(1);expect(actual.faults).toHaveLength(1);
    expect(actual.errors.filter(error=>error!=null)).toHaveLength(1);
    expect(actual.planning).toHaveLength(1);expect(actual.mappings).toHaveLength(1);
  });
  it('演示或非本机运行不向生产日志写入任何目标',async()=>{
    for(const options of [{demo:true},{live:false}])expect((await publish('ok',options)).predictions).toEqual([]);
  });
  it('RR56 节流：同一实质输入一小时内只发布一次；满一小时或输入变化再发布',async()=>{
    const gate=freshGate();const t0=Date.parse('2026-10-13T10:00:00+08:00');
    const first=await publish('ok',{gate,now:t0});expect(first.predictions).toHaveLength(7);
    const again=await publish('ok',{gate,now:t0+20*60_000});expect(again.predictions).toEqual([]);expect(again.planning).toEqual([]);
    const later=await publish('ok',{gate,now:t0+60*60_000});expect(later.predictions).toHaveLength(7);
    const changed=await publish('stale',{gate,now:t0+61*60_000});expect(changed.predictions).toHaveLength(5);
  });
  it('RR56 节流：北京 09:00 主槽不受一小时限制，每天只补一次',async()=>{
    const gate=freshGate();const nine=Date.parse('2026-10-13T09:00:00+08:00');
    const before=await publish('ok',{gate,now:nine-10*60_000});expect(before.predictions).toHaveLength(7);
    const daily=await publish('ok',{gate,now:nine});expect(daily.predictions).toHaveLength(7);expect(daily.predictions[0].issuedAt).toBe(nine);
    const dup=await publish('ok',{gate,now:nine+5*60_000});expect(dup.predictions).toEqual([]);
  });
});
