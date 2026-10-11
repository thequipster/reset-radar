# REVIEW 第 2 轮报告（2026-10-11 15:46，会话 S1011-RR12r2）

> 触发：阶段4业务卡全部闭环（RR17→971be17 / RR28→c546b52 / RR27→a362c4e），无 🟠 无 🟡。
> 上轮报告：docs/review-20261011.md（首轮，立卡 RR13–RR19）。

## 验收 artifact（均可复现）

| 项 | 命令 | 结果 |
|---|---|---|
| 治理守卫 | `npx tsc --noEmit`（main a362c4e） | 退出 0（RR27 合入后复验） |
| 全量门禁 | `npx vitest run` | **234/234 0 failed**（基线 182 → 本轮三卡 +52 只升） |
| Node 门 | `npm run test:node` | 38/38 |
| 前端构建 | `npm run build` | ✓（`task_logs/RR12r2_artifacts/vite-build.txt`） |
| Rust 门 | `cargo check --tests` | ✓ 1.77s（`cargo-check.txt`） |
| 校准管线 | `node scripts/review-calibration.mjs`（stdout 重定向到 artifacts，勿指向 calibration-latest.md——脚本经 fetch-history 已自写该文件，重定向同文件会 EPERM） | 退出 0；历史刷新 fresh（60 事件/54 regular）；仓内与 %APPDATA% 双快照同步（n=0、legacy=3，如实） |
| UI 实跑截图 | RR27 交付的 12 张（docs/screenshots/，三轮识图 8/8 PASS） | 复用为本轮验收证据（main 与 RR27 树恒等） |

阶段4 对照 02-spec §8 快照逐项核验：RR21/22/23/15/18/19/16/17/28/27 全部闭环且成果在 main；
RR12 本体按协议转回 🟠待领（永不 🟢）。

## 差距清单与定夺（零悬空）

### G1｜UI 可访问性收尾：Tab 全键盘遍历逐控件实测、对比度逐组合 4.5:1 数值核验、credits-zero 决策卡视口截图
- 现象：RR27 已实测 Escape 端到端（1380→152）与按钮可视可达；NOACTIVATE 下点击激活后的 Tab
  遍历顺序、深浅两主题逐前景/背景组合的对比度数值、以及 credits-zero 决策卡视口未逐一留证。
- 定夺：🔧立卡 **RR29**（ui 打磨，P3）。
- 理由：有明确验证口径（computer-use/CDP 键序 + 对比度计算脚本），量小；不阻塞发布。

### G2｜MSVC 发行路径 DPI 覆盖未验证
- 现象：RR20 修复的是 GNU 自建 exe 的 manifest；CI（windows-latest=MSVC）产物是否带
  dpiAware 声明未取证（tauri 官方 MSVC 走 tao 运行时调用，理论生效但无实证）。
- 定夺：🎣立卡 **RR30**（挖卡，P3，**依赖用户 push 触发 CI 首跑后才能取产物**）。
- 理由：发布动作留给用户（RUNBOOK §1.7）；CI 未跑过之前无法取证，不虚设验证。

### G3｜review-calibration 的 stdout 重定向陷阱
- 现象：本轮实跑发现把 stdout 重定向到 docs/calibration-latest.md 会与脚本内部原子写
  同文件冲突（EPERM）；RUNBOOK §9.1 的旧命令针对 calibrate.mjs（只写 stdout）无此问题。
- 定夺：不立卡。处置：RUNBOOK §11 追加变更行注明新入口用法（已完成）；本报告留档。

### G4｜ROADMAP v0.3 未立卡条目（系统通知 / 配速联动开关 / 多窗口布局记忆）
- 定夺：不立卡本轮。理由：属新功能排期，未获用户阶段授权；REVIEW 拍取材优先级
  （新差距 > ROADMAP）已由 G1/G2 覆盖当前真实差距。留用户点单。

### G5｜已消除项核验（不立卡，留档）
- RR21「校准 2 字孤行」、RR14 遗产②胶囊顶部白条：RR27 重构后 03b/01 截图无此象 → 消除。
- 空壳目录 RR13/RR21（worktree 句柄占用残留，git 侧已清）：本轮尝试 rmdir 仍 busy，
  空目录无害，留待句柄释放后随手清；RR26 worktree 按裁决保留（用户参考图原件）。
- 校准计分样本 n=0：运行时自然积累（RR16 后构建的 app 落盘 + 窗口完成 + 历史覆盖后
  自动结算），无需立卡。

## 结论

阶段4 目标全部达成且主仓四绿；本轮立卡 2 张（RR29/RR30，均 P3 非阻塞）、不立卡 3 条附理由、
已消除 3 条留档。BOARD 切回 WORK（RR29/RR30 可领；用户亦可随时发布——发布三步就绪，
push/打 tag 留给用户）。
