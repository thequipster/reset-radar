// RR27 域测试：展示层格式化（北京时区显式格式化；null/0 严格区分）。期望值手算：
// 2026-10-11T16:26:37Z = 北京 2026-10-12 00:26:37（跨日，UTC+8 无夏令时，D004）。
import { describe, expect, it } from "vitest";
import {
  beijingFull, beijingShort, creditsLabel, daysLabel, deltaPct, percent1, percentWhole, weekdayDateLabel,
} from "../format";

describe("北京时区格式化（禁止截 ISO 串）", () => {
  it("跨日：UTC 16:26 → 北京次日 00:26；短格式含日期", () => {
    expect(beijingShort("2026-10-11T16:26:37Z")).toBe("10/12 00:26");
    expect(beijingFull("2026-10-11T16:26:37Z")).toBe("2026/10/12 00:26:37");
  });
  it("同日：UTC 03:05 → 北京 11:05", () => {
    expect(beijingShort("2026-10-11T03:05:00Z")).toBe("10/11 11:05");
  });
  it("空/非法输入返回 null，不输出误导性日期", () => {
    expect(beijingShort(null)).toBeNull();
    expect(beijingShort("")).toBeNull();
    expect(beijingShort("not-a-date")).toBeNull();
    expect(beijingFull(undefined)).toBeNull();
  });
});

describe("null 与 0 严格区分（02-spec §6）", () => {
  it("百分比：null→“—”；0→“0%”；一位小数口径同", () => {
    expect(percentWhole(null)).toBe("—");
    expect(percentWhole(0)).toBe("0%");
    expect(percentWhole(29.4)).toBe("29%");
    expect(percent1(null)).toBe("—");
    expect(percent1(25.44)).toBe("25.4%");
  });
  it("卡数：null→“卡 —”；0→“卡 ×0”；3→“卡 ×3”", () => {
    expect(creditsLabel(null)).toBe("卡 —");
    expect(creditsLabel(0)).toBe("卡 ×0");
    expect(creditsLabel(3)).toBe("卡 ×3");
  });
  it("delta：正负号与图稿一致（非 ASCII 减号）", () => {
    expect(deltaPct(8.74)).toBe("+8.7");
    expect(deltaPct(-1.24)).toBe("−1.2");
    expect(deltaPct(0)).toBe("+0.0");
  });
  it("天数：一位小数；null→“—”", () => {
    expect(daysLabel(2.44)).toBe("2.4 天");
    expect(daysLabel(null)).toBe("—");
  });
});

describe("weekdayDateLabel（候选日轴标签）", () => {
  it("北京日历键 → 周X MM/DD", () => {
    // 2026-10-15=周四（与 calibration.core 周锚同源：10-12=周一）。
    expect(weekdayDateLabel("2026-10-15")).toBe("周四 10/15");
    expect(weekdayDateLabel("2026-10-11")).toBe("周日 10/11");
  });
  it("非法键原样返回不炸", () => {
    expect(weekdayDateLabel("garbage")).toBe("garbage");
  });
});
