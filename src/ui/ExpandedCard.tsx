// 展开卡（RR09）：三块面板——风险雷达 / 今日建议 / 用卡规划。
// UI 零业务规则（ARCHITECTURE §2）：本组件只做 vm 字段的排版与文案映射，不计算任何数字。
// RR21：窄窗自适应（RR14 遗产①）——标题/指标行可换行、收起常驻可见、× 关闭悬浮窗
// （skipTaskbar 下唯一常规退出入口）、理由链任意字符断行，消除 460 宽横滚与竖排单字。
import type { DashboardViewModel } from "./adapters";
import type { FactorStep, ResetCardDecisionKind } from "../lib";

/** 用卡决策的展示文案（机器键→中文，rc:39-44 决策语义的 UI 翻译，非业务判断）。 */
const DECISION_LABELS: Record<ResetCardDecisionKind, string> = {
  not_applicable: "当前不适用",
  hold: "暂缓用卡",
  use_today: "建议今天用卡",
  wait: "等待更优时机",
  uncertain: "需求未知 · 结论不稳",
};

const sectionStyle: React.CSSProperties = {
  background: "#1e222b",
  border: "1px solid #3a3f4a",
  borderRadius: 12,
  padding: "10px 14px",
};

const titleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#9aa3b2",
  letterSpacing: 1,
  margin: "2px 0 6px",
};

/** 指标行公共排版：窄窗换行（RR21 自适应）。 */
const metricsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  rowGap: 8,
};

/** 可解释因子行（D006：UI 必须按 id/label/delta/note 渲染，不许只给总分）。 */
function FactorRows({ factors }: { factors: readonly FactorStep[] }) {
  if (factors.length === 0) return <div style={{ color: "#9aa3b2", fontSize: 12 }}>无因子</div>;
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {factors.map((factor) => (
        <div
          key={factor.id}
          style={{ display: "flex", flexWrap: "wrap", rowGap: 2, fontSize: 12, alignItems: "baseline" }}
        >
          <span
            style={{
              minWidth: 48,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
              color: factor.delta >= 0 ? "#ff9800" : "#4caf50",
            }}
          >
            {factor.delta >= 0 ? "+" : ""}
            {(factor.delta * 100).toFixed(1)}
          </span>
          <span style={{ color: "#e8eaf0", margin: "0 6px 0 8px" }}>{factor.label}</span>
          <span style={{ color: "#9aa3b2", flex: "1 1 150px", minWidth: 0, overflowWrap: "anywhere" }}>
            {factor.note}
          </span>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 86 }}>
      <span style={{ fontSize: 11, color: "#9aa3b2" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

/** 标题栏按钮（收起 / ×）共用样式。 */
const headerButtonStyle: React.CSSProperties = {
  fontSize: 12,
  cursor: "pointer",
  border: "1px solid #3a3f4a",
  borderRadius: 8,
  background: "#262b36",
  color: "#e8eaf0",
  padding: "3px 10px",
};

export default function ExpandedCard({
  vm,
  onCollapse,
  onClose,
}: {
  vm: DashboardViewModel;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const card = vm.cardPlan;
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        fontFamily: "system-ui, sans-serif",
        color: "#e8eaf0",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", rowGap: 6, alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          {vm.displayName} · 重置雷达
        </span>
        {vm.plan != null && (
          <span style={{ fontSize: 11, color: "#9aa3b2" }}>{vm.plan}</span>
        )}
        <span style={{ flex: "1 1 60px" }} />
        <span style={{ fontSize: 11, color: "#9aa3b2" }}>
          数据时刻 {vm.observedAt.slice(11, 16)}（北京+8）
        </span>
        <button onClick={onCollapse} style={headerButtonStyle}>
          收起
        </button>
        <button onClick={onClose} style={headerButtonStyle} title="关闭悬浮窗">
          ×
        </button>
      </div>

      {vm.status !== "ok" && (
        <div style={{ ...sectionStyle, borderColor: "#f44336" }}>
          <div style={titleStyle}>采集状态</div>
          <div style={{ fontSize: 13 }}>
            {vm.status}
            {vm.message != null ? ` · ${vm.message}` : ""}
          </div>
        </div>
      )}

      {/* 面板一：风险雷达 */}
      <div style={sectionStyle}>
        <div style={titleStyle}>① 风险雷达 · 未来 24h 强制重置概率</div>
        <div style={{ ...metricsRowStyle, gap: 18, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {vm.riskPercent.toFixed(1)}%
          </span>
          <Metric label="48h 碰撞概率" value={card == null ? "—" : `${((vm.risk.survivalCurve.find((point) => point.hours === 48)?.cumulativeProbability ?? 0) * 100).toFixed(1)}%`} />
        </div>
        <FactorRows factors={vm.risk.factorSteps} />
      </div>

      {/* 面板二：今日建议 */}
      <div style={sectionStyle}>
        <div style={titleStyle}>② 今日建议用量（周额度百分点）</div>
        {vm.dailyPlan == null ? (
          <div style={{ fontSize: 12, color: "#9aa3b2" }}>周窗数据缺失，暂无建议</div>
        ) : (
          <>
            <div style={{ ...metricsRowStyle, gap: 18, marginBottom: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {vm.dailyPlan.todaySuggested == null ? "需求未知" : `+${vm.dailyPlan.todaySuggested.toFixed(1)}`}
              </span>
              <Metric label="需求质量" value={vm.dailyPlan.demandQuality} />
              <Metric label="截止前预计未用" value={`${vm.dailyPlan.expectedUnspentBeforeDeadline.toFixed(1)}`} />
              <Metric
                label="短窗剩余"
                value={vm.shortRemainingPercent == null ? "—" : `${Math.round(vm.shortRemainingPercent)}%`}
              />
            </div>
            <div>{vm.dailyPlan.explanations.map((line) => <div key={line}>{line}</div>)}</div>
          </>
        )}
      </div>

      {/* 面板三：用卡规划 */}
      <div style={sectionStyle}>
        <div style={titleStyle}>③ 用卡规划</div>
        {card == null ? (
          <div style={{ fontSize: 12, color: "#9aa3b2" }}>周窗数据缺失，暂无规划</div>
        ) : (
          <>
            <div style={{ ...metricsRowStyle, gap: 18, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                {DECISION_LABELS[card.decision]}
              </span>
              <Metric label="建议时刻" value={card.recommendedAt == null ? "—" : new Date(card.recommendedAt).toLocaleString("zh-CN")} />
              <Metric label="增量用量" value={`${card.incrementalUsage.toFixed(1)} pp`} />
              <Metric label="候选时刻数" value={String(card.candidateResults.length)} />
            </div>
            <div style={{ fontSize: 11, color: "#9aa3b2", overflowWrap: "anywhere" }}>
              {card.explanations.join(" › ")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
