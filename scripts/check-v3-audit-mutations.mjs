// RR48真实行为变异：只在本卡worktree运行，finally逐字恢复。
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert(/reset-radar_wt[\\/]RR48$/i.test(process.cwd()),'RR48 worktree required');
const cases=[
 {file:'src/lib/v3/demand.ts',from:'start >= cutoffDay - 28 * DAY_MS',to:'start >= cutoffDay - 999 * DAY_MS',test:'src/lib/__tests__/demand.v3.test.ts',name:'旧日错误参与需求'},
 {file:'src/lib/v3/planning.ts',from:"!empirical && input.dailyRange && (input.workload == null || input.workload === 'unknown')",to:'false && input.dailyRange',test:'src/lib/__tests__/planning.v3.test.ts',name:'未知需求只跑中值'},
 {file:'src/lib/v3/platform.ts',from:"(r.record?.modelVersion ?? '').toLowerCase().includes('p0')",to:"(r.record?.modelVersion ?? '').includes('p0')",test:'src/lib/__tests__/platform.v3.test.ts',name:'在线P0版本无法匹配'},
 {file:'src/lib/v3/runtime.ts',from:"r.windowEnd>now||!covered?'pending'",to:"r.windowEnd>now?'pending'",test:'src/lib/__tests__/runtime.v3.test.ts',name:'未知覆盖伪造负标签'},
];
let report='# RR48 变异验证\n\n';
for(const c of cases){
 const original=readFileSync(c.file,'utf8');assert(original.includes(c.from));let red;
 try{
  writeFileSync(c.file,original.replace(c.from,c.to));
  red=spawnSync('pwsh',['-NoProfile','-Command',`npx vitest run ${c.test} --reporter=dot`],{encoding:'utf8'});
  assert.notEqual(red.status,0);assert((red.stdout+red.stderr).includes('FAIL'));
 }finally{writeFileSync(c.file,original);}
 const green=spawnSync('pwsh',['-NoProfile','-Command',`npx vitest run ${c.test} --reporter=dot`],{encoding:'utf8'});
 assert.equal(green.status,0);
 report+=`## ${c.name}\n\n${c.from} → ${c.to}\n\nRED\n\n\`\`\`text\n${red.stdout}${red.stderr}\n\`\`\`\n\nRESTORED GREEN\n\n\`\`\`text\n${green.stdout}${green.stderr}\n\`\`\`\n\n`;
 console.log(`${c.name}: RED -> restored GREEN`);
}
writeFileSync('task_logs/RR48_artifacts/mutations.md',report.replace(/\x1b\[[0-9;]*m/g,''));
