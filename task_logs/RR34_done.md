# RR34 done — 浅色横幅对比度修复（ui）

- 会话：S1011-1821（2026-10-11 18:30 领卡 → 交付；本班前半程 MERGE RR29→main 0b1370d）
- 基线：main e831974 → 分支 agent/RR34 单 commit（sha 见 BOARD 条目）
- diffstat：widget.css（两主题 token）+ theme.ts（浅色 --warn 同步）+
  DashboardPanel.module.css（sub/decisionIcon token 化）+ contrastPairs.ts（登记表+配对）+
  ui.contrast.test.ts（快照+不达标清单）+ docs/a11y-contrast-20261011.md（再生成+定夺）+
  shot-expanded.ps1（-Theme 参数）+ 双主题截图两张 + 本 done。

## 修法（卡面候选①，无人值守裁决）

浅色「今日建议」横幅由浅紫渐变（#ede4ff/#e6dcff/#e0e7ff）换**深紫渐变与深色统一**
（#9333ea/#7c3aed/#4c1d95），白字/白系全要素达标；**保持横幅的紫语义与视觉层级**
（候选② Plain 系会削弱信息层级，弃）。深色 a 段同步 #a855f7→#9333ea（白字 3.96→5.38）。
副文案与决策图标 token 化（--banner-sub / --decision-icon）——单一色值无法两主题通吃
（黄亮对深底/黄深对浅底），token 化让两主题各取达标值。

## 逐项数值（84 组快照锁定，报告=docs/a11y-contrast-20261011.md）

| 配对 | 深色 旧→新 | 浅色 旧→新 |
|---|---|---|
| white-on-banner-a/b/c | 3.96/5.70/10.95 → **5.38/5.70/10.95** | 1.23/1.31/1.23 → **5.38/5.70/10.95** |
| label-on-banner-a/b | 3.96/5.70 → **5.38/5.70** | 1.23/1.31 → **5.38/5.70** |
| number-on-banner-a/b/c | 3.96/5.70/10.95 → **5.38/5.70/10.95** | 4.65/4.35/4.63 → **5.38/5.70/10.95**（紫→白） |
| sub-on-banner-a/b | 2.14/3.09 → **4.56/4.83** | 1.51/1.41 → **4.56/4.83** |
| tail-on-banner-a | 3.96 → **5.38** | 1.23 → **5.38** |
| banner-icon | 3.06 → **4.00** | 1.18 → **4.00** |
| decision-icon（顺带） | 6.15（保持） | 1.30 → **5.81**（#854d0e） |
| dot-warn-on-panel（顺带） | 8.48（保持） | 2.99 → **4.71**（--warn #b45309） |

**达标数只升**：深色 33→**38**/42，浅色 20→**31**/42。余留不达标均为 RR29 定夺沿袭的
设计取舍（深 4：tertiary×3+white-on-accent-blue；浅 11：tertiary/blue-bright/cyan/success
语义色系），详见报告定夺段。

## 改动清单

1. `src/ui/widget.css`：深色 --purple-banner-a #9333ea + 新 token --banner-sub/--decision-icon
   两主题值；浅色 banner 三值换深紫、--suggestion-number #ffffff、--warn #b45309（与
   --warn-text 同值语义；--warn 仅用于状态点底色与边框，提深无回归面）。
2. `src/ui/theme.ts`：浅色 --warn 同步 #b45309（THEME_VARIABLES 表与 CSS 双源一致）。
3. `src/ui/DashboardPanel.module.css`：.suggestionSub/.decisionIcon 改 var() 引用。
4. `src/ui/contrastPairs.ts`：CSS_ONLY_TOKENS(_LIGHT) 表更新+注释；sub/decision-icon
   配对 fg 换 token 名。
5. `src/ui/__tests__/ui.contrast.test.ts`：84 组快照数值+两主题不达标清单更新。
6. `docs/a11y-contrast-20261011.md`：contrast-report.mjs 再生成+定夺段补写（RR34 基准）。
7. `scripts/shot-expanded.ps1`：新增 -Theme 参数（先导航 base 落 localStorage 键再两跳
   重挂，App 读到目标主题；RR29 排障遗产①口径——CDP 参数先 ConvertTo-Json 再传）。
8. 双主题截图 docs/screenshots/20261011-rr34-expanded-{light,dark}.png（920×1380，
   PMv2 192，ThemePreset 键值实证生效）。

## 门禁四绿（2026-10-11 worktree 实跑）

1. `npx tsc --noEmit` ✅
2. UI 域 `npx vitest run src/ui/` **105/105** ✅（基线 105 持平——本卡改快照不改测试数）
3. 全量 `npx vitest run` **262/262 0 failed** ✅（基线 262 持平）
4. 变异红验 ✅ 两轮：①widget.css 浅色 banner-a 回旧值 #ede4ff →「浅色块逐 token 一致」
   红 1；②contrastPairs.ts 登记表同位回旧值 → 红 3（token 一致+light 数值快照+不达标
   清单）→ 均字节复原 → 13/13 复绿。（三要素：改了什么=浅色 banner-a token 值回旧；
   哪条红=上；红在哪=CSS↔登记表对齐哨兵与数值快照双锁。）
5. Rust 门不适用：未触 src-tauri/ 代码（cargo release 仅为截图取证，31s 增量，B01 特性）。

## 识图子代理复核（Explore 只读，两图）

- 浅色：横幅四要素（主标题/副文案/+18.4 大数字/›箭头）全清晰不发虚；深紫渐变到位、
  与周围浅色卡片形成合理 CTA 层级不刺眼；圆形图标清晰。PASS。
- 深色：四要素全清晰；a 段加深后与深色背景衔接自然无发黑死块。PASS。
- 非阻断观察（既有、与本卡无关，RR29 已录）：采集卡副文案「北京时/间」「北京/时间」
  两处换行孤字——文案排版面，留 REVIEW 取材。

## 真值出处

- WCAG 2.x 对比度定义与档位（4.5/3.0、1.4.11）：沿 RR29 已核源（Understanding SC
  1.4.3/1.4.11；公式=contrast.ts 域测试锚点锁定）。
- 色值选择依据：本仓 contrast.ts 实算（本 done 上表全数值），非猜测；#9333ea/#f3e8ff/
  #854d0e/#b45309 为 Tailwind 色板 purple-600/purple-50/yellow-800/amber-700 邻档值，
  与既有 token 语言（--accent-purple 系同族）一致。
- 横幅结构与硬编码色：src/ui/DashboardPanel.module.css .suggestionBanner 系（290-380）；
  token 现状：src/ui/widget.css 两主题块（RR29 已逐 token 登记 CSS_ONLY_TOKENS）。
- 主题记忆机制：src/ui/theme.ts THEME_STORAGE_KEY="reset-radar.theme"（探针 -Theme
   参数据此落键）。
- 无参考实现借鉴（修复卡，色值=本仓计算）。

## 待用户清单

- 余留不达标 15 组（深 4+浅 11）均为语义色/三级文本设计取舍，报告定夺段已列——用户
  在线时可点单是否整体调深（会改变浅色主题色彩语言）。
- 发布三步（push/tag/release）仍留用户（RR30 的 CI 首跑 DPI 取证也依赖）。

## 排障遗产（REVIEW 取材）

1. 换行孤字两处（「北京时/间」「北京/时间」）——副文案排版，非对比度面。
2. 环内百分比灰字（81%/77%/78%/62%）对比偏低可读——识图两轮均提，属环内弱化设计，
   与 tertiary 系取舍同类。

## →下轮

- MERGE 班：cherry-pick 本卡单 commit → 树恒等；worktree 拆除前先拆 node_modules 与
  src-tauri/target 两个 junction（本卡为截图取证挂了 target，B09，沿 RR29 同款）。
- 合后无🟠无🟡 → REVIEW 第 3 轮（RR30 仍依赖用户 CI 首跑）。
