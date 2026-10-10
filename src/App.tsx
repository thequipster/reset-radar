// 应用根（RR09）：胶囊态 / 展开卡两态切换。UI 层零业务规则（ARCHITECTURE §2）——
// 组件只排版 adapters 视图模型，数字与建议一律产自 src/lib 纯核心。
import { useState } from "react";
import { buildDashboard } from "./ui/adapters";
import Capsule from "./ui/Capsule";
import ExpandedCard from "./ui/ExpandedCard";
import { RESET_HISTORY_ANNOUNCED_AT } from "./ui/history";
import { useSnapshots } from "./ui/useSnapshots";

export default function App() {
  const [expanded, setExpanded] = useState(false);
  const { snapshots, live } = useSnapshots();

  const codex = snapshots.find((item) => item.provider === "codex") ?? snapshots[0];
  const vm = codex != null ? buildDashboard(codex, RESET_HISTORY_ANNOUNCED_AT) : null;

  if (vm == null) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, color: "#e8eaf0" }}>
        <p>正在采集 CODEX 快照…（首次启动约需数秒）</p>
        {!live && <p style={{ color: "#9aa3b2", fontSize: 12 }}>浏览器预览：等待 Tauri 环境</p>}
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#14171d",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: expanded ? "stretch" : "flex-start",
      }}
    >
      {expanded ? (
        <ExpandedCard vm={vm} onCollapse={() => setExpanded(false)} />
      ) : (
        <Capsule vm={vm} onExpand={() => setExpanded(true)} />
      )}
      {!live && (
        <span style={{ color: "#9aa3b2", fontSize: 11 }}>demo 数据（浏览器降级，非实采）</span>
      )}
    </main>
  );
}
