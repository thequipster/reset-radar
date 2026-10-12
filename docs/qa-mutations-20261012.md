# RR46 mutation evidence

## src/ui/dockGeometry.ts
Mutation: monitor.x - size.width / 2 -> monitor.x - size.width + 24
Expected RED exit=1

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR46

····x·····

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  12:50:23
   Duration  239ms (transform 48%, import 34%, tests 13%, worker 4%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ui/__tests__/ui.dock-geometry.test.ts > dockedPosition（圆心压边线，露出半圆） > 四条边窗口中心都落在屏幕边线上
AssertionError: expected { x: -48, y: 300 } to deeply equal { x: -36, y: 300 }

- Expected
+ Received

  {
-   "x": -36,
+   "x": -48,
    "y": 300,
  }

 ❯ src/ui/__tests__/ui.dock-geometry.test.ts:53:71
     51| describe("dockedPosition（圆心压边线，露出半圆）", () => {
     52|   it("四条边窗口中心都落在屏幕边线上", () => {
     53|     expect(dockedPosition("left", MONITOR, SIZE, { x: 200, y: 300 })).…
       |                                                                       ^
     54|       x: -36,
     55|       y: 300,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


Restored GREEN

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR46

··········

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  12:50:25
   Duration  222ms (transform 49%, import 36%, tests 9%, worker 5%)


## src/lib/usageObservations.ts
Mutation: 15 * 60_000 -> 0 * 60_000
Expected RED exit=1

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR46

xx·xxx

 Test Files  1 failed (1)
      Tests  5 failed | 1 passed (6)
   Start at  12:50:27
   Duration  283ms (transform 44%, import 30%, tests 22%, worker 4%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/usage.observations.test.ts > aggregateDailyUsage > 两天连续 5 分钟观测按固定账号生成完整北京日差量，当前日不计
AssertionError: expected [] to deeply equal [ '2026-10-08', '2026-10-09' ]

- Expected
+ Received

- [
-   "2026-10-08",
-   "2026-10-09",
- ]
+ []

 ❯ src/lib/__tests__/usage.observations.test.ts:35:51
     33|     const rows = fiveMinuteRows(first, now);
     34|     const samples = aggregateDailyUsage(rows, ACCOUNT, now);
     35|     expect(samples.map(({ dateKey }) => dateKey)).toEqual(["2026-10-08…
       |                                                   ^
     36|     expect(samples[0]?.usedPercent).toBeCloseTo(5.76, 8);
     37|     expect(samples[1]?.usedPercent).toBeCloseTo(5.76, 8);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  src/lib/__tests__/usage.observations.test.ts > aggregateDailyUsage > 只聚合选定账号，不混入另一个账号的日耗
AssertionError: expected undefined to be close to 2.88, received difference is NaN, but expected 5e-9
 ❯ src/lib/__tests__/usage.observations.test.ts:47:37
     45|       ...fiveMinuteRows(start, end, { accountKey: OTHER, startRemainin…
     46|     const samples = aggregateDailyUsage(rows, ACCOUNT, end + DAY_MS);
     47|     expect(samples[0]?.usedPercent).toBeCloseTo(2.88, 8);
       |                                     ^
     48|     expect(samples[1]?.usedPercent).toBeCloseTo(2.88, 8);
     49|     expect(aggregateDailyUsage(rows, null, end + DAY_MS)).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  src/lib/__tests__/usage.observations.test.ts > aggregateDailyUsage > 周期变化或余额上跳会丢弃受影响日，不伪算为负日耗或用量
AssertionError: expected [] to deeply equal [ '2026-10-09' ]

- Expected
+ Received

- [
-   "2026-10-09",
- ]
+ []

 ❯ src/lib/__tests__/usage.observations.test.ts:70:100
     68|     const changedCycle = stable.map((row) => Date.parse(row.observedAt…
     69|       ? { ...row, resetsAt: "2026-10-17T00:00:00.000Z" } : row);
     70|     expect(aggregateDailyUsage(changedCycle, ACCOUNT, end + DAY_MS).ma…
       |                                                                                                    ^
     71|
     72|     const jumped = stable.map((row) => Date.parse(row.observedAt) === …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  src/lib/__tests__/usage.observations.test.ts > aggregateDailyUsage > 跨北京时间午夜的 5 分钟区间按重叠时长分摊到两天
AssertionError: expected [] to deeply equal [ '2026-10-08', '2026-10-09' ]

- Expected
+ Received

- [
-   "2026-10-08",
-   "2026-10-09",
- ]
+ []

 ❯ src/lib/__tests__/usage.observations.test.ts:82:51
     80|     const rows = fiveMinuteRows(first - 3 * 60_000, first + 2 * DAY_MS…
     81|     const samples = aggregateDailyUsage(rows, ACCOUNT, first + 2 * DAY…
     82|     expect(samples.map(({ dateKey }) => dateKey)).toEqual(["2026-10-08…
       |                                                   ^
     83|     expect(samples[0]?.usedPercent).toBeCloseTo(14.4, 8);
     84|     expect(samples[1]?.usedPercent).toBeCloseTo(14.4, 8);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  src/lib/__tests__/usage.observations.test.ts > aggregateDailyUsage > 解析跳过损坏行并保留耗尽标记
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/lib/__tests__/usage.observations.test.ts:95:21
     93|     expect(parsed).toHaveLength(rows.length);
     94|     const samples = aggregateDailyUsage(parsed, ACCOUNT, end + DAY_MS);
     95|     expect(samples).toHaveLength(1);
       |                     ^
     96|     expect(samples[0]?.exhausted).toBe(true);
     97|     expect(samples[0]?.usedPercent).toBeCloseTo(3, 8);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


Restored GREEN

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR46

······

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  12:50:29
   Duration  236ms (transform 44%, import 30%, tests 23%, worker 4%)


## src/ui/adapters.ts
Mutation: at - modelAsOfMs -> at
Expected RED exit=1

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR46

x

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  12:50:31
   Duration  506ms (transform 49%, import 47%, tests 2%, worker 1%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ui/__tests__/ui.pace-survival.test.ts > dashboard pace survival input > uses elapsed hours from model as-of so later daily allocations have lower survival
AssertionError: expected 0.9179653405230793 to be greater than 0.9179653405230793
 ❯ src/ui/__tests__/ui.pace-survival.test.ts:31:38
     29|     expect(vm.dailyPlan?.demandQuality).toBe("estimated");
     30|     expect(allocations.length).toBeGreaterThan(2);
     31|     expect(allocations[0]!.survival).toBeGreaterThan(allocations[1]!.s…
       |                                      ^
     32|     expect(new Set(allocations.map(({ survival }) => survival)).size).…
     33|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


Restored GREEN

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR46

·

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  12:50:34
   Duration  490ms (transform 52%, import 45%, tests 2%, worker 1%)
