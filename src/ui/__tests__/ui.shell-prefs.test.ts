// RR43 域测试：悬浮外壳偏好（形态 / 迷你圆指标 / 贴边边 / 位置）。
// 本地优先：只依赖最小 Storage 接口，测试用假存储，不碰网络、不碰真实 localStorage。
import { describe, expect, it } from "vitest";
import { DEFAULT_SHELL_PREFS, readShellPrefs, writeShellPrefs, type PrefsStorage } from "../shellBridge";

class FakeStorage implements PrefsStorage {
  private map = new Map<string, string>();
  fail = false;
  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.map.set(key, value);
  }
  getItem(key: string): string | null {
    if (this.fail) throw new Error("storage unavailable");
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.fail) throw new Error("storage unavailable");
    this.map.set(key, value);
  }
  dump(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}

describe("readShellPrefs", () => {
  it("空存储 → 默认值（迷你圆 + 配速 + 自由摆放）", () => {
    expect(readShellPrefs(new FakeStorage())).toEqual(DEFAULT_SHELL_PREFS);
    expect(DEFAULT_SHELL_PREFS.form).toBe("orb");
    expect(DEFAULT_SHELL_PREFS.metric).toBe("pace");
  });

  it("坏值/缺值一律回落默认，不让坏存储把悬浮窗拖垮", () => {
    const prefs = readShellPrefs(new FakeStorage({
      "rr.shell.form": "capsule",
      "rr.shell.metric": "whatever",
      "rr.shell.dockEdge": "diagonal",
      "rr.shell.x": "not-a-number",
      "rr.shell.y": "",
    }));
    expect(prefs.form).toBe("orb");
    expect(prefs.metric).toBe("pace");
    expect(prefs.dockEdge).toBeNull();
    expect(prefs.x).toBeNull();
    expect(prefs.y).toBeNull();
  });

  it("存储抛异常（隐私模式/配额）也不崩，返回默认", () => {
    const storage = new FakeStorage();
    storage.fail = true;
    expect(readShellPrefs(storage)).toEqual(DEFAULT_SHELL_PREFS);
  });

  it("storage 为 null（服务端降级）返回默认", () => {
    expect(readShellPrefs(null)).toEqual(DEFAULT_SHELL_PREFS);
  });
});

describe("writeShellPrefs（只写传入字段）", () => {
  it("写入后可原样读回", () => {
    const storage = new FakeStorage();
    writeShellPrefs(storage, { form: "bar", metric: "risk", dockEdge: "right", x: 120, y: 340 });
    expect(readShellPrefs(storage)).toEqual({
      form: "bar", metric: "risk", dockEdge: "right", x: 120, y: 340,
    });
  });

  it("局部更新不覆盖其它字段", () => {
    const storage = new FakeStorage();
    writeShellPrefs(storage, { form: "bar", x: 10, y: 20 });
    writeShellPrefs(storage, { metric: "remaining" });
    const prefs = readShellPrefs(storage);
    expect(prefs.form).toBe("bar");
    expect(prefs.x).toBe(10);
    expect(prefs.metric).toBe("remaining");
  });

  it("显式写 null 表示「清除」（如取消贴边）", () => {
    const storage = new FakeStorage();
    writeShellPrefs(storage, { dockEdge: "left" });
    expect(readShellPrefs(storage).dockEdge).toBe("left");
    writeShellPrefs(storage, { dockEdge: null });
    expect(readShellPrefs(storage).dockEdge).toBeNull();
  });
});
