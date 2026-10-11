# 运行时重置公告契约（RR23）

数据路径：`codex-resets.com/api/v1/status` → Rust `reset_status` → `ProviderSnapshot.resetStatus` → `buildDashboard` → `DashboardViewModel.resetStatus`。公告采集与额度采集并行，失败互不抹掉另一来源。

## 采集与持久化

- reqwest 0.12.28，rustls TLS与系统代理；版本配置借鉴MIT codex-cockpit `src-tauri/Cargo.toml:25`。TLS不做忽略证书/主机名验证的降级。
- 请求总超时4秒，参考`src-tauri/src/reset_forecast.rs:334`；15分钟缓存期来自BACKLOG RR23，额度仍保持既有5分钟后台刷新。
- 数据层输出`fetchedAt`（最近成功时刻）、`lastAttemptAt`、`generatedAt`（上游原文）及`freshUntil`（成功时刻+轮询周期）。核心比较来源提供的有效期，不重复定义轮询常数。
- 成功`scheduled_reset:null`会清除旧计划；缺字段/坏JSON/坏形状是采集失败，不能假装“没有公告”。
- 失败保留上次成功的数据/时间并标`status:error`和消息；第一次失败时间与成功时刻不会混用。失败按相同轮询期重试，手动“刷新额度”不承诺强制重拉公告。
- 复用`last-snapshots.json`落盘。旧快照缺resetStatus可读；热启动先显示来源真实时刻，服务首刷立即联网，不把磁盘缓存年龄换成新鲜的单调时钟。

## 快照字段

| 字段 | 语义 |
|---|---|
| scheduledReset | nullable；id/status/resetType/announcedAt/scheduledFor/text/source；上游snake_case适配到camelCase，公告来源原文保留 |
| activeWatch / latestReset | nullable原始JSON对象，不猜测缺字段/概率；最新事件用于风险输入时按时间戳去重，只接受regular自动回满类型 |
| fetchedAt / generatedAt / freshUntil | nullable，来源成功时间/上游生成时刻/采集有效期 |
| lastAttemptAt / status / message | 本次尝试时刻、ok/error、错误说明 |

## VM与核心边界

- 核心`evaluateResetStatus`返回ok/stale/error，失败与过期仍可展示旧公告，`actionableReset`为null。精确freshUntil边界即过期；未来成功时刻/非法时效不可用于行动。
- 当前有效来源的公告与已确认事件在当前评估时刻计算，`riskEvaluatedAt`单独传出，额度`observedAt`保持原义；公告不被冻结在旧额度观测时间。
- 日建议和卡收益仅接核心给出的actionableReset，全部业务公式仍在src/lib；适配层只装配输入和做单位换算。
- valid计划采用RR22情景策略；计划时刻已过显示awaiting-confirmation，不能声称已回满；失败/过期停止继续清仓。
- `activeWatch`本卡只原样透传，RR16负责接既有tracker-watch因子并做校准对比。UI层不新增第二套概率算法。
- 缺整个来源字段时保持旧风险/规划golden；生产来源一旦存在，按当前时间判断自然窗口是否已过期。

## 后续消费

RR27据VM显示公告来源/时间/状态；来源抓取失败与额度状态可同时存在。RR15预测记录须使用明确的风险评估时间；RR18刷新离线历史，并按regular/banked区别核对历史消费者，防止发卡记录被误当自动重置。

## 验证记录

编译、Rust单元测试、真实TLS请求与生产落盘实证见主仓`task_logs/RR23_done.md`及RR23_artifacts。本文不把尚未执行的验证记作通过。

reqwest超时与构造失败语义回源：[ClientBuilder官方文档](https://docs.rs/reqwest/0.12.28/reqwest/struct.ClientBuilder.html)。公开API事实源见TRUTH B07；实际响应以本轮采集产物为准，不使用搜索索引的旧计划。
