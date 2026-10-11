# RR18 done — 历史刷新/新鲜度/事件口径

- 会话S1011-RR18；基线main44f2bba；交付agent/RR18 62d71e1d5f1caa1ae9093076a52ab75f338ffd2a；42路径，+2074/-169（含原字节旧夹具和门禁原文）；patch task_logs/RR18.patch。
- 范围：纯核心7日新鲜度与regular选择；UI唯一VM历史来源元数据；calibrate非法时间不计分、stale顶部标红；log-prediction同口径；REVIEW先采集再报告；真实夹具60/54/6。完整说明docs/history-refresh-20261011.md、D026、04-progress。

## 四绿及追加验证

1. npx tsc --noEmit退出0（空stdout，工具结果）；npm run build内tsc也绿，build.txt。
2. 域src/lib/__tests__+ui.adapters：129/129，domain.txt。
3. 全量147/147，full-restored.txt；Node30/30（scripts/*.test.mjs **及** scripts/tests/*.node.mjs），node-restored.txt。初node-all只覆盖顶层22，不冒称全部；最终命令覆盖8个日志Node用例。
4. 3类变异红验均退出1；mutation-proof.txt原字节恢复SHA和red原文：误把regular改banked→混合筛选用例红；>7改>=7→恰7日fresh用例红；按类型上一条改全局上一条→邻近异类型与交错同类去重两项红。随后全量147/Node30复绿。
- Vite构建成功；cargo build --release --features tauri/custom-protocol成功，release.txt。Rust源码未改，非Rust域；已有GNU重复manifest linker warning保留，与前卡同样退出0。
- REVIEW入口实拉两API，review-refresh.txt；最后fetchedAt=2026-10-11T05:33:27.738Z；60条原始、54regular、6banked，latest04:01:09Z；consumer-live.json有独立常量统计和纯核心结果。
- 生产ownedPID26652实跑，tauri=true，只读CDP风险32.1%、hook=ok；实际后台新采集source/quota都ok，来源05:36:33.524549900Z。日志188→361，旧前缀逐字节保留，旧44行不改，App自然追加32.1，无锁残留；仅关闭owned进程。production-history-verified.json/production-dom-fresh.json。
- 最新calibration-latest归档1+应用2行，全部今日，n=0；无伪造命中率。没有外观重设计，不把DOM证据当参考图UI截图。

## 真值出处

- BACKLOG.md RR18卡面：7日守卫和REVIEW前置采集；docs/review-20261011.md G6；TRUTH§1公开历史API/B07。
- data/resets-history.json:3 fetchedAt；:18 latest_reset；events[].resetType/announcedAt，sources两个原URL。纯核心selectQuotaResetHistory src/lib/history.ts:45、evaluateHistoryFreshness:57、assessHistorySource:73；VM adapters.ts:47,137，UI history.ts:5只接线。
- banked语义继承D022/D024与TRUTH B07回源首页，不计自动额度回满；raw仍完整保留。参考MIT codex-cockpit/src-tauri/src/reset_forecast.rs:8-9,103-132的5分钟窗口，本卡按类型隔离。
- 旧59条夹具采集前Copy-Item原字节，SHA256=D3E54A8F986FC8E0E214DF5D2F4A089AA0EF4FD80E7BA1F1BFD3FD8A27F347D5；risk.core.test.ts:11改读该归档，不改旧golden数字。

## 排障遗产/下轮

- pwsh的rg通配符路径不展开：改为rg目录-g筛选；真正变异红指向行为的原文已复核。
- 来源fresh cache可在后台网络完成前先记预测；探针单独等cache.lastAttemptAt>=owned启动，并-DateKind String保持ISO时区。这个顺序下32.1自然追加属于输入变化，不重写44旧预测。
- 静态历史与实时公告独立，VM已有historySource；RR27展示时不要因为status fresh把旧历史标fresh。REVIEW采集失败不要覆盖上一报告，按退出码决定是否替换。
- RR17仍须审预测目标窗、生成时点与有效回测，禁止把当天事后概率按当天命中；真实样本不足显示缺值。RR27还须修旧UI北京时间格式（本次CDP旧界面05:36标北京，实际为UTC；照图UI统一Intl时区）。
- →下轮RR19（CI Node覆盖）→RR16→RR17→RR28→RR27→RR12有限最终验收。用户授权全部余卡，未push/tag/release，无需用户审批事项。阶段4整体仍未完成。

交付时间：2026-10-11 13:38:55。MERGE结果另追加。

## MERGE闭环追加 2026-10-11 13:40:27

62d71e1→main7e406e032fa044c3f014495b8d45f3ab9a3ba18e；全树git diff agent/RR18 HEAD为0字节；源格式检查排除原文task_logs为0。主仓tsc exit=0（RR18_merge-tsc.txt）、全147、Node30、calibrate n=0皆绿。node_modules已验证Junction及精确主仓target，非递归拆除后主依赖仍在，再git worktree remove；源码无固定RR18 worktree引用。wip验证绝对源/目标后Move-Item至RR18_wip-delivered.md保留历史。agent/RR18保留归档，无force、无push、无发布。主仓额外merge输出保存task_logs/RR18_merge-*。
