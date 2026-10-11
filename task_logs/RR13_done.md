# RR13 done — 胶囊右缘截断修复（ui 域）🟡待合入

- 会话：S1011-0913 领卡（时间盒到点留证）→ **S1011-1013 续作收尾交付**
- 分支/commit：agent/RR13 @ **a994f73**（单 commit；基于 main 91a3ddf——RR20 已在；
  patch 备份 task_logs/RR13.patch 对 main 干净适用）
- diffstat：4 文件 +46/-2 —— src-tauri/tauri.conf.json（width 420→460 + minWidth 460
  防拖窄回归）/ README.md（图引→20261011-capsule-460.png 无截断真图）/
  docs/screenshots/20261011-capsule-460.png（本轮重截 920×1120 物理像素）/
  scripts/shot-capsule.ps1（PrintWindow 截图脚本，RR14 可复用）
- worktree：../reset-radar_wt/RR13 **保留给 MERGE 班拆（内含 node_modules junction，
  拆前必须先 cmd //c rmdir node_modules，B09）**

## 真值出处

1. 根因与修复链：TRUTH §2 **B10**（exe 内嵌 manifest 无 dpiAware→200% 缩放 CSS 视口=
   窗宽/2；RR20 build.rs 补 PerMonitorV2 后 manifest dump 含 dpiAware）+ DECISIONS **D020**
   （RR13 卡面两修向在本机作废、转立 RR20、转待领避免槽死锁）。
2. 胶囊自然宽 **421 CSS px**（上轮 IAB vite preview 900px 视口实测，注入文案 100.0% 档
   最宽 413px）→ 460 视口放下且余 ~39px（本轮实测吻合：余量 35–40px）。
3. 本轮修复生效实证（worktree release 实跑，探针 shot-rr20.ps1 复用，探针进程自设
   PMv2 防坐标虚拟化）：GetDpiForWindow **192**（修复前病灶 96）；物理客户区
   **920×1120 = 2×(460×560)**（修复前 460 窗宽物理=460×560，视口仅 230）。

## 验证证据（卡面口径：release 截图无截断 + 四绿 ui 域）

- 截图复验（Explore 识图子代理，RUNBOOK §9.1 口径，主会话不读图）：**PASS**——胶囊
  整条完整（约 25→420 CSS px），「重置风险 25.4%」子胶囊与右端「卡×3」完整可见，
  右缘余量 35–40 CSS px，真实数据 29% 端到端；无白屏/黑块/错位。
- 门禁四绿（worktree 实测 10:17）：
  1. `npx tsc --noEmit` ✅
  2. 域 `npx vitest run src/ui/` **8/8** ✅
  3. 全量 `npx vitest run` **86/86 0failed** ✅（=main 基线，无新增）
  4. 变异红验：**不适用口径**（沿上轮+RR12 先例——本卡零 src 逻辑改动，纯窗口配置
     +文档+证据件，无可变异代码路径；行为级红证=三轮截图演进实证：420 窗宽截断→
     460 无 DPI 仍截断（切点逐字符吻合 230 视口模型）→460+DPI 修复完整无截断，
     width 参数与 manifest 修复的生效均有独立观测）。
- 构建链：npm run build（vite 658ms）+ cargo build --release --features
  tauri/custom-protocol（28.58s，B01 特性必带；链接警告 multiple non-default
  manifests=RR20 已注记的两份 manifest 并存，生效者已实证为含 dpiAware 份）。

## 排障遗产（REVIEW 取材，均非本卡范围不扩 scope）

1. 「周额度剩余」标签在 460 视口下换行生硬（「余」字单独成行）——排版微调候选。
2. 胶囊右端「卡×3」为竖排堆叠——是否符合设计意图可议。
3. 窗口右缘见浅灰竖直滚动条（页面纵向溢出迹象，胶囊态不应滚动）——疑似 body
   高度溢出 1–2px，候选小修。
4. shot-capsule.ps1 未设探针自身 PMv2（200% 缩放下 GetClientRect 会被虚拟化）——
   RR14 起建议直接复用 shot-rr20.ps1 口径（本轮即如此）。

## 待用户清单

- 无（发布三步仍按 RR11 待用户执行，无新增）。

## →下轮

- MERGE 班合入 a994f73（预审：单 commit/4 文件/对 main 干净/与在飞无路径交集）；
  拆 worktree 前先 rmdir junction（B09）。
- 其后 WORK：RR14（展开态截图，复用 shot-rr20.ps1 + hash 入口）→ RR15 → RR18 →
  RR19 → RR16 → RR17。
