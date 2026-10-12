import {readFile,writeFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);assert(root.pathname.includes('/reset-radar_wt/RR50/'));
const mutations=[['trend.ts','coverage.reduce((s,c)=>s+weightedExposure(t,c.from,c.to),0)','exposureDays','trend.v31.test.ts'],['coldStart.ts','total * todayHours * todayWeight / weightedHours','total * (todayHours+1) * todayWeight / weightedHours','coldStart.v31.test.ts']];
for(const [file,before,after,test]of mutations){const path=new URL(`../src/lib/v3/${file}`,import.meta.url),original=await readFile(path,'utf8');assert(original.includes(before));let red;
 try{await writeFile(path,original.replace(before,after));red=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',`src/lib/__tests__/${test}`],{cwd:root,encoding:'utf8'});console.log(red.stdout,red.stderr);assert.notEqual(red.status,0);console.log(`RED ${file}: ${before} => ${after}`);}finally{await writeFile(path,original);}
 const green=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run',`src/lib/__tests__/${test}`],{cwd:root,encoding:'utf8'});assert.equal(green.status,0);console.log(green.stdout,`GREEN restored ${file}`);
}
