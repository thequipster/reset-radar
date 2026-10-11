// RR43 迷你圆形态：比胶囊更小的圆形悬浮，只显示一个最关键的数字
// （默认今日建议配速；托盘菜单 / 右键可切到 24h 重置风险、周额度剩余）。
// 数字一律来自 adapters 视图模型（ARCHITECTURE §2），本组件只做展示与拖拽/贴边交互。
import { useRef } from "react";
import type { DashboardViewModel } from "./adapters";
import { DOCK_VISIBLE, orbShift, orbShiftSign, type DockEdge } from "./dockGeometry";
import { orbReadout, type OrbMetric } from "./orbMetric";
import { ORB_DIAMETER, ORB_SIZE } from "./widgetWindow";
import styles from "./Orb.module.css";

/** 圆环几何：直径 56、描边 4 → 半径 26。 */
const STROKE = 4;
const RADIUS = (ORB_DIAMETER - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 小于这个位移量视为点击而非拖拽（避免手抖把“展开”变成“挪一下”）。 */
const DRAG_THRESHOLD = 3;

export interface OrbProps {
  vm: DashboardViewModel | null;
  metric: OrbMetric;
  /** 当前贴边的边；null = 自由摆放。 */
  dockEdge: DockEdge | null;
  /** 贴边后是否被鼠标唤出（整圆滑回屏幕内）。 */
  popped: boolean;
  onExpand: () => void;
  /** 右键轮换指标（与托盘菜单同一组选项，两条入口同语义）。 */
  onCycleMetric: () => void;
  /** 拖拽中：相对起点的位移增量（逻辑像素）。 */
  onDragMove: (dx: number, dy: number) => void;
  /** 拖拽结束：moved=false 表示没动过（按点击处理）。 */
  onDragEnd: (dx: number, dy: number, moved: boolean) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  /** 收起后焦点交回圆（02-spec §5：可见焦点不被 hover 替代）。 */
  orbRef?: React.RefObject<HTMLButtonElement | null>;
}

export default function Orb({
  vm,
  metric,
  dockEdge,
  popped,
  onExpand,
  onCycleMetric,
  onDragMove,
  onDragEnd,
  onPointerEnter,
  onPointerLeave,
  orbRef,
}: OrbProps) {
  const readout = orbReadout(vm, metric);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const docked = dockEdge != null && !popped;

  // 贴边时把圆推向可见一侧，使圆心落在可见带中线 → 屏幕上只剩一个半圆。
  const shift = docked && dockEdge != null ? orbShift(ORB_SIZE.width, DOCK_VISIBLE) : 0;
  const sign = dockEdge != null ? orbShiftSign(dockEdge) : { x: 0, y: 0 };
  const shiftTransform =
    shift === 0 ? undefined : `translate3d(${shift * sign.x}px, ${shift * sign.y}px, 0)`;

  const bandClass =
    readout.band === "low"
      ? styles.bandLow
      : readout.band === "mid"
        ? styles.bandMid
        : readout.band === "high"
          ? styles.bandHigh
          : styles.bandUnknown;

  const dash = readout.percent == null ? 0 : (readout.percent / 100) * CIRCUMFERENCE;
  const fontSize = readout.value.length <= 2 ? 20 : readout.value.length === 3 ? 17 : 14;

  return (
    <div className={styles.wrap}>
      <div className={styles.shift} style={{ transform: shiftTransform }}>
        <button
          ref={orbRef}
          type="button"
          className={`${styles.orb} ${bandClass}`}
          data-orb-metric={metric}
          data-orb-docked={docked ? "true" : "false"}
          data-orb-popped={popped ? "true" : "false"}
          aria-label={readout.title}
          title={readout.title}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            start.current = { x: event.screenX, y: event.screenY };
            moved.current = false;
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const origin = start.current;
            if (origin == null) return;
            const dx = event.screenX - origin.x;
            const dy = event.screenY - origin.y;
            if (!moved.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
            moved.current = true;
            onDragMove(dx, dy);
          }}
          onPointerUp={(event) => {
            const origin = start.current;
            if (origin == null) return;
            start.current = null;
            const dx = event.screenX - origin.x;
            const dy = event.screenY - origin.y;
            if (moved.current) onDragEnd(dx, dy, true);
            else onExpand();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onExpand();
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onCycleMetric();
          }}
        >
          <svg
            width={ORB_DIAMETER}
            height={ORB_DIAMETER}
            viewBox={`0 0 ${ORB_DIAMETER} ${ORB_DIAMETER}`}
            aria-hidden="true"
            focusable="false"
          >
            <circle
              className={styles.track}
              cx={ORB_DIAMETER / 2}
              cy={ORB_DIAMETER / 2}
              r={RADIUS}
              strokeWidth={STROKE}
              fill="none"
            />
            <circle
              className={styles.progress}
              cx={ORB_DIAMETER / 2}
              cy={ORB_DIAMETER / 2}
              r={RADIUS}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${ORB_DIAMETER / 2} ${ORB_DIAMETER / 2})`}
            />
          </svg>
          <span className={styles.value} style={{ fontSize }}>
            {readout.value}
            {readout.unit !== "" && <span className={styles.unit}>{readout.unit}</span>}
          </span>
        </button>
      </div>
    </div>
  );
}
