# RR38 done — 采集状态卡行尾悬挂「·」断点微调（ui 域，P3）

- 会话：S1011-1940（2026-10-11 19:44 领卡 → 19:47 交付）
- 分支/commit：agent/RR38 @ **cf64aad**（单 commit，基于 main 4187287）
- diffstat：4 文件 +24/−1（DashboardPanel.tsx 1 行改动 + 新测试 23 行 + 双主题截图 2 张）
- patch 备份：`task_logs/RR38.patch`（314650B，对 main 4187287 干净适用 ✅ `git apply --check`）

## 病灶与修复（真值出处）

- 病灶：`src/ui/DashboardPanel.tsx:239` 采集状态卡副文案
  `<>最近更新成功 · <span className={styles.timeNoWrap}>{beijingShort(vm!.observedAt) ?? "—"} 北京时间</span></>`
  ——「·」在 nowrap 段外、其后空格是**唯一可断点** → 窄行时第一行行尾悬挂「·」（两主题同现，
  REVIEW 第4轮 G2 立卡，证据 `docs/review-20261011-round4.md` §2 识图子代理双主题复核）。
- 修复（卡面指定修向：nowrap 扩界至「· 时间段」）：
  `<>最近更新成功 <span className={styles.timeNoWrap}>· {beijingShort(vm!.observedAt) ?? "—"} 北京时间</span></>`
  ——「·」并入 nowrap 段，断点只剩「成功」后的空格，「·」随时间段整段换行，悬挂消除。
- 范围核查：`DashboardPanel.tsx:306`「自然重置 <span>…北京时间</span>」无「·」不涉及；
  数据页（520/529/542/550/663 行）与 PeekCard.tsx 卡面未点名、无同类悬挂结构，不扩界。
- CSS `.timeNoWrap` 规则不动（RR35 语义保持）；RR35 锁测试 `styles.timeNoWrap` count=2 不变。

## 新增测试

`src/ui/__tests__/ui.hanging-dot.test.ts`（3 条，沿 ui.banner-polish.test.ts 读源码文本断言先例）：
1. 「·」并入 .timeNoWrap 段（tsx 正则锁定修复结构）
2. 旧悬挂结构不得回归（`最近更新成功 · <span` 模式即红）
3. .timeNoWrap 仍为 nowrap（RR35 语义不动）

## 门禁四绿

1. tsc --noEmit ✅
2. 域：`npx vitest run src/ui/` **112/112** ✅（RR35 基线 109 + 本卡 3）
3. 全量：`npx vitest run` **269/269 0 failed** ✅（基线 266 → 269 只升）
4. 变异红验 ✅（三要素）：
   - 改了什么：「·」从 timeNoWrap span 内挪回 span 外（恢复 RR35 余留的悬挂坏结构）
   - 哪条红：ui.hanging-dot.test.ts **2 条红**（修复模式缺失 + 悬挂结构命中）
   - 红在哪：失败信息直指本卡行为（tsx 断言点名 `最近更新成功 · <span`）
   - 复原后 3/3 绿 + tsc 绿 ✅
5. Rust 不适用：未触 src-tauri/（release 构建仅为取证验证）

## 截图实证（release 真跑，B01 路径）

- 构建：worktree `cargo build --release --features tauri/custom-protocol`（junction 热缓存 39s）
- 探针：`scripts/shot-expanded.ps1 -Theme dark|light`（PMv2 自设 + PrintWindow(3)，B10/B11 正口径）
- 探针日志：GetDpiForWindow=192（PMv2 生效）✅ ClientRect 物理 920×1380（展开态 RR35 口径）✅
  PrintWindow(3)=True ✅
- IHDR 字节核验（B11 判别法，node readUInt32BE(16/20)）：
  `20261011-rr38-expanded-dark.png` 920×1380（143735B）、`-light.png` 920×1380（132567B）✅
- 识图子代理独立复核（Explore，主会话未读图）**6/6 PASS**：
  - 深色：第一行「最近更新成功」、第二行「· 10/11 19:44 北京时间」——无悬挂「·」、时间段完整
  - 浅色：同构，第二行「· 10/11 19:45 北京时间」（仅截图时刻差）
  - 周额度剩余卡「自然重置 / 10/18 11:57 北京时间」无拆断无悬挂（RR35 顺带修无回归）

## 借鉴出处

无外部参考实现引用（本卡为自有 UI 微修）；病灶定位依据 = 本仓 REVIEW 第4轮报告 +
本仓源码阅读，符合 TRUTH §1 证据源约束（无新增外部真值）。

## 待用户清单

- 无（RR30 依赖用户 CI 首跑，与本卡无关）。

## 排障遗产

- 无新坑。沿 RR35 先例的 worktree 双 junction（node_modules + src-tauri/target）构建路径畅通，
  拆除时先 rmdir 两个 junction 再 `git worktree remove`（B09 硬前提）。

## →下轮

- MERGE 班合入 cf64aad（patch 对 main 干净适用已验）→ 拆 worktree（双 junction 先拆）→ branch 归档。
- 合入后下一张：RR39（P3 docs：README:42 复选项口径诚实化，docs 域）；三卡闭环后 REVIEW 第 5 轮。
