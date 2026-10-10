// RR01 冒烟测试：锁脚手架三契约——identifier 防撞、双源 identifier 一致、双源版本一致。
// 这些断言是看板协议的可执行化（TRUTH B05 / RUNBOOK §6），改动前先读对应条款。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_IDENTIFIER, APP_NAME } from "../meta";

// 测试文件位于 src/lib/__tests__/ → 上溯 3 层即仓库根
const root = fileURLToPath(new URL("../../../", import.meta.url));
const tauriConf = JSON.parse(
  readFileSync(`${root}src-tauri/tauri.conf.json`, "utf8"),
);
const pkg = JSON.parse(readFileSync(`${root}package.json`, "utf8"));

describe("RR01 脚手架冒烟", () => {
  it("identifier 必须是本项目专属前缀 app.resetradar.*（防撞 TRUTH B05）", () => {
    expect(APP_IDENTIFIER.startsWith("app.resetradar.")).toBe(true);
  });

  it("核心层常量与 tauri.conf.json 的 identifier 一致（防双源漂移）", () => {
    expect(tauriConf.identifier).toBe(APP_IDENTIFIER);
  });

  it("package.json 与 tauri.conf.json 的 version 一致（RUNBOOK §6 版本同步）", () => {
    expect(tauriConf.version).toBe(pkg.version);
  });

  it("应用名非空", () => {
    expect(APP_NAME.length).toBeGreaterThan(0);
  });
});
