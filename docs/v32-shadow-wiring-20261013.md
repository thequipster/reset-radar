# RR55：v3.2 星期影子正式接线报告（2026-10-13）

按 docs/weekday-proposal-20261013.md §7/§8 的后续实施要求，把 RR54 的隔离原型接入在线发布、结算、配对与展示四处。会话 S1013-v32-implement 实施至最终复验前因额度中断，S1013-v32-resume 接管完成最终双主题复验、交付包与本地合入。**默认参考模型仍为 D60；影子未验证前不参与任何用卡建议。**

## 改动范围（base 00d6562）

| 落点 | 实现 |
|---|---|
| `src/lib/v3/weekday.ts` | 原型固化：未知星期率保留 `null`（不伪装成 0 风险）；`predictWeekday` 拒绝非法模型、非有限/负率、非法 Date 范围、>3660 日段或 >10 年视野 |
| `src/lib/v3/weekdayEvaluation.ts`（新） | D60/星期严格配对汇总、成熟/未知/覆盖不足分开计数、北京时间 90/180/365 天预定评审、激活门槛、每周一回滚审阅记录；时间合法性与 BJT 检查点防御 |
| `src/lib/v3/verdict.ts` | 结算白名单加入 `platform-v3.2:D60-W28-BJT-shadow` |
| `src/lib/v3/runtime.ts` | 独立星期评估分支导出，不复用 P0/P1 旧升级门槛 |
| `src/ui/v3Model.ts` | 派生 `weekdayShadow`（拟合+预测+差值+状态+理由），不覆盖主参考或规划输入 |
| `src/ui/useV3Journal.ts` | `appendWeekdayPair`：同次冻结（同 issuedAt/trainingCutoff/24h 窗/历史快照）才配对；D60 先落盘，候选写失败只停影子不阻断主链；`stopWeekdayShadow` 故障登记；到点评审与周一回滚审阅追加 |
| `src/App.tsx` | 发布 effect 同时追加 D60+星期成对记录；星期故障显示但不影响 D60/R90/P1/个人链路；`weekdayCalibration` 传入数据页 |
| `src/ui/V3Dashboard.tsx` + css | 数据页「星期影子模型验证」卡：概率、D60 配对参考、差值、训练覆盖、有效配对日、ΔBrier、证据状态（零样本如实显示未验证）、评审日程；标签色加深一档（对比度修复） |

## 提案验收清单对照（§8 十项）

1. 覆盖拆分暴露守恒/计数同 D60 —— weekday.v32.test.ts 覆盖拆分用例。
2. 未来不可见事件/修订不影响旧截点；firstSeen 缺失标理想化 —— weekday.v32 + pairing 测试；日志 assumptions/evidenceQuality 原样携带。
3. 午夜归属、周二 09:00=15h+9h —— weekday.v32 边界用例。
4. τw=28/中心 D60 率/七组乘数均值 1 —— weekday.ts 公式 + 测试断言。
5. 任意冻结完整 7 天累计强度=D60 七天强度 —— weekday.v32 积分恒等用例。
6. 同次冻结配对；重复刷新/重启/缺 09:00 不增样 —— appendWeekdayPair 同窗校验 + appendOnce id 去重；原生 23 条影子行 registry 仍恰 1 条。
7. 迟到修订/不同版本/不同历史快照正确结算与配对 —— weekday.pairing.test.ts + ui.weekday-journal.test.ts。
8. D60 默认、P0 回退、卡台账、规划输出与 RR53 资源护栏不受影子影响 —— 全量含 planning.memory 受限堆测试保持绿；规划输入未接影子。
9. tsc/域/全量/变异红验 + 接线端到端 —— 见下节证据。
10. 桌面报告与代码数字一致 —— report-equality-corrected.txt：onlineAsStored.w28 模型、理想化回放模型与冻结预测（d60=0.18089130797849404，weekday=0.18980383894600267）逐字段恒等；未把 27%/显著 p 值当通过条件。

## 验证证据（task_logs/RR55_artifacts/）

- 四绿：resume-tsc.txt（0 错）；resume-full.txt（61 文件 525 测试 0 failed）；resume-node.txt（41/41）；resume-build.txt + resume-native-build.txt/final-native-build.txt（前端与 GNU `--features tauri/custom-protocol` 桌面构建）。
- 变异红验（均 finally 按原字节恢复，restored.txt 复绿）：①配对键去掉历史快照约束 → weekday.pairing.test.ts 红（mutation-pair.txt exit=1）；②结算白名单漏接星期版本 → ui.weekday-journal.test.ts 红（mutation-settlement.txt exit=1）；③未知星期率 null 映射改为 0 → weekday.v32「未知时保留 null」用例红（RR55_luna_tests.md 记录）。
- 原生端到端（native-ui.txt 22:44 首轮 + final-native-ui.txt 23:01 含对比度修复终轮）：独立 identifier `app.resetradar.rr55.qa`/独立 profile/禁真实 quota CLI；双主题数据页星期影子卡完整；journal 实际落盘 5 个平台版本、weekday_experiment registry 恰 1 条、影子行全部与 D60 同 group/同窗/同 trainingCutoff/同历史快照、faults=0、晚间运行无伪造 09:00 primary 样本。
- 视觉复核（RR55_visual.md + 23:02 终轮子代理识图）：双主题通过，零样本未显示成已验证，无裁切/溢出/乱码；dt 标签对比度修复确认到位。

## 交付与边界

- 本地包 `release-qa/reset-radar-v32-RR55.zip`：EXE SHA256 `38A37C5AFBD9A9DDF8969657869BAD090AC746CEE82E3EA8F25D068C17EA5B1E`，内部哈希核验一致，沿用原标识 `app.resetradar.desktop`（package-verified/identifier/zip-sha256）。
- 不 push、不打 tag；版本号维持 0.2.0。转正门槛、回滚护栏与规划边界维持提案 §7.2/§7.3 原文，未因接线放宽。
- 生产用户数据未改写；QA 数据在 release-qa/RR55-qa 与独立 profile 内。

## 出处

提案与验收 docs/weekday-proposal-20261013.md（§7 发布配对、§8 落点清单）；原型与实算 docs/DECISIONS.md D041；D60 收缩与覆盖语义 src/lib/v3/trend.ts；事件归一化与可知性 src/lib/v3/platform.ts；账号/平台发布分离 D039；RR53 资源护栏 D040。新借鉴外部代码：无。
