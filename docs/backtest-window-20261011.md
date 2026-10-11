# 统一前瞻 24h 回测对账说明（2026-10-11，RR17）

## 当前结论

RR17 之前，「每日预测 vs 实际重置」的通用对账用**同北京日历键匹配**：某日给过预测、该日发生重置即算 realized。这与风险模型的语义不符——`assessResetRisk` 的目标是**评估时刻起的未来 24h**（`risk.ts` `RESET_RISK_HORIZON_MS`）。同日匹配会漏掉跨午夜的窗口命中（如北京 23:00 评估、次日 01:00 重置），也会把窗口起点之前的同日事件错误计入。RR16 只给 watch 配对修了这一口径，通用校准仍走旧对账（watch-calibration-20261011.md「现有证据与边界」节移交本卡）。

RR17 起，全部对账统一为**前瞻窗口制**：

- 每条 RR16 及之后落盘的预测行都带 `windowStart/windowEnd`；只有窗口元数据合法（长度恰为 24h、`fetchedAt` 不晚于窗口起点、窗口起点折北京日 = 行 `date`）的行才可计分。
- 实际结果只匹配 `(windowStart, windowEnd]` 内的 regular 重置；窗口完整结束且被历史 `fetchedAt` 覆盖后才结算，进行中的窗口不计分。
- 每个北京目标日取**记录时刻最早**的合法行；同日后补行只能作 duplicate 排除，不能改写当日概率。
- **旧四字段行（无窗口元数据）一律排除，不倒填**：它们的评估时点在 24h 语义下不可知，任何「推断窗口」都是事后编造。当前生产日志 3 行（24.5 归档行 + 44 / 32.1 应用行）全部属旧格式，本卡后计分 n=0——这是诚实结果，不是回测失败。

## 自动对答案

`fetch-history` 刷新历史后自动调用 `refresh-calibration`：读取仓内归档与应用 canonical 预测日志（只读），生成

- `data/calibration.json` —— 机读快照（schema `reset-radar/calibration@1`）：计分、watch 同样本比较、逐窗 outcomes、六类排除计数、历史来源与分页覆盖信息；
- `docs/calibration-latest.md` —— 人读报告，新增「排除」行逐类给数。

REVIEW 入口 `scripts/review-calibration.mjs` 编排不变（先 fetch 再 calibrate），fetch 内嵌的刷新保证「拉到新重置日 → 该日窗口自动对上答案」无需人工干预。历史坏 JSON / fetchedAt 非法时保留上一代完整产物不写半截（原子写 + 拒绝生成）。

## 分页诚实性

API `has_more=true`（历史被截断）时，最早已返回 regular 事件之前的窗口一律按「超出历史覆盖」排除——不能因为分页截断就把旧窗口判成「未重置」。`has_more=false` 才视为全覆盖。该边界来自 B07 的 pagination schema。

## CLI 评估时点

`log-prediction` 过去把评估时点取历史 fetchedAt（夹具滞后时会「倒签」旧日预测）。RR17 起：评估与 24h 窗口起点统一为**本次运行时刻**，历史 fetchedAt 只用来验新鲜度；stale/invalid 来源拒绝落盘，提示先刷新历史。核心逻辑在 `src/lib/historyPrediction.ts`（`buildHistoryPrediction`），脚本零算法。

## 证据出处

- 窗口语义唯一实现：`src/lib/calibrationWindows.ts`（`selectCompletedPredictionWindows`）；`calibration.ts` `joinPredictionsWithResets` 与 `watchCalibration.ts` 均委托它——三处消费一份实现（RUNBOOK §1.4）。
- 24h horizon：`src/lib/risk.ts` `RESET_RISK_HORIZON_MS`。
- ISO 严格解析：`src/lib/watchSignal.ts` `parseIsoWithZone`（RR16 已验）。
- 分页字段：TRUTH §2 B07（`pagination.has_more` schema 与首拉实测）。
- 快照产物：`src/lib/calibrationSnapshot.ts`、`scripts/refresh-calibration.mjs`；实跑证据 `task_logs/RR17_artifacts/`（fetch 后 calibration.json 摘要：3 行全 legacy、n=0、state=fresh）。
- 北京日边界：D004（`resetCard.beijingCalendarDateKey`）。

## 完成本卡验证

- 四绿：`tsc` 退出 0；域 `src/lib` 147/147；全量 177/177 0 failed（基线 170 只升）；Node 38/38（基线 37 只升）。
- 变异红验三组（全部复原后复绿）：
  1. 窗口边界 `(start,end]` 反转为 `[start,end)` —— 首轮**存活**（继承测试只断言 realized=true，未分别钉起点/终点事件），补「单事件在 start 必须 false / 在 end 必须 true」两断言后重验红 1 条；
  2. 删除旧行（无窗口）排除分支 —— 红 1 条（`legacy:0,invalid:1` vs 期望 `legacy:1`）；
  3. 删除 24h 窗长校验 —— 首轮**存活**（无错长度窗口用例），补「23h/25h 窗口一律拒收」用例后重验红 1 条。
  首轮两组存活即本卡变异步骤抓到的测试盲点，均已补钉，不掩盖。
- 实跑：`node scripts/fetch-history.mjs` 真拉两端点成功（60 事件 / 最新 regular 2026-10-11T04:01:09Z），自动产出 `data/calibration.json` 与 `docs/calibration-latest.md`；3 条预测全 legacy 排除、n=0，未伪造任何指标。

## 遗留

- 计分样本要等带窗口元数据的预测自然积累（RR16 后构建的 app 或新版 `log-prediction` 落盘，且窗口完成 + 历史覆盖后结算）；当前 n=0 属预期。
- `data/calibration.json` 为脚本生成物（数据锁口径：只由脚本写）；RR28 校准摘要将以它为只读输入。
