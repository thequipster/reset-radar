# RR22 done — 公告计划感知核心与参考图归档

- S1011-design4；2026-10-11；agent/RR22 @ c8321dc2f37e78a6b98dad7cb9e02743f5650278。
- base main bca3ba4；27文件 +664/-10（含6张用户参考图原字节）；patch task_logs/RR22.patch 11965699字节，原字节subprocess导出。
- 本轮先MERGE RR21→0fe0159、RR26→bca3ba4，涉及路径树恒等；main tsc/93vitest/文档验收/cargo check --tests退出0。RR24/RR25由RR26覆盖闭环。

## 实现与边界
- 新src/lib/scheduledReset.ts纯契约，status=scheduled、有效时间、已发布为前提；future为planned，到计划时刻只标awaiting-confirmation；regular参与周额度配速，banked/未知类型只展示。
- risk保持统计score，独立公告状态及0百分点说明；watch现有25%因子原样复用，没有重复算法。按D022修正旧RR22卡面“确定性覆盖”：第三方计划没有校准可靠性，不伪造成100%概率。
- daily可按公告缩短horizon，同日2h将均匀份额前拉到剩余全部，但仍保留软上限/风险²与今日追加口径。无公告/取消/无效输出逐字段不变。
- card按计划时刻截断情景收益，精确截断当日概率质量与消耗；北京零点边界保留所有计划前候选，排除计划之后。自然重置时间仍是原窗口时间，24h/48h统计碰撞概率不伪装成必然。planningResetAt标记情景，新增hold-until-scheduled-reset及中文映射。
- 本卡核心无IO；生产运行时采集及adapter接线由RR23执行，当前UI不冒称已消费公告。视觉还原RR27、校准只读桥接RR28均正式立卡。未改Rust/版本/真实数据夹具。
- 参考图六文件复制至本卡ref且SHA256与RR26原图一致；Luna读盘选择展开/compact主参考，其余补peek/theme/state/component。对应与误导纠偏见docs/design/04-progress.md。

## 门禁四绿与变异
- npx tsc --noEmit exit0，tsc.txt。
- 核心域93/93，含新公告15；vitest-core-green.txt / restored-core-green.txt。
- 全量108/108，0failed，原93+新增15；vitest-full.txt。
- 变异A：upcomingQuotaResetAt的planned条件→awaiting-confirmation；红6条，2h建议29误退5.7、到期清仓及候选边界被捕获；mutant-future-red.txt。scheduledReset.core.test.ts:54/:89等；exit1，原字节恢复后15/15。
- 变异B：evaluateUseDay.firstEnd关闭truncateAtPlan，放任收益算到次日结束；跨北京零点收益上限断言:161红1条，exit1；mutant-card-boundary-red.txt。原字节恢复后核心93/93。
- Git staged校验：源码无空白问题，原样stdout记录保留尾部空行，使用git -c core.whitespace=-blank-at-eof diff --cached --check通过；没有删改历史输出。
- 无Rust改动，不新增cargo门。没有外观重构，不新增应用实跑截图；ref是用户图稿，不是验收截图。

## 真值出处与借鉴
- TRUTH B07、§U用户阶段4指令与02-spec:192-194计划/模型分列。
- B07实时回源 status-live.json：meta.generated_at=2026-10-11T04:33:44.170Z；scheduled_reset/active_watch均null，latest_reset regular时间04:01:09Z。旧卡面公告不能当当前实况；源记录source-notes.md。
- https://codex-resets.com/ 首页banked需主动兑换的解释，source-notes；API字段登记在主仓BACKLOG RR22。
- scheduledReset.ts:1-46定义契约；risk.ts:164-181公告状态；planner.ts:59-64 horizon/:99-110解释；resetCard.ts:208-224精确截止/:256-279候选/:309-338情景标记。
- MIT codex-cockpit原有算法出处保留源码注释：src/lib/dynamicQuota.ts配速，src/lib/resetCard.ts增量收益，src-tauri/src/reset_forecast.rs watch25%权重。本轮新增公告边界，未复制第二份业务算法。
- 用户六图保留原名，SHA256在reference-sha256.json；Luna识图与简单测试执行，主会话契约/核心实现/门禁/合入。

## →下轮
- RR23运行时/status采集、TLS/超时/来源新鲜度、nullable snapshot、adapter接线；公告评估时间不可冻结在旧额度observedAt，区分来源时刻。
- 此后RR15→RR18→RR19→RR16→RR17→RR28→RR27→RR12验收；全部stage4仍未完成。
- 用户无需再次确认参考图；原RR26未跟踪图保留，RR22版本化后也不强拆含junction工作树。不push。

## MERGE与收工追加（2026-10-11 12:44:16）
- c8321dc→main1142551dc8a0657090978f77e4000005d2bcb15b；27路径diff0；主仓tsc退出0，全量108/108与RR26设计验收通过。
- RR22工作树已安全拆；RR21 git已注销但空目录句柄占用暂留。先验证junction目标后Directory.Delete非递归拆链接，main/typescript/package.json完整；不用force清空壳，分支保留归档。RR26仍有用户原图未跟踪，继续保留；参考图另已版本化到main。
- 一次会话一卡：本轮RR22及MERGE批闭环，收工释放槽；后续RR23等仍需执行，完整UI和总完成报告未完成。

