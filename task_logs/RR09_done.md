# RR09 done — ui：悬浮胶囊 + 展开卡三块（数据全部来自 src/lib 纯核心）

- 领卡：2026-10-11 07:21 S1011-0713（LIGHT；本会话前段 MERGE RR08→main 42d443c）
- 分支：agent/RR09 @ **12d8380**（单 commit；基于 main 42d443c；patch 备份 task_logs/RR09.patch，
  已验证对 main 干净适用）
- diffstat：10 文件 +666/-7 —— src/ui/ 新 6 文件 + App.tsx 重写 + tauri.conf.json(高300→560)
  + 截图 1 张

## 交付内容

1. **src/ui/types.ts**：RR08 ProviderSnapshot 契约（与 src-tauri/src/models.rs camelCase 一一对应）
2. **src/ui/adapters.ts**（纯函数可测）：快照→视图模型；risk=assessResetRisk(history, asOf=快照
   observedAt——risk.ts 文件头 as_of 语义)；dailyPlan=planDailyUsage({remaining, daysToReset,
   risk.score})；cardPlan=planResetCard({…, dailyNeedPercent=estimateDailyNeedPercent([]) 走 lib
   兜底 100/7}；MS_PER_DAY 仅单位换算（注释注明非业务公式）
3. **src/ui/useSnapshots.ts**：invoke("get_snapshots")+listen("background-snapshots-updated")
   （lib.rs:27 事件名）；纯浏览器（无 __TAURI_INTERNALS__）降级 demo 快照（数值=RR08 冒烟
   实测样本，不参与测试断言，D018）
4. **src/ui/history.ts**：data/resets-history.json 只读提取 events[].announcedAt（59 条，RR03 夹具）
5. **src/ui/Capsule.tsx + ExpandedCard.tsx + App.tsx**：胶囊态（CODEX/剩余%/风险色点/卡数）↔
   展开态三块（①风险雷达：分数+因子行 D006 ②今日建议：数字+factors+软上限/配速/前拉
   ③用卡规划：决策文案+期望收益+24h/48h 碰撞+理由链）；配色阈值仅分数→颜色的展示映射
6. **tauri.conf.json**：窗口高 300→560（D018：窗口铬属 UI 交付面）

## 真值出处

- UI 结构与三块面板内容 = BACKLOG RR09 卡面修向 + ARCHITECTURE §2（UI 零业务规则）/D006
  （factors 必须逐行展示）——数字与建议全部来自 src/lib（risk/planner/resetCard，
  其出处链见各 done）
- 快照契约 = src-tauri/src/models.rs（serde camelCase）+ lib.rs:27 事件名（RR08 done）
- 风险历史 = data/resets-history.json（RR03 采集夹具，scripts/fetch-history.mjs 生成）

## 门禁四绿（+Rust 复核）

- ① tsc --noEmit ✅（worktree agent/RR09）
- ② 域测试 `npx vitest run src/ui/` 8/8 ✅（透传一致/换源即红/降级三态）
- ③ 全量 `npx vitest run` 73/73 0 failed ✅（基线 65→73 只升）
- ④ 变异红验两轮 ✅：
  - A「主数字换源 weeklyWindow→shortWindow」→ 红 5 条（直映射/换源守卫/今日建议/用卡规划/
    无周窗降级），复原再绿 8/8
  - B「daysToReset 除数注入 +8h」→ 红 1 条（今日建议透传），复原再绿 8/8
- Rust 复核：cargo check --tests ✅ 1m02s（动了 tauri.conf.json，虽非 Rust 域卡仍复验）
- UI 层无业务公式 grep ✅（唯一命中=useSnapshots demo 快照的演示数据构造，注释已隔离）

## 运行证据

- `npm run build` ✅（dist 265.56KB 含夹具）；`cargo build --release
  --features tauri/custom-protocol` ✅ 2m41s（B01 特性必带）
- **release app 实跑 + PrintWindow 截图：胶囊态真实数据渲染 ✅**
  （docs/screenshots/20261011-capsule.png：CODEX/剩余 29%——与 RR08 冒烟落盘实测一致，
  端到端 stale 载入→UI 展示全通）
- ⚠️ 卡面口径偏差：`npm run tauri dev` 在本机 gnu 链上 cdylib 链接失败（ld `export ordinal
  too large: 94564`，见 TRUTH B09），dev 模式不可用 → 改用 release app 截图（B01 实证路径）
- ⚠️ 展开态截图未取得：本会话环境拒绝前台切换（SetForegroundWindow/最小化恢复均
  FOREGROUND=False），鼠标输入注入不落窗口（两图 MD5 相同实证）→ 留 →下轮（见下）

## 排障遗产（已记 TRUTH）

- B09：tauri dev（gnu）cdylib 链接 `export ordinal too large` → 本机 dev 模式死路，用
  release+custom-protocol 代替
- 截图工具链：PrintWindow(PW_CLIENTONLY|PW_RENDERFULLCONTENT=3) 可离屏渲染 WebView2 内容
  （CopyFromScreen 会被遮挡污染）；输入注入需前台权，本环境拿不到 → 展开态截图两条路：
  ① computer-use 技能的 SDK 输入注入 ② 临时让 App 读 location.hash=#expanded 起始展开
- 胶囊在 420px 窗宽下右侧截断（截图可见「重置风险」标签被切）→ 立修卡素材（REVIEW 拍）

## 待用户清单

- 无（无删除功能/License/协议事项）

## →下轮

1. 展开态截图（上节两条路径任一）补 docs/screenshots/，RR09 附注补证据（代码已 🟡 可先合入）
2. 胶囊溢出 420px 窗宽：压缩胶囊内边距或加宽窗口到 460（小修卡）
3. MERGE 注意：worktree 内有 node_modules junction 与 src-tauri/target（未跟踪），
   `git worktree remove` 需先拆 junction（cmd //c rmdir node_modules）再 --force
