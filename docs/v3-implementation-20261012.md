# v3 实现与验收

依据：用户桌面原文原样归档为 [spec-algorithm-v3.md](spec-algorithm-v3.md)。这是一轮实现，不把设计文档上一轮“不改实现”的交付说明当成本轮禁令。

## 运行链路

`App → v3Model → inputs/platform/supply/observations/demand/simulator/planning/journal`。运行界面不再调用 v2 的风险、配速或用卡函数。旧模块仅为历史日志/旧版本验收保留，不重命名旧 target，不将旧成绩当作 v3 结果。

- P0 全部 regular 公告训练，P1 影子；54 条 / 53 间隔实际回测见 [v3-platform-backtest-20261012.md](v3-platform-backtest-20261012.md)。历史缺 firstSeen，明确标记理想化；账号平台补给概率在缺成熟映射证据时为 null。
- 周/短窗分开；用卡双窗回满且周截止+168h，旧截止失效；短窗重锚及未来自然续接分别作为未知机制。
- 日期/精确时间、库存对账、占位未知卡、查看时段、临期提醒、反馈与版本均可录入。日期截止为北京零点，默认30分钟操作缓冲；未知查看时段不保证未来操作机会。
- 工作量只影响当日；偏好可改。无需求数据预算为 null；手填预算0.5/1/2压力分开，不平均成概率。完整周需求日不被短窗重置误判无效。
- 统一模拟比较实际需求服务；按周需求及权重分预算。所有策略共享世界和绝对终点，策略只接收当前状态与独立预测，不接收未来实际路径。
- 21/28共同视野复算，反转继续35/42；仍反转作条件建议。对未知机制的情景保留未到账路径，不为减少过期空打卡。长期卡不虚构14天截止，不输出全局最优/最佳日伪精度。
- 快照、信号版本、P0/P1/A/需求预测及规划只追加。09:00运行时的每个target/model首条独立主组，其他临时组；没有运行的日子不回补。

## 验收索引

| v3 §12 | 主要证据 |
|---|---|
| A1–8 平台历史/边界/去重/年龄/冻结 | platform.v3.test.ts、ui.v3-model.test.ts、fetch-history.test.mjs；firstSeen与coverage校验 |
| B9–13 排期/观测/标签 | supply.v3.test.ts、supply.mapping-v3.test.ts、journal.v3.test.ts、simulation.v3.test.ts；执行区间与公告时间独立 |
| C14–20 卡截止/库存/版本 | cards.v3.test.ts、ui.v3-model.test.ts；原生日期输入=北京00:00 |
| D21–27 状态转换/双窗/多卡/策略可见性 | simulation.v3.test.ts、planning.v3.test.ts；共享路径、generation、过期和操作时刻 |
| E28–30 80/70/160/100手算反例 | simulation.v3.test.ts，严格核对实际服务，不把补入量当收益 |
| F31–36 需求/解释/未知/泄漏 | demand.v3.test.ts、observations.v3.test.ts、journal.v3.test.ts、planning.v3.test.ts、ui.v3-model.test.ts |

这是语义覆盖索引，不将每项原文机械等同于一条测试。数据不足和观测升级部分严格保留学习态，不能通过人为造日耗或标签“完成”统计门槛。

## 自动化与视觉

- 门禁输出：[v3-tests-20261012.txt](v3-tests-20261012.txt)、[v3-node-20261012.txt](v3-node-20261012.txt)、[v3-rust-20261012.txt](v3-rust-20261012.txt)、[v3-build-20261012.txt](v3-build-20261012.txt)。
- 三处真实变异（周截止+24h、排除text公告、日期截止改中午）均 RED 后恢复 GREEN：[v3-mutations-20261012.md](v3-mutations-20261012.md)。
- 原生检查：[v3-native-20261012.txt](v3-native-20261012.txt)。双主题四页及输入截图保存在 screenshots/20261012-rr47-*.png，Luna读取磁盘复核；未发现裁切或目标混淆，长台账在独立滚动区可达。深色滚动条已主题化。

## 数据边界

没有足够真实观测就保持 null/条件建议。未知平台命中、公告执行延迟、短窗重锚和更远续接需要后续正常使用积累；不会要求用户额外消耗卡。卡台账“记录已使用”只记用户已执行的动作并立即刷新，不自动替用户消费真实卡。

最后原生预算验收：120点手填预算可录入；256共享路径计算移至模块worker，界面响应313ms（同步基线5268ms），过时输入终止旧worker。纯模型结果和参数不变。
