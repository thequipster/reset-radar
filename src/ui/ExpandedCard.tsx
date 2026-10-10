// 展开卡（RR09）：三块面板——风险雷达 / 今日建议 / 用卡规划。
// UI 零业务规则（ARCHITECTURE §2）：本组件只做 vm 字段的排版与文案映射，不计算任何数字。
import type { DashboardViewModel } from "./adapters";
import type { ResetCardDecision, RiskFactor } from "../lib";

/** 用卡决策的展示文案（机器键→中文，rc:39-44 决策语义的 UI 翻译，非业务判断）。 */
const DECISION_LABELS: Record<ResetCardDecision, string> = {
  "no-credits": "无可用重置卡",
  "hold-until-depleted": "额度尚多 · 暂缓用卡",
  "hold-until-natural-reset": "撑得到自然重置 · 不必烧卡",
  "use-today": "建议今天用卡",
  "wait-for-best-day": "等待最佳用卡日",
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

/** 可解释因子行（D006：UI 必须按 id/label/delta/note 渲染，不许只给总分）。 */
function FactorRows({ factors }: { factors: RiskFactor[] }) {
  if (factors.length === 0) return <div style={{ color: "#9aa3b2", fontSize: 12 }}>无因子</div>;
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {factors.map((factor) => (
        <div
          key={factor.id}
          style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" }}
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
            {factor.delta.toFixed(1)}
          </span>
          <span style={{ color: "#e8eaf0" }}>{factor.label}</span>
          <span style={{ color: "#9aa3b2", flex: 1 }}>{factor.note}</span>
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

export default function ExpandedCard({
  vm,
  onCollapse,
}: {
  vm: DashboardViewModel;
  onCollapse: () => void;
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
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>
          {vm.displayName} · 重置雷达
        </span>
        {vm.plan != null && (
          <span style={{ fontSize: 11, color: "#9aa3b2" }}>{vm.plan}</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#9aa3b2" }}>
          数据时刻 {vm.observedAt.slice(11, 16)}（北京+8）
        </span>
        <button onClick={onCollapse} style={{ fontSize: 12, cursor: "pointer" }}>
          收起
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
        <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {vm.risk == null ? "—" : `${vm.risk.score.toFixed(1)}%`}
          </span>
          <Metric label="48h 碰撞概率" value={card == null ? "—" : `${card.forcedReset48hPercent.toFixed(1)}%`} />
        </div>
        <FactorRows factors={vm.risk?.factors ?? []} />
      </div>

      {/* 面板二：今日建议 */}
      <div style={sectionStyle}>
        <div style={titleStyle}>② 今日建议用量（周额度百分点）</div>
        {vm.dailyPlan == null ? (
          <div style={{ fontSize: 12, color: "#9aa3b2" }}>周窗数据缺失，暂无建议</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 18, marginBottom: 6 }}>
              <span style={{ fontSize: 30, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                +{vm.dailyPlan.suggested.toFixed(1)}
              </span>
              <Metric label="软上限" value={`${vm.dailyPlan.cap.toFixed(1)}`} />
              <Metric label="均匀配速" value={`${vm.dailyPlan.uniformPace.toFixed(1)}`} />
              <Metric label="风险前拉" value={`${vm.dailyPlan.riskBoost.toFixed(1)}`} />
              <Metric
                label="短窗剩余"
                value={vm.shortRemainingPercent == null ? "—" : `${Math.round(vm.shortRemainingPercent)}%`}
              />
            </div>
            <FactorRows factors={vm.dailyPlan.factors} />
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
            <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>
                {DECISION_LABELS[card.decision]}
              </span>
              <Metric label="今日期望收益" value={`+${card.expectedGainTodayPercent.toFixed(1)}%`} />
              <Metric label="最佳日收益" value={`+${card.expectedGainBestPercent.toFixed(1)}%`} />
              <Metric label="最佳日" value={card.bestDayLocalDate} />
              <Metric label="24h 碰撞" value={`${card.forcedReset24hPercent.toFixed(1)}%`} />
              <Metric label="自然重置" value={`${card.daysUntilNaturalReset.toFixed(1)}天`} />
            </div>
            <div style={{ fontSize: 11, color: "#9aa3b2" }}>
              重置卡 {card.credits} 张 · 日需 {card.dailyNeedPercent.toFixed(1)}%/天 ·
              策略 {card.policyVersion} · 理由链 {card.reasons.join(" › ")}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
