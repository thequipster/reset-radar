// RR32 域测试：品牌图标接入三链锁定。
// ① src-tauri/icons 资产与交付包字节一致（exe/任务栏图标源头，防回落 Tauri 默认件）；
// ② RadarLogo 渲染几何与交付正稿 reset-radar-mark.svg 逐值一致（viewBox512/双环/扇形/中心点）；
// ③ 主题 token 双文件对齐：深色=精密蓝 #46e4f4/#179bf1，浅色=02-glass #0277c8/#30b7ef
//    （handoff：勿将亮色透明标放白底——浅色必须换深色调）。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RadarLogo } from "../icons";
import { THEME_VARIABLES } from "../theme";

const uiDir = join(fileURLToPath(new URL("../", import.meta.url)));
const repoRoot = join(uiDir, "..", "..");
const pkgIcons = join(repoRoot, "docs", "design", "icons-20261011", "icons");

describe("src-tauri/icons 资产 = 交付包原件（字节一致）", () => {
  it.each([
    ["icon.ico", "reset-radar.ico"],
    ["32x32.png", "png/reset-radar-32.png"],
    ["128x128.png", "png/reset-radar-128.png"],
    ["128x128@2x.png", "png/reset-radar-256.png"],
  ])("%s ↔ %s", (dst, src) => {
    const a = readFileSync(join(repoRoot, "src-tauri", "icons", dst));
    const b = readFileSync(join(pkgIcons, ...src.split("/")));
    expect(a.length).toBe(b.length);
    expect(a.equals(b)).toBe(true);
  });
});

describe("RadarLogo 渲染 = 交付正稿几何（reset-radar-mark.svg 逐值）", () => {
  const html = renderToStaticMarkup(createElement(RadarLogo, { size: 30 }));
  const markSvg = readFileSync(join(pkgIcons, "source", "reset-radar-mark.svg"), "utf8");

  it("视窗与三环几何逐值（外环172/内环104/中心27）", () => {
    expect(html).toContain('viewBox="0 0 512 512"');
    expect(html).toContain('r="172"');
    expect(html).toContain('r="104"');
    expect(html).toContain('r="27"');
  });

  it("扇形与扫描线 path d 与交付源逐字符一致", () => {
    const paths = [...markSvg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    for (const d of paths) expect(html).toContain(`d="${d}"`);
  });

  it("色值全部走主题 token（无硬编码十六进制）", () => {
    expect(html).toContain('stroke="var(--logo-ring-main)"');
    expect(html).toContain('stroke="var(--logo-ring-inner)"');
    expect(html).toContain('stop-color="var(--logo-grad-lo)"');
    expect(html).toContain('stop-color="var(--logo-grad-hi)"');
    expect(html).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe("logo 主题 token 双文件对齐（widget.css ↔ theme.ts）", () => {
  const css = readFileSync(join(uiDir, "widget.css"), "utf8");
  const darkBlock = css.slice(css.indexOf(":root"), css.indexOf('[data-theme="light"]'));
  const lightBlock = css.slice(css.indexOf('[data-theme="light"]'));

  it("深色=精密蓝正稿色值", () => {
    expect(darkBlock).toContain("--logo-ring-main: #46e4f4");
    expect(darkBlock).toContain("--logo-ring-inner: #179bf1");
    expect(darkBlock).toContain("--logo-grad-lo: rgba(23, 155, 241, 0.12)");
    expect(darkBlock).toContain("--logo-grad-hi: rgba(70, 228, 244, 0.68)");
  });

  it("浅色=02-glass 深色调（handoff 防呆：亮色标记不放白底）", () => {
    expect(lightBlock).toContain("--logo-ring-main: #0277c8");
    expect(lightBlock).toContain("--logo-ring-inner: #30b7ef");
  });

  it("theme.ts 表与 CSS 同 token 同值（RR27 对齐口径顺延）", () => {
    for (const theme of ["dark", "light"] as const) {
      const block = theme === "dark" ? darkBlock : lightBlock;
      for (const [token, value] of Object.entries(THEME_VARIABLES[theme])) {
        if (!token.startsWith("--logo-")) continue;
        expect(block).toContain(`${token}: ${value}`);
      }
    }
    expect(THEME_VARIABLES.dark["--logo-ring-main"]).toBe("#46e4f4");
    expect(THEME_VARIABLES.light["--logo-ring-main"]).toBe("#0277c8");
  });
});
