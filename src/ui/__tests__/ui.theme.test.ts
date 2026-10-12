// RR27 域测试：主题偏好解析/记忆 + widget.css 双主题 token 存在性（CSS 是 token 唯一源，
// 此处以文件内容断言防漂移——token 丢失会整块 UI 掉色）。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  THEME_STORAGE_KEY, initialThemeOverride, readThemePreference, resolveTheme, writeThemePreference,
} from "../theme";

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  } as Storage;
}

describe("initialThemeOverride（?theme= 截图入口）", () => {
  it("dark/light 生效；非法/缺失返回 null", () => {
    expect(initialThemeOverride("?theme=dark")).toBe("dark");
    expect(initialThemeOverride("?theme=light")).toBe("light");
    expect(initialThemeOverride("?a=1&theme=light&b=2")).toBe("light");
    expect(initialThemeOverride("")).toBeNull();
    expect(initialThemeOverride("?theme=neon")).toBeNull();
    expect(initialThemeOverride("?themes=light")).toBeNull(); // 前缀相似不误匹配
  });
});

describe("resolveTheme", () => {
  it("dark/light 直选；system 跟随系统深浅", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it.each(["dark", "light"] as const)("显式 %s 主题不受系统主题影响", (preference) => {
    expect(resolveTheme(preference, true)).toBe(preference);
    expect(resolveTheme(preference, false)).toBe(preference);
  });
});

describe("本地记忆（localStorage）", () => {
  it("合法值往返；坏值/无存储回退 dark；写失败不抛错", () => {
    const store = memoryStore({ [THEME_STORAGE_KEY]: "light" });
    expect(readThemePreference(store)).toBe("light");
    expect(writeThemePreference(store, "system")).toBe(true);
    expect(readThemePreference(store)).toBe("dark"); // 旧 system 记忆迁移到深色默认
    expect(readThemePreference(memoryStore({ [THEME_STORAGE_KEY]: "system" }))).toBe("dark");
    expect(readThemePreference(memoryStore())).toBe("dark"); // 默认=图3 深色主参考
    expect(readThemePreference(memoryStore({ [THEME_STORAGE_KEY]: "neon" }))).toBe("dark");
    // 抛错存储（如隐私模式配额）：读写都不炸。
    const throwing = {
      length: 0,
      clear: () => {},
      key: () => null,
      removeItem: () => {},
      getItem: () => {
        throw new Error("quota");
      },
      setItem: () => {
        throw new Error("quota");
      },
    } as unknown as Storage;
    expect(readThemePreference(throwing)).toBe("dark");
    expect(writeThemePreference(throwing, "light")).toBe(false);
    expect(readThemePreference(null)).toBe("dark");
  });
});

describe("widget.css token 完整性（双主题）", () => {
  const css = readFileSync(
    join(fileURLToPath(new URL("../", import.meta.url)), "widget.css"),
    "utf8",
  );
  const tokens = [
    "--bg-panel", "--bg-card", "--bg-skeleton", "--ring-track", "--border-subtle",
    "--text-primary", "--text-secondary", "--accent-blue", "--accent-cyan", "--accent-purple",
    "--success", "--warn", "--danger", "--glow-purple", "--shadow-panel",
  ];
  it.each(tokens)("深色块含 %s", (token) => {
    const darkBlock = css.slice(css.indexOf(":root"), css.indexOf('[data-theme="light"]'));
    expect(darkBlock).toContain(`${token}:`);
  });
  it.each(tokens)("浅色块含 %s", (token) => {
    const lightBlock = css.slice(css.indexOf('[data-theme="light"]'));
    expect(lightBlock).toContain(`${token}:`);
  });
  it("reduced-motion 关停旋转/位移动效（02-spec §5）", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
