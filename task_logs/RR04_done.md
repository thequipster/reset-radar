# RR04 done — core 风险模型（会话 S1011-0243，2026-10-11 02:51 交付）

- commit：`agent/RR04 @ f1810f9`（基于 main 01c34dc）；diffstat：3 files, +288
  （src/lib/risk.ts +160 / src/lib/__tests__/risk.core.test.ts +127 / src/lib/index.ts +1）
- patch 备份：`task_logs/RR04.patch`

## 交付内容

`src/lib/risk.ts`：
- `assessResetRisk(history, now, watchPercent?) → { score, factors[] }`——未来 24h 强制重置
  风险（0-100 百分比）；factors 结构对齐 D006（id/label/delta/note）。
- 因子链（顺序固定）：base（星期基线）→ consecutive-reset（连续重置）→ interval-hazard
  （历史间隔条件风险）→ recent-regime（近期升频）→ weekday-empirical（星期分布平滑）→
  tracker-watch（上游 watch 融入，可选）。
- `beijingWeekday(ts)` 导出为公共工具：D004 星期判定唯一入口（+8h 取星期），RR05+ 复用
  （决策 D014）。
- index.ts 追加 `export * from "./risk"`。

## 真值出处（证据铁律）

- 算法与全部常量：codex-cockpit `src-tauri/src/reset_forecast.rs::calibrated_risk`
  L134-240（TRUTH §1 来源 3，MIT；D007 合规借鉴）。逐段行号已注在 risk.ts 常量声明处：
  基线 L140-144（Tue/Sat 70、其余 10）｜连续 L154-167（≤1.5 天抬到 40）｜间隔 L169-191
  （Laplace (e+1)/(n+2)、权重 0.25、±12 夹紧、间隔下限 0.25 天）｜近期 L193-213（30 天窗、
  1.25 倍阈值、+12）｜星期平滑 L214-227（(m+2)/(n+14)、×20、±6）｜watch L229-238（0.25
  权重）｜输出夹紧 [2,95] L239。目标星期 = now+24h 的北京星期（rs:139 的 +24h+8h 语义）。
- 真实夹具：`data/resets-history.json`（RR03 产出，schema 见 TRUTH §2 B07）。
- B07 的北京星期分布（Sun..Sat = 9,4,10,12,8,7,9）直接作为测试锚点——RR03 会话独立核实的
  数字，反向验证了本卡 beijingWeekday 的 D004 边界正确性。

## golden 期望值手工推导（as_of = fetchedAt = 2026-10-10T17:20:15.727Z）

目标日 = 北京周一 → base 10；age 2.566 天 > 1.5 → 无连续抬升；58 个有效间隔中
atRisk=34、events=8 → empirical = (8+1)/(34+2)×100 = 25.0 → delta = (25−10)×0.25 = +3.75；
recent 7 > 长期 4.5554×1.25 = 5.694 → +12；星期平滑 matching=4 → (6/73 − 1/7)×20 = −1.2133；
合计 10+3.75+12−1.2133 = 24.54 → **24.5**。实现输出与手算逐位一致（实现前先完成手算）。

## 门禁四绿证据

1. `npx tsc --noEmit` ✅（worktree 根，02:49 与复原后 02:50 两次）
2. `npx vitest run src/lib/` ✅ 18/18（meta.smoke 4 + risk.core 14）
3. `npx vitest run` 全量 ✅ 18/18、0 failed（基线 4/4 → 只增未破；变异复原后复跑仍 18/18）
4. 变异红验两轮（三要素）：
   - A（卡面口径 0.7→0.1）：改 `WEEKDAY_BASE_HIGH 70→10` → 红 4 条——「空历史+目标日
     周二→70」「D004：星期按北京时区判定」（红在星期基线与北京边界）、「6 事件等距 7 天
     …→58」「周二 70+watch 0→52.5」（红在基线下游因子链）；复原 → 绿。
   - B：改 `WATCH_WEIGHT 0.25→0` → 红 3 条——watch 融合三用例（红在融合公式
     (watch−p)×0.25）；复原 → 全量 18/18 再绿。

## 备注

- 非 Rust 域卡，按 RUNBOOK §5 未追加 cargo check（src-tauri 零改动）。
- 排障遗产（给下班的工位会话）：worktree 无 node_modules（未跟踪文件不随 worktree 传播），
  领卡后先 `npm ci`（本机约 40s，B04 镜像可达）。
- watchPercent 契约 0-100；越界值由输出夹紧 [2,95] 兜住（有防御测试，与 rs 行为一致）。

## 待用户清单

无（未触及发布资产/版本号/License）。

## →下轮

- RR05（planner）可直接消费：`import { assessResetRisk } from "@/lib"`（或相对路径）；
  planner 的 risk 入参即本卡 score（0-100）。
- RR07（校准器）消费口径：predictions 记 predictedRisk 时建议存 0-1 概率（score/100），
  Brier 才是标准定义——留给 RR07 卡内决策。
- RR04 🟡待合入；建议下一班先占 MERGE 槽合入（core 域串行，避免 RR05 开工后 core 域
  悬两张未合卡），再回 WORK 领 RR05。
