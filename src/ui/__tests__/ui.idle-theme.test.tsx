import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {needsPlanning,needsCalibration} from '../planningSchedule';
import {RadarBrand,ResetCardArtwork} from '../RadarArtwork';
describe('idle scheduling and theme artwork',()=>{
 for(const form of ['orb','bar'] as const)for(const metric of ['remaining','risk','pace'] as const){
  it(`collapsed ${form}/${metric} only plans when its visible budget needs it`,()=>expect(needsPlanning('collapsed',form,metric)).toBe(form==='orb'&&metric==='pace'));
  for(const state of ['peek','expanded'] as const)it(`${state} ${form}/${metric} keeps advice enabled`,()=>expect(needsPlanning(state,form,metric)).toBe(true));
 }
 it('ships separate decorative light/dark artwork, not a dimmed dark bitmap',()=>{
  for(const html of [renderToStaticMarkup(<RadarBrand/>),renderToStaticMarkup(<ResetCardArtwork/>)]){expect(html).toContain('rr-art-dark');expect(html).toContain('rr-art-light');expect(html).toContain('aria-hidden="true"');}
  for(const asset of ['radar-emblem-light','reset-card-art-light']){const svg=readFileSync(new URL(`../../assets/ui/${asset}.svg`,import.meta.url),'utf8');expect(svg).toContain('<svg');expect(svg).not.toMatch(/<animate|<filter|<script|href=["']https?:/);}
 });
 it('orb SVG does not interpolate its live quota stroke',()=>{
  const css=readFileSync(new URL('../Orb.module.css',import.meta.url),'utf8');expect(css).toMatch(/\.progress\{transition:none\}/);expect(css).not.toMatch(/animation:[^;}]*infinite/);expect(css).toContain('contain:layout paint');
 });
});

it.each(['collapsed','peek','expanded'] as const)('review statistics are only built for the expanded panel (%s)',state=>expect(needsCalibration(state)).toBe(state==='expanded'));
