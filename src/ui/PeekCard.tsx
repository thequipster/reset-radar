// RR27 迷你预览（图2）：不点击即可读今日建议；公告有效时首行换公告计划（02-spec §3.3）。
// stale 时保留数字并标注「上次观测」，不为旧快照显示实时动词。
import type { DashboardViewModel } from "./adapters";
import type { ResetCardDecision } from "../lib";
import { beijingShort, percent1 } from "./format";
import { BarChartIcon, ChevronRight, ClockIcon, SpeakerIcon } from "./icons";
import styles from "./PeekCard.module.css";

export interface PeekCardProps {
  vm: DashboardViewModel | null;
  phase: "initializing" | "ready" | "empty" | "read-error";
  demo: boolean;
  onOpen: () => void;
}

export default function PeekCard({ vm, phase, demo, onOpen }: PeekCardProps) {
  if (vm == null || phase === "initializing") {
    return (
      <div className={styles.shell} role="status" aria-label="读取中">
        <div className={styles.row}>
          <span className={styles.rowLabel}>正在获取 Codex 使用数据…</span>
          {demo && <span className={styles.demoBadge}>演示</span>}
        </div>
      </div>
    );
  }

  const announcement = vm.resetStatus?.announcement ?? null;
  const plannedAt = announcement != null ? beijingShort(announcement.announcement.scheduledFor) : null;
  const stale = vm.resetStatus != null && vm.resetStatus.state === "stale";
  const observed = beijingShort(vm.observedAt);

  return (
    <div className={styles.shell}>
      {announcement != null && plannedAt != null ? (
        <div className={styles.row}>
          <SpeakerIcon size={16} className={styles.observedIcon} />
          <span className={styles.rowLabel}>公告计划</span>
          <span className={`${styles.rowValue} ${styles.rowValueWarn}`}>
            北京时间 {plannedAt} 重置{announcement.state === "awaiting-confirmation" ? "（待核实）" : ""}
          </span>
        </div>
      ) : (
        <div className={styles.row}>
          <span className={styles.rowLabel}>今日建议追加</span>
          <span className={`${styles.rowValue} ${styles.rowValueAccent}`}>
            {vm.dailyPlan == null ? "暂无建议" : `+${vm.dailyPlan.suggested.toFixed(1)} 个周额度百分点`}
          </span>
        </div>
      )}

      <div className={styles.row}>
        <span className={styles.rowLabel}>用卡建议</span>
        <span className={styles.rowValue}>
          {vm.cardPlan == null
            ? vm.resetCredits == null
              ? "卡数未知，暂无法确认"
              : "暂无规划"
            : DECISION_SHORT[vm.cardPlan.decision]}
        </span>
      </div>

      <div className={styles.footer}>
        <span className={styles.observed}>
          <ClockIcon size={13} className={styles.observedIcon} />
          {stale ? (
            <span>上次观测 {observed ?? "—"} · 数据过期</span>
          ) : (
            <span>额度观测 {observed ?? "—"} 北京时间</span>
          )}
          风险 {vm.risk == null ? "—" : percent1(vm.risk.score)}
        </span>
        {demo && <span className={styles.demoBadge}>演示数据</span>}
        <button type="button" className={styles.openButton} onClick={onOpen}>
          <BarChartIcon size={14} />
          查看完整规划
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

/** 用卡决策短语（机器键→中文短语，rc:39-44 决策语义的 UI 翻译，非业务判断）。 */
const DECISION_SHORT: Record<ResetCardDecision, string> = {
  "no-credits": "无可用重置卡",
  "hold-until-depleted": "额度尚多 · 暂缓用卡",
  "hold-until-natural-reset": "撑得到自然重置 · 不必烧卡",
  "hold-until-scheduled-reset": "按公告计划暂缓 · 待核实",
  "use-today": "建议今天用卡",
  "wait-for-best-day": "等待最佳用卡日",
};
