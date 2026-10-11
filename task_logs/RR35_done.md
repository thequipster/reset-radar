# RR35 done — ui 打磨：横幅尾箭头视觉权重 + 副文案孤字换行（两主题同修）

- 会话：S1011-1849｜交付 2026-10-11 19:40（看板钟）｜commit：agent/RR35 @ **fdef9a8**（单 commit，基于 main ba7d0e8）
- diffstat：9 文件 +70/−7（含 2 张二进制截图、1 个新测试文件）
- patch 备份：task_logs/RR35.patch（324KB，对 main 干净适用——主仓 HEAD 即 base）

## 交付内容

1. **G1① 横幅尾箭头视觉权重**（`DashboardPanel.module.css` .suggestionTail）：
   字号继承(~12px)→**22px**、字重 400→**700**（与横幅主数字同量级）、不透明度
   0.65→**0.9** 且 token 化 `--banner-tail`（widget.css 深/浅两块同值 rgba(255,255,255,0.9)，
   沿 RR34 `--banner-sub` token 化先例，由 ui.contrast 的 token 对齐测试锁定 widget.css↔登记）。
2. **G1② 采集状态卡孤字换行**（`DashboardPanel.tsx` 通知行 + CSS）：
   `{time} 北京时间` 包 `.timeNoWrap`（white-space: nowrap）——断行点落在「·」后，
   时间段整体不断行，不再出现孤字「间」。`overflow-wrap: anywhere` 保留在
   .noticeSub（错误消息长文本仍可断）。
3. **顺带修复（卡内裁决 D029）**：识图复核挖出卡面外同类差距——「周额度剩余」卡
   副文案「自然重置 {time} 北京时间」同根因拆行（「时间」独占一行）；同款 `.timeNoWrap`
   修复（quotaSub），tsx 结构锁定断言 count=2 防单边回退。
4. **登记/报告同步**：contrastPairs.ts tail-on-banner-a fg 字面→`--banner-tail` token
   （CSS_ONLY_TOKENS/‥LIGHT 双表）；a11y 报告 3 处 tail 行 + 定夺节补 RR35 段
   （脚本 `contrast-report.mjs > 重定向` 会冲掉手工定夺节——本轮改为恢复原文手工同步，
   后续班注意）。**数值快照不变（5.38）**：RR29 口径半透明前景按字面 rgb 亮度近似
   （alpha 不入亮度），0.65→0.9 数值不动，达标数深 38/浅 31 不变——本轮是视觉权重
   （尺寸）修复，非对比度数值修复，与 REVIEW G1 定性一致。
5. **新测试** `src/ui/__tests__/ui.banner-polish.test.ts`（4 条）：解析
   DashboardPanel.module.css 锁 .suggestionTail 的 22px/700/var(--banner-tail) 与
   .timeNoWrap 的 nowrap（沿 ui.contrast 解析 widget.css 同款先例）+ tsx 结构 count=2。

## 真值出处（证据铁律）

- 卡面差距：docs/review-20261011-round3.md G1（Explore 识图子代理双主题独立复核转录）
- tail 对比度现值 5.38 达标：docs/a11y-contrast-20261011.md 两主题表行 +
  ui.contrast.test.ts 快照（本卡前提：数值已达标，修尺寸/权重）
- token 化模式：RR34 先例 `--banner-sub`（contrastPairs.ts:17 注释链）+ ui.contrast.test.ts
  「CSS 独有 token 与 widget.css 对齐」测试结构
- 主数字量级参照：.suggestionNumber 22px/800（DashboardPanel.module.css:350-356）
- 副文案结构：DashboardPanel.tsx:239（采集状态）/ :306（周额度，D029 顺带）
- 无参考实现借鉴（纯本项目 UI 打磨，不涉 MIT 移植面）

## 门禁四绿

1. **tsc**：`npx tsc --noEmit` 退出 0 ✅
2. **域**：`npx vitest run src/ui/` **109/109** ✅（基线 105→109，+4 新）
3. **全量**：`npx vitest run` **266/266 0 failed** ✅（基线 262→266 只升）
4. **变异红验**（四组，三要素=改了什么/哪条红/红在哪）：
   - 红1：.suggestionTail font-size 22px→12px → banner-polish「.suggestionTail 与主数字
     同量级：22px / 700」断言红（expected font-size 22px）→ 复原绿 ✅
   - 红2：.noticeSubTime(now .timeNoWrap) 规则体删 white-space → banner-polish
     「存在且整段不断行」红（rule 不匹配 nowrap）→ 复原绿 ✅
   - 红3：widget.css 深色块 --banner-tail 0.9→0.65 → ui.contrast「深色块逐 token 一致」红
     （cssVar 与登记不等）→ 复原绿 ✅
   - 红4（顺带面）：tsx 删一处 styles.timeNoWrap 引用 → banner-polish「两处副文案均使用
     .timeNoWrap（count=2）」红 → 复原绿 ✅
- Rust 门不适用：未触 src-tauri/ 源码（release 构建仅为截图取证）。

## UI 实证（release + 识图独立复核两轮）

- 构建：`npm run build`（vite ✓ 849ms）+ `cargo build --release --features
  tauri/custom-protocol`（✓ 33.1s，B01 特性带齐；warning 为 B08 已知 .rsrc 无害）
- 截图：shot-expanded.ps1 -Theme dark/light → docs/screenshots/20261011-rr35-expanded-{dark,light}.png
  （920×1380 物理=2×逻辑，GetDpiForWindow 192 PMv2 生效，PrintWindow(3) True）
- 识图第一轮：卡面两处 PASS + 挖出周额度卡同类拆行（→D029 顺带修复）；
  识图第二轮（终审，修复后重拍）：**两主题 × 三核对项全 PASS**（箭头醒目与主数字同量级、
  两卡时间整段不断行、RR34 横幅无回归、无溢出/截断/重叠）。

## 待用户清单

- 无（纯 UI 打磨，无行为/协议变化）。

## 排障遗产

- `contrast-report.mjs > docs/a11y-contrast-20261011.md` 重定向会把手写「定夺」节替换为
  脚本占位文本——再生成时须先备份定夺节手工回填（本轮实操验证）。
- mklink 经 Git Bash 直接调用会被路径转换吃参数（/J 与 C:/ 双翻车）；可靠做法是
  `pwsh -NoProfile -Command 'New-Item -ItemType Junction ...'`（本轮实证，B09 补充口径）。

## →下轮

- worktree 留 MERGE 班拆（node_modules + src-tauri/target 双 junction 先拆，B09）。
- 下一班建议：MERGE 合 RR35 → 领 RR36（README 状态行刷新，docs 小卡）。
- RR30 仍等用户 CI 首跑。
