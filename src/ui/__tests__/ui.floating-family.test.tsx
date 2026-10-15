import {describe,it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import Orb from '../Orb';
import {V3CompactBar,V3Peek} from '../V3Dashboard';
import {buildV3Dashboard} from '../v3Model';
import {demoSnapshot} from '../demoScenarios';
const snapshot=demoSnapshot();
const vm=buildV3Dashboard(snapshot,{events:[],fetchedAt:snapshot.updatedAt},Date.parse(snapshot.updatedAt),undefined,[],[],true);
afterEach(()=>vi.unstubAllGlobals());
describe('floating surfaces and self-hosted assets',()=>{
 it('orb retains live quota and adds a shared theme marker and metric hint',()=>{
  const noop=()=>{};const html=renderToStaticMarkup(<Orb vm={null} readout={{metric:'remaining',value:'29',unit:'%',title:'周额度剩余29%',percent:29,band:'unknown',hasValue:true}} metric="remaining" dockEdge={null} popped={false} onExpand={noop} onCycleMetric={noop} onDragMove={noop} onDragEnd={noop} onPointerEnter={noop} onPointerLeave={noop}/>);
  expect(html).toContain('data-floating-surface="orb"');expect(html).toContain('周余');expect(html).toContain('stroke-dasharray');expect(html).toContain('29');
 });
 it('bar and peek share the floating palette, keep live metrics and never replace numbers with artwork',()=>{
  const bar=renderToStaticMarkup(<V3CompactBar vm={vm} demo onExpand={()=>{}}/>);
  expect(bar).toContain('data-floating-surface="bar"');expect(bar).toContain('radar-emblem');expect(bar).toContain('本周还剩');expect(bar).toContain('短窗');expect(bar).toContain('演示模式');
  const peek=renderToStaticMarkup(<V3Peek vm={vm} demo onOpen={()=>{}}/>);expect(peek).toContain('data-floating-surface="peek"');expect(peek).toContain('看今天怎么用');
 });
 it('fonts are real local WOFF assets with complete OFL notices and no CSS CDN request',()=>{
  for(const file of ['manrope','radar-sans-sc']){
   const bytes=readFileSync(new URL(`../../assets/fonts/${file}.woff`,import.meta.url));expect(bytes.subarray(0,4).toString()).toBe('wOFF');
   const license=readFileSync(new URL(`../../../public/licenses/fonts/${file}-OFL.txt`,import.meta.url),'utf8');expect(license).toContain('SIL OPEN FONT LICENSE');
  }
  const css=readFileSync(new URL('../fonts.css',import.meta.url),'utf8');expect(css).toContain('font-display:swap');expect(css).not.toContain('https://');
 });
});
