# BOARD — 唯一调度中心（所有会话先读这里）

> 项目：reset-radar（看得见准头的 Codex 重置风险与用卡规划器）
> 初始化：2026-10-11 会话 S1011-init（perpetual-board v1）

## 🛑 STOP 区（用户专用）

<!-- 用户在本区单独一行写 STOP（可附原因）→ 整个循环停止；删掉该行即恢复。除用户外任何会话不得写本区。 -->

（当前：无 STOP —— 循环运行中）

## 循环阶段判定

**WORK**（有 🟠可领卡）→ **MERGE**（无 🟠 但有 🟡待合入）→ **REVIEW**（都无 → 生成验收
artifact 逐条审差距立卡）→ 回 WORK。规则细节见 RUNBOOK.md §4/§9。

**当前阶段：MERGE（RR29 🟡唯一待合〔S1011-1755，d1c3b07〕；RR34 🟠待领〔浅色横幅对比度，RR29 挖出〕；RR30 依赖用户 CI 首跑）**
（RR29=G1 三口径全闭环：84 组对比度数值+Tab 键序三态实测+credits-zero 决策卡视口（含 demo 夹具缺陷修复）。
下一班建议：占 MERGE 槽合 RR29 → 转 WORK 领 RR34。

## 槽位（占用 = 下方在飞条目）

- LIGHT：×1（单工位：定时任务每 45 分钟唤醒一个会话，一次一卡）
- MERGE：×1（主仓合入互斥，同一时刻只有一人写主仓代码）

## 当前状态（置顶条目区——新条目插在最上面，勿动他人条目）

### [2026-10-11 18:30:00] RR29 | P3 | 🔧🟡待合入 | ui | S1011-1755 交付
- d1c3b07（base 791b89c，16文件+804/−8，patch 对 main 干净适用）：①对比度核验 84 组（42对×2主题，WCAG 核心 contrast.ts+配对登记 contrastPairs.ts+13 域测试快照锁定+docs/a11y-contrast-20261011.md；深色33/浅色20达标，浅色横幅 1.23–1.51 实锤缺陷→立 RR34）②Tab 键序探针 probe-tab-order.ps1 三态实测（胶囊1控件/展开9控件/页内+3，全可达全循环，四份记录在 task_logs/RR29_artifacts/）③credits-zero 决策卡视口（-ClickTab 参数+demo 夹具缺陷修复 healthyWeeklyWindow+重建重拍，识图四轮全过）。门禁：tsc/域105/全量262 0failed/变异红4复原绿；Rust 不适用（仅取证构建）。worktree 留 MERGE 班拆（node_modules junction 在，target 已拆）。

### [2026-10-11 18:12:00] RR29 | P3 | 🔧🟠在飞→已被顶部 18:30 🟡交付条目吸收 | ui | S1011-1755
- base 791b89c；UI 可访问性收尾取证：①对比度报告（widget.css token 实值逐前景/背景组合 WCAG 4.5:1 计算留档，含 RR32 遗产浅色横幅副文案面）②Tab 键序探针遍历三态控件（NOACTIVATE 点击激活后）③credits-zero 决策卡视口补拍；新截图过识图子代理。建 worktree agent/RR29。

### [2026-10-11 18:08:00] RR32 | P3 | 🎣🟢已闭环 | ui+assets | S1011-1755 MERGE
- 3237e5b→main 7e5dffa 树恒等✅（22路径 diff 0字节含4二进制资产）；预审四过（探活/对账/patch对main干净适用/交集空）；主仓复验 tsc✅ vitest 全量248/248 0failed✅ cargo check --tests✅ check-release✅（14链接）；junction先拆（node_modules+src-tauri/target双链接）worktree移除无残留、branch归档；RR29/RR30 待领（RR30 依赖用户 CI 首跑）。MERGE 释放。

### [2026-10-11 18:05:00] RR32 | P3 | 🎣🟡待合入（已闭环，见上行） | ui+assets | S1011-1735 交付
- 3237e5b（base 77c8e0c，对现 main 8aa944d 路径无交集 patch 干净适用），22文件+238/−12；src-tauri/icons 换交付 ico(8帧)+三PNG（icns 无交付保留现件）、RadarLogo 按正稿 mark 几何逐值重绘+双主题 token（dark=精密蓝/light=02-glass）；tsc/UI域91/全量248/cargo check/check-release 绿；变异红验两组（ico 回旧件→指纹红/logo 硬编码→token 断言红）；release 实证 exe 内嵌=交付 ico 8 帧字节逐帧命中（exe-icon-bytes.txt）+识图 6 图 PASS（两主题 logo 可见/exe 图标非默认）；done/patch 齐；worktree 留 MERGE 班拆（node_modules+src-tauri/target 双 junction 先拆，B09）；LIGHT 释放。识图两条非阻断观察归 done（浅色横幅副文案对比度→RR29 面已覆盖）。

### [2026-10-11 17:56:00] RR33 | P2 | 🧱🟢已闭环 | license+docs | S1011-RR33（用户在线裁决：如实声明）
- 8bffd4f→main 8aa944d 树恒等；主仓 tsc/238TS/check-release（14链接）/cargo check 复验绿；junction先拆worktree移除，branch归档。如实声明落地：THIRD_PARTY_NOTICES（对方MIT全文+复用清单）+resetCard/codex.rs/planner 版权行+README致谢补强+TRUTH §U 裁决入档；注释/文档级零代码变更，变异不适用理由记 done。

### [2026-10-11 17:45:00] RR32 | P3 | 🎣🟠在飞→已被顶部 18:05 🟡交付条目吸收 | ui+assets | S1011-1735
- base 77c8e0c（件务遗留已替 S1011-1722 落库）；图标接入按 handoff 四步：src-tauri/icons 换 ico+三 PNG（icns 无交付保留现件）、UI RadarLogo 重绘为交付正稿造型（浅色底走 glass 配色 token）、release 实证 exe 内嵌图标+两主题截图识图。建 worktree agent/RR32。

### [2026-10-11 17:22:00] 图标设计交付归档 | 📦🟢件务完成（非卡） | S1011-1722（用户指令）
- 生图AI返回包 reset-radar-design-20261011.zip 整包解压至 docs/design/icons-20261011/（40 文件 SHA256SUMS 全对；reference-ui 六图与 ref/ 现件字节一致，保留双份以维持包内 index.html 离线预览与校验单完整）；zip 已按用户指令删除。工程接入未做→立卡 RR32 🟠待领。

### [2026-10-11 16:08:00] RR31 | P1 | 🔧🟢已闭环 | ui | S1011-RR31（用户在线指定）
- b0cb857→main a89369c，树恒等；主仓tsc/238TS/38Node复验绿；junction先拆worktree移除。用户三反馈全闭环：页签分模块无滚动条、顶栏实底无透出、收益图注澄清；算法疑问实算答复无缺陷（TRUTH §U）。

### [2026-10-11 15:52:00] RR12 第2轮REVIEW | 🟢本轮完成（锚卡转回🟠待领，永不🟢） | S1011-RR12r2
- 验收artifact：main a362c4e tsc/234TS/38Node/build/cargo check/校准管线（fresh双快照n=0如实）+RR27十二截图复用；差距5条零悬空：立卡RR29/RR30、不立卡3条附理由（详见docs/review-20261011-round2.md）；BOARD切WORK。

### [2026-10-11 15:45:00] RR27 | P1 | 🔧🟢已闭环 | ui | S1011-RR27
- 95c3a98→main a362c4e，树恒等；主仓tsc/234TS/38Node复验绿；junction先拆worktree移除，wip移档，branch归档。三态UI/主题/SVG/全状态/12截图三轮识图8/8；阶段4业务卡全部闭环→RR12第2轮REVIEW。

### [2026-10-11 14:50:00] RR28 | P2 | 🧱🟢已闭环 | data-layer+core | S1011-RR28
- c53fc42→main c546b52，树恒等；主仓复验见心跳；junction先拆worktree安全移除，wip移档，branch归档。→RR27。

### [2026-10-11 14:48:00] RR28 | P2 | 🧱🟡待合入（已闭环，见上行） | data-layer+core | S1011-RR28 交付
- c53fc42，12文件+429/−15；refresh-calibration追加写应用目录calibration.json→Rust只读命令read_calibration_summary→TS纯映射三态（missing/invalid/ok）→VM必填字段；tsc/域+全量182/Node38/Rust check+32test绿；三组变异红恢复；实跑应用目录真实摘要落盘（fresh/n=0/legacy3）；done/patch齐备；LIGHT释放。

### [2026-10-11 14:40:00] RR17 | P2 | 🧱🟢已闭环 | core+data采集 | S1011-RR17b
- 657da35→main971be17，树恒等；主仓tsc/177TS/38Node复验绿；junction先拆worktree安全移除，wip移档，branch保留归档。→RR28。

### [2026-10-11 14:36:00] RR17 | P2 | 🧱🟡待合入（已闭环，见上行） | core+data采集 | S1011-RR17b 交付
- 657da35，27文件+1440/−155；统一前瞻24h窗口对账（旧行排除不倒填）、fetch-history后自动产出calibration.json+报告、CLI评估时点=运行时刻；tsc/域147/全量177/Node38绿；三组变异红恢复（两组首轮存活已补钉）；实跑60事件3行全legacy n=0；done/patch齐备；LIGHT释放。

### [2026-10-11 14:02:09] RR17 | P2 | 🧱🟢已闭环（被上行交付吸收） | core+data采集 | S1011-RR17
- base299c1d5；上会话仅领卡建worktree，S1011-RR17b 14:28接管续作至交付（见上行）。


### [2026-10-11 14:00:37] MERGE | 🟢已闭环 | S1011-RR16
- f7890a5→main299c1d5，39路径全树恒等；主仓tsc/170TS/37Node/校准复验绿；worktree先非递归拆junction安全移除，wip移档，branch保留。MERGE释放。


### [2026-10-11 13:49:23] RR16 | P2 | 🧱🟢已闭环 | core | S1011-RR16 LIGHT
- base17fc22c；watch有效性与既有25%权重接线、前瞻baseline日志与同样本校准分列，不倒填历史watch。

### [2026-10-11 13:47:17] MERGE | 🟢已闭环 | S1011-RR19
- 3edf240→main17fc22c，全树恒等；主仓tsc/147TS/34Node/两结构/actionlint/版本绿；安全拆junction/worktree，wip移档，branch保留；MERGE释放。

### [2026-10-11 13:41:45] RR19 | P2 | 🔧🟢已闭环 | docs+发布 | S1011-RR19
- 3edf240→main17fc22c，30路径；四绿/34Node/结构YAML版本/4红恢复；主仓复验绿，done/patch齐。→RR16。

### [2026-10-11 13:39:07] MERGE | 🟢已闭环 | S1011-RR18
- 62d71e1→main7e406e0，全树恒等；主仓tsc/147tests/Node30/calibrate绿；先非递归拆junction再移除worktree，wip移档，分支保留归档。MERGE释放。

### [2026-10-11 13:27:05] RR18 | P2 | 🔧🟢已闭环 | data采集 | S1011-RR18
- 62d71e1→main7e406e0，42路径；四绿/Node30/3红恢复/生产32.1日志保留；已合入复验，done/patch齐备。→RR19。


### [2026-10-11 13:24:13] MERGE | 🟢已闭环 | S1011-RR15
- a246165→main44f2bba，全树恒等；主仓tsc/137tests/Node8/cargo check --tests/calibrate绿。worktree先拆junction再移除，分支归档；MERGE释放。


### [2026-10-11 13:08:01] RR15 | P1 | 🧱🟢已闭环 | data-layer | S1011-RR15
- a246165，52路径；tsc/域118/全137/Rust29/Node8/release/生产落盘与重启幂等绿，4类变异红恢复；done/patch齐备，LIGHT释放。


### [2026-10-11 13:06:31] MERGE | 🟢已闭环 | S1011-RR23
- RR23合入98d9bbc→main1f67601，全树恒等；主仓tsc/125tests/cargo check --tests绿。worktree已安全拆除，junction先非递归拆；分支保留归档，MERGE释放。


### [2026-10-11 12:47:01] RR23 | P0 | 🧱🟢已闭环 | data-layer | S1011-RR23
- 交付98d9bbc，34路径；tsc/域110/全量125/Rust24/TLS/生产落盘绿；两轮变异红恢复绿，done/patch齐备，LIGHT释放。



### [2026-10-11 12:42:59] MERGE | 🟢已闭环 | S1011-design4 RR22
- 合入c8321dc→main1142551，27路径树恒等；主仓tsc/108tests/设计验收全绿。RR22 worktree安全拆除；RR21已注销但空目录句柄占用留壳，junction已先拆且main依赖完好；分支保留归档，不用force；RR26用户原图保留。MERGE释放。
- RR22 worktree干净，patch适用，主仓HEAD bca3ba4与卡基线相同；27路径对账，占MERGE槽。



### [2026-10-11 12:38] RR27 / RR28 | P1/P2 | 🧱🟠待领 | ui / data-layer+core | 阶段4余项
- RR28先提供真实校准只读摘要，RR27据六图重构三态UI/主题/SVG/完整状态/窗口焦点与尺寸；详细五件卡面见BACKLOG，前置业务卡依次执行；未领卡不占LIGHT。



### [2026-10-11 12:33:26] RR22 | P0 | 🧱🟢已闭环 | core | S1011-design4 LIGHT
- 本卡已合入main1142551；参考图及04-progress均已在主仓，下一卡RR23接线运行时公告。
- 交付c8321dc；27文件+664/-10；tsc/核心93/全量108/两轮变异红复绿；参考图原字节归档，done/patch齐备，LIGHT释放。
- 公告感知纯核心：计划与已发生/模型概率分开；RR23输入契约；日建议缩短计划 horizon、卡收益按公告情景截断；无公告golden回归。基线main bca3ba4，worktree agent/RR22。



### [2026-10-11 12:32:13] MERGE | 🟢已闭环 | S1011-design4
- 合入：RR21→main0fe0159，RR26→mainbca3ba4，涉及路径树恒等；主仓tsc/93测试/设计域/cargo check --tests全绿。保留两worktree（RR26用户参考图；RR21待安全拆junction），MERGE释放。
- 预审通过：RR21/RR26各12文件、patch可应用、路径交集空；占MERGE槽，主仓cherry-pick。RR26含用户六张未跟踪参考图，保留原worktree，避免丢图。



### [2026-10-11 11:57:14→2026-10-11 12:05:03] RR26 | P1 | 🧱🟢已闭环 | docs+发布 | S1011-design3交付
- 分支/commit：agent/RR26 @961fdfb（单commit，基于main bcb3b5a；12文件+752行；task_logs/RR26.patch原字节导出，主仓apply --check通过）。
- 已落：01/02/03三份设计文档、ref交接目录；03六组独立UIUX提示词，风格/色值/字体/材质自由；02同步新裁决；TRUTH用户裁决追加。
- 门禁：tsc绿；UI11/11；全量89/89 0failed（main基线，RR21尚未合入）；文档验收绿；未知卡数误变零卡→断言红exit1→字节恢复绿；done/输出见task_logs/RR26_done.md与RR26_artifacts。
- 阶段3停点已通过：用户六图到位并授权阶段4；图已随RR22版本化到main/ref。RR24/RR25落档由本卡覆盖闭环，勿重复领；RR26原图worktree留存。
- worktree保留，含node_modules junction；未来拆前先核实拆链接。异常CRLF备份RR26.powershell-crlf.patch只作排障档案，勿用于合入。LIGHT释放。
### [2026-10-11 11:40:25] RR25 | P1 | 🧱🟢已闭环 | docs+发布 | 用户指定重设计阶段2
- 方案：独立审阅目录02-spec.md；石墨深色/浅色主题、三态线框、完整状态和字段边界；待用户确认后阶段3，参考图到位后阶段4。
- 新授权：阶段4本设计总指挥逐卡执行其他看板任务；RR22/RR23公告主线优先，RR15–RR19按依赖收尾，详见BACKLOG及方案§8。
- 槽位：未领卡不占LIGHT，RR21仍在飞勿抢；释放后在 agent/RR25 分支落档 docs/design/02-spec.md。RR24阶段1内容已获用户认可，仓内落档仍待领。
- 协调注记：RUNBOOK是协议权威；STOP会停止所有会话，不能用“写STOP后本会话继续实施”协调。阶段4按卡与槽位互斥，保持STOP空才工作。


### [2026-10-11 11:30:46] RR24 | P1 | 🧱🟢已闭环 | docs+发布 | 用户指定前端重设计阶段1
- 已准备：独立审阅目录 01-proposals.md，42条未定稿提案（Luna底稿+主会话校对）；详见 BACKLOG RR24 草稿绝对路径。
- 槽位：未领卡，不占LIGHT；遵循§4不抢RR21槽。释放后在agent/RR24落入docs/design/01-proposals.md并交付。
- 阶段停点：只交阶段1候选供用户过目；02方案/03图prompt/参考图后实施按用户四阶段顺序推进。


### [2026-10-11 11:17→11:56] RR21 | P1 | 🔧🟢已闭环 | ui | 会话 S1011-1113 交付
- 分支/commit：agent/RR21 @ **2b10c27**（单 commit，基于 main b518bcd；patch 备份
  task_logs/RR21.patch 263893B）
- 已落：真·悬浮窗——tauri.conf.json 对齐 codex-cockpit widget 字段（出处其
  src-tauri/tauri.conf.json，done 有逐字段表）+ capabilities +3 窗口权限 +
  src/ui/widgetWindow.ts 两态契约（胶囊 460×76/展开 460×648，浏览器 DOM 实测定值）+
  App 拖动区/等待页样式化/透明底 + ExpandedCard 窄窗自适应（RR14 遗产① 消除）+
  展开态 × 关闭钮（skipTaskbar 伴生）+ probe-transparent.ps1 透明实证探针 +
  README 换新两态图（check-release 13 链接绿）
- 实证（release 实跑 B01 路径）：胶囊 920×152=2×(460×76) 悬浮条收紧（0.6% 占比
  病根拔除）；展开 920×1296=2×(460×648) 前端 LogicalSize 动态长高端到端生效；
  DPI 192；**屏幕 DC 实拍四角=桌面像素→gnu transparent 生效，未走降级路径**；
  EXSTYLE TOPMOST+NOACTIVATE 置位；识图子代理两图 PASS（五要素/三面板/无横滚/
  无竖排字/收起+×可见/无白条——RR14 遗产①③ 消除）
- 门禁：tsc✅ 域 src/ui **15/15**✅ 全量 **93/93 0failed**✅（基线 89→93 只升）
  变异红验✅（胶囊高 76→560 病灶值→红2条→复原绿）cargo check --tests 5.19s✅
- worktree **保留给 MERGE 班拆**（含 node_modules junction，拆前先 cmd //c rmdir，B09）
- 证据件：task_logs/RR21_done.md（真值出处表+实证链+卡内裁决 3 条+排障遗产 4 条）

### [2026-10-11 10:53→11:22] RR14 | P1 | 🔧🟢已闭环 | ui | 会话 S1011-1043 交付 → S1011-1113 合入
- 合入：agent/RR14 @ ba11e47（单 commit）→ main **e569ce1**（cherry-pick，树恒等✅
  7 路径 diff 0 字节；worktree/分支已拆——junction 先拆 cmd rmdir 一步干净，主仓
  node_modules 完好；顺手清掉 RR09 空壳目录，RR13 空壳仍句柄占用暂留〔RR09 同款〕）
- 主仓复验：tsc✅ vitest 全量 **89/89 0failed**✅（基线 86→89 只升）cargo check
  --tests 2.00s✅
- 交付详情：task_logs/RR14_done.md（src/ui/appState.ts initialExpanded 纯函数 +
  App.tsx 起始态接线〔#expanded 起始展开，RR09_done B09 机制②〕+ 域测试 3 条 +
  shot-expanded.ps1 探针〔CDP 两跳导航+PMv2〕+ 展开态截图 920×1120 + README 图引
  闭环；变异红验 精确匹配→#mutant 红1/复原绿）
- 排障遗产 4 条留 REVIEW（done 内详）：**展开态 460 窄窗排版差距已由 RR21 吸收** /
  胶囊顶部白条 / 探针偶发超大窗口已防御 / 探针 -Hash 两态通用

### [2026-10-11 10:15→10:52] RR13 | P1 | 🔧🟢已闭环 | ui | 会话 S1011-1013 交付 → S1011-1043 合入
- 合入：agent/RR13 @ a994f73（单 commit）→ main **6dd9ed6**（cherry-pick，树恒等✅
  4 路径 diff 0 字节；worktree git 侧已拆（junction 先拆 cmd rmdir，主仓 node_modules
  完好）；目录空壳句柄占用暂留磁盘，RR09 同款留档）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅ cargo check --tests 1.26s✅
- 交付详情：task_logs/RR13_done.md（tauri.conf.json width 460+minWidth 460 + README
  换无截断真图 + shot-capsule.ps1 截图脚本；GetDpiForWindow 192/物理客户区 920×1120
  实证/识图 PASS；排障遗产①–③留 REVIEW 取材）

### [2026-10-11 09:46→10:08] RR20 | P1 | 🔧🟢已闭环 | data-layer | 会话 S1011-0944 交付 → 同会话合入
- 合入：agent/RR20 @ 8963fd3（单 commit）→ main **aadaed4**（cherry-pick，树恒等✅
  2 路径 diff 0 字节；worktree/分支已拆——junction 先拆 cmd rmdir，主仓 node_modules 完好）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅ cargo check --tests 4.18s✅
  （worktree 侧域门 cargo test --lib 12/12✅ 含新哨兵2）
- 分支/commit：agent/RR20 @ **8963fd3**（单 commit；基于 main 7afcd64；patch 备份
  task_logs/RR20.patch）
- 已落：build.rs GNU_APP_MANIFEST 补 dpiAware=true/PM + dpiAwareness=PerMonitorV2,
  PerMonitor（保留 CC v6，B08 成果不丢；xml 落盘无条件、embed 仍 gnu 门控）+
  lib.rs 哨兵测试×2（B08/B10 回归，include_str! 读真件）；真值=B10/D020+registry
  源码核实（tauri-build 2.7.1 默认 manifest 无 dpiAware，官方靠 tao 运行时调用，
  本机 gnu 实测未生效）
- 门禁：tsc✅ 域 cargo test --lib **12/12**✅（10+新2）全量 vitest 86/86 0failed✅
  cargo check --tests✅ 变异红验✅（PerMonitorV2→MUTANT 红哨兵1条/复原复绿）
- 实证（200% 缩放）：exe 嵌入含 dpiAware manifest（PerMonitorV2×1）；
  **GetDpiForWindow 96病灶→192**；物理客户区 **840×1120=2×逻辑**（修复前 420×560）；
  识图复验胶囊右端「卡×3」完整、余量 40+px——**右缘截断消除**（真实数据 29%/24.7%/×3）
- 证据件：task_logs/RR20_artifacts/（manifest-dump.txt 含两份并存注记 / rr20-after-420.png /
  shot-rr20.ps1 探针可复用）；done 有 MSVC 发行路径 DPI 注记（REVIEW 取材）
- 解锁：**RR13 复验收尾**（下一班优先；其 wip 4 步指引照走）

### [2026-10-11 09:17→09:55] RR13 | P1 | 🔧🟠待领（留证续作） | ui | 会话 S1011-0913 留证
- 分支/commit：agent/RR13 @ **1482ca9**（WIP：width 460+minWidth/README 图引/截图脚本+460 截图；
  worktree 在，**含 node_modules junction，拆前先 rmdir**，B09）
- 已落：门禁前三绿（tsc/ui 8/8/全量 86/86）；460 截图识图复验**否决**→根因实锤
  **DPI 无感知**（exe manifest 无 dpiAware，200% 缩放 CSS 视口=窗宽/2，胶囊实测 421 CSS px
  放不进 230 视口；两轮截图切点与模型逐字符吻合）——TRUTH **B10** + D020 + 立 **RR20**；
- →下轮：**前置 RR20 合入**后领本卡收尾（重截→识图复验无截断→四绿→done；详 task_logs/RR13_wip.md 续作指引 4 步）

### [2026-10-11 08:46→09:16] RR12 首轮 artifact 批 | P0 | 🔁🟢已闭环 | docs（REVIEW 产物） | 会话 S1011-0843 交付 → S1011-0913 合入
- 合入：agent/RR12 @ f15baad（单 commit）→ main **6360778**（cherry-pick，树恒等✅ 5 路径
  diff 0 字节；worktree/分支已拆——无 junction 直接 remove）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅
- 分支/commit：agent/RR12 @ **f15baad**（单 commit；基于 main ae642c0；patch 备份
  task_logs/RR12.patch）；**锚卡本体已转回🟠待领（永不🟢），此条目只跟踪本轮 artifact 批合入**
- 已落：docs/review-20261011.md（差距 10 条零悬空定夺：立卡 RR13–RR19 共 7 张 +
  3 条不立卡附理由）+ docs/calibration-latest.md（n=0 可计分日=冷启动）+ RR12_artifacts/
  三件（vitest 86/86 / vite build / cargo check）+ ROADMAP v0.2 行尾标注
- 门禁：代码与 main 恒等（零代码改动），tsc✅ 全量 86/86 0failed✅ 即等价口径；变异红验
  不适用（无代码可变异，理由见 done）；事故已修（junction 递归删损 node_modules→npm ci
  复原，TRUTH B09〔补记〕登记）
- →下轮：worktree/分支已拆（本行已过时留档）；REVIEW 第 2 轮触发=无🟠无🟡，
  前置=先跑 fetch-history 刷新夹具（RR18 ②）

### [2026-10-11 08:20→08:44] RR11 | P1 | 🧱🟢已闭环 | docs+发布 | 会话 S1011-0813 交付 → S1011-0843 合入
- 合入：agent/RR11 @ f5ce969（单 commit）→ main **ae642c0**（cherry-pick，树恒等✅ 涉及
  4 路径 diff 0 字节；worktree/分支已拆——junction 先拆 cmd rmdir，残留已清）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅ check-release✅（版本同步 0.1.0+README 链接 12 条）
- 分支/commit：agent/RR11 @ **f5ce969**（单 commit；基于 main 9b81f38；patch 备份
  task_logs/RR11.patch 对 main 干净适用✅）
- 已落：README 重写（胶囊态真实截图上墙+功能清单勾选 7/8+校准闭环用法+发布三步+致谢精确
  到 v0.3.0-beta.5；"keyring"措辞修准为 codex CLI 鉴权）+ release.yml（tag v* 触发，10 步，
  gh release create 挂 nsis/msi/SHA256SUMS，permissions 仅此 wf 写）+ check-release.mjs
  （版本同步+README 链接 12 条+tag 守卫）+ check-release-wf.py（结构门禁）
- 门禁（等价口径沿 RR02/D011）：tsc✅ 全量 86/86 0failed✅ check-release/check-release-wf/
  check-ci 回归/actionlint 1.7.12 零告警/PyYAML 全绿✅ 变异红验两轮✅（链接条件反转红12/
  触发器比较符反转红1）+ tag 守卫咬合证（v9.9.9 红/v0.1.0 绿）
- 版本定档 0.1.0 两处已一致（核验后不动值）；LICENSE/TRUTH 致谢完整性检查结论：无需改动
- 解锁：RR12 首轮 REVIEW（首批 11 卡全闭环，发布三步就绪待用户执行）

### [2026-10-11 07:56→08:00] RR10 | P1 | 🧱🟢已闭环 | core+data-layer | 会话 S1011-0743 交付 → S1011-0813 合入
- 合入：agent/RR10 @ d35bc8b（2 commits c78e462+d35bc8b）→ main **8ec7d6b**
  （cherry-pick，树恒等✅ 涉及 7 路径 diff 0 字节；worktree/分支已拆——junction 先拆
  cmd rmdir 一步干净，主仓 node_modules 完好）
- 主仓复验：tsc✅ vitest 全量 86/86 0failed✅（基线 73→86 只升；Rust 门不适用——本卡
  未动 src-tauri/）
- 分支/commit：agent/RR10 @ **d35bc8b**（2 commits；基于 main 0bbd62c；patch 备份
  task_logs/RR10.patch 对 main 干净适用✅）
- 已落：src/lib/predictions.ts 幂等追加单一源（同日首评必落/漂移>0.5 补行/否则抑制/
  坏行保留）+ scripts/log-prediction.mjs 落盘器薄壳（calibrate.mjs 点名期待）+
  data/predictions.jsonl 首行（落盘器生成，24.5=RR04 golden 同源交叉验证）+ D019 决策
- 四绿：tsc✅ 域 13/13✅ 全量 86/86 0failed✅（基线 73→86 只升）变异红验两轮✅
  （阈值比较符>=红1 / 日键换源UTC红1）+ 落盘器冒烟两跑幂等实证✅（第2跑 suppressed）
- 设计裁决 D019：阈值 0.5=score 一位小数显示精度下界；app 内落盘不接（%APPDATA% 与
  校准读取断链，留 REVIEW）
- 遗留（REVIEW 取材）：app 内自动落盘路径汇流（D019③）+ RR09 两遗留（展开态截图/
  胶囊溢出立修卡）

### [2026-10-11 07:21→07:55] RR09 | P1 | 🧱🟢已闭环 | ui | 会话 S1011-0713 交付 → S1011-0743 合入
- 合入：agent/RR09 @ 12d8380（单 commit）→ main **0bbd62c**（cherry-pick，树恒等✅；
  worktree/分支已拆——junction 先拆，RR09 空壳目录被句柄占用暂留磁盘，git 状态已清）
- 主仓复验：tsc✅ vitest 全量 73/73 0failed✅（基线 65→73 只升）cargo check --tests 1.27s✅
- 交付详情：task_logs/RR09_done.md（src/ui/ 六件+App 两态+窗高 560；数字全部来自
  src/lib；胶囊态截图真实数据 29% 端到端）
- 遗留（REVIEW 取材）：①展开态截图（done 有两条路径）②胶囊溢出 420px 立修卡
- 解锁：RR10 可领（data-layer 预测落盘）；RR11 待展开态截图

### [2026-10-11 07:21→08:05] RR09 交付记录（S1011-0713，已由上行合入闭环吸收）
- 分支/commit：agent/RR09 @ **12d8380**（单 commit；基于 main 42d443c；patch 备份
  task_logs/RR09.patch 对 main 干净适用）
- 已落：src/ui/ 六件（types 契约/adapters 纯映射/useSnapshots 事件接线+浏览器降级 D018/
  history 夹具只读/Capsule/ExpandedCard）+ App 两态切换 + tauri.conf.json 窗高 560（D018）；
  数字全部来自 src/lib（§2/D006）
- 四绿：tsc✅ 域 8/8✅ 全量 73/73 0failed✅（基线 65→73 只升）变异红验两轮✅
  （主数字换源红5 / daysToReset 注入+8h 红1）+ cargo check --tests 1m02s✅（复验）
- 运行证据：release app（custom-protocol）实跑 + PrintWindow 截图 **胶囊态真实数据 ✅**
  （29%=RR08 冒烟实测值，端到端通）；⚠️ `tauri dev` 本机 cdylib 链接死路（TRUTH B09）
  → 卡面口径以 release 等效替代；**展开态截图未取得**（agent 会话无前台权，输入注入
  不可达，B09）→ 下轮补
- →下轮：①展开态截图（computer-use SDK 注入或 App 支持 hash 状态入口）②胶囊溢出 420px
  立修卡素材 ③MERGE 拆 worktree 前先拆 node_modules junction（done 有指引）

### [2026-10-11 04:47→07:16] RR08 | P1 | 🧱🟢已闭环 | data-layer | 会话 S1011-0443 交付 → S1011-0643 接管续作 → S1011-0713 合入
- 合入：agent/RR08 @ a1f802a（2 commits）→ main **42d443c**（cherry-pick，树恒等✅，
  worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 65/65 0failed✅ cargo check --tests 12.9s✅
- 交付详情：task_logs/RR08_done.md（codex.rs app-server 握手+解析/snapshots.rs 原子写+SWR/
  models/lib get_snapshots/build.rs B08 正规化 D017；真实握手落盘冒烟 plan=PLUS/周窗29%/credits3）
- 解锁：RR09（UI）数据前置 get_snapshots+background-snapshots-updated 就绪；RR10 同域解锁

<!-- 条目模板：
### [时间] <卡号> | <优先级> | <类型标记>🟠在飞 | <域> | 会话 <会话ID>
- 分支/commit：agent/<卡号> @ <sha>
- 已落：<本会话进展>
- →下轮：<续作指引>
-->

### [2026-10-11 04:17→04:44] RR07 | P0 | 🧱🟢已闭环 | core | 会话 S1011-0413 交付 → S1011-0443 合入
- 合入：agent/RR07 @ 13be6b1 → main **dddc641**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 65/65 0failed✅（基线 49→65 只升）
- 解锁：core 域首批（risk/planner/resetCard/calibration）全闭环；calibration 已入 index.ts 导出，
  RR09 UI 可直接 import；npm run calibrate 可跑，RR12 REVIEW 校准报告 artifact 有来源；
  RR10 可消费 scorePredictions 行契约与 joinPredictionsWithResets

### [2026-10-11 04:17→04:27] RR07 交付记录（S1011-0413，已由上行合入闭环吸收）
- 分支/commit：agent/RR07 @ 13be6b1（基于 main 58ff13b；patch 备份 task_logs/RR07.patch，
  已验证对 main 干净适用）
- 已落：src/lib/calibration.ts（scorePredictions：Brier/命中率/基准率/分周/可靠性曲线 +
  joinPredictionsWithResets 北京日键对账）+ scripts/calibrate.mjs（REVIEW artifact 渲染壳，
  RUNBOOK §9.1 命令原样可用，node 原生 type-stripping 直载 .ts）+ 16 条域测试
  （Brier 三锚 0/0.25/1 + B06 反锚定对账 + 跨年周键）；接线：import 链 .ts 扩展 +
  tsconfig allowImportingTsExtensions + beijingCalendarDateKey 导出 + npm run calibrate（D016）
- 四绿：tsc✅ 域 65/65✅ 全量 65/65 0failed✅（基线 49→65 只升）变异红验两轮
  （Brier²→|·| 红6条 / 日键漏+8h 红2条）✅ 脚本两轮冒烟✅（骨架+真实夹具 10 计分日 3 重置日）
- →下轮：待 MERGE 槽合入；RR10 消费本卡行契约与 join；RR09 UI 可直接 import calibration；
  合入后 RR12 REVIEW 有校准报告 artifact 来源

### [2026-10-11 03:47→04:16] RR06 | P1 | 🧱🟢已闭环 | core | 会话 S1011-0343 交付 → S1011-0413 合入
- 合入：agent/RR06 @ 23a1d49 → main **58ff13b**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 49/49 0failed✅（基线 33→49 只升）
- 解锁：RR07（calibration）可领（core 域串行就绪）；resetCard/planRemainingQuota 已入
  index.ts 导出，RR09 UI 可直接消费

### [2026-10-11 03:47→03:51] RR06 交付记录（S1011-0343，已由上行合入闭环吸收）
- 分支/commit：agent/RR06 @ 23a1d49（基于 main 7864217；patch 备份 task_logs/RR06.patch）
- 已落：src/lib/resetCard.ts 整文件移植（rc:22-385 逐函数行号注明；适配三处记 D015：日键统一
  北京日历 D004 避 B06、配速依赖落 planner.ts、宽类型收窄）+ planner.ts 追加
  planRemainingQuota/DEFAULT_WEEKDAY_HAZARDS（dq:89-118/dq:6）+ 16 条域测试
  （13 条参考断言原样全绿 + 3 条新增自然重置日边界）
- 四绿：tsc✅ 域 49/49✅ 全量 49/49 0failed✅（基线 33→49 只升）变异红验两轮
  （survival 忽略 hazard 红3条 / refill 阈值 25→0 红1条）✅

### [2026-10-11 03:16→03:46] RR05 | P1 | 🧱🟢已闭环 | core | 会话 S1011-0313 交付 → S1011-0343 合入
- 合入：agent/RR05 @ b86ee9e → main **7864217**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 33/33 0failed✅（基线 18→33 只升）
- 解锁：RR06（resetCard 移植）可领；planner 已从 src/lib/index.ts 导出，RR09 UI 可直接消费

### [2026-10-11 03:16→03:19] RR05 交付记录（S1011-0313，已由上行合入闭环吸收）
- 分支/commit：agent/RR05 @ b86ee9e（基于 main 8b85206；patch 备份 task_logs/RR05.patch）
- 已落：src/lib/planner.ts planDailyUsage（三段式 min(剩余, 均匀+p²前拉, 软上限K(1+1.5r)×周末0.75)，
  公式出处 dq:149-165 逐行注明；factors 对齐 D006 且 delta 之和=suggested；isWeekend 复用
  beijingWeekday（D004））+ 15 条域测试（dashboard 双 golden 逐位吻合）
- 四绿：tsc✅ 域 33/33✅ 全量 33/33 0failed✅（基线 18→33 只升）变异红验两轮（1.5→0 红5条 /
  p²→p¹ 红6条）✅

### [2026-10-11 02:46→03:14] RR04 | P0 | 🧱🟢已闭环 | core | 会话 S1011-0243 交付 → S1011-0313 合入
- 合入：agent/RR04 @ f1810f9 → main **8b85206**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：tsc✅ vitest 全量 18/18 0failed✅
- 解锁：RR05（planner）可消费 assessResetRisk/beijingWeekday（import 自 src/lib）

### [2026-10-11 02:46→02:51] RR04 交付记录（S1011-0243，已由上行合入闭环吸收）
- 已落：src/lib/risk.ts assessResetRisk（factors 对齐 D006；常量全部注明 rs 行号出处）+
  beijingWeekday 公共工具（D014）+ 14 条域测试（真实夹具 golden 24.5 手算逐位吻合；
  B07 星期分布锚点 Sun..Sat=9,4,10,12,8,7,9 反验 D004 边界）
- 四绿：tsc✅ 域 18/18✅ 全量 18/18 0failed✅ 变异红验两轮（70→10 红 4 条 / watch 权重→0 红 3 条）✅

### [2026-10-11 01:45→02:30] RR02 | P1 | 🧱🟢已闭环 | docs+发布 | 会话 S1011-0143 交付 → S1011-0213 合入
- 合入：agent/RR02 @ c451728 → main **0e0f5bc**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：check-ci 结构门禁绿✅；CI 真跑待用户 push 后首跑（无 runner 不声称"跑过"）
- 遗留：node:test 纳入 CI 留给 REVIEW 立卡（done 已记）

### [2026-10-11 01:16→02:30] RR03 | P0 | 🎣🟢已闭环 | data采集 | 会话 S1011-0113 交付 → S1011-0213 合入
- 合入：agent/RR03 @ cf4d0ab → main **93858e9**（cherry-pick，树恒等✅，worktree/分支已拆）
- 主仓复验：node --test 12/12✅；RR04 起可直接消费 data/resets-history.json 的 events[].announcedAt
- 集成注记：与 RR01 合并后 vitest 误载本卡 .test.mjs → fixup c78978c 修复（D013），node:test 与
  vitest 职责正交（scripts/** 已从 vitest exclude）

### [2026-10-11 00:57→02:30] RR01 | P0 | 🧱🟢已闭环 | core+ui+data-layer | 会话 S1011-0043 交付 → S1011-0213 合入
- 合入：agent/RR01 @ cd9f759 → main **838649b**（cherry-pick，树恒等✅，worktree/分支已拆；
  原🟡条目重复表头一并清理）
- 主仓复验：tsc✅ vitest 全量 4/4 0failed✅ cargo check✅(56.9s)——RR04+ 依赖本卡全部解锁


## 建议领取顺序

1. RR04 → RR05 → RR06 → RR07（core 域串行；RR07 依赖 RR03 的数据夹具——已合入可直接消费）
2. RR08 → RR10（数据层串行）
3. RR09（UI，依赖 RR08）
4. RR11（发布打磨，依赖 RR09 截图）
5. RR12（循环锚——首批功能卡合入后执行首轮 REVIEW，之后永续滚动）





