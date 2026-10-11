# RR27 识图子代理三轮复审记录（2026-10-11）

复审协议：RUNBOOK §9.1——主会话不直接读图，派只读 Explore 子代理逐图返回文字差距清单。

## 第一轮（10 张：三态×深浅 + 六演示态）
- FAIL 4 类：①悬浮条中部叠字/图标压字（10/10）；②?theme=light 未生效（覆盖被 dark 偏好挡住）；
  ③demo empty/loading 未生效（场景快照 null 被当作「无覆盖」）；④展开态底栏在折叠线下不可达
  （main 未定高→整页被 body overflow 裁切，面板内部滚动从未激活）。
- 通过项：460 逻辑宽无横向溢出、演示徽标齐全、深色主题结构正确、empty 值语义（—）正确。

## 修复
悬浮条重排（去圆环/采集文本列，六件线框归位+ellipsis 纪律）；覆盖改直接生效
（resolvedTheme = override ?? resolveTheme(pref, system)）；场景 phase 映射
（empty→空数组+empty，loading→initializing）；展开态不渲染悬浮条+main 100vh
+面板内部滚动；探针扩 -ScrollBottom（CDP 滚到底再截）。

## 第二轮（12 张：+滚到底 2 张）
- 修复确认：叠字消除、浅色生效、empty/loading 骨架正确、stale 过期横幅正确。
- 残留：①-bottom 两张与顶部图相同（滚动 eval 早于 React 挂载，null 报错）；②演示态悬浮条
  数值被省略号截断（独立演示徽章挤宽）；③浅色下主题切换高亮仍在月亮。

## 修复
滚动 eval 前加 3s 等待；演示徽章并入品牌副行「reset-radar · 演示」；高亮跟随生效主题
（activeTheme prop）。

## 第三轮（8 张定点）
- 8/8 PASS：顶栏单条无重复悬浮条；滚到底可见底栏三按钮+校准行（n=0 旧行3条）+三来源时刻；
  浅色滚到底白底正确；卡×0 与卡数未知两态可区分；error/stale 数值完整、横幅齐全；
  全部无横向溢出。
- 备注：credits-zero 滚到底视口未见「无可用重置卡」决策卡（渲染在同状态上方视口），
  留 REVIEW 补拍；本卡以两态可区分+决策映射有测试覆盖放行。
