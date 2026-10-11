# RR20 done — exe manifest 补 dpiAware（data-layer 域）✅四绿+实证全过

- 会话：S1011-0944（09:46 领卡 → 10:0x 交付）
- 分支/commit：agent/RR20 @ **8963fd3**（单 commit；基于 main 7afcd64；patch 备份
  task_logs/RR20.patch，8029 字节）
- diffstat：2 files, +69/−25（src-tauri/build.rs、src-tauri/src/lib.rs）
- worktree：../reset-radar_wt/RR20（**node_modules junction 在——MERGE 拆前先
  pwsh/cmd rmdir 链接**，B09 硬前提）；target/ 已有 release 产物

## 改动内容

1. `build.rs`：patch_test_manifest → patch_gnu_manifest；TEST_APP_MANIFEST →
   GNU_APP_MANIFEST，在 Common-Controls v6 依赖（B08，逐字保留）之上补
   `<asmv3:application><asmv3:windowsSettings>` 的
   `<dpiAware>true/PM</dpiAware>`（SMI/2005）+ `<dpiAwareness>PerMonitorV2,
   PerMonitor</dpiAwareness>`（SMI/2016）。**xml/rc 落盘改无条件**（下游 lib 的
   include_str! 哨兵测试在 MSVC/CI 也要能编译），embed_resource 仍仅 windows-gnu
   （MSVC 不进本分支，B08 口径不变）。
2. `lib.rs`：新增 `#[cfg(test)] mod build_manifest` 哨兵测试×2——
   `manifest_keeps_common_controls_v6_dependency`（B08 回归）+
   `manifest_declares_per_monitor_dpi_awareness`（B10 回归，断言 PerMonitorV2 值 +
   legacy dpiAware 元素都在）。测试经 `include_str!(concat!(env!("OUT_DIR"),
   "/app-manifest.xml"))` 直接读 build.rs 落盘真件。

## 真值出处（证据铁律）

- 卡面修向（BACKLOG RR20）+ TRUTH §2 **B10**（RR13 两轮截图+注册表 AppliedDPI=192+
  manifest dump 证据链）+ **D020** 决策②。
- 落码前回源核实（本会话，registry 源码直读）：
  - tauri-build 2.7.1 `src/windows-app-manifest.xml` **无任何 dpiAware**，crate 内
    grep 零命中 → 官方 Tauri v2 不靠 manifest 声明 DPI；
  - tao 0.37.1（本项目 Cargo.lock 版本）`event_loop.rs:185` `if attributes.dpi_aware
    { become_dpi_aware() }`（默认 true）→ `dpi.rs:20` 运行时调
    `SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2)`（GetProcAddress 动态解析）；
    tauri-runtime-wry 2.12.1 未改默认 → 官方路径=运行时 API，本机 gnu exe 实测未生效
    （B10）。manifest 声明由加载器在进程创建时生效，不依赖该调用，是为根治。
  - MS Windows manifest 规范形状：dpiAware/dpiAwareness 元素带 SMI 命名空间
    （2005/2016），两元素并存时新系统只认 dpiAwareness（逗号回退序）。
- 参考实现借鉴：无（本卡纯构建层，codex-cockpit 无对应处理可借鉴）。

## 门禁四绿 + Rust 门

1. `npx tsc --noEmit` ✅（worktree，09:51）
2. 域测试：`cargo test --lib` **12/12** ✅（既有 10 + 本卡新哨兵 2；vitest 侧本卡
   零 TS 改动，无独立域路径）
3. 全量 `npx vitest run` **86/86 0 failed** ✅（基线不变）
4. 变异红验 ✅：`PerMonitorV2,PerMonitor` → `MUTANT-UNAWARE` →
   `build_manifest::manifest_declares_per_monitor_dpi_awareness` **FAILED**
   （lib.rs:200 panic，消息指名 B10 回归；11 passed/1 failed）→ sed 复原 → 12/12 复绿。
5. Rust 门：`cargo check --tests` ✅（1m01s；含 build.rs+哨兵测试编译）

## 运行实证（卡面验证口径逐条）

- 构建：`npm run build` + `cargo build --release --features tauri/custom-protocol`
  （B01 特性）✅ 29.9s；WebView2Loader.dll 同目录（B02）。
- manifest dump：exe 内 `PerMonitorV2×1 / dpiAware×4 / asmv3×10`——含 dpiAware 的
  manifest 确已嵌入（注意：文件内另有 tauri-build CC-only 一份物理并存，naive 首段
  dump 会先命中它；加载器实际读哪份以运行时为准，详 task_logs/RR20_artifacts/
  manifest-dump.txt）。
- 运行探针（task_logs/RR20_artifacts/shot-rr20.ps1，探针进程先 PMv2 防坐标虚拟化）：
  **GetDpiForWindow=192**（修复前病灶=无感知）；**物理客户区 840×1120=2×逻辑
  420×560**（修复前=420×560 物理、CSS 视口 210/230，B10 实证）。
- 识图复验（Explore 子代理逐字转录，rr20-after-420.png 840×1120）：胶囊完整
  （CODEX｜29% 周额度/剩余｜●重置风险 24.7%｜卡×3），右端「×3」完整可读、余量
  40–45 物理px，无半切/缺字，文字锐利——**右缘截断已消除**。真实数据实取成功
  （29%/24.7%/×3，app-server 握手端到端通）。

## 待用户清单

- 无（发布仍留用户：push/tag/release 永不动）。

## 排障遗产 / 注记

1. **两份 manifest 并存**：gnu bin 里 ld merge-failure 后 tauri-build（CC-only）与
   本卡（CC+DPI）两份字节都在文件内，运行时实证生效的是含 dpiAware 的组合
   （GetDpiForWindow=192 只有读到 dpiAware 声明才可能成立——修复前同代码路径下
   tao 运行时调用未生效是 B10 已实证事实）。若未来升级 tauri-build 后 DPI 行为
   回退，优先怀疑 merge 取份变化，回归哨兵测试（编译期）+GetDpiForWindow 探针
   （运行期）双保险可定位。
2. **MSVC 发行路径注**：release.yml 的 MSVC 构建不进本分支（manifest 嵌入仅 gnu），
   MSVC exe 的 DPI 仍依赖 tao 运行时调用是否在 MSVC 下生效——未验证（本机无 MSVC
   工具链，不装未核实假设进项目）。如需覆盖，用 tauri_build WindowsAttributes::
   app_manifest 覆盖默认 manifest（上游支持的正规入口），留 REVIEW 取材。
3. **tauri 运行时调用为何在本机 gnu 失效未深挖**（超出本卡范围，manifest 已根治；
   挖需动态调试 release 进程，性价比低）。已核实其代码路径存在且未被 tauri 关闭。

## →下轮

- MERGE 槽：cherry-pick 8963fd3 → 主仓复跑 cargo check --tests + vitest 全量 →
  拆 worktree（**先 rmdir node_modules junction**）→ BOARD🟢。
- 合入后 RR13 续作解锁（task_logs/RR13_wip.md 4 步指引：npm run build+release 重建
  →shot-capsule.ps1 重截→识图复验（460 窗宽 CSS 视口应=460，胶囊 421px 完整余 ~39px）
  →done；其 worktree 含 junction 同样先拆）。
