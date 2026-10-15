// 诊断：列出 reset-radar 应用数据目录的文件大小与日志行数分布（只读，不修改任何文件）。
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
const bases = [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean);
for (const base of bases) {
  for (const name of fs.readdirSync(base)) {
    if (!name.startsWith("app.resetradar")) continue;
    const dir = path.join(base, name);
    console.log("DIR", dir);
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      console.log("  ", f, st.isDirectory() ? "<dir>" : `${st.size} bytes`, st.mtime.toISOString());
      if (f.endsWith(".jsonl") && st.isFile() && st.size > 0 && st.size < 4e9) {
        const kinds = new Map(); let lines = 0; let bad = 0;
        const rl = readline.createInterface({ input: fs.createReadStream(p) });
        for await (const line of rl) {
          if (!line.trim()) continue; lines++;
          try { const row = JSON.parse(line); const k = row.kind ?? (row.schemaVersion === 3 ? "usage-snapshot" : "other"); const e = kinds.get(k) ?? { n: 0, bytes: 0 }; e.n++; e.bytes += line.length; kinds.set(k, e); } catch { bad++; }
        }
        console.log("     lines", lines, "bad", bad);
        for (const [k, e] of [...kinds.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) console.log("     ", k, e.n, "rows", e.bytes, "bytes");
      }
    }
  }
}
