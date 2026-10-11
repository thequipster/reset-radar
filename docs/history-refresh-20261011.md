# RR18 历史刷新与新鲜度

REVIEW 前先运行 `node scripts/review-calibration.mjs > docs/calibration-latest.md`。入口先拉两个真实接口，校验成功并原子替换历史，再运行校准；采集诊断走 stderr，Markdown 走 stdout。采集失败非零退出，不继续校准，不给旧数据盖新时间。脚本失败时保留上一份报告；如需原子更新报告，可先输出到临时文件，确认退出0后再替换正式报告。

本卡不修改 RUNBOOK。上述入口是 §9.1 校准命令的前置采集载体，独立运行 `node scripts/calibrate.mjs` 仍可离线检查现有历史。采集使用4秒请求超时、默认TLS验证；fetchedAt 在两个请求均成功后记录。

## 数据口径

- 原始夹具保留 regular（额度重置）与 banked（发放可主动兑换的卡），同类型5分钟窗口去重；不同类型邻近记录互不吞掉，交错记录也各自去重。
- 风险、脚本预测与校准统一调用 `src/lib/history.ts`，只使用合法 regular 时间。未知类型不猜成额度重置。UI通过 buildDashboard.historySource 获取历史抓取时间、原始/额度重置/排除数量与状态，业务逻辑不落React。
- 新鲜度严格超过7日才 stale，正好7日为 fresh；未来、非法或缺失 fetchedAt 为 invalid。stale 在报告顶部标红，仍只计 fetchedAt 覆盖内已完结日；invalid 不计分，不回退墙钟。日志脚本对 stale 提醒，并保持日期为历史时刻，invalid 不写。
- 实时公告来源与离线历史分别评估，公告有效并不把旧历史标为新鲜。运行时最新确认额度重置仍由既有 resetStatus 核心并入；历史全量滚动采集由REVIEW入口完成。

## 本轮真实证据

`data/resets-history.json` 由入口实际生成：fetchedAt=2026-10-11T05:33:27.738Z；60条原始记录，54条regular、6条banked；最新regular为2026-10-11T04:01:09Z，id=2109132167112782291。regular北京星期Sun..Sat计数为[10,4,10,10,7,5,8]。参见 task_logs/RR18_artifacts/review-refresh.txt 与 consumer-live.json。

RR03旧夹具在采集前原字节复制至 `src/lib/__tests__/fixtures/resets-history-20261010.json`，SHA256=D3E54A8F986FC8E0E214DF5D2F4A089AA0EF4FD80E7BA1F1BFD3FD8A27F347D5。旧风险golden仍验证历史算法；当前生产消费者另测regular筛选，更新真实数据不需要改旧golden数值。

刷新时实际归档与应用日志各1行；生产验证后应用按既有变化阈值自然追加32.1一行，44的旧预测原字节保留。均属今日，今日未完结，实际校准n=0，各项指标显示缺值。不能用今日事后预测冒充昨日有效样本。预测目标与观测窗进一步核对由RR17处理，校准显示由RR28/RR27处理。

## 验证与借鉴

tsc、核心与adapter域129项、全量147项、Node30项通过；7日边界、误纳banked、交错去重三个变异均红，原字节恢复后全量复绿。Vite及GNU custom-protocol release成功；ownedPID26652只读CDP看到32.1%、hook=ok，真实新采集05:36:33.524549900Z；日志188→361字节，旧前缀不变，无锁残留，进程已关闭。证据production-history-verified.json与production-dom-fresh.json。风险因子算法未改。

采集清洗的5分钟容差与去重窗口沿MIT参考 `codex-cockpit/src-tauri/src/reset_forecast.rs:8-9,103-132`，本卡在事件类型之间隔离窗口；banked语义回源codex-resets.com首页与原APIreset_type字段，原始证据锚点TRUTH B07及D022/D024。本卡7日守卫来自BACKLOG RR18。
