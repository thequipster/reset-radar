// RR56：Bridge 里没有 shell、也不允许内联脚本，cargo（gnu 工具链）又需要 gcc/windres 在 PATH 上。
// 这里把 mingw64 与 ~/.cargo/bin 前置到 PATH 后转调 `rustup run stable cargo <args>`，工作目录固定为 src-tauri。
// 用法：node scripts/rr56-cargo.mjs test            → cargo test
//       node scripts/rr56-cargo.mjs build --release --features tauri/custom-protocol
// 可用环境变量 RR_MINGW_BIN 指定 mingw64\bin；未设置时尝试本机已知路径，不存在则只依赖现有 PATH。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tauriDir = path.resolve(here, "..", "src-tauri");
const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
const candidates = [
  process.env.RR_MINGW_BIN,
  path.join(home, ".zcode", "workspace", "default", "quota-analysis", "toolchain", "mingw64", "bin"),
].filter(Boolean);
const mingw = candidates.find((dir) => existsSync(path.join(dir, process.platform === "win32" ? "gcc.exe" : "gcc")));
const prefix = [mingw, path.join(home, ".cargo", "bin")].filter((dir) => dir && existsSync(dir));
const env = { ...process.env, PATH: [...prefix, process.env.PATH ?? ""].join(path.delimiter) };
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node scripts/rr56-cargo.mjs <cargo args…>");
  process.exit(2);
}
console.log(`[rr56-cargo] cwd=${tauriDir}`);
console.log(`[rr56-cargo] mingw64=${mingw ?? "(not found; relying on PATH)"}`);
const rustup = process.platform === "win32" ? "rustup.exe" : "rustup";
const result = spawnSync(rustup, ["run", "stable", "cargo", ...args], { cwd: tauriDir, env, stdio: "inherit" });
if (result.error) {
  console.error(`[rr56-cargo] failed to start rustup: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
