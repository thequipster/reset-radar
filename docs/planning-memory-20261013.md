# RR53 规划worker内存修复（2026-10-13）

用户报告迷你圆冻结，renderer V8 OOM。本轮独立复核源码并复现资源耗尽，没有读取原Crashpad dump，也不把用户转述的09:34/2558MB当成本轮实测。

原实现把每个供给情景×背景费率×机制×需求档的世界和基线模拟结果同时保留；每条基线又携带完整trajectory与terminal。36个供给情景（18个带背景）、3费率、4机制、6默认需求档会产生1728个指标组，其中背景世界331776条，21/28天至少各跑一轮。直接保留这些中间结果在Node V8 2048MB限制下也耗尽内存（before-golden.txt），128MB限制更在约0.6秒失败（before-memory.txt）。这些是合成压力输入，不是用户实际事件发生率或测量结果。

改为按单个指标情景计算所有候选，共享该情景的256条世界和基线，汇总后释放；永久保留的只有原有输出指标。规划不消费详细轨迹，因此显式关闭轨迹记录，保留动作、状态、缺口、到期与收益，模拟器默认轨迹接口保持兼容。worker计算成功/失败后立即退出，取消后迟到消息不写状态。

保留全部供给情景、D60低中高费率、4机制、低中高需求/日内形状、256路径、种子/模型版本、21/28/35/42视野和词典序选择；没有以删功能或改算法来压内存。

验证：
- 修复前独立bundle与修复后四组完整输出（默认、经验需求手填压力、到期用卡、显式短窗/省卡偏好）全部恒等；完整输出冻结SHA256见planning.memory.test.ts。
- 36供给情景的全部1728组指标，在128MB堆子进程内完成21/28日计算；12轮连续运行，没有手动GC，进程RSS108–115MB，V8已用堆约9–44MB，耗时约23–32秒/轮。
- tsc通过；域31测试通过；全量57文件492测试通过；Node41测试通过；生产前端及GNU custom-protocol桌面构建通过。
- 三次真实变异：恢复原planning→受限堆测试OOM红；强制记录trajectory→摘要等价断言红；删除完成时terminate→worker成功/错误三项红；均按原字节恢复，全量492复绿。
- 原生QA使用独立identifier app.resetradar.rr53.qa、独立WebView profile、禁用真实quota CLI，执行同一生产worker资产的8次每分钟压力刷新；详细结果见末尾实测补记。

证据：task_logs/RR53_artifacts/。出处：TRUTH U20261013-oom、用户v3规格§9.8（docs/spec-algorithm-v3.md:608）、D035/D037/D038；实现位置src/lib/v3/planning.ts、simulator.ts、src/ui/useV3Planning.ts。未借用新的参考实现代码。

原生实测补记：8次每分钟独立worker刷新全部通过，451901ms（约7分32秒）内页面100ms计时器推进4432次，renderer未退出；每轮18.3–24.5秒，1728组指标及21/28日视野一致。renderer采样RSS峰值581582848字节，worker完成后的RSS94916608–189247488字节；最后主线程V8已用堆29137120字节。WebView未人为限制堆，因此不能把Node的108–115MB当作实际桌面内存；关键是单轮中间对象/worker释放，避免跨轮累积到OOM。压力模型为合成输入，测试未冒充真实额度采集成功。隔离QA目录的Encrypted/EXDEV文件系统限制见qa-environment-note.txt，原生产目录不受影响。本卡没有改Rust采集/快照协议。

交付包：release-qa/reset-radar-v31-RR53.zip；生产EXE SHA256 55139A03B5B47F0E9A46CBECB11C7F58E308997AAEF71E09DC2ACDEE948238AD。沿用原app.resetradar.desktop标识，版本号不改；需要退出旧版后打开新程序，不删除用户数据。
