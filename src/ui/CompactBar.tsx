// RR27 悬浮条（图1）：拖动把手 / 品牌雷达+状态点 / 周余 / 24h 风险 / 卡数 / 展开钮。
// 02-spec §3.2 线框即此六件——采集状态收敛为品牌旁状态点+可访问文本（不占文本列），
// 圆环留给预览/展开态。窄空间靠 min-width:0+ellipsis 防叠字（RR27 截图复审教训）。
// UI 零业务规则（ARCHITECTURE §2）：数字一律来自 VM；展开钮 ≥44×44 命中。
import { useMemo } from "react";
import type { RefObject } from "react";
import type { DashboardViewModel } from "./adapters";
import { creditsLabel, percent1, percentWhole } from "./format";
import { CardStackIcon, ChevronDown, GripDots, PulseIcon, RadarLogo } from "./icons";
import styles from "./CompactBar.module.css";

export interface CompactBarProps {
  vm: DashboardViewModel | null;
  phase: "initializing" | "ready" | "empty" | "read-error";
  demo: boolean;
  onExpand: () => void;
  /** 展开钮引用（收起/Escape 后焦点回到展开入口，02-spec §5）。 */
  expandRef?: RefObject<HTMLButtonElement | null>;
}

type CollectState = "ok" | "warn" | "error" | "loading";

/** 采集状态可访问文本（纯展示映射；error/stale 语义来自 phase 与 VM 状态字段）。 */
function collectStateLabel(state: CollectState): string {
  if (state === "ok") return "采集正常";
  if (state === "error") return "采集失败";
  if (state === "warn") return "数据过期";
  return "读取中";
}

export default function CompactBar({ vm, phase, demo, onExpand, expandRef }: CompactBarProps) {
  const loading = vm == null || phase === "initializing";
  const collectState = useMemo<CollectState>(() => {
    if (loading || phase === "empty") return "loading";
    if (phase === "read-error" || (vm.status !== "ok" && vm.status !== "stale") || vm.remainingPercent == null) return "error";
    if (vm.status === "stale" || (vm.resetStatus != null && vm.resetStatus.state === "stale")) return "warn";
    return "ok";
  }, [loading, phase, vm]);

  const announcement = vm?.resetStatus?.announcement ?? null;
  const dotClass =
    collectState === "ok" ? styles.dotOk : collectState === "error" ? styles.dotError : styles.dotWarn;
  const riskText = loading ? "—" : percent1(vm.riskPercent);

  return (
    <div className={styles.shell} role="group" aria-label="reset-radar 悬浮条" onClick={onExpand}>
      <span className={styles.dragHandle} data-tauri-drag-region title="拖动悬浮条">
        <GripDots size={18} />
      </span>

      <span className={styles.brand}>
        <RadarLogo size={30} className={styles.logo} />
        <span className={styles.brandText}>
          <span className={styles.brandName}>
            {loading ? <span className={styles.skeleton}>CODEX</span> : vm.displayName}
            {!loading && (
              <span className={`${styles.dot} ${dotClass}`} role="img" aria-label={collectStateLabel(collectState)} />
            )}
            {!loading && announcement != null && (
              <span className={`${styles.dot} ${styles.dotWarn}`} role="img" aria-label="有重置公告" title="有重置公告" />
            )}
          </span>
          <span className={styles.brandSub}>
            {demo ? "reset-radar · 演示" : `reset-radar${vm?.plan != null ? ` · ${vm.plan}` : ""}`}
          </span>
        </span>
      </span>

      <span className={styles.metric} title="周额度剩余">
        <span className={styles.metricText}>
          <span className={styles.metricValue}>{loading ? "—" : percentWhole(vm.remainingPercent)}</span>
          <span className={styles.metricLabel}>周余</span>
        </span>
      </span>

      <span
        className={styles.metric}
        title="重置风险：未来24小时强制重置模型估计"
        aria-label={`重置风险（未来24小时强制重置模型估计）：${riskText === "—" ? "未知" : riskText}`}
      >
        <span className={styles.riskIconBox} aria-hidden={true}>
          <PulseIcon size={18} />
        </span>
        <span className={styles.metricText}>
          <span className={styles.metricValue}>{riskText}</span>
          <span className={`${styles.metricLabel} ${styles.metricLabelRisk}`}>风险</span>
        </span>
      </span>

      <span className={styles.metric} title="可用重置卡数量">
        <span className={styles.cardIconBox} aria-hidden={true}>
          <CardStackIcon size={16} />
        </span>
        <span className={styles.metricText}>
          <span className={styles.metricValue}>{loading ? "—" : creditsLabel(vm.resetCredits)}</span>
          <span className={styles.metricLabel}>重置卡</span>
        </span>
      </span>

      <span className={styles.spacer} />

      <button
        type="button"
        ref={expandRef}
        className={styles.expandButton}
        onClick={(event) => { event.stopPropagation(); onExpand(); }}
        aria-label="展开完整面板"
        title="展开（Enter/Space）"
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}
