import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 配置出处：参考项目 codex-cockpit vite.config.ts（MIT，TRUTH §1 来源 3，本机实测可跑组合）。
// 端口 1420/strictPort 为 Tauri devUrl 约定；test 段为 vitest（排除 Rust 构建产物目录）。
// scripts/** 排除：scripts 下是 node:test 套件（node --test 运行，RR03 约定），
// vitest 默认抓 **/*.test.mjs 会误载导致文件级失败（RR01+RR03 合入后实测，D013）。
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { rollupOptions: { input: "index.html" } },
  test: {
    maxWorkers: 2,
    exclude: ["**/node_modules/**", "dist/**", "src-tauri/target/**", "scripts/**"],
  },
});
