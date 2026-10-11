// RR27：数据可视化 SVG（圆环进度 / 候选日柱状图）。形状语言照识图规格：环粗≈直径1/10、
// 圆头端点、12 点方向顺时针；柱图蓝色渐变、最佳日绿色+皇冠。数值与颜色语义分开：
// 组件只接收 0-100 数值与 token 类名，不判断业务状态。
import type { ReactNode } from "react";
import { CrownIcon } from "./icons";

/** 圆环进度：value=null 只画轨道（加载/缺数），环心由 children 提供。 */
export function ProgressRing({
  value,
  size = 64,
  thickness,
  className,
  trackClassName,
  children,
  label,
}: {
  value: number | null;
  size?: number;
  thickness?: number;
  className?: string;
  trackClassName?: string;
  children?: ReactNode;
  label: string;
}) {
  const stroke = thickness ?? Math.max(4, Math.round(size / 10));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value == null || !Number.isFinite(value) ? 0 : Math.min(100, Math.max(0, value));
  const dash = (clamped / 100) * circumference;
  return (
    <div
      className={className}
      role="img"
      aria-label={`${label}：${value == null || !Number.isFinite(value) ? "未知" : `${Math.round(value)}%`}`}
      style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden={true}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={stroke}
          className={trackClassName}
        />
        {value != null && Number.isFinite(value) && (
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="ring-value"
          />
        )}
      </svg>
      <span
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {children}
      </span>
    </div>
  );
}

export interface OutlookBar {
  dateKey: string; // 北京日历键（YYYY-MM-DD）
  axisLabel: string; // 展示标签（周X MM/DD）
  gainPercent: number; // 期望收益（周额度百分点）
  best: boolean;
}

/** 候选日收益柱状图：以最大 gain 为比例基准画柱长（不创造未来轨迹，02-spec §3.5）。 */
export function OutlookChart({ bars, unitLabel }: { bars: OutlookBar[]; unitLabel: string }) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map((b) => b.gainPercent), 0.1);
  return (
    <div className="outlook-chart" role="table" aria-label={unitLabel}>
      {bars.map((bar) => (
        <div key={bar.dateKey} className="outlook-col" role="row">
          <span className={`outlook-value${bar.best ? " best" : ""}`}>
            {bar.best && <CrownIcon size={11} />}
            +{bar.gainPercent.toFixed(1)}
          </span>
          <div className="outlook-bar-track" role="cell">
            <span
              className={`outlook-bar${bar.best ? " best" : ""}`}
              style={{ height: `${Math.max(4, (bar.gainPercent / max) * 100)}%` }}
            />
          </div>
          <span className={`outlook-axis${bar.best ? " best" : ""}`}>{bar.axisLabel}</span>
        </div>
      ))}
    </div>
  );
}
