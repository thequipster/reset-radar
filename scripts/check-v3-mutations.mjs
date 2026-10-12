// RR47门禁：每个语义破坏必须被行为测试抓到；finally恢复原文件，不修改任何夹具。
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert(/reset-radar_wt[\\/]RR47$/i.test(process.cwd()),'mutation only allowed in RR47 worktree');
const cases=[
 {file:'src/lib/v3/simulator.ts',from:'resetsAt: at + 7 * DAY_MS',to:'resetsAt: at + DAY_MS',test:'src/lib/__tests__/simulation.v3.test.ts',name:'用卡周截止错误改成+24h，D21/E30必须红'},
 {file:'src/lib/v3/platform.ts',from:"if (raw.resetType !== 'regular') continue;",to:"if (raw.resetType !== 'regular' || raw.text) continue;",test:'src/lib/__tests__/platform.v3.test.ts',name:'再次排除带text公告，A1必须红'},
 {file:'src/lib/v3/cards.ts',from:'Date.UTC(parts.year, parts.month - 1, parts.day) - 8 * 60 * 60 * 1000',to:'Date.UTC(parts.year, parts.month - 1, parts.day) + 4 * 60 * 60 * 1000',test:'src/lib/__tests__/cards.v3.test.ts',name:'日期安全截止改到当天中午，C14必须红'},
];
let evidence='# RR47 v3变异红验\n\n';
for(const c of cases){
 const original=readFileSync(c.file,'utf8');assert(original.includes(c.from),`missing mutation anchor ${c.file}`);
 let red;
 try{writeFileSync(c.file,original.replace(c.from,c.to));red=spawnSync('pwsh',['-NoProfile','-Command',`npx vitest run ${c.test} --reporter=dot`],{encoding:'utf8'});assert.notEqual(red.status,0,`${c.name} unexpectedly GREEN`);assert((red.stdout+red.stderr).includes('FAIL'),`${c.name} did not reach behaviour assertions`);}
 finally{writeFileSync(c.file,original);}
 const green=spawnSync('pwsh',['-NoProfile','-Command',`npx vitest run ${c.test} --reporter=dot`],{encoding:'utf8'});assert.equal(green.status,0,`${c.name} restore failed`);
 evidence+=`## ${c.name}\n\n- 文件 ${c.file}\n- 变异 ${c.from} → ${c.to}\n\nRED\n\n\`\`\`text\n${red.stdout}${red.stderr}\n\`\`\`\n\n恢复GREEN\n\n\`\`\`text\n${green.stdout}${green.stderr}\n\`\`\`\n\n`;console.log(`RED → restored GREEN: ${c.name}`);
}
writeFileSync('docs/v3-mutations-20261012.md',evidence.replace(/\x1b\[[0-9;]*m/g,''));
