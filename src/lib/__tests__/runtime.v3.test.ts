import {describe,expect,it} from 'vitest';
import {archivePlatformHistory,evaluatePlatformJournal} from '../v3/runtime';
import {DAY_MS} from '../beijing';
const start=Date.parse('2026-10-12T09:00:00+08:00');
const history=(complete=true)=>({fetchedAt:new Date(start+2*DAY_MS).toISOString(),events:[
  {id:'old',resetType:'regular',announcedAt:new Date(start-DAY_MS).toISOString()},
  {id:'new',resetType:'regular',announcedAt:new Date(start+DAY_MS).toISOString()}],
  upstream:{pagination:{has_more:!complete,next_cursor:complete?null:'next'}}});
const journal=(group='primary_daily')=>['P0','P1-shadow'].map((version,i)=>JSON.stringify({kind:'prediction',group,groupDate:'2026-10-12',
  record:{id:version,issuedAt:start,trainingCutoff:start,windowStart:start,windowEnd:start+DAY_MS,target:'platform_notice',modelVersion:`platform-v3:${version}`,probability:i?.3:.2}})).join('\n');
describe('v3 runtime archival and calibration',()=>{
  it('finishing pagination after a window ends does not backfill unobserved tail coverage',()=>{
    const doc={...history(),coverageThrough:new Date(start+DAY_MS-1).toISOString()};
    const result=evaluatePlatformJournal(journal(),doc,start+2*DAY_MS);
    expect(result.pending).toBe(1);expect(result.matchedCount).toBe(0);
  });
  it('scores frozen live P0/P1 using later complete coverage and (start,end] notice boundaries',()=>{
    const content=journal(),result=evaluatePlatformJournal(content,history(),start+2*DAY_MS);
    expect(result.matchedCount).toBe(1);expect(result.positiveCount).toBe(1);
    expect(result.brierP0).toBeCloseTo(.64);expect(result.improvement).toBeCloseTo(.15);
    expect(content).toBe(journal());expect(result.upgradeEvidenceReady).toBe(false);
  });
  it('never scores a negative from partial pagination or an unfinished forecast window',()=>{
    for(const [doc,now] of [[history(false),start+2*DAY_MS],[history(),start+DAY_MS/2]] as const){
      const result=evaluatePlatformJournal(journal(),doc,now);
      expect(result.matchedCount).toBe(0);expect(result.brierP0).toBeNull();expect(result.pending).toBe(1);
    }
  });
  it('temporary and old-version rows do not inflate primary daily score',()=>{
    const result=evaluatePlatformJournal(journal('temporary')+'\n'+JSON.stringify({kind:'prediction',record:{target:'platform_notice',modelVersion:'risk-v2'}}),history(),start+2*DAY_MS);
    expect(result.temporaryRows).toBe(2);expect(result.matchedCount).toBe(0);
  });
  it('appending a user-card operation never censors platform predictions',()=>{
    const result=evaluatePlatformJournal(journal()+'\n'+JSON.stringify({kind:'card_use',at:start+100}),history(),start+2*DAY_MS);
    expect(result.matchedCount).toBe(1);expect(result.censored).toBe(0);
  });
  it('archives firstSeen and revisions without inventing historical availability or mutating old snapshots',()=>{
    const old=history();old.events=old.events.slice(0,1);
    const doc=archivePlatformHistory(history(),old);
    expect(doc.events[0]!.firstSeenAt).toBeNull();expect(doc.events[1]!.firstSeenAt).toBe(doc.fetchedAt);
    const revised={...doc,events:doc.events.map(e=>({...e,text:'revision'})),fetchedAt:new Date(start+3*DAY_MS).toISOString()};
    expect(archivePlatformHistory(revised,doc).events[1]!.firstSeenAt).toBe(doc.fetchedAt);
    const changedTime={...revised,events:revised.events.map(e=>({...e,announcedAt:new Date(start+DAY_MS/2).toISOString()}))};
    const archived=archivePlatformHistory(changedTime,doc);
    expect(archived.events[1]!.firstSeenAt).toBe(doc.fetchedAt);
    expect(archived.events[1]!.versionSeenAt).toBe(revised.fetchedAt);
    expect(old.events).toHaveLength(1);expect(()=>archivePlatformHistory(history(false),old)).toThrow(/分页/);
  });
});
