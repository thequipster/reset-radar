# RR40 done — 「采集状态」卡副文案分隔点「·」行缘悬挂收敛（去点改间距）

- 会话：S1011-2010｜交付 2026-10-11 20:22｜base main 133c0a7
- 分支/commit：agent/RR40 @ **f0f44f0**（单 commit；5文件 +36/−10，含 2 张二进制截图）
- patch 备份：task_logs/RR40.patch（310KB，对 main `apply --check` 干净适用✅）

## 真值出处（证据链，全本仓实测，无外部源）

| # | 事实 | 出处 |
|---|------|------|
| 1 | 缺陷现象：RR38 结构下双主题渲染「最近更新成功」/「· 10/11 … 北京时间」两行，「·」行首顶格 | docs/review-20261011-round5.md §2/§3 G1（识图子代理双主题独立复核 FAIL×2）；task_logs/RR12r5_artifacts/ |
| 2 | 修复前结构：「·」在 nowrap 段首位 | src/ui/DashboardPanel.tsx:239（base 133c0a7） |
| 3 | 换行必发的宽度条件：notices 为 `grid-template-columns: 1fr 1fr`，采集状态卡文本区约 165–170px，副文案全串（10px 字号）约 170px 贴边 | src/ui/DashboardPanel.module.css:134-138 + .noticeSub font-size 10px |
| 4 | 两种绑定形态互为镜像缺陷：「·」留段外=行尾悬挂（RR38 实证 round4 G2）；并入段内=行首顶格（round5 G1）→ 绑定两侧任何一侧都必悬一处 | round4/round5 报告对照 |
| 5 | 修向依据：卡面候选②「去「·」改间距/等效分隔样式」（候选① nbsp 绑前文会复活 RR38 行尾形态，弃） | BACKLOG RR40 卡面修向 |

## 改动内容

1. **src/ui/DashboardPanel.tsx:239**：去掉 nowrap 段首的「· 」，段回缩为纯时间段
   `{beijingShort(observedAt)} 北京时间`；「最近更新成功」后的普通空格保留为干净断点。
2. **src/ui/DashboardPanel.module.css**：新增作用域规则 `.noticeSub .timeNoWrap { padding-left: 4px }`
   ——间距分隔（换行时段落行首缩进 4px，无孤悬标点）；作用域仅采集状态卡副文案，
   周额度卡（quotaSub）timeNoWrap 不受影响。
3. **src/ui/__tests__/ui.hanging-dot.test.ts**：RR38 口径升级为「既不悬挂行尾也不顶格行首」
   双向锁——新结构锁定 / 成功分支无「·」/ 坏②（行首顶格，RR40 所修）防回退 / 坏①（行尾悬挂，
   RR38 所修）防回退 / nowrap 语义保持（RR35）/ 间距落地+作用域锁定，共 6 条（原 3 条）。
4. 证据截图 2 张：docs/screenshots/20261011-rr40-expanded-{dark,light}.png。

## 门禁四绿证据

1. `npx tsc --noEmit`：exit 0✅
2. UI 域 `npx vitest run src/ui`：**115/115**✅（14 文件；RR38 基线 112 + 锁测试净增 3）
3. 全量 `npx vitest run`：**272/272 0 failed**✅（29 文件；基线 269 只升）
4. 变异红验两轮（三要素）：
   - 第①轮：把「· 」放回 nowrap 段首（复现行首顶格形态）→ 锁测试 **3 红**（新结构×/无「·」×/坏②防回退×，
     红信息均指向「·」并入段首）→ sed 复原 → 复跑 6/6 绿✅
   - 第②轮：CSS 作用域选择器 `.noticeSub .timeNoWrap` 改坏为 `MUTANT .timeNoWrap` →
     「间距分隔落地且作用域限 noticeSub」**1 红** → 复原 → 复跑绿✅
5. Rust 不适用：未触 src-tauri/（diffstat 为证）。

## 截图实证（release 真跑，B01 特性）

- 构建：worktree `npm run build`（989ms）+ `cargo build --release --features tauri/custom-protocol`
  （41.87s，junction 热缓存，沿 RR38 先例）。
- 探针：`scripts/shot-expanded.ps1 -Theme dark|light`（PMv2 自设，GetDpiForWindow 192✅；
  PrintWindow(3) True）。
- IHDR 字节核验：双图 920×1380 OK（node readUInt32BE(16/20)）。
- 识图子代理独立复核（Explore，主会话不直接读图）：**双图全 PASS**——A1 无「·」/A2 第二行行首
  为间距+数字无标点/A3「北京时间」整段/B 周额度卡无回归/D 横幅箭头无回归/E 整页无截断重叠。
  逐字转录：两主题均渲染「最近更新成功」/「10/11 20:17 北京时间」两行，行首缩进约 6 逻辑像素
  为空白无字形（即设计的间距分隔形态，非缺陷——子代理已明示确认）。

## 卡内裁决

- 候选①（nbsp 绑前文）弃用：会把断点推回「·」后，复活 RR38 行尾悬挂形态（两报告对照互为镜像，
  任何单侧绑定必悬一处）；候选②（卡面明示）为唯一稳妥解。
- 不扩界：DashboardPanel.tsx:218 公告卡副文案含多个行中「·」（长文本多断点，round4/5 识图均未
  判缺陷），非同根因（无 nowrap 边缘绑定结构），不动；PeekCard「北京时间」无「·」不涉及。

## 待用户清单

- 无（纯 UI 排版收敛；RR30 仍等用户 CI 首跑，与本卡无关）。

## 排障遗产

- 无新坑。worktree 双 junction（node_modules + src-tauri/target）构建路径畅通（RR35/38 先例延续），
  拆除时先 `cmd //c rmdir` 两个 junction 再 `git worktree remove`（B09 硬前提）。
- 观察（非缺陷）：换行后第二行行首 4px 缩进为设计形态（间距分隔在换行时的表现）；若未来用户
  点单要求两行顶格对齐，可改为 text-indent 负挂或去 padding。

## →下轮

- 本会话时间盒余量充足 → 续占 MERGE 槽自合入 f0f44f0（预审→cherry-pick→树恒等→主仓复验→
  拆 worktree→branch 归档→看板回写）。
- 合入后下一班建议：RR41（docs：README:110 状态行刷新）；RR30 仍等用户 CI 首跑；v0.3 留点单
  见 D031 用户门控期。
