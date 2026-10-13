# RR53 done — 规划worker内存修复

- 会话S1013-oom-fix；实际base main e7c389b，源码commit 77f71ad（7文件+139/-27）；用户本轮明确修复OOM与顺带问题，不push、不改版本/协议/License。
- 根因实证：原规划同时保留全部世界及完整基线轨迹。before.mjs为base源码独立bundle，36供给情景/3费率/4机制/6需求档的原算法在128MB和2048MB堆上限均OOM。未亲读原Crashpad，不将用户转述2558MB当本卡实测。
- 修复：按情景处理256共享路径与配对基线、汇总后释放；规划及策略内预评估不记录未消费的trajectory（默认详细模拟仍完整）；worker成功/错误后立即terminate，取消后迟到结果不覆盖新输入。全部情景/费率/机制/路径数/种子/模型版本/视野保留。
- 四绿：tsc0；域4文件31测试；全量57文件492测试0failed；三变异恢复后全量492复绿。Node41、前端生产构建、GNU release --features tauri/custom-protocol通过；Rust源码未改。
- 变异红验：①恢复base planning.ts全世界保留→planning.memory.test.ts受限堆子进程V8 OOM，status非0断言红；②去掉recordTrajectory条件→planning.v3.test.ts摘要与详细结果只差轨迹的断言红；③删完成时terminate→ui.planning-worker.test.ts成功/消息错误/运行错误三项红。均finally按原字节恢复，日志mutation-{memory,trajectory,worker}.txt。
- 恒等证据：修复前4组完整JSON（默认/经验手填压力/用卡到期/显式短窗省卡）与修复后完全相同；SHA256冻结在planning.memory.test.ts。data夹具/用户生产数据不改，golden.json是全新合成验收输出。
- 内存证据：同规模12轮128MB堆限制，无显式GC，Node RSS108–115MB。原生隔离identifier/profile执行生产worker资产8次分钟刷新，7分32秒，18.3–24.5秒/轮，renderer存活、4432次100ms心跳、0错误；采样renderer峰值582MB，完成后95–189MB，主线程终点堆29MB。不是对无限运行的保证，不把Node堆限当桌面进程RSS。
- 证据出处：TRUTH §U U20261013-oom（本轮用户修复授权+实测）、U20261012-v3/v31；docs/spec-algorithm-v3.md:608（256共享路径），D035/D037/D038/D040；原base src/lib/v3/planning.ts:151-161（world/baseline保留），simulator.ts:112（trajectory）；修复src/ui/useV3Planning.ts:9（完成释放）。新借鉴代码：无。
- 产物task_logs/RR53_artifacts/；报告docs/planning-memory-20261013.md；生产包release-qa/reset-radar-v31-RR53.zip（EXE/DLL/中文说明）。EXE SHA256 55139A03B5B47F0E9A46CBECB11C7F58E308997AAEF71E09DC2ACDEE948238AD。
- 待用户：无阻塞；安装体验包时退出旧版后打开新版。排障遗产：隔离QA目录带Encrypted，rename探针EXDEV是测试目录文件系统限制，生产目录未带Encrypted且时间/大小未变；不据此修改快照协议。自有QA进程测试完已关闭，用户实例/数据未动。
- →下轮：无本卡未完功能。长期真实账号数据仍按原机制自然积累。

- 本地合入：main a0b074d/c69c7ee；源码、TRUTH、决策、报告与交付档及验收历史对分支a422528树恒等（git diff 0字节）。验收历史先追加收编d5d5018，避免未跟踪文件覆盖；main复验tsc0/57文件492全量0failed。生产包ZIP内部EXE哈希核验一致，originalIdentifier=true、qaIdentifier=false；zip哈希及检查在package-*.txt。临时worktree安全拆除，依赖主仓仍在，分支archive/RR53-merged-c69c7ee；wip原样归档RR53_progress.md。未push。2026-10-13 21:40:57 +08:00
