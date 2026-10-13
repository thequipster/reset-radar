# RR55 Luna 测试与原型防御

- 当前状态：代码与验收补项完成；模型域和真实发布effect域测均绿。全项目tsc等待并行journal类型/fixture修正后复验。
- 审阅结论：`weekday.ts` 原型把未知 D60 率转换成七个0，容易伪装为确定无风险；预测入口未验证 rates 长度及有限非负值，也没有有限的日段/合法日期保护。
- 修改范围：仅 `src/lib/v3/weekday.ts`、`src/lib/__tests__/weekday.v32.test.ts`、`src/ui/__tests__/ui.platform-publication.test.ts`（UI组件/model/effect由同卡其他实现并行完成）。未知率保留`null`；预测拒绝非法模型、非有限/负率、不合法Date范围及超过3660日段/10年视野，正常24h/7日行为与模型公式不变。
- 星期域测试：`npx vitest run src/lib/__tests__/weekday.v32.test.ts`，13/13通过；新增未知、非法rate数组、Date/长视野边界、重叠覆盖、未来不可知修订验收。
- 变异红验：将未知rate的`null`映射临时改成0，`覆盖未知时保留未知星期率`按预期失败（实际7个0、期望7个null）；`finally`将原文件按字节恢复，之后星期域测试13/13复绿。
- 类型检查首轮：本文件的新增类型错误已修正；全项目`tsc`仍被并行UI接线的中间态阻断（`V3Dashboard.tsx`引用的`weekdayEvaluation`/`weekdayShadow`类型尚未到位），待整体接线完成复验。
- 真实发布 effect 验收：`npx vitest run src/ui/__tests__/ui.platform-publication.test.ts`，8/8通过；覆盖账号error/stale仍发布五个平台目标及D60/W28成对group、缺失/不可用/NaN候选不写、候选写失败fallback保留D60并继续R90/P1和个人链路。
- `npx tsc --noEmit` 待整体接线完成复验；现余5个编译错误都在`journal`尚未定义的`appendWeekdayPair`/`stopWeekdayShadow`方法及并行周模型UI测试fixture缺少`WeekdayCalibration`字段，不属于这三处文件。
- 依据：`docs/weekday-proposal-20261013.md` §7–8；`src/lib/v3/trend.ts` 的D60收缩与可靠覆盖；`src/lib/v3/platform.ts` 的事件归一化及可知性规则。新借鉴代码：无。
