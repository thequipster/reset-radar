# RR07 done — 预测校准器（差异化核心 D001 落地）

- 会话：S1011-0413（2026-10-11 04:17 领卡 → 04:27 交付；本班先完成 MERGE RR06→main 58ff13b）
- 分支/commit：agent/RR07 @ **13be6b1**（基于 main 58ff13b；patch 备份 task_logs/RR07.patch，
  已验证对 main `git apply --check` 干净适用）
- diffstat：8 文件 +619/−6（src/lib/calibration.ts 209 新增 / 测试 231 新增 /
  scripts/calibrate.mjs 165 新增 / planner.ts、resetCard.ts、index.ts、tsconfig.json、package.json 小改）

## 交付内容

1. `src/lib/calibration.ts`（算法唯一实现源，RUNBOOK §1.4）：
   - `scorePredictions(records, {thresholdPercent?}) → {n, brier, hitRate, thresholdPercent, baseRate,
     byWeek[], reliability[]}`——Brier=mean((p−y)²) 标准定义；命中率=p≥阈判「会重置」与实现一致占比；
     n=0 时 brier/hitRate/baseRate=null（不误读为完美）；byWeek 按周一北京日历键分组；
     reliability 十分桶（含下不含上、末桶双含，空桶不出现）。
   - `joinPredictionsWithResets(rows, announcedAt, now)`——预测×历史对账：announcedAt 折北京日历键判
     realized；同日多行取首行（ex-ante）；dateKey ≥ as_of 日键的未完结日剔除。
2. `scripts/calibrate.mjs`：REVIEW artifact 渲染壳（零算法），读 data/predictions.jsonl +
   data/resets-history.json 出 Markdown 报告；RUNBOOK §9.1 固定命令 `node scripts/calibrate.mjs >
   docs/calibration-latest.md` 原样可用（node ≥22.18 原生 type-stripping 直载核心层 .ts，本机
   v22.23.1 实测两轮冒烟通过）；as_of=夹具 fetchedAt（数据新鲜度，与 risk.ts now 语义同源）；
   predictions.jsonl 尚不存在时优雅降级出骨架报告（RR10 落盘后自动出全量指标）。
3. 接线小改：lib import 链带 .ts 扩展（planner→risk、resetCard→planner、calibration→resetCard）+
   tsconfig `allowImportingTsExtensions`（noEmit 下合法）；`beijingCalendarDateKey` 自 resetCard.ts
   导出（日键唯一实现源，D014 beijingWeekday 同例）；index.ts 补 calibration 导出；
   package.json 增 `npm run calibrate` 便捷入口。
4. 测试 16 条（见下）。

## 真值出处（证据铁律）

| 内容 | 出处 |
|---|---|
| Brier = mean((p−y)²)，完美=0 / 恒50%=0.25 / 全错=1 | RR07 卡面证据行（标准定义；TRUTH §1 来源 3 参考仓已核实无 calibration 先例，确系从零新建） |
| 命中率 = 阈值化命中占比 | 同上 |
| 北京日历键（对账/分组唯一日边界） | resetCard.ts beijingCalendarDateKey（rc:111-114，D004/D015） |
| predictions.jsonl 行契约 {date, predictedRisk, fetchedAt} | RR10 卡面修向（本卡先行定义消费侧，写侧 RR10 跟进） |
| as_of=数据新鲜度时刻（非墙钟） | risk.ts 文件头语义先例（参考实现取 meta.generated_at） |
| 接口契约四决策（0-100 刻度/首行/未完结剔除/周一锚） | docs/DECISIONS.md **D016**（本会话记） |

## 四绿证据（worktree ../reset-radar_wt/RR07，2026-10-11 04:21–04:25）

1. `npx tsc --noEmit` → **GREEN**（含 allowImportingTsExtensions 变更后）
2. `npx vitest run src/lib/` → **65/65 passed**（基线 49 + 本卡 16）
3. `npx vitest run` 全量 → **65/65 passed，0 failed**（基线 49→65 只升）
4. 变异红验两轮（三要素）：
   - 轮1：Brier 公式 `(p−y)²` → `|p−y|` → **6 条红**：恒50%（0.25→0.5 正中定义锚）、手算混合
     0.225、阈 70 复算、防御、按周聚合、端到端——红全部指向 Brier 计算行为；复原 → 绿。
   - 轮2：`beijingCalendarDateKey` 去掉 `+BEIJING_OFFSET_MS`（B06 陷阱注入）→ **2 条红**：
     「realized 按北京日历键对账（B06 反锚定）」（事件键 2026-10-09→10-08 翻转）与「端到端」——
     正中本卡对账边界；复原 → 域 65/65 + tsc + 全量复绿。
   - 过程注记：开发中测试先行抓到 weekKey 周一回退公式真 bug（getUTCDay 周一=1 直接减 1 天落到
     周日），修正为 (d+6)%7 折算（与 resetCard.hazardWeekday 同式）——测试有效性的事前佐证。

## 脚本冒烟（两轮，node v22.23.1 原生 type-stripping 直载 .ts 链）

- 无 predictions.jsonl：骨架报告 + 指标口径表，exit 0。
- 临时造数（worktree 内 node 脚本 appendFileSync 生成 10 行、验后已删、未提交）：10 计分日 ×
  真实夹具 59 events 对账（3 个实际重置日），总分/分周/可靠性三表全渲染，数值与单测口径一致。

## 待用户清单

无（不涉发布资产/版本号/删除功能；tsconfig 与 import 扩展为工程接线，非协议变更）。

## 排障遗产

- node 直载 .ts 要求 import 链全部显式 .ts 扩展（node ESM 解析硬要求）；新核心模块引用既有模块时
  记得带扩展名，否则 scripts/ 侧直载断裂（D016 已写入两处文件头注释）。
- `git format-patch --stdout` 与 `-o` 互斥——重定向形式备份 patch 即可。

## →下轮

待 MERGE 槽合入；合入后 RR12（循环锚 REVIEW）即有校准报告 artifact 来源。RR10（落盘器）消费
本卡定义的行契约与 joinPredictionsWithResets；RR09 UI 可直接 import calibration。下一班建议：
占 MERGE 合 RR07 → 回 WORK 领 RR08（data-layer 域，与 core 无在飞冲突）。
