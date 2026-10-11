# RR15交付：生产预测自动落盘与日志汇流

- S1011-RR15；基线main1f67601，agent/RR15单commit a24616534f26e117e29fbeb89505fdeebca1847c；52文件+1413/-57。Luna写scripts四文件，主会话复审、补充文件安全/参数/错误测试及业务/Rust/React接线。
- 生产文件=app_config_dir/predictions.jsonl（Windows APPDATA/app.resetradar.desktop）。统一VM生成纯核心候选，真实风险评估自动触发IO；风险来源新鲜时额度失败不影响记录，旧契约stale与过期/失败风险来源不冒充新预测。浏览器demo不写。
- 既有TS appendPredictionLog每日首条/漂移>0.5唯一实现；Rust只结构校验、读、跨进程文件锁、expectedContent CAS与append/sync。并发重读重算，有限重试；旧字节/坏行保留。Node共用同名锁及核心，失败不假装空日志。
- log-prediction默认写生产文件；calibrate默认双源合并按实际fetchedAt稳定排序；--path可独立指定文件，未知/重复参数拒绝。没有自动改写归档历史。

## 四绿、Rust与实跑证据

- npx tsc --noEmit exit0；域src/lib+src/data+新增VM测试118/118；全量137/137（125+12），0failed。
- node --test scripts/tests/prediction-log.node.mjs最终8/8；cargo check --tests exit0；cargo test --lib 29passed/0failed/1手动TLS默认ignored。npm run build和GNU release --features tauri/custom-protocol绿；B08既有多manifest链接warning，CC/DPI哨兵仍绿。
- 变异①把评估日换成执行日→跨北京零点日期断言红1；②回退为额度失败即阻止有效风险→核心+VM独立性红2；③跳过Rust CAS→重复追加断言红1；④生产identifier改错→Node路径契约红1。每次finally原字节恢复，域/全量/Rust/Node复绿。
- 已有文件不存在后，真实app自动创建首条：date2026-10-11、risk44、执行05:17:20.742Z；CDP只读DOM状态ok且Tauri=true，未调用写入命令造数据。production-log-first-verified.json与production-dom-first.json。
- 重启同分数不重复，最终release ownedPID31512于05:21:45Z启动、新采集source=ok；刷新前后CDP hook=ok，188bytes→188bytes完全相同且.lock释放。production-verified-idempotent.json；只停止本轮自有进程，不改其他应用。
- 脚本实读：calibration-dual-source.md（仓内1行+应用1行），calibration-runtime-only.md（仅应用1行）；今日未完结，n=0，指标空值而非假满分。
- 源码git diff --check绿（排除task_logs原始输出）；Node TAP变异断言自带两行尾空格，原输出保留，不修写证据文件。

## 真值出处

- ARCHITECTURE §2/§4，D004/D019/D025；RR15卡面。原卡修向D020编号已被DPI事项占用，路径裁决顺延D025，未修改历史。
- 本仓tauri.conf.json:5 identifier；lib.rs setup app_config_dir；Tauri2.12.2安装源码src/path/desktop.rs:239及官方https://v2.tauri.app/reference/javascript/api/namespacepath/#appconfigdir；Windows实际运行路径证明。mac/Linux仅路径分支单测。
- src/lib/predictions.ts:99 buildPredictionRecord、既有appendPredictionLog（D019 0.5）；src/ui/adapters.ts:132唯一VM候选；src/data/predictionLog.ts:14编排；usePredictionLog.ts:16真实IO触发；Rust predictions.rs:14/16/36固定路径/读/CAS，lib.rs新命令。
- scripts/prediction-files.mjs:7/17/40/82路径/读取/锁，scripts/calibrate/log薄壳；本卡不引入第二风险算法，既有MIT借鉴仍沿原src/lib模块出处，新增IO为本项目自写。

## 排障与后续

- 首次变异输出打印被Python GBK编码拒绝，但finally已恢复；保留ts-mutant-red.txt后用UTF-8完整重做ts-mutant-red-verified.txt。不是残留坏码。
- pwsh7.5 ConvertFrom-Json默认会把ISO转换成DateTime，再Parse会丢原时区；生产探针改-DateKind String。新鲜来源缓存可先完成风险记录，必须另等后台采集lastAttemptAt更新后判断刷新成功，不能只看第一次DOM观察。早观察探针产物保留，并有最终成功证据。
- 异常退出可能留.lock，含PID/createdAt便于确认持有者；不擅自删未知锁，明确报busy/error。RR27须呈现hook返回的写入失败状态。
- 本卡没有视觉重构，无新视觉截图；历史regular/banked与新鲜度交RR18，脚本CI RR19，watch RR16，自动回测RR17、只读桥RR28、参考图UI RR27与最终验收均仍必做。完整项目目标保持active。
- patch原字节备份RR15.patch；无push/force/发布，数据夹具与仓内预测原字节未改。本轮生产记录自然新增，仅证据副本归档。

格式口径勘正：源码检查实际使用git -c core.whitespace=-blank-at-eof diff HEAD^ HEAD --check并排除task_logs原始输出，退出0；默认规则会提示Luna helper末尾空行，该空行不属于功能门禁。保留原始TAP输出的尾空格，未篡改证据。

MERGE预审补记：在主仓对RR15正确范围执行git -c core.whitespace=-blank-at-eof diff 1f67601 agent/RR15 --check（排除task_logs），exit0；前一条HEAD^..HEAD在主仓是RR23范围，不能作RR15证据，以本条正确范围为准。工作树干净、52路径、patch适用、基线相同。

## 合入补记 2026-10-11 13:25:31

a246165→main44f2bba84262d7536991f97e509701fe3cc682ec，52路径及全树diff0。主仓tsc/137tests/Node8/cargo check --tests/calibrate全部退出0，输出RR15_merge/及RR15_merge-cargo-check.txt。工作树安全先验证/非递归拆node_modules junction再移除，主仓vitest依赖在位；分支保留归档，wip已移到RR15_wip-delivered.md，历史证据不删。LIGHT/MERGE释放，本会话按一次一卡收工。下一RR18及后续校准/UI仍属活动总目标，无push/force/发布。
