# 第三方声明（Third-Party Notices）

本仓部分代码复用自 [codex-cockpit](https://github.com/HouSiyuan2001/codex-cockpit)
（v0.3.0-beta.5，MIT License）。按 MIT 条款在此保留其版权与许可声明原文，并列明复用范围，
供任何人核验（登记卡 RR33；用户裁决「如实声明」路线，不做重写）。

## codex-cockpit — MIT License（原文保留）

```text
MIT License

Copyright (c) 2026 Quota Float contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 复用清单（RR33 逐行比对定档）

| 本仓文件 | 复用方式 | 原文出处（codex-cockpit） |
|---|---|---|
| `src/lib/resetCard.ts` | 整文件移植，逐函数对应（归一化后约 77% 行与原文逐行相同）；适配点见文件头与 docs/DECISIONS.md D015 | `src/lib/resetCard.ts` |
| `src-tauri/src/codex.rs` | app-server 握手序列与解析移植（约 300 行同文），裁剪为本项目单 provider 子集 | `src-tauri/src/codex.rs` |
| `src/lib/planner.ts` | `planRemainingQuota` / `DEFAULT_WEEKDAY_HAZARDS` 公式段移植（约 46 行同源） | `src/lib/dynamicQuota.ts` |
| `src/lib/risk.ts` | 算法思路借鉴后重写为 TypeScript（非逐字复用，常量与结构注明 rs 行号） | `src-tauri/src/reset_forecast.rs` |
| `.github/workflows/ci.yml`、`release.yml` | workflow 结构与 action 选型借鉴（action 按 commit SHA 锁定） | `.github/workflows/release.yml` |
| `src-tauri/tauri.conf.json` 悬浮窗字段 | 字段口径对齐 | `src-tauri/tauri.conf.json` |

逐函数行号出处另见各文件头注释与 `task_logs/*_done.md`；来源登记见 `TRUTH.md` §1 来源 3。
除上表外，本仓其余源码、文档、图稿为本工作区 AI 看板会话原创产出。

## 本地字体（SIL Open Font License 1.1）

- Manrope：来源 https://github.com/google/fonts/tree/main/ofl/manrope 。
- Radar Sans SC：由 Noto Sans SC 生成的 GB2312+标点子集，已重命名；来源 https://github.com/google/fonts/tree/main/ofl/notosanssc 。
- 原始版权及完整许可证随应用保留在 `public/licenses/fonts/`，构建后复制到 `dist/licenses/fonts/`。字体均本地加载，不安装到系统、不调用运行时 CDN。
