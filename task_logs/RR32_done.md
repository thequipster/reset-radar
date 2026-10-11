# RR32 done — 图标接入（ui+assets）

- 会话：S1011-1735（2026-10-11 17:36 开工 → 18:0x 交付，时间盒内完卡）
- 基线：main 77c8e0c → 分支 agent/RR32 单 commit（sha 见 BOARD 条目）
- diffstat：21 文件 +144/−12（4 资产替换 + 6 UI 源 + 1 新测试 + 4 截图入库 + 7 证据件）

## 已落

1. **src-tauri/icons 资产替换**（exe/任务栏/窗口图标源头）：
   - icon.ico ← 交付包 icons/reset-radar.ico（8 帧：16/20/24/32/48/64/128/256，全 PNG 帧）
   - 32x32.png ← reset-radar-32.png；128x128.png ← reset-radar-128.png；128x128@2x.png ← reset-radar-256.png
   - icon.icns 无交付保留现件（Windows 目标不受影响；macOS 发行时需补画，见待用户）
   - tauri.conf.json bundle.icon 五件路径不变（值域内替换，零配置改动）
2. **UI 品牌 logo 重绘**（src/ui/icons.tsx RadarLogo）：几何与交付正稿
   reset-radar-mark.svg 逐值一致（viewBox512：外环 r172 sw15 / 内环 r104 sw12 /
   扫描扇形渐变 / 扫描线 / 中心点 r27），色值全部走新增主题 token，无硬编码。
3. **主题 token**（widget.css + theme.ts 双文件对齐，RR27 对齐口径顺延）：
   - dark = 精密蓝正稿：--logo-ring-main #46e4f4 / --logo-ring-inner #179bf1 /
     渐变 rgba(23,155,241,.12)→rgba(70,228,244,.68) / 辉光 drop-shadow(0 0 6px rgba(70,228,244,.45))
   - light = 02-glass 配色：--logo-ring-main #0277c8 / --logo-ring-inner #30b7ef / 辉光 none
     （handoff 第4步防呆：浅色底换深色调，勿将亮色透明标放白底）
   - CompactBar/DashboardPanel 的 .logo：color 弃用（SVG 内不再吃 currentColor），
     filter 改 var(--logo-glow)（token 完整 filter 值，light 为 none——drop-shadow(none) 非法）。
4. **新域测试** src/ui/__tests__/ui.brand-icon.test.ts（10 条）：
   - 资产指纹 4 条：src-tauri/icons 四件与交付包原件字节一致（Buffer.equals）
   - 渲染几何 3 条：renderToStaticMarkup（React.createElement，.ts 不吃 JSX）断言
     viewBox/r=172/104/27、扇形与扫描线 path d 与交付源逐字符、色值全走 token 无硬编码 hex
   - token 对齐 3 条：widget.css 深浅块色值 + theme.ts 表 ↔ CSS 同 token 同值交叉

## 门禁四绿 + Rust 门（2026-10-11 worktree 实跑）

1. `npx tsc --noEmit` ✅
2. UI 域 `npx vitest run src/ui/` **91/91** ✅（基线 81 → 91 只升）
3. 全量 `npx vitest run` **248/248 0 failed** ✅（基线 238 → 248 只升；变异复原后终跑同值）
4. 变异红验两组 ✅：
   - 变异A（资产）：icon.ico 换回 HEAD 旧 Tauri 件 → 红 1 条「icon.ico ↔ reset-radar.ico」
     （字节一致断言，红在资产指纹 describe）→ 交付包复原 cp → 10/10 绿
   - 变异B（logo 色值）：外环 stroke 硬编码 #38bdf8 → 红 1 条「色值全部走主题 token（无硬编码
     十六进制）」→ 复原 var(--logo-ring-main) → 91/91 绿
5. `cargo check --tests` ✅ 11.16s（gnu 工具链，PATH 按 RUNBOOK §10 /c/ 风格）
6. `node scripts/check-release.mjs` ✅ 版本同步 0.1.0 + README 相对链接 13 条可达（未动 README）

## 实证（exe 内嵌图标 + 两主题 UI）

- **release 构建**：`cargo build --release --features tauri/custom-protocol`（B01 特性必带）
  36.19s，产物 27,746,224 字节（旧 27,696,434，差量≈新 ico 嵌入）；exe SHA256
  06882AD1E112D32EB748112E6BCD047EB2B7192314BBEEEE62D3A043924D4DCF。
- **exe 内嵌图标字节级实证**（task_logs/RR32_artifacts/exe-icon-bytes.txt）：交付 ico 全部
  8 帧（16–256px，PNG 帧）帧数据前 96 字节在 exe 全文件逐一命中（偏移 17046752–17065512，
  .rsrc 区）——exe 内嵌 = 交付 ico 逐帧，非 Tauri 默认图标。
  注：ExtractAssociatedIcon 渲染 MD5 与 ico 帧渲染 MD5 不同，为 shell 渲染管线（alpha
  预乘等）差异，视觉识图已证两者构图逐像素一致；字节级探针为准。
- **两主题截图 4 张**（PrintWindow PW_CLIENTONLY|PW_RENDERFULLCONTENT 离屏，B09 机制②；
  ?theme= 截图入口 + CDP 两跳导航）：docs/screenshots/20261011-rr32-{capsule,expanded}-{dark,light}.png，
  客户区 920×152 / 920×1380（PMv2 2× 逻辑，B10 修复在）。
- **识图子代理复核（Explore）6 图全 PASS**：深色 logo=亮青双环+扇形+中心点对比清晰；
  浅色 logo=深蓝主环白底高对比（handoff 防呆达标）；exe 图标=深蓝圆角底板+青色双环雷达，
  非 Tauri 默认（白底几何），与交付帧视觉一致；界面无破损错位。

## 真值出处

- 图标几何/配色：docs/design/icons-20261011/icons/source/reset-radar-mark.svg（推荐正稿）、
  02-glass.svg（浅色配色）——几何逐值移植（r172/104/27、sw15/12/7、扇形/扫描线 path d 原字符）。
- 接入步骤：docs/design/icons-20261011/handoff/设计与接入说明.md「Tauri 接入建议」四步
  （复制 ico/配置核对/重建核验/界面 logo + 浅色配色防呆 + shell 缓存提示）。
- 资产原件：docs/design/icons-20261011/icons/reset-radar.ico 与 icons/png/reset-radar-{32,128,256}.png
  （SHA256SUMS 40/40 已由 S1011-1722 核验；本卡以字节一致断言锁死不漂移）。
- 构建口径：TRUTH §2 B01（custom-protocol）、B02（WebView2Loader.dll 同目录，已就位）、
  B09 机制②（PrintWindow 离屏）、B10（PMv2 920=2×460）。
- 无参考实现借鉴（纯设计交付接入，非算法卡）。

## 待用户清单

- 发布三步（push/tag/release）仍留用户；发布后注意 **shell 图标缓存可能延迟显示旧标**
  （handoff 提示，非缺陷）。
- macOS 目标 icon.icns 无设计交付，仍为 Tauri 默认件——若发 macOS 版需补画或接受默认
  （Windows 目标不受影响）。

## 排障遗产（REVIEW 取材）

1. 识图子代理两条非阻断观察：①展开面板（概览页）紫色横幅以下留白偏大（RR31 分页后概览
   内容密度低，属设计议题非破损）；②浅色主题建议横幅副文案「建议后剩余 61.9%」淡紫压浅紫
   对比度偏低——RR29（对比度逐组合 4.5:1 留证）已覆盖该面，不重复立卡。
2. shot-expanded.ps1 偶发 CDP 首页 about:blank（/json/list 顺序），重跑即中
   http://tauri.localhost/（本卡 3/4 次一次中，1 次重试 2 次内中）；RR14 已有同款注记。
3. ExtractAssociatedIcon 渲染 MD5 不可作 ico 替换判据（shell 渲染管线差异）——用帧字节
   探针（本卡 exe-icon-bytes.txt 方法）。

## →下轮

- MERGE 班：cherry-pick 本卡单 commit → 树恒等（涉及路径含 4 个二进制资产，diff 0 字节
  口径不变）；worktree 拆除前先拆 node_modules 与 src-tauri/target 两个 junction
  （本卡新增 target junction，B09 硬前提）。
- 剩余待领：RR29（UI 可访问性收尾）/ RR30（依赖用户 CI 首跑）。
