// 应用根（RR09）：胶囊态 / 展开卡两态切换。UI 层零业务规则（ARCHITECTURE §2）——
// 组件只排版 adapters 视图模型，数字与建议一律产自 src/lib 纯核心。
// RR14：起始态由 hash 决定（#expanded 起始展开，截图/验收可复现入口）。
// RR21：真·悬浮窗——两态窗口尺寸由 widgetWindow 契约驱动；透明窗口下胶囊态只剩
// 悬浮条本体、展开态容器自带面板底色；data-tauri-drag-region 整窗可拖。
import { useEffect, useState } from "react";
import { buildDashboard } from "./ui/adapters";
import { initialExpanded } from "./ui/appState";
import Capsule from "./ui/Capsule";
import ExpandedCard from "./ui/ExpandedCard";
import { RESET_HISTORY_ANNOUNCED_AT } from "./ui/history";
import { usePredictionLog } from "./ui/usePredictionLog";
import { useSnapshots } from "./ui/useSnapshots";
import { applyWidgetSize, closeWidget } from "./ui/widgetWindow";

/** 悬浮条样式基元：等待页与胶囊同设计语言（RR21 等待页样式化）。 */
const pillStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "14px 22px",
  borderRadius: 999,
  border: "1px solid #3a3f4a",
  background: "#1e222b",
  color: "#e8eaf0",
  fontFamily: "system-ui, sans-serif",
  fontSize: 14,
  boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
};

export default function App() {
  const [expanded, setExpanded] = useState(() => initialExpanded(window.location.hash));
  const { snapshots, live } = useSnapshots();

  useEffect(() => {
    applyWidgetSize(expanded).catch(() => {
      /* 窗口尺寸调整失败不阻塞渲染（浏览器降级本就 no-op） */
    });
  }, [expanded]);

  const codex = snapshots.find((item) => item.provider === "codex") ?? snapshots[0];
  const vm = codex != null ? buildDashboard(codex, RESET_HISTORY_ANNOUNCED_AT) : null;

  const predictionLog = usePredictionLog(vm?.prediction ?? null, live, vm?.updatedAt ?? "");

  if (vm == null) {
    return (
      <main
        data-tauri-drag-region
        data-prediction-log-state={predictionLog.status}
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          padding: 8,
          boxSizing: "border-box",
        }}
      >
        <div style={pillStyle}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4caf50",
              display: "inline-block",
            }}
          />
          正在采集 CODEX 快照…
          {!live && <span style={{ fontSize: 11, color: "#9aa3b2" }}>浏览器预览</span>}
        </div>
      </main>
    );
  }

  return (
    <main
      data-tauri-drag-region
      data-prediction-log-state={predictionLog.status}
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        background: expanded ? "#14171d" : "transparent",
        borderRadius: expanded ? 12 : 0,
        padding: expanded ? 12 : 6,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: expanded ? "stretch" : "flex-start",
        overflow: expanded ? "hidden auto" : "hidden",
      }}
    >
      {expanded ? (
        <ExpandedCard
          vm={vm}
          onCollapse={() => setExpanded(false)}
          onClose={() => {
            void closeWidget();
          }}
        />
      ) : (
        <Capsule vm={vm} onExpand={() => setExpanded(true)} />
      )}
    </main>
  );
}
