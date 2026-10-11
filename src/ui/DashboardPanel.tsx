// RR27 展开面板（图3 主参考；浅色对应图4；状态六宫格图5）。信息顺序与全状态按 02-spec
// §1/§6：公告/异常 → 额度与今日建议 → 风险解释 → 用卡规划 → 数据来源与校准。
// UI 零业务规则（ARCHITECTURE §2）：全部数字来自 adapters VM；校准摘要只消费 RR28
// 只读契约。收起/关闭常驻顶栏，不在滚动区尾部。
import { useState } from "react";
import type { DashboardViewModel } from "./adapters";
import type { CalibrationSummaryView, ResetCardDecision, RiskFactor } from "../lib";
import { beijingFull, beijingShort, creditsLabel, deltaPct, daysLabel, percent1, percentWhole, weekdayDateLabel } from "./format";
import { buildCopySummary } from "./copySummary";
import { OutlookChart, ProgressRing, type OutlookBar } from "./viz";
import {
  AlertIcon, BarChartIcon, BulbIcon, CalendarIcon, CardStackIcon, CheckIcon, ChevronUp,
  CloseIcon, CopyIcon, DatabaseIcon, InfoIcon, MonitorIcon, MoonIcon, PulseIcon, RadarLogo,
  RefreshIcon, ShieldIcon, SlidersIcon, SparkleIcon, SpeakerIcon, SunIcon, GripDots,
} from "./icons";
import styles from "./DashboardPanel.module.css";

export interface DashboardPanelProps {
  vm: DashboardViewModel | null;
  phase: "initializing" | "ready" | "empty" | "read-error";
  readError: string | null;
  subscriptionError: boolean;
  refreshing: boolean;
  calibration: CalibrationSummaryView;
  demo: boolean;
  themePreference: "dark" | "light" | "system";
  /** 生效主题（?theme= 截图覆盖时与偏好不同；高亮跟随生效项）。 */
  activeTheme: "dark" | "light";
  onThemePreference: (pref: "dark" | "light" | "system") => void;
  onRefresh: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

/** 用卡决策文案（机器键→中文，rc:39-44 决策语义的 UI 翻译，非业务判断）。 */
const DECISION_LABELS: Record<ResetCardDecision, string> = {
  "no-credits": "无可用重置卡",
  "hold-until-depleted": "额度尚多 · 暂缓用卡",
  "hold-until-natural-reset": "撑得到自然重置 · 不必烧卡",
  "hold-until-scheduled-reset": "按公告计划暂缓 · 待核实执行",
  "use-today": "建议今天用卡",
  "wait-for-best-day": "等待最佳用卡日",
};

/** 风险分级标签（纯展示映射：分数→档位文案，不产出数字；30/60 与图5 档位一致）。 */
function riskBadge(score: number | null): { label: string; className: string } | null {
  if (score == null) return null;
  if (score < 30) return { label: "较低风险", className: styles.riskBadgeLow };
  if (score < 60) return { label: "中等风险", className: styles.riskBadgeMid };
  return { label: "较高风险", className: styles.riskBadgeHigh };
}

export default function DashboardPanel(props: DashboardPanelProps) {
  const { vm, phase, demo } = props;
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");
  const [showPacingDetail, setShowPacingDetail] = useState(false);
  const [showPlannerDetail, setShowPlannerDetail] = useState(false);

  const loading = vm == null || phase === "initializing";

  const copySummary = () => {
    if (vm == null) return;
    const text = buildCopySummary(vm, props.calibration, { live: !demo });
    const done = () => {
      setCopied("ok");
      window.setTimeout(() => setCopied("idle"), 1500); // 原位反馈 1.5s（02-spec §5）
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => setCopied("error"));
    } else {
      setCopied("error");
    }
  };

  // 高亮：覆盖态显示实际生效主题；正常态 system 时光跟随偏好不好猜，高亮偏好项。
  const activeForHighlight = props.activeTheme === "dark" ? "dark" : "light";
  const card = loading ? null : vm.cardPlan;
  const announcement = loading ? null : vm.resetStatus?.announcement ?? null;
  const resetStatusStale = !loading && vm.resetStatus != null && vm.resetStatus.state === "stale";
  const collectError = !loading && (phase === "read-error" || vm.status === "error");
  // 卡数未知时隐藏 no-credits 决策及收益比较（02-spec §6），其余照常。
  const hideNoCreditsDecision = !loading && vm.resetCredits == null;
  const showPlannerBlocks = card != null && !(hideNoCreditsDecision && card.decision === "no-credits");

  return (
    <div className={styles.shell} role="main" aria-label="reset-radar 展开面板">
      {/* ── 顶栏（常驻） ── */}
      <header className={styles.header}>
        <div className={styles.headerDrag} data-tauri-drag-region>
          <GripDots size={16} />
          <RadarLogo size={30} className={styles.logo} />
          <span className={styles.title}>
            <span className={styles.titleMain}>
              reset-radar / {loading ? "…" : vm.displayName}
              {!loading && vm.plan != null && <span className={styles.titleSubPlan}>{vm.plan}</span>}
            </span>
            <span className={styles.titleSub}>Codex 额度规划与强制重置风险</span>
          </span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.themeToggle} role="group" aria-label="主题">
            {(["dark", "light", "system"] as const).map((pref) => (
              <button
                key={pref}
                type="button"
                className={`${styles.themeOption} ${activeForHighlight === pref ? styles.themeOptionActive : ""}`}
                onClick={() => props.onThemePreference(pref)}
                aria-label={pref === "dark" ? "深色主题" : pref === "light" ? "浅色主题" : "跟随系统主题"}
                aria-pressed={props.themePreference === pref}
              >
                {pref === "dark" ? <MoonIcon size={15} /> : pref === "light" ? <SunIcon size={15} /> : <MonitorIcon size={15} />}
              </button>
            ))}
          </span>
          <button type="button" className={styles.iconButton} onClick={props.onCollapse} aria-label="收起面板" title="收起（Esc）">
            <ChevronUp size={17} />
          </button>
          <button type="button" className={styles.iconButton} onClick={props.onClose} aria-label="退出 reset-radar" title="退出 reset-radar">
            <CloseIcon size={16} />
          </button>
        </div>
      </header>

      {/* ── 状态横幅区 ── */}
      {loading ? (
        <div className={styles.notices}>
          <span className={`${styles.noticeCard} ${styles.skeleton} ${styles.skeletonBlock}`} />
          <span className={`${styles.noticeCard} ${styles.skeleton} ${styles.skeletonBlock}`} />
        </div>
      ) : (
        <div className={styles.notices}>
          {announcement != null ? (
            <div className={`${styles.noticeCard} ${styles.noticeCardAnnouncement}`}>
              <SpeakerIcon size={17} className={styles.noticeIcon} />
              <span className={styles.noticeBody}>
                <span className={styles.noticeTitle}>
                  公告：计划 {beijingShort(announcement.announcement.scheduledFor)} 北京时间重置
                  {announcement.state === "awaiting-confirmation" ? "（待核实）" : ""}
                </span>
                <span className={styles.noticeSub}>
                  来源：{announcement.announcement.source.type}
                  {announcement.announcement.source.author ? ` / ${announcement.announcement.source.author}` : ""} ·
                  抓取 {beijingShort(vm.resetStatus?.fetchedAt) ?? "—"} · 尚未确认发生
                </span>
              </span>
            </div>
          ) : (
            <div className={`${styles.noticeCard} ${resetStatusStale ? styles.noticeCardAnnouncement : ""}`}>
              <SpeakerIcon size={17} className={styles.noticeIcon} />
              <span className={styles.noticeBody}>
                <span className={styles.noticeTitle}>{resetStatusStale ? "公告来源已过期" : "暂无有效公告"}</span>
                <span className={styles.noticeSub}>
                  {resetStatusStale
                    ? `上次尝试 ${beijingFull(vm.resetStatus?.lastAttemptAt) ?? "—"}，未见新计划`
                    : vm.resetStatus == null
                      ? "运行时公告来源未接入"
                      : "上游当前无 scheduled 重置计划"}
                </span>
              </span>
            </div>
          )}
          <div className={`${styles.noticeCard} ${collectError ? styles.noticeCardError : styles.noticeCardOk}`}>
            <DatabaseIcon size={17} className={styles.noticeIcon} />
            <span className={styles.noticeBody}>
              <span className={styles.noticeTitle}>{collectError ? "采集失败" : resetStatusStale ? "采集状态：过期" : "采集状态：正常"}</span>
              <span className={styles.noticeSub}>
                {collectError
                  ? (phase === "read-error" ? props.readError ?? "读取失败" : vm.message ?? "额度来源返回错误")
                  : `最近更新成功 · ${beijingShort(vm.observedAt) ?? "—"} 北京时间`}
              </span>
            </span>
          </div>
        </div>
      )}

      {props.subscriptionError && (
        <div className={`${styles.stateBanner} ${styles.stateBannerWarn}`} role="status">
          <AlertIcon size={18} className={styles.stateIcon} />
          <span className={styles.stateBody}>
            <span className={styles.stateTitle}>自动更新不可用</span>
            <span className={styles.stateSub}>后台事件订阅失败；当前数据仍可显示，可手动刷新额度。</span>
          </span>
        </div>
      )}

      {phase === "empty" && (
        <div className={`${styles.stateBanner} ${styles.stateBannerEmpty}`}>
          <DatabaseIcon size={20} className={styles.stateIcon} />
          <span className={styles.stateBody}>
            <span className={styles.stateTitle}>暂无额度数据</span>
            <span className={styles.stateSub}>未取得 Codex 额度快照（原因未知，不推断为未登录）。</span>
          </span>
          <span className={styles.stateAction}>
            <button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}>
              <RefreshIcon size={14} className={props.refreshing ? "rr-spin" : undefined} />
              刷新额度
            </button>
          </span>
        </div>
      )}

      {phase === "read-error" && (
        <div className={`${styles.stateBanner} ${styles.stateBannerError}`} role="alert">
          <AlertIcon size={20} className={styles.stateIcon} />
          <span className={styles.stateBody}>
            <span className={styles.stateTitle}>读取失败</span>
            <span className={styles.stateSub}>{props.readError ?? "无法获取 Codex 额度数据，请检查网络。"}</span>
          </span>
          <span className={styles.stateAction}>
            <button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}>
              <RefreshIcon size={14} className={props.refreshing ? "rr-spin" : undefined} />
              重试
            </button>
          </span>
        </div>
      )}

      {/* ── 额度状态与今日建议 ── */}
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}><CalendarIcon size={13} /></span>
        <span className={styles.sectionTitle}>额度状态与今日建议</span>
      </div>

      {loading ? (
        <div className={styles.quotaGrid}>
          <span className={`${styles.quotaCard} ${styles.skeleton} ${styles.skeletonBlock}`} />
          <span className={`${styles.quotaCard} ${styles.skeleton} ${styles.skeletonBlock}`} />
          <span className={`${styles.suggestionBanner} ${styles.skeleton} ${styles.skeletonBlock}`} />
        </div>
      ) : (
        <>
          <div className={styles.quotaGrid}>
            <div className={styles.quotaCard}>
              <ProgressRing value={vm.remainingPercent} size={54} className={styles.ringBlue} label="周额度剩余">
                <span className={styles.ringCenter}>{percentWhole(vm.remainingPercent)}</span>
              </ProgressRing>
              <span className={styles.quotaText}>
                <span className={styles.quotaLabel}>周额度剩余</span>
                <span className={styles.quotaSub}>
                  {vm.remainingPercent == null
                    ? "周窗缺失 · 暂无数据"
                    : `自然重置 ${beijingShort(vm.resetsAt) ?? "—"} 北京时间`}
                </span>
              </span>
            </div>
            <div className={styles.quotaCard}>
              <ProgressRing value={vm.shortRemainingPercent} size={54} className={styles.ringGreen} label="短窗剩余">
                <span className={styles.ringCenter}>{percentWhole(vm.shortRemainingPercent)}</span>
              </ProgressRing>
              <span className={styles.quotaText}>
                <span className={styles.quotaLabel}>短窗剩余</span>
                <span className={styles.quotaSub}>
                  {vm.shortRemainingPercent == null ? "暂无数据" : "两窗口额度互不影响"}
                </span>
              </span>
            </div>
          </div>

          <SuggestionBanner vm={vm} stale={resetStatusStale} />
        </>
      )}

      {/* ── 风险分析 ── */}
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}><ShieldIcon size={13} /></span>
        <span className={styles.sectionTitle}>风险分析</span>
      </div>

      {loading ? (
        <span className={`${styles.riskCard} ${styles.skeleton} ${styles.skeletonBlock}`} />
      ) : (
        <>
          <div className={styles.riskGrid}>
            <div className={styles.riskCard}>
              <span className={styles.riskIconBox}><PulseIcon size={19} /></span>
              <span className={styles.riskText}>
                <span className={styles.riskLabel}>未来24h 模型风险</span>
                <span className={styles.riskValue}>{vm.risk == null ? "—" : percent1(vm.risk.score)}</span>
                {(() => {
                  const badge = riskBadge(vm.risk?.score ?? null);
                  return badge != null ? <span className={`${styles.riskBadge} ${badge.className}`}>{badge.label}</span> : null;
                })()}
              </span>
            </div>
            <div className={styles.riskCard}>
              <span className={styles.riskIconBox}><BarChartIcon size={19} /></span>
              <span className={styles.riskText}>
                <span className={styles.riskLabel}>48h 碰撞（用卡模型）</span>
                <span className={`${styles.riskValue} ${styles.riskValueDanger}`}>
                  {card == null ? "—" : percent1(card.forcedReset48hPercent)}
                </span>
                {(() => {
                  const badge = riskBadge(card?.forcedReset48hPercent ?? null);
                  return badge != null ? <span className={`${styles.riskBadge} ${badge.className}`}>{badge.label}</span> : null;
                })()}
              </span>
            </div>
          </div>
          <div className={styles.factorList}>
            <FactorRows factors={vm.risk?.factors ?? []} emptyNote="无因子" />
          </div>
          <p className={styles.mutedNote}>
            两个口径来自不同模型时段，分别命名展示，不能互相换算。因子正值提升风险、负值降低风险。
            {vm.risk?.watchComparison != null && " watch 公开信号按 25% 权重融合（对比见数据与校准区）。"}
          </p>
        </>
      )}

      {/* ── 重置规划与用卡决策 ── */}
      <div className={styles.sectionHead}>
        <span className={styles.sectionIcon}><CalendarIcon size={13} /></span>
        <span className={styles.sectionTitle}>重置规划与用卡决策</span>
        <button type="button" className={styles.sectionLink} onClick={() => setShowPlannerDetail((v) => !v)}>
          {showPlannerDetail ? "收起依据" : "规划依据"}
        </button>
      </div>

      {loading ? (
        <span className={`${styles.plannerCard} ${styles.skeleton} ${styles.skeletonBlock}`} />
      ) : (
        <>
          <div className={styles.plannerGrid}>
            <div className={styles.plannerCard}>
              <span className={styles.plannerCardBlueIcon}><CardStackIcon size={19} /></span>
              <span className={styles.plannerText}>
                <span className={styles.plannerBig}>
                  {vm.resetCredits == null ? "卡数未知" : vm.resetCredits === 0 ? "卡 ×0" : `重置卡 ×${vm.resetCredits}`}
                </span>
                <span className={styles.plannerSub}>
                  {vm.resetCredits == null ? "暂无法获取可用重置卡数量" : "当前可用重置卡数量"}
                </span>
              </span>
            </div>
            {showPlannerBlocks && card != null && (
              <div className={styles.decisionCard}>
                <span className={styles.decisionIcon}><BulbIcon size={16} /></span>
                <span className={styles.decisionText}>
                  <span className={styles.decisionTitle}>用卡决策</span>
                  <span className={styles.decisionMain}>{DECISION_LABELS[card.decision]}</span>
                  <span className={styles.decisionSub}>{plannerDecisionSub(card, vm.resetCredits)}</span>
                </span>
              </div>
            )}
          </div>

          {showPlannerBlocks && card != null && (
            <>
              <div className={styles.metricGrid}>
                <span className={styles.metricMini}>
                  <span className={styles.metricMiniLabel}>今日期望收益</span>
                  <span className={styles.metricMiniValue}>+{card.expectedGainTodayPercent.toFixed(1)} pp</span>
                </span>
                <span className={styles.metricMini}>
                  <span className={styles.metricMiniLabel}>最佳日期期望收益</span>
                  <span className={styles.metricMiniValue}>+{card.expectedGainBestPercent.toFixed(1)} pp</span>
                </span>
                <span className={styles.metricMini}>
                  <span className={styles.metricMiniLabel}>模型最佳日</span>
                  <span className={styles.metricMiniValue}>{weekdayDateLabel(card.bestDayLocalDate)}</span>
                </span>
                <span className={styles.metricMini}>
                  <span className={styles.metricMiniLabel}>自然重置</span>
                  <span className={styles.metricMiniValue}>
                    {beijingShort(vm.resetsAt) ?? "—"}（约 {daysLabel(card.daysUntilNaturalReset)}后）
                  </span>
                </span>
              </div>
              <div className={styles.chartCard}>
                <span className={styles.chartTitle}>
                  <BarChartIcon size={13} /> 候选日期收益图（预计获得的周额度百分点）
                  <InfoIcon size={12} />
                </span>
                <OutlookChart bars={outlookBars(card)} unitLabel="候选日期收益图（周额度百分点）" />
                <p className={styles.chartNote}>
                  期望收益为周额度百分点，不构成“获得更多实际额度的承诺”；日需为模型假设，非个人实测用量。
                </p>
              </div>
            </>
          )}

          {showPlannerDetail && card != null && (
            <p className={styles.mutedNote}>
              策略 {card.policyVersion} · 日需假设 {card.dailyNeedPercent.toFixed(1)}%/天 · 24h 碰撞{" "}
              {percent1(card.forcedReset24hPercent)} · 补给规模 {card.refillTodayPercent.toFixed(1)}pp ·
              理由链 {card.reasons.join(" › ")}
              {card.daysUntilCreditExpiry != null && ` · 最早卡过期约 ${daysLabel(card.daysUntilCreditExpiry)}后`}
              {card.planningResetAt != null && " · 收益按公告如期执行情景（碰撞概率仍为统计模型）"}
            </p>
          )}
        </>
      )}

      {/* ── 数据与校准 ── */}
      <footer className={styles.footer}>
        <div className={styles.dataLines}>
          <span className={styles.dataLine}>
            <span className={styles.dataLineKey}>额度观测</span>
            <span className={`${styles.dataLineValue} ${resetStatusStale ? styles.dataLineStale : ""}`}>
              {loading ? "…" : `${beijingFull(vm.observedAt) ?? "—"} 北京时间`}
              {resetStatusStale ? "（上次观测，数据过期）" : ""}
            </span>
          </span>
          <span className={styles.dataLine}>
            <span className={styles.dataLineKey}>历史抓取</span>
            <span className={styles.dataLineValue}>
              {vm?.historySource == null
                ? "—"
                : `${beijingFull(vm.historySource.asOf) ?? "—"} 北京时间 · ${
                    vm.historySource.state === "fresh"
                      ? `新鲜（${vm.historySource.quotaResetEvents ?? "—"} 条额度重置）`
                      : vm.historySource.state === "stale"
                        ? "已过期（超过 7 天）"
                        : "无效来源"
                  }`}
            </span>
          </span>
          <span className={styles.dataLine}>
            <span className={styles.dataLineKey}>公告抓取</span>
            <span className={styles.dataLineValue}>
              {!loading && vm.resetStatus != null
                ? `${beijingFull(vm.resetStatus.fetchedAt) ?? "—"} 北京时间 · ${
                    vm.resetStatus.state === "ok" ? "新鲜" : vm.resetStatus.state === "stale" ? "已过期" : "失败"
                  }`
                : "—"}
            </span>
          </span>
        </div>
        <CalibrationLine calibration={props.calibration} />
        <div className={styles.footerActions}>
          <button type="button" className={styles.primaryButton} onClick={props.onRefresh} disabled={props.refreshing}>
            <RefreshIcon size={14} className={props.refreshing ? "rr-spin" : undefined} />
            {props.refreshing ? "刷新中…" : "刷新额度"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={copySummary} disabled={vm == null}>
            {copied === "ok" ? <CheckIcon size={14} className={styles.copied} /> : <CopyIcon size={14} />}
            {copied === "ok" ? "已复制" : copied === "error" ? "复制失败" : "复制摘要"}
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => setShowPacingDetail((v) => !v)}>
            <SlidersIcon size={14} />
            配速解释
          </button>
          {demo && <span className={styles.demoBadge}>演示数据 · 非本机实采</span>}
        </div>
        {showPacingDetail && vm?.dailyPlan != null && (
          <div className={styles.factorList}>
            <FactorRows factors={vm.dailyPlan.factors} emptyNote="无配速因子" />
          </div>
        )}
      </footer>
    </div>
  );
}

/** 紫色建议横幅（图6 权威样例）：stale/空/错误按图5 换文案与色调，不虚构数字。 */
function SuggestionBanner({ vm, stale }: { vm: DashboardViewModel; stale: boolean }) {
  const plan = vm.dailyPlan;
  if (plan == null) {
    const weeklyMissing = vm.remainingPercent == null;
    return (
      <div className={`${styles.suggestionBanner} ${styles.suggestionBannerPlain}`}>
        <span className={`${styles.suggestionIcon} ${styles.suggestionIconPlain}`}>
          <InfoIcon size={18} />
        </span>
        <span className={styles.suggestionBody}>
          <span className={`${styles.suggestionLabel} ${styles.suggestionLabelPlain}`}>今日建议</span>
          <span className={styles.suggestionNumber}>当前无法生成建议</span>
          <span className={`${styles.suggestionSub} ${styles.suggestionSubPlain}`}>
            {weeklyMissing ? "周窗数据缺失" : "自然重置时刻无效或已过"}——两类 null 含义不同，不一律写“缺周窗”。
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className={styles.suggestionBanner}>
      <span className={styles.suggestionIcon}><SparkleIcon size={20} /></span>
      <span className={styles.suggestionBody}>
        <span className={styles.suggestionLabel}>今日建议追加</span>
        <span className={styles.suggestionNumber}>
          +{plan.suggested.toFixed(1)} <span className={styles.suggestionNumberSuffix}>个周额度百分点</span>
        </span>
        <span className={styles.suggestionSub}>
          {stale ? "基于上次观测（数据过期）；" : ""}
          建议后剩余 {plan.suggestedRemaining.toFixed(1)}% · 均匀 {plan.uniformPace.toFixed(1)} + 前拉{" "}
          {plan.riskBoost.toFixed(1)}，受软上限 {plan.cap.toFixed(1)} 约束
        </span>
      </span>
      <span className={styles.suggestionTail} aria-hidden={true}>›</span>
    </div>
  );
}

/** 因子行（risk 与配速共用）：icon + label + note + 带符号 delta；零/负/新增因子都渲染。 */
function FactorRows({ factors, emptyNote }: { factors: RiskFactor[]; emptyNote: string }) {
  if (factors.length === 0) return <div className={styles.mutedNote}>{emptyNote}</div>;
  return (
    <>
      {factors.map((factor) => (
        <div key={factor.id} className={styles.factorRow}>
          <span className={styles.factorIcon} aria-hidden={true}>
            {factor.delta >= 0 ? <PulseIcon size={11} /> : <ShieldIcon size={11} />}
          </span>
          <span className={styles.factorLabel}>{factor.label}</span>
          <span className={styles.factorNote}>{factor.note}</span>
          <span className={`${styles.factorDelta} ${factor.delta >= 0 ? styles.factorDeltaPositive : styles.factorDeltaNegative}`}>
            {deltaPct(factor.delta)} pp
          </span>
        </div>
      ))}
    </>
  );
}

/** 校准行（RR28 只读契约）：零样本如实“数据积累中”，不伪造指标。 */
function CalibrationLine({ calibration }: { calibration: CalibrationSummaryView }) {
  if (calibration.status !== "ok") {
    return (
      <div className={styles.calibrationLine}>
        <span className={styles.calibrationKey}>校准</span>
        <span className={`${styles.calibrationValue} ${styles.calibrationZero}`}>
          {calibration.status === "missing" ? "尚未生成报告（运行 npm run calibrate 或刷新历史后自动生成）" : "报告无效，需重新生成"}
        </span>
      </div>
    );
  }
  const d = calibration.data;
  return (
    <div className={styles.calibrationLine}>
      <span className={styles.calibrationKey}>校准</span>
      <span className={styles.calibrationValue}>
        {d.sampleCount === 0 ? (
          <span className={styles.calibrationZero}>
            数据积累中（n=0{d.excluded.legacy > 0 ? `，旧行 ${d.excluded.legacy} 条按无窗口排除` : ""}）
          </span>
        ) : (
          <>
            n={d.sampleCount} · Brier {d.brier?.toFixed(3) ?? "—"} · 命中率{" "}
            {d.hitRate == null ? "—" : `${(d.hitRate * 100).toFixed(1)}%`}（阈 {d.thresholdPercent}%）·{" "}
            {d.state === "fresh" ? "报告新鲜" : d.state === "stale" ? "报告基于过期历史" : "报告来源无效"} · 生成{" "}
            {beijingFull(d.generatedAt) ?? "—"} 北京时间
            {d.watchPairedSamples > 0 && ` · watch 同样本 ${d.watchPairedSamples} 对`}
          </>
        )}
      </span>
    </div>
  );
}

/** 决策副文案：把 reasons 首条翻译成自然中文补充（机器键映射，非业务判断）。 */
function plannerDecisionSub(card: NonNullable<DashboardViewModel["cardPlan"]>, credits: number | null): string {
  if (credits == null) return "卡数未知，暂无法确认用卡建议；请评估风险后决策。";
  if (credits === 0) return "无可用重置卡；保持风险与配速信息可读。";
  const first = card.reasons[0];
  // 机器键→中文（rc:299-318 reasons 取值；顺序=重要性，只翻首条，其余进“规划依据”）。
  const mapping: Record<string, string> = {
    "scheduled-reset-scenario": "收益按公告计划情景评估，公告未确认执行",
    "no-credits": "无可用重置卡",
    "quota-plentiful": "额度尚多，暂缓用卡",
    "wait-for-depletion": "等待剩余降到值得用卡区间",
    "gain-below-threshold": "今日期望收益低于阈值",
    "wait-for-scheduled-reset-confirmation": "公告计划临近，暂缓用卡待核实",
    "better-day-ahead": "等待模型推荐的最佳日期，收益更高",
    "card-expires-soon": "重置卡即将过期，提前用卡",
  };
  return mapping[first] ?? (card.reasons.length > 0 ? card.reasons.join(" › ") : "—");
}

/** 候选日柱：outlook 原值 → 图形行（bestDayLocalDate 标绿加皇冠；无候选日不画）。 */
function outlookBars(card: NonNullable<DashboardViewModel["cardPlan"]>): OutlookBar[] {
  return card.outlook.map((day) => ({
    dateKey: day.localDate,
    axisLabel: weekdayDateLabel(day.localDate),
    gainPercent: day.expectedGainPercent,
    best: day.localDate === card.bestDayLocalDate,
  }));
}
