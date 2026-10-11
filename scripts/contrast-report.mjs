// RR29：对比度核验报告渲染壳（RUNBOOK §9 artifact 口径）。经 node ≥22.18 原生
// type-stripping 直载 src/ui/*.ts（import 链带 .ts 扩展，同 calibrate.mjs 口径）。
// 用法：node scripts/contrast-report.mjs > docs/a11y-contrast-20261011.md
// （脚本只写 stdout；数值唯一源=src/ui/contrastPairs.ts，与域测试快照互锁。）
import { CONTRAST_PAIRS, pairRatio } from "../src/ui/contrastPairs.ts";
import { levelThreshold } from "../src/ui/contrast.ts";

const NOW = new Date();
const stamp = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, "0")}-${String(NOW.getDate()).padStart(2, "0")}`;

const lines = [];
lines.push(`# 可访问性对比度核验报告（${stamp}）`);
lines.push("");
lines.push("> 生成：\`node scripts/contrast-report.mjs > docs/a11y-contrast-20261011.md\`（RR29，G1 口径）。");
lines.push("> 计算=WCAG 2.x 相对亮度法；档位：正文 4.5:1，大字（≥24px 或 ≥18.66px 粗体）与图形组件 3:1（1.4.11）。");
lines.push("> 口径：bg-panel(α0.97) 按不透明近似；*-dim(α0.10–0.12) 合成到所在卡片 bg-card；");
lines.push("> 横幅渐变三色 a/b/c 各一行。数值唯一源=src/ui/contrastPairs.ts（域测试 84 组快照锁定）。");
lines.push("");

for (const theme of ["dark", "light"]) {
  const rows = CONTRAST_PAIRS.map((p) => ({ p, r: pairRatio(p, theme) }));
  const fail = rows.filter((x) => x.r + 1e-9 < levelThreshold(x.p.level));
  lines.push(`## ${theme === "dark" ? "深色主题" : "浅色主题"}（${rows.length} 组，不达标 ${fail.length}）`);
  lines.push("");
  lines.push("| id | 前景 | 背景（自底向上） | 档位 | 数值 | 结论 |");
  lines.push("|---|---|---|---|---|---|");
  for (const { p, r } of rows) {
    const ok = r + 1e-9 >= levelThreshold(p.level);
    lines.push(
      `| ${p.id} | \`${p.fg}\` | ${p.bgStack.map((b) => `\`${b}\``).join(" ⊕ ")} | ${p.level}(${levelThreshold(p.level)}) | **${r.toFixed(2)}** | ${ok ? "达标" : "不达标"} |`,
    );
  }
  lines.push("");
  lines.push(`小结：${fail.length === 0 ? "全部达标。" : `不达标 ${fail.length} 组：${fail.map((f) => `\`${f.p.id}\`(${f.r.toFixed(2)})`).join("、")}。逐条定夺见文末。`}`);
  lines.push("");
}

lines.push("## 出处索引（配对 → CSS 规则）");
lines.push("");
lines.push("| id | 出处 | 注 |");
lines.push("|---|---|---|");
for (const p of CONTRAST_PAIRS) {
  lines.push(`| ${p.id} | ${p.source} | ${p.note ?? ""} |`);
}
lines.push("");
lines.push("## 定夺");
lines.push("");
lines.push("（交付时按识图子代理复核结论补写：哪些属真实可读性缺陷立卡修复、哪些属三级文本/");
lines.push("装饰性元素的设计取舍留档。）");
process.stdout.write(lines.join("\n") + "\n");
