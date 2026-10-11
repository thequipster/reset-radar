# RR10 done — core+data-layer：predictions.jsonl 每日预测落盘（幂等追加）

- 领卡：2026-10-11 07:56 S1011-0743（LIGHT；本会话前段 MERGE RR09→main 0bbd62c 树恒等✅）
- 分支：agent/RR10 @ **d35bc8b**（2 commits：c78e462 代码 + d35bc8b D019；基于 main 0bbd62c；
  patch 备份 task_logs/RR10.patch，git apply --check 对 main 干净适用✅）
- diffstat：6 文件 +288/-1（src/lib/predictions.ts 新 96 行 + 域测试 13 条 127 行 +
  scripts/log-prediction.mjs 61 行 + data/predictions.jsonl 首行 + index.ts/package.json 接线）

## 交付内容

1. **src/lib/predictions.ts**（core 纯函数，幂等单一源）：
   `appendPredictionLog(existing, candidate, threshold=0.5)`——同日无行→追加
   （first-of-day）/同日 |Δ|>阈值→补行（risk-drift）/否则抑制（suppressed-noise）；
   坏行原样保留不参与判断（与 calibrate.mjs 坏行跳过同口径）；输入不被修改
   `digestFactors`：`id=delta` 逗号连接（delta 1 位小数=UI 展示口径）；`predictionDateKey`：
   北京日历键（D004 复用 resetCard.beijingCalendarDateKey）；行 schema=卡面四字段
   {date, predictedRisk, factorsDigest, fetchedAt}
2. **scripts/log-prediction.mjs**（落盘器薄壳零算法）：读 data/resets-history.json →
   assessResetRisk(announcedAt, as_of=夹具 fetchedAt) → appendPredictionLog 判定 →
   appendFileSync 只追加（单一序列化源取自 outcome 行）；npm run log-prediction 接线
3. **data/predictions.jsonl 首行**（落盘器生成，数据锁合规：只由脚本追加）：
   `{"date":"2026-10-11","predictedRisk":24.5,"factorsDigest":"base=10,interval-hazard=3.8,
   recent-regime=12,weekday-empirical=-1.2","fetchedAt":"2026-10-10T23:49:40.729Z"}`
4. **docs/DECISIONS.md D019**：阈值 0.5 依据（risk.ts round1 显示精度下界）+ 落盘器走
   脚本不走 app 的裁决（%APPDATA% 与校准读取断链；app 内落盘留 REVIEW 立卡）
5. index.ts 导出 predictions 模块（核心层五模块齐备）

## 真值出处

- 行 schema 与幂等规则 = BACKLOG RR10 卡面修向原文（{date, predictedRisk, factorsDigest,
  fetchedAt}；同日仅变化超阈值补行；只追加不修改）
- date 边界 = D004 北京零点（beijingCalendarDateKey，resetCard.ts 导出，RR06 移植链）
- risk 值 = assessResetRisk（src/lib/risk.ts，RR04，常量出处 rs 行号链）；as_of=夹具
  fetchedAt 口径与 scripts/calibrate.mjs 同源（RR07 done）
- 消费端契约 = calibration.ts PredictionLogRow + calibrate.mjs readPredictionRows
  （date/predictedRisk 必需，factorsDigest 额外字段被消费端容忍忽略）
- 交叉验证：落盘首行 predictedRisk=24.5 与 RR04 真实夹具 golden 24.5 逐位一致
  （同夹具同 as_of，risk 实现端到端复核）

## 门禁四绿

- ① tsc --noEmit ✅（worktree agent/RR10，复验两轮）
- ② 域测试 `npx vitest run src/lib/__tests__/predictions.core.test.ts` 13/13 ✅
  （幂等四态/边界恰等/跨日/同日末行比较/坏行防御/纯函数/摘要稳定与顺序敏感/北京日键
  跨 UTC 边界/阈值显式覆盖）
- ③ 全量 `npx vitest run` 86/86 0 failed ✅（基线 73→86 只升）
- ④ 变异红验两轮 ✅（三要素）：
  - A 改了什么：阈值比较 `> threshold` → `>= threshold`；哪条红：`边界：同日漂移恰等
    阈值 0.5 → 抑制`（1 条）；红在哪：期望抑制（appended=false），变异后恰等也补行
  - B 改了什么：predictionDateKey 换源 `beijingCalendarDateKey` → UTC 日键
    `toISOString().slice(0,10)`；哪条红：`UTC 15:30 → 当日；UTC 17:30 → 次日`（1 条）；
    红在哪：17:30Z（北京次日 01:30）期望 2026-10-12，UTC 换源后得 2026-10-11
  - 两轮均 git checkout 复原 → 域测试 13/13 再绿 ✅
- 落盘器冒烟两跑：第1跑 first-of-day 追加✅；第2跑 suppressed-noise 不追加✅（幂等实证，
  文件保持 1 行）
- Rust 门不适用（本卡未动 src-tauri/——D019 裁决落盘器走脚本）

## 待用户清单

- 无（无删除功能/License/协议事项）

## 排障遗产

- 无新坑（node 直载 .ts import 链 predictions.ts→resetCard.ts/risk.ts 全通，D016 口径复验）
- 注：建 node_modules junction 时 cmd mklink 在 Git Bash 下参数仍被吃（B09 的正斜杠法
  也不行），改用 pwsh New-Item -ItemType Junction 成功——后续班可直接用 pwsh 法

## →下轮

- MERGE：占槽 cherry-pick d35bc8b 两 commit（patch 对 main 干净适用已验证）
- 校准闭环已通：predictions.jsonl 有首行后 `npm run calibrate` 报告自动出指标
  （但 n=0 可计分日——首个北京日 2026-10-11 未完结，属预期；样本积累靠每日跑
  npm run log-prediction）
- app 内每日评估自动落盘（写路径汇流问题）留 REVIEW 立卡定夺（D019 ③）
- RR09 遗留仍在：展开态截图 + 胶囊溢出 420px 立修卡（REVIEW 拍取材）
