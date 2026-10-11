# RR14 done — 展开态截图（hash 状态入口）🟡待合入

- 会话：S1011-1043（2026-10-11 10:53 领卡 → 11:22 交付）
- 分支/commit：agent/RR14 @ **ba11e47**（单 commit；基于 main 6dd9ed6——RR13 已在；
  patch 备份 task_logs/RR14.patch 对 main 干净适用）
- diffstat：7 文件 +149/-2 —— src/ui/appState.ts（initialExpanded 纯函数）/
  src/App.tsx（起始态一行接线）/ src/ui/__tests__/ui.app-state.test.ts（3 条）/
  scripts/shot-expanded.ps1（CDP 探针）/ docs/screenshots/20261011-expanded.png
  （920×1120 展开态三块面板）/ 20261011-capsule-460.png（连带更新复验）/ README.md
  （展开态图引用闭环，原「待补」措辞清除）
- worktree：../reset-radar_wt/RR14 **保留给 MERGE 班拆（内含 node_modules junction，
  拆前必须先 cmd //c rmdir node_modules，B09）**

## 真值出处

1. hash 入口路径：RR09_done B09 机制②（卡面证据）——「App 读
   location.hash=#expanded 起始展开」为 agent 无前台权下唯一可复现展开态路径。
2. URL fragment 原样保留、不归一化（大小写敏感）：WHATWG URL 规范 fragment 语义，
   域测试锚定 `#EXPANDED`/`#expanded/` 均不触发。
3. 截图注入机制（本轮实证）：WebView2 官方环境变量
   `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port` → CDP
   `Page.navigate`；同 URL 仅变 hash 是 same-document 导航**不会重挂 SPA**，必须
   两跳（about:blank → index.html#expanded）强制整页加载（两次运行均返回新
   loaderId 证明确实整页导航）。
4. 探针 PMv2 口径：TRUTH §2 B10 + RR13_done 遗产④（探针自设
   SetProcessDpiAwarenessContext(PMv2) 防 200% 缩放坐标虚拟化）。
5. 实证数字（两态各一次）：GetDpiForWindow **192**；物理客户区 **920×1120 =
   2×(460×560)**——B10 修复与 RR13 窗宽均生效。

## 验证证据（卡面口径：两态截图落盘 + tsc/域/全量四绿）

- 展开态截图（Explore 识图子代理复验）：**hash 入口生效**——三块面板齐全
  （①风险雷达 25.4%/48h 碰撞 58.0%+4 因子 ②今日建议 +8.7/软上限 25.9/均匀 7.3/前拉
  1.4 ③用卡规划），文字可读，920×1120 落盘。
- 胶囊态截图（连带更新）：数据完整（CODEX/29%/重置风险 25.4%/卡×3）、**无右缘
  截字**（RR13 基线一致口径）；识图另报折行/滚动条=RR13 已登记遗产①②③，
  顶部白条为本轮新发现（见遗产③）。
- 门禁四绿（worktree 实测 10:55–10:58）：
  1. `npx tsc --noEmit` ✅
  2. 域 `npx vitest run src/ui/` **11/11** ✅（adapters 8 + app-state 3 新增）
  3. 全量 `npx vitest run` **89/89 0failed** ✅（基线 86→89 只升）
  4. 变异红验 ✅ 三要素：改 `appState.ts` 精确匹配 `hash === "#expanded"` →
     `"#mutant"`；ui.app-state.test.ts **1 红**（「#expanded → 起始展开」，期望 true
     实得 false，红在本卡 hash 识别行为）；复原后 3/3 复绿，全量复跑 89/89。
- 构建链：npm run build（vite 673ms）+ cargo build --release --features
  tauri/custom-protocol（2m29s，B01 特性必带；链接警告=RR20 已注记两份 manifest
  并存，无害）；exe 与 WebView2Loader.dll 同目录（target/release 内已就位）。

## 排障遗产（REVIEW 取材，均非本卡范围不扩 scope）

1. **展开态 460 窄窗排版差距**（本卡验收的直接产出）：右缘溢出需横向滚动（头部
   「数据时…」/面板①②文字右切）、面板③出现竖排单字「等/待/最」、「收起」按钮在
   视口外不可达——ExpandedCard 未做窄窗自适应，候选 🔧修卡（横向压缩/可换行布局/
   收起按钮固定可见）。
2. 胶囊态截图顶部偶见贯穿全宽白色横条（8–10 物理像素，RR13 识图未报，本轮报出）
   ——候选小修（疑似 webview 首刷时序或 body 顶边距，可与 RR13 遗产③滚动条一并查）。
3. 探针偶发超大窗口：第一次胶囊态跑出 3072×1779（识图证明确为应用窗口被开到
   全屏大小、内容锚定左上），重跑即恢复 920×1120；根因未深挖（疑似窗口创建
   过渡态句柄/尺寸），探针已修 HWND 等待循环恒假 bug（`for ($i=0; $i -and …)`）
   并加 >2000px 复读防御——REVIEW 若复现可深挖。
4. 探针 `scripts/shot-expanded.ps1` 支持 `-Hash ""` 拍胶囊态（两跳重载后仍回默认
   胶囊，兼作「重载不破坏默认态」验证）；主窗口关闭即整树退出（无残留 webview，
   本轮 tasklist 复核无 resetradar 相关进程）。

## 待用户清单

- 无（发布三步仍按 RR11 待用户执行，无新增）。

## →下轮

- MERGE 班合入 ba11e47（预审：单 commit/7 文件/patch 在位/91a3ddf..main 无代码路径
  交集即 6dd9ed6..main 只看板文件）；拆 worktree 前先 rmdir junction（B09）。
- 其后 WORK：RR15 → RR18 → RR19 → RR16 → RR17（RR17 依赖 RR15）；
  遗产 1（展开态窄窗排版）建议在 REVIEW 拍立卡。
