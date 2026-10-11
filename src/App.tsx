// 应用根（RR09 → RR27 三态重构）：collapsed / peek / expanded 展示分层 + 主题记忆 +
// 数据生命周期接线。UI 层零业务规则（ARCHITECTURE §2）——数字与建议一律产自
// adapters 视图模型；hover/focus/click 只改展示状态，不触发业务重算（02-spec §5）。
// RR14 hash 入口延续：#expanded / #peek 起始态；#demo=<场景> 注入演示快照（带演示标识）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildDashboard } from "./ui/adapters";
import {
  PEEK_CLOSE_DELAY_MS, PEEK_OPEN_DELAY_MS, escapeEvent, initialDisplayState, nextDisplayState,
  type DisplayEvent, type DisplayState,
} from "./ui/appState";
import CompactBar from "./ui/CompactBar";
import PeekCard from "./ui/PeekCard";
import DashboardPanel from "./ui/DashboardPanel";
import { RESET_HISTORY_ANNOUNCED_AT, RESET_HISTORY_SOURCE } from "./ui/history";
import { usePredictionLog } from "./ui/usePredictionLog";
import { useSnapshots } from "./ui/useSnapshots";
import { useCalibrationSummary } from "./ui/useCalibrationSummary";
import { applyWidgetSize, closeWidget } from "./ui/widgetWindow";
import {
  initialThemeOverride, readThemePreference, resolveTheme, writeThemePreference, type ThemePreference,
} from "./ui/theme";
import { demoScenarioSnapshot, parseDemoScenario } from "./ui/demoScenarios";
import "./ui/widget.css";

export default function App() {
  const [display, setDisplay] = useState<DisplayState>(() => initialDisplayState(window.location.hash));
  const [themePref, setThemePref] = useState<ThemePreference>(() => readThemePreference(window.localStorage));
  const [systemDark, setSystemDarkBase] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );
  // ?theme= 截图入口：直接覆盖生效主题（不写偏好记忆；不匹配时走正常解析链）。
  const themeOverride = useMemo(() => initialThemeOverride(window.location.search), []);
  const resolvedTheme = themeOverride ?? resolveTheme(themePref, systemDark);
  const { snapshots, live, phase, readError, subscriptionError, refreshing, refresh } = useSnapshots();
  const calibration = useCalibrationSummary();
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);

  const scenario = useMemo(() => parseDemoScenario(window.location.hash), []);
  const demo = !live || scenario != null;

  // 主题：偏好记忆 + 跟随系统；生效值写 data-theme（两套 token 在 widget.css）。
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDarkBase(event.matches);
    query?.addEventListener?.("change", onChange);
    return () => query?.removeEventListener?.("change", onChange);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  const onThemePreference = useCallback((pref: ThemePreference) => {
    setThemePref(pref);
    writeThemePreference(window.localStorage, pref);
  }, []);

  // 窗口尺寸跟展示态走（浏览器降级 no-op，失败不阻塞渲染）。
  useEffect(() => {
    applyWidgetSize(display).catch(() => {});
  }, [display]);

  // 展示态转移 + Escape（展开→收起、预览→收起；焦点回到展开入口，02-spec §5）。
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const clearTimers = useCallback(() => {
    if (openTimer.current != null) window.clearTimeout(openTimer.current);
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);
  const dispatch = useCallback((event: DisplayEvent) => {
    setDisplay((current) => nextDisplayState(current, event));
  }, []);
  const activate = useCallback(() => {
    clearTimers();
    dispatch("activate");
  }, [clearTimers, dispatch]);
  const collapse = useCallback(() => {
    clearTimers();
    dispatch("collapse");
    expandButtonRef.current?.focus();
  }, [clearTimers, dispatch]);
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const transition = escapeEvent(display);
      if (transition == null) return;
      clearTimers();
      setDisplay(nextDisplayState(display, transition));
      expandButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearTimers, display]);

  // 悬停预览时序（02-spec §5）：进条 350ms 开预览；离整个区域 200ms 收，移回取消。
  const onPointerEnterBar = () => {
    clearTimers();
    dispatch("pointer-enter");
    openTimer.current = window.setTimeout(() => dispatch("peek-open"), PEEK_OPEN_DELAY_MS);
  };
  const onPointerLeaveWidget = () => {
    clearTimers();
    dispatch("pointer-leave");
    closeTimer.current = window.setTimeout(() => dispatch("peek-close"), PEEK_CLOSE_DELAY_MS);
  };
  const onPointerEnterPeek = clearTimers; // 移入预览区：取消收回计时，不闪退

  // 演示场景注入（02-spec §6 末行）：仅替换显示快照并带演示标识，不触数据夹具；
  // empty/loading 场景本身无快照——以空数组和 phase 覆盖表达（不是“无覆盖”）。
  const scenarioSnapshot = scenario == null ? null : demoScenarioSnapshot(scenario);
  const scenarioPhase =
    scenario === "empty" ? "empty" : scenario === "loading" ? "initializing" : null;
  const effectiveSnapshots =
    scenarioPhase != null ? [] : scenarioSnapshot != null ? [scenarioSnapshot] : snapshots;
  const effectivePhase = scenarioPhase ?? phase;
  const codex = effectiveSnapshots.find((item) => item.provider === "codex") ?? effectiveSnapshots[0] ?? null;
  const vm = useMemo(
    () =>
      codex != null
        ? buildDashboard(codex, RESET_HISTORY_ANNOUNCED_AT, new Date(), RESET_HISTORY_SOURCE, calibration.view)
        : null,
    [codex, calibration.view],
  );

  const predictionLog = usePredictionLog(vm?.prediction ?? null, live, vm?.updatedAt ?? "");

  return (
    <main
      data-prediction-log-state={predictionLog.status}
      style={{
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        background: "transparent",
      }}
    >
      {display !== "expanded" && (
        <div
          onPointerEnter={display === "collapsed" ? onPointerEnterBar : undefined}
          onPointerLeave={display === "collapsed" ? onPointerLeaveWidget : undefined}
        >
          <CompactBar vm={vm} phase={effectivePhase} demo={demo} onExpand={activate} expandRef={expandButtonRef} />
        </div>
      )}
      {display === "peek" && (
        <div onPointerEnter={onPointerEnterPeek} onPointerLeave={onPointerLeaveWidget} className="rr-fade-in">
          <PeekCard vm={vm} phase={effectivePhase} demo={demo} onOpen={activate} />
        </div>
      )}
      {display === "expanded" && (
        <DashboardPanel
          vm={vm}
          phase={effectivePhase}
          readError={readError}
          subscriptionError={subscriptionError}
          refreshing={refreshing}
          calibration={calibration.view}
          demo={demo}
          themePreference={themePref}
          activeTheme={resolvedTheme}
          onThemePreference={onThemePreference}
          onRefresh={refresh}
          onCollapse={collapse}
          onClose={() => {
            void closeWidget();
          }}
        />
      )}
    </main>
  );
}
