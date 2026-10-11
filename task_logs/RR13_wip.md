# RR13 wip — 胶囊溢出小修（ui 域）【🟠在飞，→下轮续作】

- 会话：S1011-0913（09:17 领卡；09:55 时间盒到点留证收工，未交付）
- 分支：agent/RR13 @ **1482ca9**（WIP commit；worktree ../reset-radar_wt/RR13，
  **内含 node_modules junction——worktree remove 前必须先 cmd //c rmdir node_modules**，B09）
- 卡面：窗宽 420 下胶囊右侧「重置风险」标签截断 → 修向（460 或压 padding）+ README 换图；
  验证口径=release 截图无截断 + 四绿（ui 域）

## 本轮已完成

1. MERGE 前置（同会话早段）：RR12 artifact 批已合入 main 6360778（树恒等✅ 86/86✅）
2. 落码（在 worktree @ 1482ca9）：
   - tauri.conf.json：width 420→**460** + **minWidth 460**（防用户拖窄回归）
   - scripts/shot-capsule.ps1：PrintWindow(B09 机制②) 截图脚本（可复用，RR14 也要用）
   - docs/screenshots/20261011-capsule-460.png：460 窗宽 release 实跑截图（**仍有截断**，见下）
   - README.md:18 图引已指向新图（待最终复验后一并交付）
3. 门禁前三绿（worktree 实测）：tsc✅ / ui 域 8/8✅ / 全量 86/86 0failed✅
   （变异红验按 RR12 先例"不适用"口径：本卡零 src 逻辑改动，纯窗口配置+文档+证据件；
   行为级红证=旧 420 截图 vs 新 460 截图的截断位置移动本身就是宽度参数生效的实证）

## 证据链（根因=DPI 无感知，卡面两修向在本机作废——D020）

1. 识图子代理两轮审查（旧 420 图/新 460 图）：均右缘截断，新图仅多显约 1 个汉字
   （「剩」仍半切），风险标签与卡×N 始终不可见 → 460 不够。
2. IAB 浏览器 vite preview 实测（900px 视口）：胶囊自然宽 **421.3 CSS px**，末元素右缘 398
   → 460 窗口容器 428px 本应放下 → 截断必另有根因（注入文案复测：—/24.5%/100.0% 档
   384/406/413px，位宽波动 ~29px）。
3. 注册表 AppliedDPI=**192**（200% 缩放；pwsh 不感知时 Screen.Bounds=1536×960=物理/2 旁证）。
4. exe 内嵌 manifest dump（python 读 `<assembly` 段）：**只有 Common-Controls v6 依赖，
   无 dpiAware**——B08 正规化的 manifest 未保留 Tauri 默认 DPI 声明 → 进程 DPI 无感知 →
   窗口按物理像素建 → WebView2 CSS 视口=窗宽/2：460→230、420→210。
5. 模型闭合验证：420 图（视口 210）切点=内容第 ~166px 处（「度」半切）✅；
   460 图（视口 230）切点=内容第 ~186px 处（「剩」半切）✅ —— 逐字符吻合。
6. 全部登记：TRUTH §2 **B10** + DECISIONS **D020** + 立 **RR20**（data-layer 修 manifest）。

## →下轮续作指引（按序）

1. **前置：RR20 合入**（manifest 补 dpiAware PerMonitorV2；本卡 conf 的 460/minWidth 保留）。
2. RR20 后本卡收尾：worktree（junction 已在）npm run build + cargo build --release
   --features tauri/custom-protocol（PATH 见 RUNBOOK §10 /c/ 风格）→
   pwsh scripts/shot-capsule.ps1 重截 → **识图子代理复验无截断**（若 RR20 使 CSS 视口=460，
   胶囊 421px 应完整且余 ~39px——留意 100.0% 档 413px 仍在内）。
3. 复验过 → README 图引已是新图，核对一次；门禁复跑（tsc/ui 域/全量）；
   done（真值出处=B10 证据链+D020 裁决+421px 实测）→ format-patch → BOARD🟡 → BACKLOG
   状态行 → 删本 wip → 心跳。**拆 worktree 前先 rmdir junction（B09 硬前提）。**
4. 若 RR20 修后截断仍在（模型有未 foresee 因素）：回 wip 记录新证据，勿硬交付。
- 备注：RR14（展开态截图）可复用 scripts/shot-capsule.ps1；hash 入口属 RR14 范围勿并入本卡。
