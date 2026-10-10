import { APP_IDENTIFIER, APP_NAME } from "./lib";

// UI 层零业务规则（ARCHITECTURE §2）：本组件只展示核心层常量，数字/建议一律来自 src/lib。
export default function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>{APP_NAME} · 重置雷达</h1>
      <p>脚手架已就绪——风险模型 / 每日配速 / 用卡规划将在此展开（RR04 起）。</p>
      <p style={{ color: "#888", fontSize: 12 }}>{APP_IDENTIFIER}</p>
    </main>
  );
}
