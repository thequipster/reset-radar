# RR21 done — 真·悬浮窗改造（ui 域，P1）

- 交付：2026-10-11 会话 S1011-1113（MERGE RR14 后同会话完卡）
- 分支/commit：agent/RR21 @ **2b10c27**（单 commit，基于 main b518bcd；patch 备份 task_logs/RR21.patch 263893B）
- diffstat：12 文件 +270/−27（6 改 + 6 新）

## 真值出处（证据铁律回源）

| 改动 | 出处（文件+字段/行） |
|---|---|
| 窗口配置全字段（decorations:false / transparent:true / backgroundColor:#00000000 / alwaysOnTop:true / skipTaskbar:true / shadow:false / focus:false / backgroundThrottling:"disabled" / minWidth:80 / minHeight:32 / maxWidth:760 / maxHeight:1200 / 初始小窗） | 参考实现 **codex-cockpit/src-tauri/tauri.conf.json** `app.windows[0]`（widget 窗口）逐字段对齐；初始尺寸改 460×76=本项目胶囊实测 |
| 动态尺寸机制（收起/展开两态 set_size） | codex-cockpit/src-tauri/src/lib.rs:210-233（Rust PhysicalSize×scale_factor）；本项目进程 PMv2 已生效（TRUTH B10 修复=RR20），**前端 `@tauri-apps/api/window` LogicalSize 等效**，免 Rust 通道（卡面修向②二选一取前端侧） |
| capabilities 显式授权 | codex-cockpit/src-tauri/capabilities/default.json 同款三条：core:window:allow-start-dragging / allow-set-size（+本项目追加 allow-close 供 × 退出）——core:default 不含这三条（参考实现显式列出实证） |
| data-tauri-drag-region 拖动区 | Tauri v2 官方机制（卡面修向③；配 allow-start-dragging 权限） |
| 胶囊宽度 460 | RR13_done 实测胶囊自然宽 421px+余量（沿其窗口宽度基线） |
| 胶囊高 76 / 展开高 648 | 本会话浏览器 DOM 实测：胶囊 421×63（vite preview 460 视口，scrollWidth=460 无横滚）→ 63+容器 padding12+余量=76；展开内容 scrollHeight 618+padding24+余量=648 |

## 已落

1. **src-tauri/tauri.conf.json**：main 窗口 → widget 式悬浮窗（字段表见上；初始 460×76）
2. **src-tauri/capabilities/default.json**：+3 窗口权限（start-dragging/set-size/close）
3. **src/ui/widgetWindow.ts**（新）：两态尺寸契约纯函数 targetWidgetSize + 副作用壳 applyWidgetSize（Tauri 检测+LogicalSize setSize）+ closeWidget；浏览器环境 no-op 优雅降级
4. **src/App.tsx**：useEffect 两态调窗；data-tauri-drag-region 整窗拖动；等待页胶囊化（与胶囊同设计语言，RR21 修向④）；透明窗口下胶囊态容器透明、展开态自带面板底色（圆角 12）
5. **index.html**：body 默认 8px 边距清零 + html/body 透明（透明窗口硬前提）
6. **src/ui/ExpandedCard.tsx**：窄窗自适应（RR14 遗产①）——标题/指标/因子行 flexWrap、收起常驻可见、理由链 overflowWrap:anywhere、**标题栏加 × 关闭钮**（skipTaskbar:true 下无任务栏项，×=唯一常规退出入口；配 allow-close）
7. **scripts/probe-transparent.ps1**（新）：透明度实证探针（CopyFromScreen 实拍+四角取样；PrintWindow 会把透明区合成黑，不能作证）
8. **docs/screenshots/**：两态截图 + 屏幕实拍件；README 图引用换新（check-release 13 条链接全绿）

## 门禁四绿 + Rust 门

- ① tsc --noEmit ✅
- ② 域 vitest src/ui **15/15** ✅（RR14 基线 11→15，+4 新契约测试）
- ③ 全量 vitest **93/93 0failed** ✅（基线 89→93 只升）
- ④ 变异红验 ✅：改 CAPSULE_SIZE.height 76→560（=复刻用户投诉的「胶囊态预留展开整窗高」病灶）→ 域测试红 **2 条**（`胶囊态返回悬浮条尺寸 460×76` 精确断言 + `胶囊态高度收紧≤120` 病根断言）→ 复原 → 15/15 复绿
- ⑤ cargo check --tests ✅ 5.19s（共享主仓 CARGO_TARGET_DIR；tauri.conf.json/capabilities 经 tauri-build 解析无误）
- 附：check-release.mjs ✅（版本 0.1.0 同步+README 13 链接可达）

## 实证链（release 实跑，custom-protocol B01 路径）

- 构建产物：src-tauri/target/release/reset-radar.exe（WebView2Loader.dll 旁置 B02）
- **胶囊态**（shot-expanded.ps1 无 hash）：GetDpiForWindow **192**（B10 修复在）+ 客户区 **920×152=2×(460×76)**——窗口即悬浮条（原 460×560，胶囊占比 0.6% 病根拔除）
- **展开态**（#expanded 两跳）：客户区 **920×1296=2×(460×648)**——初始 76 的窗口被前端 LogicalSize **动态长高**，端到端实证 setSize+权限链生效
- **识图子代理两图 PASS**：胶囊五要素齐全无截断（CODEX/26%〔真实握手数据〕/周额度剩余/重置风险 24.9% 绿点/卡×3）、胶囊占宽 92%、**无顶部白条**（RR14 遗产③ 消除）；展开态三面板齐全、**无横滚无右裁**（RR14 遗产① 消除）、**无竖排单字**、收起+× 双钮完整可见、底部理由链完整（唯一小瑕疵：面板①一行解释「校准」一词 CJK 跨行成 2 字孤行，悬挂缩进正确，观感级不立卡）
- **透明度成立**（probe-transparent.ps1 屏幕实拍）：窗口四角=桌面像素 RGB(248,249,251)/(255,255,255)/(243,244,246)/(82,83,85)——非窗口底色，**gnu 下 transparent:true 实际生效，无需降级路径**（PrintWindow PNG 四周纯黑系其合成行为，已用屏幕 DC 实拍区分）
- **窗口样式位**：EXSTYLE 0x00040118 = WS_EX_TOPMOST ✅（alwaysOnTop）+ WS_EX_NOACTIVATE ✅（focus:false）；STYLE 留 WS_CAPTION 位系 tao 无边框+可缩放窗口的 WM_NCCALCSIZE 手法（截图实证无标题栏）；skipTaskbar 走 ITaskbarList 机制不改 EXSTYLE，未单独探活（不强称）

## 设计裁决（卡内自裁）

- 动态尺寸取前端 LogicalSize 而非参考实现 Rust PhysicalSize 通道：PMv2 生效下等效，且 UI 域卡不动 Rust 业务面（ARCHITECTURE §2 分层）
- × 关闭钮为 skipTaskbar 的必要伴生（否则用户无常规退出入口）；只入展开态标题栏，胶囊态保持纯净
- CARGO_TARGET_DIR 共享主仓 target：构建提速（2m44s 含 dist 重建），产物 gitignore 无污染

## 待用户清单

- 无阻塞项；托盘菜单（D021 选项 C 增量）留 ROADMAP

## 排障遗产 / REVIEW 取材

1. PrintWindow 对透明窗口的合成黑伪象与屏幕 DC 实拍判别法（probe-transparent.ps1 可复用）
2. vite preview 4173 端口被前会话遗留进程占用（换 4183 绕开；REVIEW 可立清理卡或给脚本随机端口）
3. 展开」校准」2 字孤行观感瑕疵（悬挂缩进正确，量级极小不立卡，记档备查）
4. RR14 遗产②（胶囊 0.6% 占比）/遗产①（窄窗溢出）/遗产③（顶部白条）均随本卡闭环；RR14 遗产④（探针偶发超大窗口防御）保持原状

## →下轮

- 待 MERGE 合入（junction 在 worktree node_modules，拆前先 cmd //c rmdir，B09）
- 合入后下一张：按 BOARD 建议顺序 RR15→RR18→RR19→RR16→RR17
