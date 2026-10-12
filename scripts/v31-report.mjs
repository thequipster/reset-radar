// 本地可复现四模型回放与追加verdict后的数字汇总；生成模块仅在OS临时目录。
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const temp=await mkdtemp(join(tmpdir(),'rr-v31-')),modules=new Map();
async function pure(file){file=resolve(file);if(modules.has(file))return modules.get(file);
 const out=join(temp,`module-${modules.size}.mjs`);modules.set(file,out);
 let code=ts.transpileModule(await readFile(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const matches=[...code.matchAll(/from\s+['"]([^'"]+)['"]/g)];
 for(const m of matches)if(m[1].startsWith('.')){const dep=await pure(resolve(dirname(file),`${m[1]}.ts`));code=code.replace(m[0],`from ${JSON.stringify(pathToFileURL(dep).href)}`);}
 await writeFile(out,code);return out;
}
const trend=await import(pathToFileURL(await pure(join(root,'src/lib/v3/trend.ts'))).href);
const runtime=await import(pathToFileURL(await pure(join(root,'src/lib/v3/runtime.ts'))).href);
const verdict=await import(pathToFileURL(await pure(join(root,'src/lib/v3/verdict.ts'))).href);
const fixture=JSON.parse(await readFile(join(root,'data/resets-history.json'),'utf8'));
let content='';try{content=await readFile(process.argv[2]??join(process.env.APPDATA??'', 'app.resetradar.desktop','card-decisions.jsonl'),'utf8');}catch{/* 仓库历史仍可回放；没有日志不宣称在线分数。 */}
const history=runtime.latestArchivedHistory(content,fixture),to=Date.parse(history.coverageThrough??history.fetchedAt);
const times=history.events.filter(e=>e.resetType==='regular').map(e=>typeof e.announcedAt==='number'?e.announcedAt:Date.parse(e.announcedAt));
const complete=runtime.completeHistoryDocument(history);
const input={events:history.events,coverage:complete&&times.length?[{from:Math.min(...times),to,complete:true}]:[],trainingCutoff:Date.parse(history.fetchedAt),to};
const decay=trend.fitTrendModel(input),replay=trend.replayTrend(input),reference=trend.selectTrendReference(decay,replay);
const delayed6=trend.replayTrend({...input,availabilityDelayHours:6}),delayed24=trend.replayTrend({...input,availabilityDelayHours:24});
const rows=verdict.settlePlatformPredictions(content,history,Date.now());
const summary=verdict.summarizeVerdicts(content+(content.endsWith('\n')?'':'\n')+rows.map(r=>JSON.stringify(r)).join('\n'));
let md=`# v3.1 四模型回放与评分\n\n统计截点：${new Date(to).toISOString()}；完整分页：${complete}。\n\nD60=${decay.probability24h==null?'未知':(decay.probability24h*100).toFixed(3)+'%'}；发生率=${decay.ratePerDay?.toFixed(6)??'—'} 次/天。Cw=${decay.weightedCount.toFixed(4)}（折扣事件量，非独立样本数）；Ew=${decay.weightedExposureDays.toFixed(4)} 天；覆盖=${decay.exposureDays.toFixed(3)} 天。半衰期60天、收缩7等效观察日，固定产品假设。\n\n主参考：${reference.activeModel}；deployment=${reference.deployment}；evidence=${reference.evidence}。${reference.reason}\n\n`;
for(const [title,metrics] of [['全评估期',replay.all],['最近180天',replay.recent180],['最近90天',replay.recent90]]){md+=`## ${title}\n\n| 模型 | 样本 | 正例 | Brier | 对数损失 | 预测/实际 |\n|---|---:|---:|---:|---:|---:|\n`;for(const key of ['p0','p1','d60','r90']){const r=metrics[key];md+=`| ${key} | ${r.count} | ${r.positiveCount} | ${r.brier?.toFixed(6)??'—'} | ${r.logLoss?.toFixed(6)??'—'} | ${r.predictedActualRatio?.toFixed(4)??'—'} |\n`;}md+='\n';}
md+=`固定7日区块：${JSON.stringify(replay.blocks7)}\n\n固定14日区块：${JSON.stringify(replay.blocks14)}\n\n${replay.note} 理想化=${replay.idealized}。延迟6/24小时是未测得的压力假设，各自共同样本${delayed6.rows.length}/${delayed24.rows.length}；D60全期Brier ${delayed6.all.d60.brier?.toFixed(6)??'—'} / ${delayed24.all.d60.brier?.toFixed(6)??'—'}。\n\n近期与全期方向均完整呈现，不因近期数值较高宣称更准；近期0.01止损门槛不是显著性检验。\n\n三组校准：\n\n\`\`\`json\n${JSON.stringify(replay.all,null,2)}\n\`\`\`\n\n在线汇总（未写回生产日志；新标签仅用于此命令数字汇总）：\n\n\`\`\`json\n${JSON.stringify(summary,null,2)}\n\`\`\`\n`;
await mkdir(join(root,'docs'),{recursive:true});await writeFile(join(root,'docs/v31-replay-20261012.md'),md);
await writeFile(join(root,'docs/v31-replay-20261012.json'),JSON.stringify({decay,reference:{...reference,replay:undefined},replay,delayed6:{all:delayed6.all},delayed24:{all:delayed24.all},summary},null,2));
console.log(JSON.stringify({d60:decay.probability24h,active:reference.activeModel,all:replay.all,recent90:replay.recent90,summary},null,2));
