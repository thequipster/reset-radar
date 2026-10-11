// RR26 文档验收：保证六组提示词可独立使用，并检查容易误导的状态语义。
// 口径来自用户阶段3裁决与已确认UIUX规格，不调用图片模型或修改业务夹具。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = new URL("../../", import.meta.url);
const read = (name) => readFileSync(new URL(`docs/design/${name}`, root), "utf8");
const proposals = read("01-proposals.md");
const spec = read("02-spec.md");
const prompts = read("03-image-prompts.md");
const blocks = [...prompts.matchAll(/```text\r?\n([\s\S]*?)```/g)].map((match) => match[1]);

assert.equal((proposals.match(/^### \d+\./gm) ?? []).length, 42, "retain the 42 stage-1 proposals");
assert.equal(blocks.length, 6, "deliver six independently copyable image prompts");
for (const [index, block] of blocks.entries()) {
  for (const marker of ["reset-radar", "场景与视角：", "区域划分：", "交互与信息层级：", "视觉自由：", "画幅："]) {
    assert.ok(block.includes(marker), `prompt ${index + 1} missing ${marker}`);
  }
  assert.match(block, /配色|色彩|颜色/, `prompt ${index + 1} must allow visual exploration`);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b/i, `prompt ${index + 1} must not prescribe hex colors`);
  assert.match(block, /建议\d+:\d+/, `prompt ${index + 1} missing suggested aspect ratio`);
}
assert.match(blocks[0], /周额度百分点/, "daily recommendation must state its unit");
assert.match(blocks[0], /软上限表达约束/, "soft cap is a constraint, not another additive quota");
assert.match(blocks[0], /尚未确认发生/, "announcement is a plan rather than a confirmed event");
assert.match(blocks[4], /卡数未知 \/ 卡 —/, "state 05 must distinguish unknown credits from known zero");
assert.match(blocks[4], /卡×0 \/ 无可用重置卡/, "state 05 must retain the known-zero state");
assert.match(blocks[4], /保留上次观测/, "stale state must preserve and label the last observation");
assert.match(blocks[4], /首次加载|读取中/, "loading must differ from empty data");
assert.match(blocks[4], /暂无额度数据/, "empty data must not silently become zero");
for (const marker of ["RR22", "RR23", "RR15", "RR16", "RR17", "RR18", "RR19", "阶段4", "4.5:1", "refresh_snapshots", "卡数未知"]) {
  assert.ok(spec.includes(marker), `approved UX/phase-4 contract missing ${marker}`);
}
assert.match(spec, /支持深色、浅色、跟随系统/, "retain theme UX while freeing palette choices");
assert.match(spec, /不规定色值/, "the latest user decision must override previous color values");
assert.match(prompts, /没有实际生成图片/, "document validation must not claim actual image evaluation");
console.log(`PASS RR26 design contract: ${blocks.length} prompts, 42 proposals, state semantics, phase-4 scope; ${fileURLToPath(root)}`);
