# RR47 v3变异红验

## 用卡周截止错误改成+24h，D21/E30必须红

- 文件 src/lib/v3/simulator.ts
- 变异 resetsAt: at + 7 * DAY_MS → resetsAt: at + DAY_MS

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR47

··xx······

 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
   Start at  16:30:05
   Duration  411ms (import 48%, transform 44%, tests 6%, worker 2%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/simulation.v3.test.ts > v3同一双窗模拟器的可手算反例 > E30 提前用卡取消明日自然补给，160变100，不能藏掉损失
AssertionError: expected 160 to be close to 100, received difference is 60, but expected 0.005
 ❯ src/lib/__tests__/simulation.v3.test.ts:25:77
     23|     const demand=uniform(0);demand[0]!.weeklyCost=60;demand[1]!.weekly…
     24|     const base=simulatePolicy(account(60),[card],NEVER_USE,world(deman…
     25|     expect(base.consumedWeekly).toBeCloseTo(160);expect(use.consumedWe…
       |                                                                             ^
     26|     expect(use.trajectory.find(t=>t.at===DAY_MS)!.weeklyGeneration).to…
     27|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/lib/__tests__/simulation.v3.test.ts > v3同一双窗模拟器的可手算反例 > D21 状态转换回满双窗、周+168h且标记指定卡已用
AssertionError: expected 86400000 to be 604800000 // Object.is equality

- Expected
+ Received

- 604800000
+ 86400000

 ❯ src/lib/__tests__/simulation.v3.test.ts:31:113
     29|     const initial={...account(5),cards:[card],weeklyGeneration:3,short…
     30|     const used=applyCardUse(initial,'first',0,mechanisms)!;
     31|     expect(used.weekly.remaining).toBe(100);expect(used.short.remainin…
       |                                                                                                                 ^
     32|     expect(applyCardUse(used,'first',0,mechanisms)).toBeNull();
     33|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


```

恢复GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR47

··········

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  16:30:08
   Duration  385ms (transform 60%, import 34%, tests 4%, worker 2%)


```

## 再次排除带text公告，A1必须红

- 文件 src/lib/v3/platform.ts
- 变异 if (raw.resetType !== 'regular') continue; → if (raw.resetType !== 'regular' || raw.text) continue;

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR47

x·······

 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  16:30:11
   Duration  310ms (transform 37%, tests 36%, import 24%, worker 3%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/platform.v3.test.ts > platform v3 > counts every regular including text, deduplicates IDs, and excludes banked records
AssertionError: expected +0 to be 54 // Object.is equality

- Expected
+ Received

- 54
+ 0

 ❯ src/lib/__tests__/platform.v3.test.ts:10:30
      8|     events.push({ ...events[10], text: 'revised' }, { id: 'b', resetTy…
      9|     const model = fitPlatformModel({ events, coverage: [{ from: 0, to:…
     10|     expect(model.eventCount).toBe(54);
       |                              ^
     11|     expect(model.completedGapCount).toBe(53);
     12|     expect(model.k[0]).toBe(53);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

恢复GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR47

········

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  16:30:14
   Duration  303ms (transform 37%, tests 36%, import 24%, worker 3%)


```

## 日期安全截止改到当天中午，C14必须红

- 文件 src/lib/v3/cards.ts
- 变异 Date.UTC(parts.year, parts.month - 1, parts.day) - 8 * 60 * 60 * 1000 → Date.UTC(parts.year, parts.month - 1, parts.day) + 4 * 60 * 60 * 1000

RED

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR47

x·············

 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Start at  16:30:16
   Duration  265ms (transform 50%, import 32%, tests 14%, worker 4%)


⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/lib/__tests__/cards.v3.test.ts > 卡截止按北京时间和操作缓冲解释 > C14：只录日期时安全截止是当天北京零点，晚间最后查看提前到前一天
AssertionError: expected 1792468800000 to be 1792425600000 // Object.is equality

- Expected
+ Received

- 1792425600000
+ 1792468800000

 ❯ src/lib/__tests__/cards.v3.test.ts:21:35
     19|     const parsed = parseCardExpiry("2026-10-20", "date");
     20|     expect(parsed.exactExpiryAt).toBeNull();
     21|     expect(parsed.safeDeadlineAt).toBe(ms("2026-10-19T16:00:00Z"));
       |                                   ^
     22|     const item = card("date-only", "2026-10-20");
     23|     const reminder = cardReminder(item, ms("2026-10-18T00:00:00Z"), ["…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

恢复GREEN

```text

 RUN  v5.0.3 C:/Users/slsjz/Desktop/reset-radar_wt/RR47

··············

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  16:30:19
   Duration  261ms (transform 53%, import 32%, tests 10%, worker 5%)


```
