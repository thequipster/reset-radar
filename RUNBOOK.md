# RUNBOOK — reset-radar 永续看板循环操作手册（协议唯一权威）

> 任何会话（定时唤醒 / 手动新开 / 人工）开工前必读本文件。
> 2026-10-11 由初始化会话建立（perpetual-board v1 协议落地）。
> 修改本文件只能在文末追加变更行。

## 0. 总纲与文件地图

一句话：**Markdown 看板做唯一协调点，多个 AI 会话按「领卡-交付-合入」协议在同一仓库安全并发**。

| 文件 | 作用 |
|------|------|
| `BOARD.md` | 唯一调度中心：STOP 区 + 循环阶段 + 槽位 + 置顶条目区 |
| `BACKLOG.md` | 编号唯一源 + 卡账（状态流转只追加） |
| `HEARTBEAT.md` | append-only 心跳：开工/收工各一行 |
| `task_logs/<卡号>_wip.md` / `_done.md` | 活性凭证（>1h 未更新可被接管）/ 交付档案 |
| `TRUTH.md` | 证据锚点登记簿（已确认事实源 + 已证伪黑名单） |
| `docs/ARCHITECTURE.md` | 架构宪法（拿不准时的裁决依据） |
| `docs/DECISIONS.md` | AI 决策日志（初始化期决策全留痕） |
| `ROADMAP.md` | 想法池（REVIEW 拍取材处） |

**主仓绝对路径：`C:\Users\slsjz\Desktop\reset-radar`**（看板文件永远读写主仓路径，不要在 worktree 改看板副本）。

## 1. 硬规则（违反任何一条 = 该会话交付作废）

1. **STOP 开关**：BOARD 顶部 STOP 区出现 STOP 行 → 所有会话写收工心跳并立即结束。只有用户可写。
2. **证据铁律**：改动只许来自 TRUTH.md §1 登记的证据源。允许提假设**定位**问题，但装进项目前
   必须回源核实，done 写明出处（文件+字段+行）。TRUTH.md §8 黑名单里的坑绝不重踩。
3. **主仓只读**：产出改动在 worktree 分支 `agent/<卡号>` 上（`git worktree add ../reset-radar_wt/<卡号> -b agent/<卡号>`）。
   主仓唯一可写场景：合并槽合入 + 看板协调文件本身。
4. **多目标同步**：本项目的算法唯一实现源是 `src/lib/`（TS）。若未来出现第二实现（如 Rust 侧复算），
   同一逻辑必须双同步，改一边不改另一边 = 半成品，不许交付。
5. **数据锁**：`data/*.json` 夹具与 `data/predictions.jsonl` 预测日志只许追加/由脚本生成，
   **绝不手改数值**；`task_logs/` 历史、`HEARTBEAT.md`、`BACKLOG.md` 历史行绝不改删。
6. **看板文件永远读写主仓绝对路径**（见 §0），worktree 里的看板副本只读。
7. **绝不 push 远端；绝不 force；删除任何文件前列清单 + 查引用**。发布（push/打 tag/发 release）永远留给用户。
8. **环境约定**：Windows 上执行 PowerShell 一律用 `pwsh`（禁 powershell.exe）；Git Bash 中给子进程
   传 PATH 用 `/c/...` 风格（Windows 风格 `C:/...` 会失效，见 TRUTH §8）；工具链路径见 §10。
9. **append-only**：HEARTBEAT/BACKLOG 只追加；勘误用新行注记，不改历史。
10. **一次会话一张卡**（合并槽例外，可批量合多张待合卡）。
11. **无人值守决策权**：用户离线期间（初始化期），遇到本 RUNBOOK/ARCHITECTURE 未覆盖的决策，
    由会话按 ARCHITECTURE 原则自行裁决并记入 `docs/DECISIONS.md`（编号顺延），**绝不阻塞等待用户**。
    涉及「删除既有功能/改 License/改协议」三类事项例外：立 🟣待用户卡搁置。

## 2. 会话标准流程（顺序不可乱）

1. 读 `BOARD.md`：STOP → 心跳一行收工，立即结束。
2. `HEARTBEAT.md` 追加开工行。
3. 通读：BOARD / 本 RUNBOOK / BACKLOG 尾部 / HEARTBEAT 末 30 行 / `docs/calibration-latest.md` 最近一轮（如有）→ 定阶段。
4. 领卡（§4 规则）：BOARD 置顶插 🟠条目 + 写 `task_logs/<卡号>_wip.md` + 心跳行。
5. 落码：worktree + 分支；改前读上下文，风格随仓库（现有代码全是中文注释+紧凑风格）。
6. 门禁四绿（§5）。
7. 交付（§6）。
8. 无卡可领时按阶段做：MERGE=§8；REVIEW=§9。
9. 收工心跳行。**时间盒 50 分钟**，到点未完 → wip+BOARD 条目附「→下轮」收工，不硬撑。
   绝不在时间盒压力下跳过门禁或变异红验。

## 3. 卡生命周期与编号

状态机：🟠待领 → 🟠在飞 → 🟡待合入 → 🟢已闭环；异常：🔴重开（合入冲突/回归）、🚫证伪（挖卡）、🟣待用户。

编号 `RR<NN>` 顺延（开新卡前查 BACKLOG 尾部最大号 +1）。立卡五件：现象 / 证据 / 修向 / 验证口径 / 状态行。
卡类型：🧱建卡（从零搭新能力）/ 🔧修卡（修既有差距，须真值出处）/ 🎣挖卡（只挖证据不实装）。

新测试文件命名 `src/lib/__tests__/<域>.<slug>.test.ts`；新报告 `docs/<主题>-<YYYYMMDD>.md`。

## 4. 槽位与并发

- **LIGHT ×1**（单工位起步：定时任务每 45 分钟唤醒一个会话）｜**MERGE ×1**（合入互斥）。
- 占用 = BOARD 在飞条目。槽满 → 做阶段动作或收工，不硬挤。
- **同域互斥**：`core`(src/lib) / `ui`(src) / `data-layer`(src-tauri) / `docs+发布` / `data采集`(scripts+data) ——
  同域卡串行（按 BOARD 建议顺序），不同域可并行。
- **撞行处理**：写看板前重读最新版；被别人刚写过 → 重读合并追加，不覆盖。

## 5. 门禁四绿（口径 + 降级）

1. **治理守卫**：`npx tsc --noEmit`（在主仓/worktree 根执行）。
2. **域测试**：`npx vitest run src/lib/<域路径>` + 本卡新增测试文件。
3. **全量门禁**：`npx vitest run` —— **不得新增 failed**（基线：RR01 合入时为 0 failed，之后只许降不许升）。
4. **变异红验**（灵魂步骤）：把本卡核心逻辑故意改坏（恢复被删常数/注入 off-by-one/反转关键条件）
   → 域测试**必须红**且失败信息指向本卡行为 → 复原 → 复跑再绿。三要素（改了什么/哪条红/红在哪）记进 done。

Rust 域卡（src-tauri/）追加第 5 门：`cargo check`（工具链 PATH 见 §10；gnu 下全量 `cargo test`
已知链接失败，用 `cargo check --tests` 代替，见 TRUTH §8）。

**降级条款**：RR01（脚手架）合入前 tsc/vitest 尚不存在——该卡以卡面验证口径替代门禁②③；
其余任何卡不得引用本条款。

## 6. 交付物清单

- `task_logs/<卡号>_wip.md`（领卡即写）→ 交付时换 `_done.md`（commit sha / diffstat / 四绿证据 /
  变异红验记录 / **真值出处** / 待用户清单 / 排障遗产 / →下轮）。
- patch 备份：worktree 内 `git format-patch <base>..<head> -o <主仓>/task_logs/`，重命名 `<卡号>.patch`。
- BOARD 条目转 🟡待合入（补四绿结果/范围/→下轮）；BACKLOG 追加状态行；删 wip。
- 版本戳：凡涉及发布资产的卡（README/CI/版本号），`package.json` 与 `src-tauri/tauri.conf.json`
  的 version 必须同步，且只允许在发布卡（RR11 及其后继）中变动。

## 7. 接管协议

wip 超 1h 无更新 **且** 该会话 1h 无心跳 → 判死。固定顺序：①备份对方产物到 `/tmp/takeover/<卡号>/`
②心跳写接管行 ③重写 wip 续作或退回待领。拿不准 = 只观察不动手。

## 8. MERGE 槽（合入主仓）

1. 心跳声明占槽；确认无其他 MERGE 在飞。
2. 逐张 🟡卡：预审（worktree 探活 / diffstat 对账 / patch 备份已存在 / 撞路径交集空）→
   主仓 `git cherry-pick`（多 commit 逐个）→ **树恒等验证**（涉及路径 diff 0 字节）。冲突 → 退回 🔴重开。
3. 主仓复跑全量门禁（不得新增 failed）。
4. BOARD 条目 → 🟢已闭环（附 main sha）；BACKLOG 合入行；拆 worktree/分支；心跳释放槽。
5. 全部合完 → BOARD 阶段切 REVIEW。

## 9. 标准工作流：修 → 融 → 测 → 猜 → 挖 → 修

循环四拍：**WORK → MERGE → REVIEW → DIG → 回 WORK**。

### 9.1 REVIEW 会话职责
1. 生成验收 artifact（可复现，记录命令+时间戳）：
   - `npx vitest run` 全量输出；
   - `npm run build && cd src-tauri && cargo check` 构建通过证据（若 gnu 本机构建 exe，参照 TRUTH §2 锚点 B01/B02）；
   - `node scripts/calibrate.mjs > docs/calibration-latest.md` 校准报告（RR07 合入后）；
   - UI 截图存 `docs/screenshots/<YYYYMMDD>-<场景>.png`（应用可运行时）。
2. 逐条审差距（每条 = 现象+位置+与 ARCHITECTURE/ROADMAP 期望的差异），逐条定夺：
   🔧修卡 / 🎣挖卡 / 🧱建卡 / 不立卡（写理由）/ 🟣待用户——**不许悬空**。取材优先级：
   新差距 > ROADMAP 未立卡条目 > ARCHITECTURE 里程碑缺口。
3. 产出 `docs/review-<YYYYMMDD>.md`；BOARD 切回 WORK。

### 9.2 挖卡（🎣）——只挖证据，不实装
按卡上验证路径挖（上游接口实测 / 参考源码定位 / 本地复现）。挖到真机制 → 回填 TRUTH §2 + 立
🔧/🧱 卡 → 挖卡 🟢；找不到 → 🚫证伪（记录找过哪里、排除了什么）。严禁未核实猜想直接装。

### 9.3 全灭续猜
一轮猜想全证伪 → 基于证伪记录立下一张 REVIEW 卡，不重复已证伪方向；穷尽 → 🟣待用户（附已排除清单）。

## 10. 命令速查（Git Bash；主仓 = `C:\Users\slsjz\Desktop\reset-radar`）

```bash
# 建 / 拆 worktree（主仓根执行；worktree 放仓库外）
git worktree add ../reset-radar_wt/RR07 -b agent/RR07
git worktree remove ../reset-radar_wt/RR07 && git branch -D agent/RR07

# 门禁三件
npx tsc --noEmit
npx vitest run src/lib/            # 域
npx vitest run                     # 全量

# Rust（先设工具链 PATH——MSYS 风格，勿用 C:/ 风格）
export PATH="/c/Users/slsjz/.zcode/workspace/default/quota-analysis/toolchain/mingw64/bin:/c/Users/slsjz/.cargo/bin:$PATH"
cd src-tauri && cargo check
# 本机出 exe（仅验证用；正式发布走 CI）：
#   cargo build --release --features tauri/custom-protocol   ← 特性必带，否则白屏！
#   产物需与 WebView2Loader.dll（已在工具链知识库，见 TRUTH §2 B02）同目录分发

# 接管备份
mkdir -p /tmp/takeover/RR07 && cp -r ../reset-radar_wt/RR07/<untracked> /tmp/takeover/RR07/ 2>/dev/null
```

## 11. 变更记录

- 2026-10-11 初始化会话建立五件套 + 首批 12 卡（RR01–RR12）+ 预填 TRUTH 构建锚点与黑名单。
