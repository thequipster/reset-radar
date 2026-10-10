# RR02 done — CI 建卡（docs+发布域）

- 会话：S1011-0143（2026-10-11 01:45 领卡 → 01:50 交付）
- 分支/commit：`agent/RR02 @ c451728`（worktree ../reset-radar_wt/RR02 保留待 MERGE；patch 备份 task_logs/RR02.patch）
- diffstat：`.github/workflows/ci.yml` +56（新）｜`scripts/check-ci.py` +73（新）｜`README.md` 2 行改（徽章接线）——共 +130/-1

## 交付内容

1. `.github/workflows/ci.yml`：windows-latest；push(main)+PR 触发；permissions contents:read；
   concurrency ci-<ref>；步骤序列 = checkout → setup-node(24, cache npm) → rust-toolchain(stable) →
   rust-cache(src-tauri→target) → **npm ci → npx tsc --noEmit → npx vitest run →
   cargo check --locked → npm run tauri build** → upload-artifact(nsis\*.exe + msi\*.msi,
   if-no-files-found: error)。与卡面修向逐条一致。
2. `scripts/check-ci.py`：门禁结构断言器（把「步骤结构与修向逐条对照」做成可复现断言，
   含触发/权限/runs-on/run 序列/artifact 配置/README 徽章 8 类断言；依赖本机 PyYAML 6.0.3）。
3. `README.md` 徽章接线：静态占位 `CI-planned-blue` → 真 Actions badge
   `thequipster/reset-radar/actions/workflows/ci.yml/badge.svg`（owner 依据 D012）。

## 真值出处（证据铁律）

- CI 步骤结构：BACKLOG RR02 卡面修向（windows-latest；npm ci→tsc→vitest→cargo check→tauri build→artifact）。
- action 版本与步骤模式（checkout@11d5960a / setup-node@49933ea5(24+cache npm) /
  dtolnay/rust-toolchain@89b12181 / swatinem/rust-cache@6323deb1(workspaces src-tauri→target) /
  upload-artifact@ea165f8d(if-no-files-found:error, retention 7d)）：逐 SHA 借鉴
  **codex-cockpit/.github/workflows/release.yml**（TRUTH §1 来源 3，MIT）。
- CI 命令与脚手架真实结构对齐（防"想象中的 package.json"）：`package.json` scripts
  build=`tsc && vite build`/test=`vitest run`/tauri；`package-lock.json` 与 `src-tauri/Cargo.lock`
  均已入库（npm ci 与 --locked 可用）；`tauri.conf.json` beforeBuildCommand=`npm run build`、
  bundle.targets=all（→ nsis+msi 双产物路径）——实测自 ../reset-radar_wt/RR01 脚手架文件。
- CI(MSVC) 产物免 dll、发布以 CI 为准：TRUTH §2 B02 + D009。
- 徽章 owner：D012（git config user.name=thequipster + D007 先例）。

## 门禁证据（D011 等价口径：RR02 基于 main 无 tsc/vitest 对象）

1. **语法双校验**：actionlint 1.7.12 exit 0（零告警）✅；PyYAML 6.0.3 safe_load OK
   （1 job / 10 steps）✅。
2. **结构断言（域测试等价）**：`python scripts/check-ci.py` → `check-ci OK: 5 run 步骤与卡面
   修向一致；徽章已接线` exit 0 ✅。
3. **全量基线复核**：RR01 worktree `npx vitest run` 4/4 passed（156ms）——本卡零 TS 改动，
   不可能新增 failed ✅。
4. **变异红验三要素**（改坏→check-ci 必红→复原→再绿，复原字节级 diff 验证一致）：
   - 变异A：删除「Unit tests (vitest)」步骤 → 红：`FAIL: run 步骤序列与卡面修向不符`（实际序列缺
     `npx vitest run`）exit 1 → 复原 exit 0 ✅
   - 变异B：runs-on 改 ubuntu-latest → 红：`FAIL: jobs.windows.runs-on 应为 windows-latest`
     exit 1 → 复原 exit 0 ✅
   - 变异C：README 徽章换回静态占位 → 红：`FAIL: README 未接线 CI 徽章` exit 1 → 复原 exit 0 ✅

## 局限（卡面明示，不得声称"跑过"）

无 runner 环境，本卡**不以 CI 跑过作声称**——yaml 语法+结构对照+基线复核即本卡验证上限；
用户 push 后首跑见真章（预期风险点：tauri 首次构建 ~15-20min 无缓存、runner WebView2 预装为
社区常态但未实测）。

## 排障遗产

- actionlint 下载：`releases/latest/download/actionlint_windows_amd64.zip` 短名 404（只回 9 字节
  "Not Found"）；正确资产名带版本号（如 `actionlint_1.7.12_windows_amd64.zip`），先查
  `/releases/latest` API 再拼 URL。二进制已留 /tmp/actionlint/。
- PyYAML 把裸 `on:` 键解析为布尔 True——脚本里 `wf.get("on") or wf.get(True)` 双取（check-ci.py 有注释）。

## 待用户清单 / →下轮

- 无待用户项（徽章 owner 若与实际 GitHub 用户名不符，RR11 链接可达性检查兜底，D012）。
- →下轮（MERGE 会话）：RR01+RR03+RR02 三张🟡可批量合——**路径无交集已核对**
  （RR01：脚手架 22 文件无 README/.github/scripts；RR03：scripts/fetch-history.\*+data/；
  RR02：.github/+scripts/check-ci.py+README.md）。合入后 RR04 起解锁。
- REVIEW 素材备忘：data采集 域 node:test（RR03 的 12 用例）尚未纳入 CI vitest 流程，
  首轮 REVIEW 可立卡决定是否加 `node --test` 步骤。
