# RR22来源核验

- B07 `https://codex-resets.com/api/v1/status`，Node fetch HTTP200，于2026-10-11T04:33:44.857Z获取；原响应`status-live.json`没有手工编辑。
- 响应meta.generated_at=2026-10-11T04:33:44.170Z；当前scheduled_reset/active_watch均null；latest_reset为regular，announced_at=2026-10-11T04:01:09.000Z，source.url=https://x.com/thsottiaux/status/2109132167112782291。
- https://codex-resets.com/ 首页说明banked为需要用户兑换的存储卡，不会立即回满。regular公告情景与banked分开；未支持类型只展示。搜索索引仍缓存旧计划，当前事实以这次API原文为准。
- 上轮RR22原始卡面记录scheduled_reset的id/status/reset_type/announced_at/scheduled_for/text/source字段，见主仓BACKLOG RR22。当前接口无未来计划，测试注入该已登记形状并保留snake_case到camelCase适配边界，未把旧公告写回真实夹具。
- 借鉴算法仍来自MIT codex-cockpit：src/lib/dynamicQuota.ts与src/lib/resetCard.ts，以及src-tauri/src/reset_forecast.rs watch25%权重（现有注释逐行登记）。本轮只增加公告情景边界，未再次复制实现。
- 本轮用户参考六PNG→RR22 docs/design/ref/，SHA256与RR26原文件对账一致；Luna只读评估，没有访问屏幕。选择表见04-progress。

获取命令（在RR22根，Node>=22）：

```js
const r = await fetch('https://codex-resets.com/api/v1/status', { signal: AbortSignal.timeout(20000) });
if (!r.ok) throw new Error(String(r.status));
const text = await r.text();
await writeFile('task_logs/RR22_artifacts/status-live.json', text);
```

注：这次没有刷新data/resets-history.json，RR18负责离线夹具刷新，RR23负责运行时/status采集与失败/新鲜度。
