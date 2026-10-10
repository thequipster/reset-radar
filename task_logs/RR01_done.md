# RR01 done — 脚手架（Tauri2 + React + TS + Vite + vitest + src/lib）

- 会话：S1011-0043 ｜ 分支：`agent/RR01` @ **cd9f759** ｜ patch 备份：`task_logs/RR01.patch`
- diffstat：23 文件新增（+约 11400 行，其中 Cargo.lock/package-lock 约 10800 行）+ .gitignore 追加 gen 排除

## 交付内容

- Tauri 2 + React 19 + TS 5.9 + Vite 7 + vitest 5 最小骨架（主窗口 420×300「重置雷达」）
- `identifier = app.resetradar.desktop`（本项目专属，防撞 TRUTH B05）
- `src/lib/`（核心层目录）+ `meta.ts`（APP_NAME/APP_IDENTIFIER 常量）
- 冒烟测试 `src/lib/__tests__/meta.smoke.test.ts`（4 条契约断言）
- `src-tauri/` 最小 Rust 骨架（Builder::default，数据层 RR08 起实装）
- `.gitignore` 追加 `src-tauri/gen/`（tauri-build 生成物，与参考项目做法一致）

## 真值出处（证据铁律）

| 内容 | 出处 |
|---|---|
| 版本组合 react19/vite7/ts5.9/vitest5/tauri2.8/cli2.8 | 参考项目 codex-cockpit `package.json`（TRUTH §1 来源 3，本机实测可跑组合） |
| vite.config.ts 结构（1420 端口/envPrefix/test 段） | 同上 `vite.config.ts` |
| tsconfig.json 全部编译选项 | 同上 `tsconfig.json` |
| Cargo.toml crate-type 三件/main.rs windows_subsystem | 同上 `src-tauri/Cargo.toml`、`src/main.rs` |
| tauri.conf.json 骨架（build 段/csp/bundle.icon 结构） | 同上 `tauri.conf.json`（productName/identifier/窗口为本项目新值） |
| icons 5 个文件（32/128/128@2x/icns/ico） | 从参考项目 `src-tauri/icons/` 原样拷贝（MIT，D007 允许；正式图标待 RR11 换） |
| identifier 防撞要求 | TRUTH §2 B05 + RR01 卡面 |

## 门禁证据（四绿 + Rust 第 5 门 + 卡面口径）

1. **tsc**：`npx tsc --noEmit` → 0 错误 ✅
2. **域测试**：`npx vitest run src/lib/`（即 smoke 测试）→ 4 passed ✅
3. **全量**：`npx vitest run` → **1 file, 4 passed, 0 failed**（全量基线 0 达成）✅
4. **变异红验**（三要素）：
   - 改了什么：`meta.ts` 的 `APP_IDENTIFIER` 从 `app.resetradar.desktop` 改为参考项目的
     `app.codexcockpit.desktop`（正是 B05 撞车场景）
   - 哪条红：2 条断言红——「identifier 必须是本项目专属前缀 app.resetradar.*」（expected false to be true）
     与「核心层常量与 tauri.conf.json 的 identifier 一致」（expected 'app.resetradar.desktop' to be 'app.codexcockpit.desktop'）
   - 红在哪：`src/lib/__tests__/meta.smoke.test.ts` 前两个 it；复原后复跑 4/4 全绿 ✅
5. **cargo check**（Rust 域）：`PATH` 按 RUNBOOK §10，`cargo check` → Finished dev profile 1m32s，0 error ✅
6. **卡面口径**：`npm run build`（tsc+vite）→ ✓ built in 958ms，dist/ 产出 ✅；
   `npm run tauri dev` 起空窗一项按卡面降级条款以 cargo check + 前端 build 替代（gnu 本机限制，B01/B02）

## 待用户清单

- 无（无 🟣 事项）。

## 排障遗产

- tauri-build 会在 `src-tauri/gen/schemas/` 生成 capabilities schema；参考项目不追踪该目录，
  已对齐（.gitignore 追加 `src-tauri/gen/`）。capabilities/default.json 的 `$schema` 指向该路径，
  文件不存在不影响构建，仅影响编辑器提示。
- CRLF 警告为 Windows 常态，无实质影响。

## →下轮（合入指引）

- MERGE 会话：cherry-pick cd9f759 到 main → 树恒等验证 → 主仓复跑全量门禁（npm install 后
  tsc/vitest/build，cargo check 可复用本次结论）→ 拆 worktree/分支。
- RR03（数据采集）/RR02（CI）此后可领；RR04+ 依赖本卡合入。
