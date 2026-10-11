# RR11 done — docs+发布：README 打磨 + 版本定档 0.1.0 + release workflow（发布就绪）

- 领卡：2026-10-11 08:20 S1011-0813（LIGHT；本会话前段 MERGE RR10→main 8ec7d6b 树恒等✅）
- 分支：agent/RR11 @ **f5ce969**（单 commit；基于 main 9b81f38；patch 备份 task_logs/RR11.patch，
  git apply --check 对 main 干净适用✅）
- diffstat：4 文件 +248/-14（release.yml 新 66 行 + check-release.mjs 53 行 +
  check-release-wf.py 67 行 + README 重写 +62/-14）

## 交付内容

1. **README.md 重写**：
   - 真实截图上墙：胶囊态 docs/screenshots/20261011-capsule.png（RR09 真实数据 29% 端到端）；
     展开态截图缺失如实注明待补（B09 前台权限制，非本卡域能解，留 REVIEW 取材）
   - 功能清单改勾选式（8 项勾 7 项，1 项如实未勾：应用内校准面板/自动落盘 → ROADMAP v0.2+）；
     原"密钥不出系统 keyring"措辞修准为"鉴权完全交给本机 codex CLI（app-server stdio），
     本应用不经手任何密钥"（实际机制：spawn codex CLI，src-tauri/src/codex.rs，无 keyring 代码）
   - 新增校准闭环用法节（log-prediction/calibrate 两命令）+ 发布三步节（用户操作）
   - 新增版本徽章；致谢精确到 codex-cockpit v0.3.0-beta.5 并指向 TRUTH §1 逐文件出处
2. **.github/workflows/release.yml**（打 tag v* 触发）：windows-latest 单 job，10 步——
   npm ci → 版本/tag 守卫（node scripts/check-release.mjs --tag "$GITHUB_REF_NAME"）→
   tsc → vitest → tauri build → gh release create（nsis+msi+SHA256SUMS，--verify-tag，
   预发布后缀自动 --prerelease，--generate-notes）；permissions contents:write（仅此 workflow，
   ci.yml 保持 read 不动）
3. **scripts/check-release.mjs**（发布就绪门禁，node）：① 版本两处同步断言
   package.json===tauri.conf.json ② README 相对链接存在性（外链/锚点/mailto 跳过）
   ③ --tag 时 tag===v{version}（release.yml CI 步骤复用同一脚本）
4. **scripts/check-release-wf.py**（release.yml 结构门禁，PyYAML）：触发器 push.tags=['v*']、
   permissions write、concurrency 不取消、全 action 逐 commit-SHA pin、守卫/tsc/vitest/
   tauri build/gh release create/--verify-tag/sha256sum 步骤齐、rust-cache save-if 'false'
5. **版本定档**：package.json 与 src-tauri/tauri.conf.json 均已是 0.1.0（RR01 设定）——核验
   一致后不动值（版本只许发布卡变动，本卡即发布卡，定档即确认 0.1.0）

## 真值出处

- release.yml 借鉴出处：参考实现 codex-cockpit `.github/workflows/release.yml`（MIT）——
  tag v* 触发、action SHA pin（四个 action 的 SHA 与本项目 ci.yml 完全一致，RR02 已核对）、
  rust-cache save-if:'false'（原注释：post-job 缓存修剪曾挂死 Windows runner）、
  gh release create --verify-tag + GH_TOKEN 内置鉴权、预发布后缀判 prerelease
- ci.yml 的 action SHA（checkout/setup-node/dtolnay/swatinem）：RR02 已逐 SHA 核对（D009/D012 链）
- codex-cockpit 版本号 v0.3.0-beta.5：TRUTH.md §1 来源 3 登记原文
- 鉴权机制：src-tauri/src/codex.rs 头注（spawn codex app-server --stdio，RR08 移植链）
- 校准命令：package.json scripts（calibrate=RR07 / log-prediction=RR10）
- 测试基数 86：RR10 合入后全量基线（BACKLOG 状态行 08:18）

## 门禁四绿（docs+发布域，等价口径沿 RR02/D011 先例）

- ① tsc --noEmit ✅（worktree agent/RR11）
- ② 域测试等价口径 ✅（本域无 src/lib 对象）：check-release.mjs 绿（版本同步 0.1.0 +
  README 相对链接 12 条全可达）+ check-release-wf.py 绿（10 步、4 action 全 SHA pin）+
  check-ci.py 回归绿（RR02 门禁未破坏：5 run 步骤一致+徽章接线）+ actionlint 1.7.12
  对 release.yml 零告警 + PyYAML safe_load OK
- ③ 全量 `npx vitest run` 86/86 0 failed ✅（基线 86 持平，未动 src/）
- ④ 变异红验两轮 ✅（三要素）：
  - A 改了什么：check-release.mjs 链接存在性条件反转 `!existsSync`→`existsSync`；
    哪条红：12 条 README 链接全部报"不可达"，exit 1；红在哪：链接守卫对合法输入的反转
    即全量误报——证明检查真实扫过每条链接
  - B 改了什么：check-release-wf.py 触发器断言比较符反转 `==`→`!=`；哪条红：
    "触发器必须是 push.tags=['v*']"，exit 1；红在哪：结构断言确实在读 release.yml 的 on 区
  - 两轮均复原 → 双脚本再绿 ✅（grep 复查原条件各恰 1 处，无残留变异）
- 咬合性附加证：`--tag v9.9.9` → exit 1 且报"tag 与版本不一致"（CI 守卫对错 tag 会咬）；
  `--tag v0.1.0` → exit 0

## 用户发布步骤三条（卡面要求，README 发布节同文）

1. `gh repo create <owner>/reset-radar --public --source . --remote origin`（仅首次）
2. `git push -u origin main`（CI 首跑 = RR02 门禁的真实首验）
3. `git tag v0.1.0 && git push origin v0.1.0`（→ release workflow 自动构建并出 Release）

## LICENSE/TRUTH 致谢完整性检查结论

- LICENSE：MIT，Copyright (c) 2026 thequipster，无第三方代码整体并入（只借鉴思路+逐文件
  注明出处），无需附加第三方法条 ✅
- TRUTH §1：三证据源齐备（codex 官方接口/codex-resets.com 公开 API/codex-cockpit v0.3.0-beta.5
  完整源码+重点文件行号）；README 致谢现精确指向 TRUTH §1 与各 done 文件的逐文件出处链 ✅

## 待用户清单

- 无（无删除功能/License 变更/协议变更；发布动作本身即"留给用户"的设计——RUNBOOK §1.7）

## 排障遗产

- actionlint 1.7.12 二进制：RR02 留的 /tmp/actionlint/ 只剩 zip，`unzip al.zip -d al_extracted`
  可复原（本次实证可用）；若 /tmp 被清，重下方法见 RR02 done（资产名必须带版本号）
- Git Bash 对含 `${GITHUB_REF_NAME#v}` 的 bash step 无需特殊处理（CI 侧才执行）

## →下轮

- MERGE：占槽 cherry-pick f5ce969（patch 对 main 干净适用已验证）
- 合入后 RR12（首轮 REVIEW 锚卡）可执行，取材清单：app 内自动落盘路径汇流（D019③）/
  展开态截图（RR09 遗留+本卡 README 待补）/胶囊溢出 420px 立修/ROADMAP v0.2 未立卡条目
  （上游 watch 信号混入/自动对答案回填/校准报告入 git 时间线）
