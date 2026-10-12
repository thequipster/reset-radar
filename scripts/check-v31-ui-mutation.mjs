import {readFile,writeFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),file=new URL('../src/ui/V3Dashboard.tsx',import.meta.url);assert(root.pathname.includes('/reset-radar_wt/RR51/'));
const original=await readFile(file,'utf8'),before='vm.demand.sampleDays<7&&';assert(original.includes(before));
const run=()=>spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','src/ui/__tests__/ui.rr51-cold-start.test.tsx'],{cwd:root,encoding:'utf8'});
try{await writeFile(file,original.replace(before,'vm.demand.sampleDays>=7&&'));const red=run();console.log(red.stdout,red.stderr);assert.notEqual(red.status,0);console.log('RED: reverse learning-state CTA condition hides needed input entries');}finally{await writeFile(file,original);}
const green=run();console.log(green.stdout);assert.equal(green.status,0);console.log('GREEN: restored cold-start input guidance');
