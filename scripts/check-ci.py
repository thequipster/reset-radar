#!/usr/bin/env python3
"""RR02 门禁断言：.github/workflows/ci.yml 步骤结构与卡面修向逐条对照 + README 徽章接线。

口径来源：BACKLOG RR02 修向——windows-latest；npm ci → tsc → vitest → cargo check →
tauri build（CI 用 MSVC 无 dll 问题，TRUTH B02/D009）→ 产物上传 artifact；README 徽章接线。
本脚本即该验证口径的可复现实现（RR02 基于 main 无 tsc/vitest 对象，门禁等价口径见 D011）。
依赖：python3 + PyYAML（本机 6.0.3 实测可用）。用法：python scripts/check-ci.py
"""
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CI = ROOT / ".github" / "workflows" / "ci.yml"
README = ROOT / "README.md"

# 卡面修向规定的 run 步骤序列（checkout/setup 等动作步骤不算，逐条精确对照）
EXPECT_RUNS = [
    "npm ci",
    "npx tsc --noEmit",
    "npx vitest run",
    "cargo check --locked --manifest-path src-tauri/Cargo.toml",
    "npm run tauri build",
]

failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


wf = yaml.safe_load(CI.read_text(encoding="utf-8"))
# PyYAML 会把裸键 on 解析为布尔 True，两种都取
on = wf.get("on") if "on" in wf else wf.get(True)

check(on is not None, "缺 on 触发区")
if on:
    check("main" in (on.get("push") or {}).get("branches", []),
          "on.push.branches 未包含 main")
    check("pull_request" in on, "缺 pull_request 触发")
check((wf.get("permissions") or {}).get("contents") == "read",
      "permissions.contents 应为 read（最小权限）")

job = wf.get("jobs", {}).get("windows")
check(job is not None, "缺 jobs.windows")
if job:
    check(job.get("runs-on") == "windows-latest",
          "jobs.windows.runs-on 应为 windows-latest")
    steps = job.get("steps", [])
    runs = [s["run"] for s in steps if "run" in s]
    check(runs == EXPECT_RUNS,
          f"run 步骤序列与卡面修向不符：期望 {EXPECT_RUNS}，实际 {runs}")
    last = steps[-1] if steps else {}
    check(str(last.get("uses", "")).startswith("actions/upload-artifact@"),
          "最后一步应为 actions/upload-artifact")
    paths = last.get("with", {}).get("path")
    paths = paths if isinstance(paths, list) else [paths]
    check(any("bundle/nsis" in str(p) for p in paths), "artifact path 缺 nsis 安装包")
    check(any("bundle/msi" in str(p) for p in paths), "artifact path 缺 msi 安装包")
    check(last.get("with", {}).get("if-no-files-found") == "error",
          "upload-artifact 应 if-no-files-found: error（产物缺失即红）")

check("actions/workflows/ci.yml/badge.svg" in README.read_text(encoding="utf-8"),
      "README 未接线 CI 徽章（actions/workflows/ci.yml/badge.svg）")

if failures:
    for f in failures:
        print(f"FAIL: {f}")
    sys.exit(1)
print(f"check-ci OK: {len(EXPECT_RUNS)} run 步骤与卡面修向一致；徽章已接线")
