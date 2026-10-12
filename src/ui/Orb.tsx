// RR43 迷你圆形态：比胶囊更小的圆形悬浮，只显示一个最关键的数字
// （默认今日建议配速；托盘菜单 / 右键可切到 24h 重置风险、周额度剩余）。
// 数字一律来自 adapters 视图模型（ARCHITECTURE §2），本组件只做展示与拖拽/贴边交互。
import { useCallback, useRef } from "react";
import type { DashboardViewModel } from "./adapters";
import type { DockEdge } from "./dockGeometry";
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
  const latest = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const pointerId = useRef<number | null>(null);
  const docked = dockEdge != null && !popped;
  const finishDragRef = useRef<(event: { pointerId: number; screenX: number; screenY: number; type?: string }, canceled?: boolean) => void>(() => {});
  const onWindowUp = useCallback((event: PointerEvent) => finishDragRef.current(event), []);
  const onWindowCancel = useCallback((event: PointerEvent) => finishDragRef.current(event, true), []);
  const onWindowBlur = useCallback(() => {
    if (start.current == null || pointerId.current == null) return;
    finishDragRef.current({
      pointerId: pointerId.current,
      screenX: latest.current?.x ?? start.current.x,
      screenY: latest.current?.y ?? start.current.y,
      type: "blur",
    }, true);
  }, []);
  const finishDrag = (event: { pointerId: number; screenX: number; screenY: number; type?: string }, canceled = false) => {
    if (start.current == null || pointerId.current !== event.pointerId) return;
    const origin = start.current;
    start.current = null;
    pointerId.current = null;
    window.removeEventListener("pointerup", onWindowUp);
    window.removeEventListener("pointercancel", onWindowCancel);
    window.removeEventListener("blur", onWindowBlur);
    const point = canceled
      ? latest.current ?? { x: event.screenX, y: event.screenY }
      : { x: event.screenX, y: event.screenY };
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    if (canceled) {
      if (moved.current) onDragEnd(dx, dy, true);
    } else if (moved.current) onDragEnd(dx, dy, true);
    else onExpand();
  };
  finishDragRef.current = finishDrag;

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
      <div className={styles.shift}>
        <button
          ref={orbRef}
          type="button"
          className={`${styles.orb} ${bandClass}`}
          data-orb-metric={metric}
          data-orb-docked={docked ? "true" : "false"}
          data-orb-popped={popped ? "true" : "false"}
          aria-label={readout.title}
          title={readout.title}
          onPointerEnter={() => { if (start.current == null) onPointerEnter(); }}
          onPointerLeave={() => { if (start.current == null) onPointerLeave(); }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            start.current = { x: event.screenX, y: event.screenY };
            latest.current = { x: event.screenX, y: event.screenY };
            moved.current = false;
            pointerId.current = event.pointerId;
            window.addEventListener("pointerup", onWindowUp);
            window.addEventListener("pointercancel", onWindowCancel);
            window.addEventListener("blur", onWindowBlur);
            try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* window listeners retain release fallback */ }
          }}
          onPointerMove={(event) => {
            const origin = start.current;
            if (origin == null) return;
            const dx = event.screenX - origin.x;
            const dy = event.screenY - origin.y;
            latest.current = { x: event.screenX, y: event.screenY };
            if (!moved.current && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
            moved.current = true;
            onDragMove(dx, dy);
          }}
          onPointerUp={(event) => {
            finishDrag(event);
          }}
          onPointerCancel={(event) => finishDrag(event, true)}
          onLostPointerCapture={(event) => finishDrag(event, true)}
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
