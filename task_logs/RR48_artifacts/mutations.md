# RR48 变异验证

## 旧日错误参与需求

start >= cutoffDay - 28 * DAY_MS → start >= cutoffDay - 999 * DAY_MS

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

·x········

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  20:46:04
   Duration  232ms (transform 45%, import 32%, tests 19%, worker 4%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/demand.v3.test.ts > v3 demand fit > 规划样本与训练一致：短窗重置不抹去完整周耗，旧日和今日不参与
AssertionError: expected [ '2026-09-02', '2026-09-03' ] to deeply equal [ '2026-09-03' ]

- Expected
+ Received

  [
+   "2026-09-02",
    "2026-09-03",
  ]

 ❯ src/lib/__tests__/demand.v3.test.ts:37:64
     35|     const days = [day(0), day(1, { crossedReset: true, shortCrossedRes…
     36|       day(2, { weeklyComplete: false }), day(29), day(30)];
     37|     expect(selectDemandDays(days, cutoff).map(d => d.dateKey)).toEqual…
       |                                                                ^
     38|     expect(fitDemandModel(days, [], cutoff).sampleDays).toBe(1);
     39|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

RESTORED GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

··········

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  20:46:07
   Duration  226ms (transform 49%, import 34%, tests 14%, worker 4%)


```

## 未知需求只跑中值

!empirical && input.dailyRange && (input.workload == null || input.workload === 'unknown') → false && input.dailyRange

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

··x········

 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
   Start at  20:46:09
   Duration  608ms (tests 68%, transform 18%, import 14%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/planning.v3.test.ts > v3 planning/simulator behavioral acceptance > 未知工作量的初步范围分别评估低中高，不能只使用中值
AssertionError: expected [ { …(14) } ] to have a length of 3 but got 1

- Expected
+ Received

- 3
+ 1

 ❯ src/lib/__tests__/planning.v3.test.ts:41:21
     39|     const result = planActions(planningInput());
     40|     const metrics = result.selected!.scenarios.filter(s => s.id.includ…
     41|     expect(metrics).toHaveLength(3);
       |                     ^
     42|     expect(new Set(metrics.map(s => s.consumedWeekly)).size).toBe(3);
     43|     expect(metrics.map(s => s.id)).toEqual(expect.arrayContaining([

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

RESTORED GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

···········

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  20:46:12
   Duration  614ms (tests 65%, transform 21%, import 13%, worker 1%)


```

## 在线P0版本无法匹配

(r.record?.modelVersion ?? '').toLowerCase().includes('p0') → (r.record?.modelVersion ?? '').includes('p0')

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

··x·········

 Test Files  1 failed (1)
      Tests  1 failed | 11 passed (12)
   Start at  20:46:14
   Duration  290ms (tests 39%, transform 37%, import 21%, worker 3%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/platform.v3.test.ts > platform v3 > scores the exact uppercase version names emitted by the live v3 journal
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ src/lib/__tests__/platform.v3.test.ts:19:34
     17|     const summary=summarizeOnlinePlatformScores(['P0','P1-shadow'].map…
     18|       outcome:'positive' as const,record:{target:'platform_notice',iss…
     19|     expect(summary.matchedCount).toBe(1);
       |                                  ^
     20|     expect(summary.brierP0).toBeCloseTo(.64);
     21|     expect(summary.brierP1).toBeCloseTo(.49);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

RESTORED GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

············

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Start at  20:46:16
   Duration  265ms (tests 37%, transform 36%, import 25%, worker 2%)


```

## 未知覆盖伪造负标签

r.windowEnd>now||!covered?'pending' → r.windowEnd>now?'pending'

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

x·x···

 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
   Start at  20:46:19
   Duration  245ms (transform 50%, import 36%, tests 11%, worker 3%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/runtime.v3.test.ts > v3 runtime archival and calibration > finishing pagination after a window ends does not backfill unobserved tail coverage
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ src/lib/__tests__/runtime.v3.test.ts:15:28
     13|     const doc={...history(),coverageThrough:new Date(start+DAY_MS-1).t…
     14|     const result=evaluatePlatformJournal(journal(),doc,start+2*DAY_MS);
     15|     expect(result.pending).toBe(1);expect(result.matchedCount).toBe(0);
       |                            ^
     16|   });
     17|   it('scores frozen live P0/P1 using later complete coverage and (star…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/lib/__tests__/runtime.v3.test.ts > v3 runtime archival and calibration > never scores a negative from partial pagination or an unfinished forecast window
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/lib/__tests__/runtime.v3.test.ts:26:35
     24|     for(const [doc,now] of [[history(false),start+2*DAY_MS],[history()…
     25|       const result=evaluatePlatformJournal(journal(),doc,now);
     26|       expect(result.matchedCount).toBe(0);expect(result.brierP0).toBeN…
       |                                   ^
     27|     }
     28|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


```

RESTORED GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR48

······

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  20:46:21
   Duration  232ms (transform 51%, import 38%, tests 8%, worker 3%)


```

