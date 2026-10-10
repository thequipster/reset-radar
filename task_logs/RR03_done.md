# RR03 done — 🎣挖卡：codex-resets.com 真实重置历史采集夹具（会话 S1011-0113）

- 交付时间：2026-10-11 01:30（+08）
- 分支/commit：agent/RR03 @ **cf4d0ab**（基 aa9376e；worktree ../reset-radar_wt/RR03 保留待 MERGE）
- diffstat：3 files changed, 791 insertions(+) —— scripts/fetch-history.mjs（新增）、
  scripts/fetch-history.test.mjs（新增）、data/resets-history.json（新增，脚本生成夹具）

## 交付内容

1. `scripts/fetch-history.mjs`：零依赖 node 采集器。并发拉取
   `/api/v1/resets?limit=100&order=desc` 与 `/api/v1/status`（各 4s 超时 + UA
   `reset-radar/0.1 (reset history fetcher)`；非 2xx 直接抛错不静默降级）；
   `/status` 的 `latest_reset` 并入历史后统一清洗；原子写（tmp+rename）`data/resets-history.json`。
2. `scripts/fetch-history.test.mjs`：node:test 12 用例（零 npm 依赖）。
3. `data/resets-history.json`：首拉真实夹具，schema `reset-radar/resets-history@1`
   （schema 已登记 TRUTH §2 B07）。

## 真值出处（证据铁律）

- API 端点与 schema：**本会话直接实测**两个端点（node fetch 200；响应原文即夹具 upstream/status 字段），
  登记 TRUTH §2 **B07**。字段名（announced_at/reset_type/latest_reset/active_watch/stats）逐一与响应原文核对。
- 清洗算法：移植自参考实现 codex-cockpit（MIT）`src-tauri/src/reset_forecast.rs` 的
  `sanitize_history`（函数体 :103-132；`FUTURE_TOLERANCE_MINUTES=5` 见 :8、`DUPLICATE_WINDOW_MINUTES=5`
  见 :9；`latest_reset` 并入对应 :108-110 的 chain 写法；"倒序遍历、跳过与上一保留项 ≤ 窗口者"对应 :114-127，
  保留每簇更晚一条）。
- 星期边界：D004（北京零点，UTC+8 固定偏移，无夏令时）。测试断言用实测锚点
  （2026-10-08T16:00:00Z=北京周五 00:00；15:59:59Z=北京周四）。

## 门禁证据（D010 等价口径：卡面口径 + node:test + 变异红验）

- 域测试=全量测试（RR03 为当时仓库唯一测试集）：`node --test scripts/fetch-history.test.mjs`
  → **12/12 pass, 0 fail**（交付前最终复跑 duration 66ms；tsc/vitest 依 D010 不适用于本卡，
  RR01 合入前的 scripts 域等价口径，决策记录 docs/DECISIONS.md D010）。
- 卡面口径「可重复运行幂等」：连续两跑后剔除易变字段（fetchedAt / upstream.generatedAt）
  逐字节比较 → **PASS ✅（27778 chars 完全一致）**；两跑控制台输出（条数/跨度/星期分布）逐字相同。
- 变异红验两轮（三要素）：
  ① 改坏：`DUPLICATE_WINDOW_MIN` 5→0（去重失效）→ 红：`sanitizeEvents` 套件 not ok
  （子测「5 分钟窗口去重：倒序遍历保留每簇晚者」失败，actual 多出被去重项）→ 复原=5 → 复跑 12/12 绿。
  ② 改坏：`FUTURE_TOLERANCE_MIN` 5→0（未来容差变严）→ 红：`sanitizeEvents` 套件 not ok
  （子测「未来容差：as_of+5min 整保留」失败）→ 复原=5 → 复跑 **12/12 pass, 0 fail**。
- 真实运行：`node scripts/fetch-history.mjs` → 事件 59 条，跨度 2025-09-17T04:02:52Z → 2026-10-08T03:44:55Z。

## 首拉统计表（卡面要求；详录 TRUTH §2 B07）

| 指标 | 值 |
|---|---|
| 事件数 | 59（banked 6 / regular 53） |
| 时间跨度 | 2025-09-17 → 2026-10-08（约 386 天） |
| upstream stats | total=59, avg_interval_days=6.7, days_since_last=2.6 |
| 北京星期分布 | Mon 4 / **Tue 10** / **Wed 12** / Thu 8 / Fri 7 / **Sat 9** / Sun 9 |
| 备注 | Tue+Sat=19/59≈32%；参考实现"Tue/Sat 70% 基线"与真实样本的偏差 = RR04/RR07 校准闭环的原料 |

## 待用户清单

- 无。（不涉发布/删除/License/协议。）

## 排障遗产（给后续会话）

1. 本机 curl(schannel) 对 codex-resets.com TLS 握手偶发失败（HTTP 000），node fetch(OpenSSL) 稳定——
   该域探活一律用 node（已记 TRUTH B07）。
2. MSYS 的 `/tmp` 虚拟路径对 node.exe 不可见（MODULE_NOT_FOUND）——node 脚本读写的临时文件用相对路径。
3. `node --test scripts/`（目录形式）在 Windows 下报 MODULE_NOT_FOUND，须显式指定测试文件路径。
4. Windows 主模块守卫用 `pathToFileURL(process.argv[1]).href`，手拼 `file://` 会因盘符 host 解析失配。

## →下轮

- RR04 起可直接消费 `data/resets-history.json`：`events[].announcedAt` 即清洗后 ISO 序列（最新在前），
  `status.active_watch`（当前为 null）预留了 RR04 风险抬升因子入口。
- MERGE 会话可批量合 RR01（cd9f759）+ RR03（cf4d0ab）：两者路径无交集（RR01 动 src*/package.json，
  RR03 动 scripts/+data/），合入后按 §8 复跑全量门禁。RR04+ 依赖 RR01 合入，RR02 可先行。
