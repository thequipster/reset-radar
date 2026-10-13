import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';
import {planActions} from '../v3/planning';
import {stressInput,goldenInputs} from './fixtures/planning-memory-input';

// 修复前e7c389b独立bundle的完整输出，排序对象键后SHA256；冻结决策与每个情景指标。
const golden=[
 'a6379832c7cb5d4459755e90ba742e327e114c4b28d593f8ec229e17eeaac03b',
 '1c07012177c1561c8256fa30f2d08cdcdff4c757329bca8b2ff32183399c9255',
 'd6da0be631b44b2d5e7f34db9e8af3afae1d19c0ffd96870cd63fd02d1796e38',
 'd90db085506c915a602308bbcc7f3906b0ea2b4e1b7767c41e63c6c656b8df2e',
];
describe('planning bounded memory without changing policy results',()=>{
 it.each(golden.map((hash,index)=>({hash,index})))('matches original complete output $index',({hash,index})=>{
  const output=planActions(goldenInputs()[index]!);
  const normalized=JSON.stringify(output,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  expect(createHash('sha256').update(normalized).digest('hex')).toBe(hash);
 },15000);
 it('finishes all 36 scenarios and three rates within a 128MB heap',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'rr53-memory-'));
  try{
   const bundle=await build({configFile:false,logLevel:'silent',build:{ssr:fileURLToPath(new URL('../v3/planning.ts',import.meta.url)),write:false,minify:false}});
   if(Array.isArray(bundle)||!('output' in bundle))throw new Error('expected a single SSR bundle');
   const chunk=bundle.output.find(o=>o.type==='chunk'&&o.isEntry);
   if(!chunk||chunk.type!=='chunk')throw new Error('missing planning bundle');
   const entry=join(dir,'planning.mjs');writeFileSync(entry,chunk.code);
   const code=`import{readFileSync}from'node:fs';import{planActions}from ${JSON.stringify(pathToFileURL(entry).href)};const input=JSON.parse(readFileSync(0,'utf8'));const r=planActions(input);console.log(JSON.stringify({metrics:r.comparisons[0].scenarios.length,horizons:r.horizons.map(h=>h.days)}));`;
   const child=spawnSync(process.execPath,['--max-old-space-size=128','--input-type=module','-e',code],{input:JSON.stringify(stressInput),encoding:'utf8',timeout:60000,maxBuffer:64000});
   expect(child.error).toBeUndefined();
   expect(child.status,child.stderr).toBe(0);
   expect(JSON.parse(child.stdout)).toEqual({metrics:1728,horizons:[21,28]});
  }finally{rmSync(dir,{recursive:true,force:true});}
 },70000);
});
