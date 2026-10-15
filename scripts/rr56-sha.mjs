// 打印文件 SHA256 与大小（交付包核验用）。用法：node scripts/rr56-sha.mjs <file> [...]
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
for (const file of process.argv.slice(2)) {
  const data = readFileSync(file);
  console.log(`${createHash("sha256").update(data).digest("hex").toUpperCase()}  ${statSync(file).size}  ${file}`);
}
