# RR19 done — Node脚本CI覆盖

- S1011-RR19；base7e406e0；agent/RR19 3edf240185c1a78b527be9e0ecc56efdae666d75；30路径，+1038/-3；patch RR19.patch。
- CI和release构建加入npm run test:node；入口递归scripts的.test.mjs/.node.mjs绝对文件列表，当前5文件34测试；包括嵌套预测日志测试，空列表/子进程错误/失败不假绿。Vitest exclude保持原样，两版本0.1.0保持一致，依赖与lockfile不变。

## 四绿与额外检查

1. tsc退出0，RR19_artifacts/tsc.txt。
2. 核心域119/119，domain.txt；本卡新增Node入口4项行为域，全Node34/34，node-restored.txt。
3. 全量Vitest147/147，full.txt；CI 6run结构、release 11步/4action结构与actionlint1.7.12两YAML退出0；ci-restored/release-restored/actionlint.txt。版本/README13链接绿，versions-links.txt。
4. 变异：删CI Node步骤→结构序列及必跑守卫红；release加continue-on-error:true→发布阻断守卫红；去掉.node.mjs发现→嵌套清单用例红；返回0吞退出码→退出码7透传与真实失败进程两项红。均exit1，原字节恢复SHA在mutation-proof.txt；复跑结构/Node34/全147绿。
- 无Rust/业务/视觉改动，无需重复生产release或截图；真实Node失败夹具只在校验过绝对路径的临时测试目录创建并清理。

## 出处与限制

- BACKLOG RR19、review-20261011 G7；原RR02 ci.yml与RR11 release.yml（MIT参考codex-cockpit/.github/workflows/release.yml的pin与构建顺序）；D013是Vitest scripts/**排除依据；D027记录统一入口与发布路径同步理由。
- 原脚本scripts/fetch-history.test.mjs及scripts/tests/prediction-log.node.mjs证明嵌套遗漏；新runner discoverNodeTests:10、runNodeTests:30，CI/release Script tests步骤；check-ci.py EXPECT_RUNS与node_tests/check-release-wf.py node_tests为结构守卫。
- Node官方CLI --test与Node24 TS文档链接已登记TRUTH§1及docs/ci-node-20261011.md。实际本机v22.23.1，node-inventory.json；Luna交接文案的“Node24套件”是配置称谓，不是本机实测版本，以该产物为准。
- GitHub runner未执行；仅本地同入口测试与YAML/结构语法验证，不称远端CI绿。没有push/tag/Release，发布仍留用户。

## 遗产/下轮

- BOARD有[时间]在飞模板，槽检查必须只看真实时间戳。最初检查误中模板，已修；只创建worktree未改源码，随后完成领卡。
- Python本机stdout默认编码非UTF8，门禁产物采集须PYTHONIOENCODING=utf-8；actionlint在AppData/Local/Temp/actionlint/al_extracted/actionlint.exe，勿重复下载。
- 新增脚本Node测试应沿.test.mjs或.node.mjs命名；同入口递归覆盖，Vitest不误载。README其它功能介绍待RR27/final audit统一更新。
- →RR16 watch联通与比较→RR17观测窗回测→RR28摘要桥接→RR27六图UI→RR12有限总验收；整体goal继续。无人审批事项。

交付2026-10-11 13:47:17；MERGE结果追加。

## MERGE闭环追加 2026-10-11 13:48:23

3edf240→main17fc22ca9647454e5003f07982b0458096248f9c；全树diff为0，30路径恒等。主仓tsc/147TS/34Node/CI与release结构/actionlint/版本13链接全绿，原文task_logs/RR19_merge-*。验证工作树绝对路径与无活引用，node_modules为精确主仓Junction，先非递归拆再git worktree remove，主仓依赖完整；wip验证两绝对路径后移档RR19_wip-delivered.md，branch归档保留。未push/force/发布。
