# RR37 done — 深色胶囊门面图 920×152 重截（docs+发布）

- 会话：S1011-1930｜交付时刻：2026-10-11 19:45（本机钟，与 mtime 对齐）
- commit：**b1e39ed**（agent/RR37，base main bab16ea，单 commit）
- diffstat：3 文件 +13/−1 —— README.md（1 行引图换名）、TRUTH.md（+12 行 §2 B11 锚点）、
  docs/screenshots/20261011-rr37-capsule-dark.png（新增 28,981 字节，IHDR 920×152）
- patch：task_logs/RR37.patch（39,860 字节，对 main bab16ea 干净适用）

## 交付内容

1. **新深色胶囊门面图** `docs/screenshots/20261011-rr37-capsule-dark.png`：
   - 探针：`pwsh -NoProfile -File scripts/shot-expanded.ps1 <exe> <out> -Hash "" -Theme dark`
     —— ProbePMv2 True / GetDpiForWindow 192 / ClientRect(物理) W=920 H=152 / PrintWindow(3) True。
   - exe 取证构建：主仓 target 重构建 `npm run build && cargo build --release
     --features tauri/custom-protocol`（✓ 38.84s，B01 特性带齐；warning 为 B08 已知 .rsrc
     无害项）——消除旧 exe（19:01，来历不能确证）疑点，保证 exe=main 现 src+data。
   - **IHDR 字节核验**：readUInt32BE(16/20) = **920×152**（=2×逻辑 460×76，RR20 DPI 192
     口径）；对照旧坏图 460×76、浅色孪生 920×152。
2. **README:18 引图换名** rr32-capsule-dark → rr37-capsule-dark（唯一胶囊门面引图；
   旧坏图留盘不删——docs/review-20261011-round4.md §2 引其为证据）。
3. **TRUTH §2 新增 B11**：截图探针无 PMv2 自设在 DPI≠100% 机器产半分辨率图（B10 同族
   反向面）；正口径=胶囊态截图用 shot-expanded.ps1 -Hash ""；判别法=PNG IHDR 字节核验。

## 取径裁决（对卡面「shot-capsule.ps1 补 -Theme」的微调，附理由）

卡面修向预设给 shot-capsule.ps1 补 -Theme；实操改用 shot-expanded.ps1（零脚本改动）：
- shot-expanded.ps1 已带 PMv2（B10 修复，正是半分辨率根因的解）+ -Theme（RR34 先例），
  头注释明载「空串=默认胶囊态（两跳重载后仍回胶囊）」——一次到位产出 920×152 规格件。
- 给 RR13 老脚本补 CDP+主题等于重写 shot-expanded.ps1 的既有能力，徒增代码面；
  老探针的坑以 TRUTH B11 登记（黑名单旁锚点）防再踩，优于表面修补。
- 卡目标（920×152 规格件替换坏图+核验口径）全数达成，无缩小范围。

## 验证（门禁证据）

- ① tsc：`npx tsc --noEmit` exit 0 ✅
- ② 域测试：N/A——docs+资产卡，无可执行代码/测试变更，全量即覆盖（RR36 同口径）✅
- ③ 全量：`npx vitest run` **266/266 passed 0 failed**（28 文件，与 r4 基线持平）✅
- ③' Node：`node scripts/run-node-tests.mjs` **38/38 pass 0 fail** ✅
- ④ check-release：版本同步 0.1.0 + README 相对链接 **13 条全部可达** exit 0 ✅
- **变异红验（三要素，沿 RR36 真做口径）**：改了什么=README:18 引图文件名 dark→DAKK；
  哪条红=check-release「✗ README 链接不可达：docs/screenshots/20261011-rr37-capsule-DAKK.png」
  exit 1；复原后复跑 exit 0 复绿 ✅
- Rust 门：不适用——未触 src-tauri/ 源码（release 构建仅为截图取证，RR35 同款口径）✅
- **识图独立复核（Explore 子代理，主会话未直接读图）**：五项全 **PASS**——A 四缘完整无
  硬切+拖拽 grip 六点齐全；B 右端「˅」展开钮/「33.0% 风险」/「卡 ×3 重置卡」完整可读；
  C 与浅色孪生元素位置一一对应同构（grip→logo→CODEX/PLUS→周余%→心率→卡×3→展开钮）；
  D 深色主题正确无白底残留；E 文字锐利无 NaN/截断/2× 发虚感。

## 真值出处

- 坏档事实：docs/review-20261011-round4.md §2（IHDR 字节级核验 460×76 vs 920×152）；
  本卡 git 溯源补证：坏图自 RR32 提交（3237e5b）即在库——RR32_done「四图客户区
  920×152/920×1380」对深色胶囊一条不实（已在 TRUTH B11 记正）。
- 根因：scripts/shot-capsule.ps1（RR13 探针）无 SetProcessDpiAwarenessContext(PMv2) →
  GetClientRect 虚拟化逻辑坐标 460×76；对照 scripts/shot-expanded.ps1:1-27 头注释（
  「空串=默认胶囊态」「PMv2 防 GetClientRect 坐标虚拟化，RR13 done 遗产④」）。
- 构建口径：TRUTH §2 B01（custom-protocol 必带）、B02（WebView2Loader.dll 同目录，
  探活确认在位）、B09 机制②（PrintWindow 离屏）、B10（PMv2 920=2×460）。
- 规格口径：RR20 DPI 192（920×152=2×460×76）。
- 无参考实现借鉴（资产+文档卡，非算法卡）。

## 待用户清单

- 无（发布三步 push/tag/release 永远留用户，沿 D031）。

## 排障遗产

- 探针一发即中（CDP 首页未遇 about:blank 竞态，RR32 遗产②的 1/4 概率未触发）。
- 主仓 target 旧 exe（19:01）来历存疑时的处理口径：直接重构建（热缓存 ~39s）比对来历
  考古更省时且更稳——本卡实证。

## →下轮

- 本会话时间盒余量充足，按 S1011-1849/1904 先例自合入（占 MERGE 槽）。
- 合入后：RR38（ui：行尾悬挂「·」）→ RR39（docs：README:42 复选项口径）；
  RR30 仍等用户 CI 首跑。
