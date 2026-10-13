// RR52真实接线变异；只许本卡worktree，finally恢复App原字节。
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
assert(/reset-radar_wt[\\/]RR52$/i.test(process.cwd()));
const file='src/App.tsx',original=readFileSync(file),text=original.toString('utf8');
const from='if(!live||demo||!vm||!codex)return;',to='if(!live||demo||!vm||!codex||codex.status!=="ok")return;';
assert(text.includes(from));let red;
function run(){return spawnSync('pwsh',['-NoProfile','-Command','npx vitest run src/ui/__tests__/ui.platform-publication.test.ts'],{encoding:'utf8'});}
try{
 writeFileSync(file,text.replace(from,to));red=run();
 assert.notEqual(red.status,0);assert((red.stdout+red.stderr).includes('账号error仍发布四个平台目标'));
}finally{writeFileSync(file,original);}
const green=run();assert.equal(green.status,0);
writeFileSync('task_logs/RR52_artifacts/mutation.txt',`恢复错误的账号总门控：${from} -> ${to}\nRED\n${red.stdout}${red.stderr}\nRESTORED GREEN\n${green.stdout}${green.stderr}`);
console.log('账号错误门控：两项回归RED -> 原字节恢复4项GREEN');
