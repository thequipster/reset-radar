// 悬浮胶囊态（RR09）：只展示，不计算——所有数字来自 adapters 视图模型（源头 src/lib）。
import type { DashboardViewModel } from "./adapters";

/** 风险配色（纯展示层映射：分数→颜色，不产出任何业务数字）。 */
function riskColor(score: number | null): string {
  if (score == null) return "#9e9e9e";
  if (score < 30) return "#4caf50";
  if (score < 60) return "#ff9800";
  return "#f44336";
}

export default function Capsule({
  vm,
  onExpand,
}: {
  vm: DashboardViewModel;
  onExpand: () => void;
}) {
  const riskScore = vm.riskPercent ?? null;
  return (
    <button
      onClick={onExpand}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 22px",
        borderRadius: 999,
        border: "1px solid #3a3f4a",
        background: "#1e222b",
        color: "#e8eaf0",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        cursor: "pointer",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
      }}
      title="点击展开详情"
    >
      <span style={{ fontWeight: 700, letterSpacing: 1 }}>{vm.displayName}</span>
      <span style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {vm.remainingPercent == null ? "—%" : `${Math.round(vm.remainingPercent)}%`}
      </span>
      <span style={{ fontSize: 12, color: "#9aa3b2" }}>周额度剩余</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          borderRadius: 999,
          background: "#262b36",
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: riskColor(riskScore),
            display: "inline-block",
          }}
        />
        重置风险 {riskScore == null ? "—" : `${riskScore.toFixed(1)}%`}
      </span>
      {vm.resetCredits != null && (
        <span style={{ fontSize: 12, color: "#9aa3b2" }}>卡×{vm.resetCredits}</span>
      )}
    </button>
  );
}
