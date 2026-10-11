# RR27 变异红验记录（S1011-RR27）

## M1 展示层 null/0 合并（format.percentWhole）
- 改动：null/非Finite 分支返回 "0%"（把缺数冒充零）
- 结果：红 2（ui.format「null 与 0 严格区分」+ ui.copy-summary「缺周窗」——后者期望「周额度剩余：—」收到 "0%"）
- 原字节复原后 UI 域 77/77 绿。

## M2 展示状态机 activate 失效（appState）
- 改动：`case "activate": return state;`（点击/键盘不再锁定展开）
- 结果：红 1（「展开态是锁定的…」用例：collapsed+activate 期望 expanded 收到 collapsed）
- 复原后绿。

## M3 复制摘要丢 stale 标记（copySummary）
- 改动：删除「——以上建议基于上次观测」追加段
- 结果：红 1（「stale 历史必须带基于上次观测标记」）
- 复原后 UI 域 77/77 绿。

## 结论
三组变异均红且复原复绿；展示层三处关键语义（零缺失区分/展开锁定/stale 诚实标记）有测试钉死。
