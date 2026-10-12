// 在独立卡worktree中把“未知卡数”错误显示成0，必须被语义测试截住。
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
assert(root.pathname.replaceAll('\\','/').includes('/reset-radar_wt/RR49/'),'仅在RR49独立worktree执行');
const file=new URL('../src/ui/V3Dashboard.tsx',import.meta.url);
const original=await readFile(file,'utf8');
const before='creditsLabel(loading?null:vm.resetCredits)';
assert(original.includes(before));
function test(){return spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/ui/__tests__/ui.v3-fusion.test.tsx'],{cwd:root,encoding:'utf8'});}
try{
  await writeFile(file,original.replace(before,'creditsLabel(loading?null:(vm.resetCredits??0))'));
  const red=test();console.log(red.stdout,red.stderr);assert.notEqual(red.status,0);assert((red.stdout+red.stderr).includes('胶囊0卡与未知卡不混淆'));
  console.log('RED: unknown credits incorrectly coalesced to zero; unknown-vs-zero regression rejected it');
}finally{await writeFile(file,original);}
const green=test();console.log(green.stdout,green.stderr);assert.equal(green.status,0);console.log('GREEN: restored unknown credits rendering');
