// 把一个文件按 base64 打印或写成文本（Bridge 只能读文本；用于把截图取回审阅）。
// 用法：node scripts/rr56-b64.mjs <file> [out.b64] [skipLines=0]
//   给了 out 就写成每行 4000 字符的文本文件（read_file_range 每个文件最多能读到 100 行，
//   大文件用 skipLines 分段：0、100、200…各写一个文件），否则分行打印。
import { readFileSync, writeFileSync } from "node:fs";
const data = readFileSync(process.argv[2]).toString("base64");
const lines = [];
for (let i = 0; i < data.length; i += 4000) lines.push(data.slice(i, i + 4000));
const skip = Number(process.argv[4] ?? 0);
if (process.argv[3]) { const part = lines.slice(skip, skip + 100); writeFileSync(process.argv[3], part.join("\n") + "\n"); console.log(`[b64-file] ${process.argv[3]} total=${data.length} lines=${lines.length} wrote=${part.length} skip=${skip}`); }
else { for (const line of lines) console.log(line); console.log(`[b64-end] ${data.length}`); }
