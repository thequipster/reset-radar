#!/usr/bin/env python3
"""RR11 门禁断言：.github/workflows/release.yml 步骤结构与卡面修向逐条对照。

口径来源：BACKLOG RR11 修向——打 tag 触发构建、产物附件挂 Release。本脚本即该验证口径的
可复现实现（actionlint+PyYAML 双校验与 RR02 同法，等价口径先例见 DECISIONS D011；actionlint
二进制留在 /tmp/actionlint/，见 RR02 排障遗产）。用法：python scripts/check-release-wf.py
"""
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
WF = ROOT / ".github" / "workflows" / "release.yml"
PINNED_SHA = re.compile(r"@[0-9a-f]{40}$")  # 逐 commit-SHA pin（借参考仓，ci.yml 同法）

failures = []


def check(cond, msg):
    if not cond:
        failures.append(msg)


text = WF.read_text(encoding="utf-8")
wf = yaml.safe_load(text)
# PyYAML 会把裸键 on 解析为布尔 True，两种都取
on = wf.get("on") if "on" in wf else wf.get(True)

check(isinstance(on, dict), "缺 on 触发区")
if isinstance(on, dict):
    check(on.get("push", {}).get("tags") == ["v*"], "触发器必须是 push.tags=['v*']（打 tag 发版）")
perms = wf.get("permissions", {})
check(perms.get("contents") == "write", "permissions.contents 必须 write（gh release create 附件上传）")
check(wf.get("concurrency", {}).get("cancel-in-progress") is False, "发版并发不得 cancel-in-progress")

jobs = wf.get("jobs", {})
check(len(jobs) == 1, "应只有单个 release job（本项目无多平台矩阵）")
job = next(iter(jobs.values())) if jobs else {}
check(job.get("runs-on") == "windows-latest", "runs-on 必须 windows-latest（与 ci.yml 产物线一致）")

steps = job.get("steps", [])
for step in steps:
    uses = step.get("uses")
    if uses:
        check(bool(PINNED_SHA.search(uses)), f"action 未按 commit-SHA pin：{uses}")

runs = [s.get("run", "") for s in steps if "run" in s]
joined = "\n".join(runs)
check("node scripts/check-release.mjs --tag" in joined, "缺版本/tag 一致性守卫步骤")
check("npx tsc --noEmit" in joined, "缺 tsc 门禁")
check("npx vitest run" in joined, "缺 vitest 门禁")
check("npm run tauri build" in joined, "缺 tauri 构建")
check("gh release create" in joined, "缺 gh release create（产物挂 Release）")
check("--verify-tag" in joined, "gh release create 必须带 --verify-tag")
check("sha256sum" in joined, "产物必须附 SHA256SUMS 校验和")

# 借参考仓教训：release job 的 rust-cache 必须 save-if false（post-job 缓存修剪曾挂死 Windows runner）
cache_steps = [s for s in steps if str(s.get("uses", "")).startswith("swatinem/rust-cache")]
check(bool(cache_steps) and all(c.get("with", {}).get("save-if") == "false" for c in cache_steps),
      "rust-cache 必须 save-if 'false'（参考仓 Windows runner 挂死教训）")

if failures:
    print("\n".join(f"✗ {f}" for f in failures))
    sys.exit(1)
print(f"release.yml 结构门禁通过：{len(steps)} 步、{sum(1 for s in steps if s.get('uses'))} 个 action 全 SHA pin")
