# RR47 v3算法与个人输入

- 用户指定桌面v3原文，真值 TRUTH U20261012-v3 / docs/spec-algorithm-v3.md §0–15；新确认用卡双窗回满、周截止+168h由用户规格直接授权。D035解释模型默认与旧架构覆盖，不改协议。
- base 567da49；agent/RR47 b21f651 → main d4d9f17，55文件+5452/-60，源码/脚本/docs树恒等，RR47.patch在位。用户原文含Markdown行尾双空格与尾部空行，原样归档，不为diff check改写设计原文；其余文件diff check绿。
- 四绿：tsc通过、v3及UI域通过、全量47文件421通过；Node41通过；Rust cargo check --tests通过，GNU custom-protocol构建通过。主仓合入复跑tsc/全量。
- 变异：用卡周截止+168h改+24h → D21/E30红；排除text公告 → A1红；日期截止改当天12点 → C14红。均finally复原再绿，docs/v3-mutations-20261012.md有完整输出。
- 新平台P0正式/P1影子，全regular训练、coverage/firstSeen、公告与执行区间独立；账号概率缺数据null；库存/日期/偏好/需求、双窗generation、统一共享世界模拟、预算、冻结日志和09:00分组均接活跃App。
- 回测真实归档54regular/53gap，P0 12.725%，P1 15.717%；周块1024次区间含0且历史无firstSeen，严格不升级P1。新fetch按ID、完整翻页，API游标出处官方https://codex-resets.com/api/openapi.json，改进来源/实测详报告。旧日志target/modelVersion不改。
- v3 §12验收索引：docs/v3-implementation-20261012.md。421是新旧历史语义测试合计，不用旧测试为错误目标辩护。现有runtime完全切v3，旧算法只保留历史兼容。
- 原生：九图双主题Luna读盘复核通过、日期午夜、120点预算当日保存、演示生产journal字节恒等、无横溢。模拟移worker后响应313ms（同步基线5268ms），旧输入终止旧worker防旧结果覆盖。预算仍以共享256路径和原参数计算。
- 本地可运行GNU体验件：主仓release-qa/v3/reset-radar.exe与WebView2Loader.dll；正式GitHub v0.2.0资产不修改，本轮仅实现不发布新版本。
- 已完成本规格的实现和保守降级；真正账号命中/延迟/短窗机制及≥60固定日/≥10正例等升级门槛需要正常观测积累，不补造数据。允许用户后续点单继续新增。
- 排障遗产：demo旧短窗截止null导致双窗缺失，已补明确的演示5h窗口并重拍；源码核查窗口按时长识别，不能只看primary字段。GNUmanifest重复警告沿B08，未吞失败。主仓既有RR12r9.patch/RR45_wip不收编或改写。
- 待用户清单：无阻塞项；样本不足与机制未知是明确学习态，不是假完成统计验证。
