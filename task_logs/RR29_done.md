# RR29 done — UI 可访问性收尾（ui）

- 会话：S1011-1755（2026-10-11 18:12 领卡 → 交付，时间盒内完卡；本班前半程 MERGE RR32→main 7e5dffa）
- 基线：main 791b89c → 分支 agent/RR29 单 commit（sha 见 BOARD 条目）
- diffstat：核心=src/ui/contrast.ts（计算核心）+ contrastPairs.ts（42 对配对登记）+
  ui.contrast.test.ts（13 域测试）+ scripts/contrast-report.mjs（报告渲染壳）+
  scripts/probe-tab-order.ps1（Tab 键序探针）+ docs/a11y-contrast-20261011.md（84 组数值报告）+
  docs/screenshots/20261011-rr29-credits-zero-decision.png + task_logs/RR29_artifacts/ 键序四件。

## 已落（G1 三口径逐项）

1. **对比度逐组合数值核验**（docs/a11y-contrast-20261011.md）：
   - 计算=WCAG 2.x 相对亮度法；档位 normal 4.5 / large·graphic 3.0（1.4.11）；
   - 42 对配对 × 深/浅两主题 = 84 组数值全登记（含出处 CSS 规则、rgba 合成口径）；
   - 数值唯一源=src/ui/contrastPairs.ts，域测试 84 组两位小数快照锁定 + 不达标清单锁定；
   - 结果：深色 33/42 达标、浅色 20/42 达标；**浅色建议横幅白字压浅紫 1.23–1.51 为真实
     可读性缺陷（识图实证：箭头不可见/副文案边缘）→ 立 RR34 修卡**；tertiary 系与浅色
     Tailwind 600 系语义色列设计取舍留档（详见报告定夺段）。
2. **Tab 键序探针实测**（scripts/probe-tab-order.ps1 + task_logs/RR29_artifacts/ 四份记录）：
   - 胶囊态：唯一控件=「展开完整面板」（aria-label）单控件循环自指 ✓；
   - 展开态：9 控件全可达（主题×3→收起→退出→页签×4），DOM 序=视觉序，循环回首个 ✓；
   - 用卡页变体：+「规划依据」sectionLink 入序 ✓；数据页变体：+「刷新额度」primaryButton
     +「复制摘要」ghostButton 入序 ✓；
   - 全部可交互控件均有 aria-label 或自文本；焦点环 :focus-visible 2px accent-blue-bright 在。
3. **credits-zero 决策卡视口截图**（920×1380，PMv2 192；-ClickTab "用卡" 页签视口）：
   - 首拍（概览页视口）识图复核发现决策块缺失 → 追根因：demo 夹具 credits-zero/unknown
     基于 baseSnapshot（周窗 resetsAt=null）→ cardPlan=null → 决策卡/配速/图表全不渲染，
     **目标分支（no-credits 决策）从未被该场景测到（夹具缺陷）**；
   - 修复：demoScenarios.ts 抽 healthyWeeklyWindow() 共用底，两卡数场景换有效周窗
     （+域测试断言 resetsAt 在未来）；重建（npm run build + cargo release 32.43s 增量）；
   - 重拍识图复核全过：绿色「用卡决策」卡三层文字（无可用重置卡；保持风险与配速信息
     可读）清晰完整、四配速指标卡全显、候选日柱状图三柱+数值标签齐全、无截断重叠。

## 识图子代理复核（Explore 只读，共四轮）

- 浅色/深色横幅（docs/screenshots/20261011-rr32-expanded-{light,dark}.png）：浅色横幅主标题
  勉强可读、副文案勉强可读（发虚边缘）、右侧 › 箭头几乎不可见；深色同位四要素全清晰；
  两图其余区域正常（环中心 81%/77% 灰字对比略低但可读）——与数值计算吻合，RR34 定档依据。
- credits-zero 首拍（概览视口）：页签/双环/文案正常，但决策块缺失+下半屏空白 → 引出夹具
  缺陷修复（见上）；另观察到采集卡副文案「北京时」/「间」孤字换行（RR34 取材顺带面）。
- credits-zero 重拍（用卡视口，修复后）：全要素正确渲染，PASS（见上）。

## 门禁四绿（2026-10-11 worktree 实跑，夹具修复后终跑）

1. `npx tsc --noEmit` ✅
2. UI 域 `npx vitest run src/ui/` **105/105** ✅（基线 91 → 105 只升，+14 新测试：
   contrast 13 + demo 卡数场景周窗 1）
3. 全量 `npx vitest run` **262/262 0 failed** ✅（基线 248 → 262 只升）
4. 变异红验 ✅：contrast.ts 线性化指数 2.4→1.2（改坏 WCAG 公式）→ 红 4 条
   （#767676 锚点 / dark·light 快照 / 不达标清单）→ 字节复原 → 13/13 复绿。
   （三要素：改了什么=公式指数；哪条红=上述 4 条；红在哪=公式锚点与数值快照。）
5. Rust 门不适用：未触 src-tauri/ 代码（exe 构建只为截图取证：npm run build +
   cargo build --release --features tauri/custom-protocol 32.43s 增量，B01 特性）。
6. `node scripts/contrast-report.mjs` 报告再生冒烟 ✅（stdout 重定向口径，沿 §9.1）。

## 真值出处

- WCAG 2.x 相对亮度与对比度定义、4.5:1/3:1 档位与 1.4.11 图形组件要求：
  WCAG 2.1 官方（Understanding SC 1.4.3/1.4.11；相对亮度公式 web.dev/articles/color-contrast
  同式）；锚点测试值（#767676 on #fff ≈4.54）为社区公认边界灰。
- 配对与色值：src/ui/widget.css（两主题 token 块，CSS_ONLY_TOKENS 由域测试解析该文件锁定
  防漂移）+ src/ui/theme.ts THEME_VARIABLES 表（ui.theme.test 既有对齐）+ 三个 module.css
  的实际 color/background 共现规则（逐条出处记在 contrastPairs.ts 与报告索引表）。
- 键序机制：CDP Input.dispatchKeyEvent + Runtime.evaluate 读 activeElement（probe-tab-order.ps1，
  沿 shot-expanded.ps1 的 B09 机制②/B10 PMv2/两跳导航基建）；NOACTIVATE 用户路径=点击激活后
  Tab，页面内焦点链一致（口径注记于报告与探针头注）。
- credits-zero 场景：src/ui/demoScenarios.ts parseDemoScenario hash 入口（#expanded&demo=credits-zero）。
- 无参考实现借鉴（取证计算卡，非移植卡）。

## 待用户清单

- 浅色主题横幅可读性缺陷已立 RR34（P2），修法涉及视觉取向（深字深底 vs 换 Plain 系），
  用户可在线时直接点单；tertiary/浅色语义色取舍同理（报告定夺 3）。
- 发布三步（push/tag/release）仍留用户（含 RR30 的 CI 首跑 DPI 取证依赖）。

## 排障遗产（REVIEW 取材）

1. probe-tab-order.ps1 首版 PowerShell 管道陷阱：`Send-Cdp "m" @{...} | ConvertTo-Json` 中
   hashtable 被直接字符串化（System.Collections.Hashtable）产生非法 JSON → CDP 无响应 →
   ReceiveAsync 无限阻塞。修法：先 `$j = @{...} | ConvertTo-Json -Compress` 再传参。
   （后续写 pwsh+CDP 探针一律先序列化再传。）
2. 胶囊态探针 hash 用 "#capsule"（Mandatory 参数不吃空串；无 expanded/peek 段即回落胶囊态）。
3. credits-zero 截图两跳导航正常，920×1380（展开态高度较 rr32 的 1380 一致）。

## →下轮

- MERGE 班：cherry-pick 本卡单 commit → 树恒等；worktree 拆除前先拆 node_modules 与
  src-tauri/target 两个 junction（本卡为截图取证挂了 target，B09）。
- RR34（浅色横幅对比度修复）待领；RR30 仍依赖用户 CI 首跑。
