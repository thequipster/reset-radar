import {WEEKDAY_VERSION} from './lib/v3/weekday';
import {evaluateWeekdayJournal} from './lib/v3/runtime';
// 应用根（RR09 → RR27 三态重构 → RR43 悬浮外壳：托盘常驻 + 迷你圆 + 贴边停靠）。
// collapsed / peek / expanded 展示分层 + 主题记忆 + 数据生命周期接线。
// UI 层零业务规则（ARCHITECTURE §2）——数字与建议一律产自 adapters 视图模型；
// hover/focus/click 只改展示状态，不触发业务重算（02-spec §5）。
// RR14 hash 入口延续：#expanded / #peek 起始态；#demo=<场景> 注入演示快照（带演示标识）。
// RR43 追加：#form=orb|bar 指定收起形态（默认迷你圆），偏好存 localStorage（本地优先）。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildV3Dashboard, mergeV31Planning, v3OrbReadout } from "./ui/v3Model";
import {
  AUTO_COLLAPSE_BLUR_DELAY_MS, AUTO_COLLAPSE_IDLE_MS, DOCK_REDOCK_DELAY_MS, PEEK_CLOSE_DELAY_MS,
  PEEK_OPEN_DELAY_MS, escapeEvent, hashSegments, initialDisplayState, initialRestForm,
  nextDisplayState, shouldAutoCollapse, shouldDeferAutoCollapse, type DisplayEvent, type DisplayState, type RestForm,
} from "./ui/appState";
import DashboardPanel, { V3CompactBar as CompactBar, V3Peek as PeekCard } from "./ui/V3Dashboard";
import Orb from "./ui/Orb";
import {
  DOCK_SNAP_DISTANCE, clampVisiblePosition, dockedPosition, nearestDockEdge, poppedPosition, type DockEdge, type Rect,
} from "./ui/dockGeometry";
import { nextOrbMetric, type OrbMetric } from "./ui/orbMetric";
import { evaluatePlatformJournal } from './lib/v3/runtime';
import { useV3Journal } from "./ui/useV3Journal";
import { usePersonalInputs } from "./ui/usePersonalInputs";
import { useV3Planning } from "./ui/useV3Planning";
import { MODEL_BUCKET_MS, isDailyPublishBucket, modelBucketStart, msUntilNextBucket } from "./ui/modelClock";
import { DAY_MS } from "./lib/beijing";
import {summarizeVerdicts} from './lib/v3/verdict';
import { useSnapshots } from "./ui/useSnapshots";
import { ORB_SIZE, closeWidget, targetWidgetSize } from "./ui/widgetWindow";
import {
  onShellAction, onShellFocusChanged, readShellPrefs, shellGeometry, shellIsVisible, shellQuit,
  shellSetBounds, shellSetVisible, writeShellPrefs, type ShellPrefs,
} from "./ui/shellBridge";
import {
  initialThemeOverride, readThemePreference, resolveTheme, writeThemePreference, type ThemePreference,
} from "./ui/theme";
import { demoScenarioSnapshot, parseDemoScenario } from "./ui/demoScenarios";
import "./ui/widget.css";

/** 拖拽/贴边共用的窗口尺寸（迷你圆形态下窗口恒为 72×72）。 */
const ORB_BOX = { width: ORB_SIZE.width, height: ORB_SIZE.height };

export default function App() {
  const [display, setDisplay] = useState<DisplayState>(() => initialDisplayState(window.location.hash));
  const [form, setForm] = useState<RestForm>(() => initialRestForm(window.location.hash));
  const [metric, setMetric] = useState<OrbMetric>(() => window.localStorage.getItem('rr.shell.metric')==null?'remaining':readShellPrefs(window.localStorage).metric==='risk'?'remaining':readShellPrefs(window.localStorage).metric);
  const [dockEdge, setDockEdge] = useState<DockEdge | null>(null);
  const [popped, setPopped] = useState(false);
  const [themePref, setThemePref] = useState<ThemePreference>(() => readThemePreference(window.localStorage));
  const [systemDark, setSystemDarkBase] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  );
  // ?theme= 截图入口：直接覆盖生效主题（不写偏好记忆；不匹配时走正常解析链）。
  const themeOverride = useMemo(() => initialThemeOverride(window.location.search), []);
  const [override, setOverride] = useState(themeOverride);
  const resolvedTheme = override ?? resolveTheme(themePref, systemDark);
  const { snapshots, live, phase, readError, subscriptionError, refreshing, refresh } = useSnapshots();
  // RR56 模型时钟：过去每 60 s 推一次 clock → 重建 VM → 重跑 18–32 s 的规划 worker + 写 8 条日志，
  // 这就是"一打开就起风扇"的根源。现在只在 15 分钟桶切换、窗口重新可见或用户展开面板时推进；
  // 规划/日志各自再按签名与小时去重，倒计时文案最多滞后一个桶。
  const [modelTick, setModelTick] = useState(() => Date.now());
  const modelTickRef = useRef(modelTick);
  const bumpModelTick = useCallback((minAgeMs = 60_000) => {
    const now = Date.now();
    if (now - modelTickRef.current < minAgeMs && modelBucketStart(now) === modelBucketStart(modelTickRef.current)) return;
    modelTickRef.current = now;
    setModelTick(now);
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => { bumpModelTick(0); schedule(); }, msUntilNextBucket(Date.now()));
    };
    schedule();
    const onVisible = () => { if (document.visibilityState === "visible") bumpModelTick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [bumpModelTick]);
  // 用户主动看（预览 / 展开）时把"模型 now"对到当前时刻，文案不滞后。
  useEffect(() => { if (display !== "collapsed") bumpModelTick(); }, [display, bumpModelTick]);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const orbRef = useRef<HTMLButtonElement | null>(null);

  // 外壳状态的最新值镜像：异步回调（拖拽/贴边/托盘）里避免闭包读到旧值。
  const formRef = useRef(form);
  const displayRef = useRef(display);
  const dockEdgeRef = useRef<DockEdge | null>(dockEdge);
  const poppedRef = useRef(popped);
  const boundsRef = useRef<{ x: number; y: number } | null>(null);
  const monitorRef = useRef<Rect | null>(null);
  const dragActive = useRef(false);
  const movementTail = useRef<Promise<void>>(Promise.resolve());
  const moveRunning = useRef(false);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const hasFormSegment = useMemo(
    () => hashSegments(window.location.hash).some((segment) => segment.startsWith("form=")),
    [],
  );

  formRef.current = form;
  displayRef.current = display;
  dockEdgeRef.current = dockEdge;
  poppedRef.current = popped;

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
    setOverride(null);
    setThemePref(pref);
    writeThemePreference(window.localStorage, pref);
  }, []);

  /** 把「形态 + 展示态 + 贴边状态」折算成实际窗口坐标并落屏（浏览器降级 no-op）。 */
  const applyGeometry = useCallback(async (): Promise<void> => {
    const geo = await shellGeometry();
    if (geo == null || dragActive.current) return;
    monitorRef.current = geo.monitor;
    const wanted = targetWidgetSize(displayRef.current, formRef.current);
    const size = { width: Math.min(wanted.width, geo.monitor.width), height: Math.min(wanted.height, geo.monitor.height) };

    const edge = dockEdgeRef.current;
    let position = { x: geo.x, y: geo.y };
    if (edge != null && displayRef.current === "collapsed" && formRef.current === "orb") {
      position = poppedRef.current
        ? poppedPosition(edge, geo.monitor, size, position)
        : dockedPosition(edge, geo.monitor, size, position);
    }
    if (displayRef.current !== "collapsed" || formRef.current === "bar") {
      position = clampVisiblePosition(position, geo.monitor, size);
    }
    boundsRef.current = position;
    await shellSetBounds(position.x, position.y, size.width, size.height);
  }, []);

  // 启动：恢复偏好（形态/指标/贴边/位置）→ 上屏。hash 显式指定 form 时不覆盖它。
  useEffect(() => {
    let cancelled = false;
    const prefs: ShellPrefs = readShellPrefs(window.localStorage);
    if (!hasFormSegment) setForm(prefs.form);
    setMetric(window.localStorage.getItem('rr.shell.metric')==null?'remaining':prefs.metric==='risk'?'remaining':prefs.metric);
    setDockEdge(prefs.dockEdge);
    formRef.current = hasFormSegment ? formRef.current : prefs.form;
    dockEdgeRef.current = prefs.dockEdge;
    void (async () => {
      await movementTail.current.catch(() => {});
      const geo = await shellGeometry();
      if (cancelled || geo == null) return;
      monitorRef.current = geo.monitor;
      const size = targetWidgetSize(displayRef.current, formRef.current);
      if (prefs.dockEdge != null && displayRef.current === "collapsed" && formRef.current === "orb") {
        const docked = dockedPosition(prefs.dockEdge, geo.monitor, size, { x: geo.x, y: geo.y });
        boundsRef.current = docked;
        await shellSetBounds(docked.x, docked.y, size.width, size.height);
      } else if (prefs.x != null && prefs.y != null) {
        const target = clampVisiblePosition({ x: prefs.x, y: prefs.y }, geo.monitor, size);
        boundsRef.current = target;
        await shellSetBounds(target.x, target.y, size.width, size.height);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasFormSegment]);

  // 窗口尺寸跟展示态走；形态/贴边变化时重算坐标（贴边位随窗口大小变）。
  useEffect(() => {
    void applyGeometry().catch(() => {});
  }, [display, form, dockEdge, popped, applyGeometry]);

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
    if (event === "auto-collapse") {
      setForm("orb");
      formRef.current = "orb";
    }
    setDisplay((current) => nextDisplayState(current, event));
  }, []);
  const activate = useCallback(() => {
    clearTimers();
    setPopped(true); // 展开面板必须完整可见，贴边圆先弹回来
    dispatch("activate");
  }, [clearTimers, dispatch]);
  const collapse = useCallback(() => {
    clearTimers();
    setForm("orb");
    formRef.current = "orb";
    dispatch("collapse");
    setPopped(false); // 收起后回到贴边位（未贴边时此值无副作用）
    if (formRef.current === "orb") orbRef.current?.focus();
    else expandButtonRef.current?.focus();
  }, [clearTimers, dispatch]);
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const transition = escapeEvent(display);
      if (transition == null) return;
      clearTimers();
      setForm("orb");
      formRef.current = "orb";
      setDisplay(nextDisplayState(display, transition));
      setPopped(false);
      if (formRef.current === "orb") orbRef.current?.focus();
      else expandButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearTimers, display]);

  // RR43 自动缩圆：展开态失焦（600ms 宽限）或闲置到点 → 收起成圆。
  // RR56：原生下拉/日期选择器弹出时外壳会瞬时失焦——指针仍在窗口内或焦点在表单控件上时暂缓，
  // 等指针真正离开窗口（且仍未回焦）再起 600ms 计时；表单输入也算“在用”。
  useEffect(() => {
    if (!shouldAutoCollapse(display)) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let blurTimer: number | null = null;
    let shellFocused = true;
    let pointerInside = true;
    let idleTimer: number | null = window.setTimeout(() => dispatch("auto-collapse"), AUTO_COLLAPSE_IDLE_MS);
    const resetIdle = (): void => {
      if (idleTimer != null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => dispatch("auto-collapse"), AUTO_COLLAPSE_IDLE_MS);
    };
    const clearBlur = (): void => {
      if (blurTimer != null) window.clearTimeout(blurTimer);
      blurTimer = null;
    };
    const armBlur = (): void => {
      if (shellFocused || blurTimer != null) return;
      if (shouldDeferAutoCollapse({ pointerInside, activeTag: document.activeElement?.tagName })) return;
      blurTimer = window.setTimeout(() => dispatch("auto-collapse"), AUTO_COLLAPSE_BLUR_DELAY_MS);
    };
    void onShellFocusChanged((focused) => {
      shellFocused = focused;
      if (focused) {
        clearBlur();
        resetIdle();
        return;
      }
      armBlur();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    const onPointerEnter = (): void => { pointerInside = true; clearBlur(); };
    const onPointerLeave = (): void => { pointerInside = false; armBlur(); };
    const root = document.documentElement;
    root.addEventListener("mouseenter", onPointerEnter);
    root.addEventListener("mouseleave", onPointerLeave);
    // 面板内的任何操作都算“在用”，重置闲置计时。
    const activity = ["pointerdown", "pointermove", "keydown", "wheel", "focusin", "input", "change"] as const;
    for (const name of activity) window.addEventListener(name, resetIdle);
    return () => {
      cancelled = true;
      unlisten?.();
      if (idleTimer != null) window.clearTimeout(idleTimer);
      clearBlur();
      root.removeEventListener("mouseenter", onPointerEnter);
      root.removeEventListener("mouseleave", onPointerLeave);
      for (const name of activity) window.removeEventListener(name, resetIdle);
    };
  }, [dispatch, display]);

  // 自动缩圆落地后：贴边状态复位（回到贴边半圆），未贴边时此值无副作用。
  useEffect(() => {
    if (display === "collapsed") setPopped(false);
  }, [display]);

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

  // —— 迷你圆：拖拽 / 贴边 / 换指标 ——
  const redockTimer = useRef<number | null>(null);
  const onOrbDragMove = useCallback((dx: number, dy: number) => {
    dragActive.current = true;
    if (redockTimer.current != null) window.clearTimeout(redockTimer.current);
    if (dragOrigin.current == null) dragOrigin.current = boundsRef.current;
    const origin = dragOrigin.current;
    if (origin == null) return;
    pendingMove.current = { x: origin.x + dx, y: origin.y + dy };
    if (moveRunning.current) return;
    moveRunning.current = true;
    movementTail.current = movementTail.current.catch(() => {}).then(async () => {
      while (pendingMove.current != null) {
        const target = pendingMove.current;
        pendingMove.current = null;
        await shellSetBounds(target.x, target.y, ORB_BOX.width, ORB_BOX.height);
      }
    }).finally(() => { moveRunning.current = false; });
  }, []);
  const onOrbDragEnd = useCallback((dx: number, dy: number, moved: boolean) => {
    const origin = dragOrigin.current ?? boundsRef.current;
    dragOrigin.current = null;
    if (!moved || origin == null) { dragActive.current = false; return; }
    const dropped = { x: origin.x + dx, y: origin.y + dy };
    void (async () => {
      const geo = await shellGeometry();
      if (geo == null) { dragActive.current = false; return; }
      const edge = nearestDockEdge(
        { ...dropped, width: ORB_BOX.width, height: ORB_BOX.height },
        geo.monitor,
        DOCK_SNAP_DISTANCE,
      );
      const target = edge == null
        ? dropped
        : dockedPosition(edge, geo.monitor, ORB_BOX, dropped);
      boundsRef.current = target;
      setDockEdge(edge);
      setPopped(false);
      writeShellPrefs(window.localStorage, { dockEdge: edge, x: dropped.x, y: dropped.y });
      await shellSetBounds(target.x, target.y, ORB_BOX.width, ORB_BOX.height);
      dragActive.current = false;
    })().catch(() => { dragActive.current = false; });
  }, []);
  const onOrbEnter = useCallback(() => {
    if (dragActive.current) return;
    if (redockTimer.current != null) {
      window.clearTimeout(redockTimer.current);
      redockTimer.current = null;
    }
    if (dockEdgeRef.current != null && !poppedRef.current) setPopped(true);
  }, []);
  useEffect(() => () => {
    if (redockTimer.current != null) window.clearTimeout(redockTimer.current);
  }, []);
  const onOrbLeave = useCallback(() => {
    if (dragActive.current || dockEdgeRef.current == null) return;
    if (redockTimer.current != null) window.clearTimeout(redockTimer.current);
    redockTimer.current = window.setTimeout(() => {
      setPopped(false);
      redockTimer.current = null;
    }, DOCK_REDOCK_DELAY_MS);
  }, []);
  const onCycleMetric = useCallback(() => {
    setMetric((current) => {
      const candidate = nextOrbMetric(current);
      const next = candidate==='risk'?'remaining':candidate;
      writeShellPrefs(window.localStorage, { metric: next });
      return next;
    });
  }, []);

  // —— 托盘菜单动作（Rust shell.rs 发出；关窗只收起，彻底退出唯一入口在托盘）——
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    void onShellAction((action) => {
      if (action === "quit") {
        void shellQuit();
        return;
      }
      if (action === "toggle") {
        void (async () => {
          const visible = await shellIsVisible();
          await shellSetVisible(visible === false);
        })();
        return;
      }
      if (action === "expand") {
        void (async () => {
          await shellSetVisible(true);
          activate();
        })();
        return;
      }
      if (action.startsWith("form:")) {
        const next = action.slice("form:".length) as RestForm;
        setForm(next);
        writeShellPrefs(window.localStorage, { form: next });
        if (next === "bar") {
          // 悬浮条不做贴边（460 宽的条贴边会挡住内容），回到自由摆放。
          setDockEdge(null);
          setDisplay((current) => (current === "peek" ? "collapsed" : current));
          writeShellPrefs(window.localStorage, { dockEdge: null });
        }
        return;
      }
      if (action.startsWith("metric:")) {
        if(action==='metric:risk'){
          window.location.hash=hashSegments(window.location.hash).filter(s=>!s.startsWith('tab=')).concat('tab=risk').join('&');
          activate();return;
        }
      const next = action.slice("metric:".length)==='risk'?'remaining':action.slice("metric:".length) as OrbMetric;
        setMetric(next);
        writeShellPrefs(window.localStorage, { metric: next });
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [activate]);

  // 演示场景注入（02-spec §6 末行）：仅替换显示快照并带演示标识，不触数据夹具；
  // empty/loading 场景本身无快照——以空数组和 phase 覆盖表达（不是“无覆盖”）。
  const scenarioSnapshot = useMemo(() => scenario == null ? null : demoScenarioSnapshot(scenario), [scenario]);
  const scenarioPhase =
    scenario === "empty" ? "empty" : scenario === "loading" ? "initializing" : null;
  const effectiveSnapshots =
    scenarioPhase != null ? [] : scenarioSnapshot != null ? [scenarioSnapshot] : snapshots;
  const effectivePhase = scenarioPhase ?? phase;
  const codex = effectiveSnapshots.find((item) => item.provider === "codex") ?? effectiveSnapshots[0] ?? null;
  const journal = useV3Journal(codex, live && !demo);
  // 09:00 桶内统一用桶起点，保证每日主预测仍落在 primary_daily（journal.predictionGroupAt 只认 09:00 整分）。
  const modelNow = useMemo(() => { const now = Date.now(); return isDailyPublishBucket(now) ? modelBucketStart(now) : now; }, [modelTick, codex?.updatedAt, journal.historyEpoch]);
  const personal = usePersonalInputs(demo ? null : codex?.accountKey ?? null, codex?.resetCredits ?? null, modelNow);
  const baseVM = useMemo(
    () =>
      codex != null
        ? buildV3Dashboard(codex, journal.historyDocument, modelNow, personal.state, journal.observations, journal.signalHistory,true,journal.accountSnapshots)
        : null,
    [codex, modelNow, personal.state, journal.observations, journal.signalHistory,journal.historyDocument,journal.accountSnapshots],
  );
  // 展开/预览时 15 分钟一桶，收起只剩迷你圆在看 → 60 分钟一桶；同签名直接命中缓存，不再重跑蒙特卡洛。
  const planningWorker=useV3Planning(baseVM?.planningInput??null,{enabled:live||demo,bucketMs:display==="collapsed"?4*MODEL_BUCKET_MS:MODEL_BUCKET_MS});
  const vm=useMemo(()=>baseVM?mergeV31Planning(baseVM,planningWorker.result):null,[baseVM,planningWorker.result]);
  const calibrationV3=useMemo(()=>evaluatePlatformJournal(journal.predictionContent,journal.historyDocument,modelNow),[journal.predictionContent,journal.historyDocument,modelNow]);
  const weekdayCalibration=useMemo(()=>evaluateWeekdayJournal(journal.predictionContent,modelNow),[journal.predictionContent,modelNow]);
  const verdictSummaries=useMemo(()=>summarizeVerdicts(journal.predictionContent),[journal.predictionContent]);
  const [journalWriteError,setJournalWriteError]=useState<string|null>(null);
  // RR56 日志节流：预测/规划行只在 (a) 北京 09:00 主槽、(b) 实质输入变化、(c) 距上次写入 ≥ 1 小时 时追加。
  // 过去每次 VM 重建（每分钟）都写 8 行，每行都要把 16 MB 日志整份搬过 IPC 两次。
  const journalGateRef=useRef<{key:string;at:number;dailyDate:string|null}>({key:'',at:0,dailyDate:null});
  useEffect(() => {
    if(!live||demo||!vm||!codex)return;
    const historySnapshotId=`platform-history:${(journal.historyDocument as {fetchedAt?:string})?.fetchedAt??'unknown'}`;
    const materialKey=[codex.accountKey??'unknown',codex.status,historySnapshotId,vm.ledgerVersion,vm.preferenceVersion,vm.recommendation?.action??'',vm.recommendation?.cardId??'',
      Math.round(vm.remainingPercent??-1),(vm.platformLongTerm?.probability24h??-1).toFixed(2),vm.coldContext?.selectedTier??'',vm.planning?.seed??''].join('|');
    const dailyBucket=isDailyPublishBucket(vm.now);
    const dailyDate=dailyBucket?new Date(vm.now+8*3_600_000).toISOString().slice(0,10):null;
    const gate=journalGateRef.current;
    const due=gate.key!==materialKey||vm.now-gate.at>=3_600_000||(dailyBucket&&gate.dailyDate!==dailyDate);
    if(!due)return;
    journalGateRef.current={key:materialKey,at:vm.now,dailyDate:dailyDate??gate.dailyDate};
    let alive=true;
    const snapshotId=`v3-${codex.accountKey??'unknown'}-${codex.rateLimitSnapshot?.observedAt??codex.updatedAt}`;
    const base={issuedAt:vm.now,windowStart:vm.now,windowEnd:vm.now+DAY_MS,trainingCutoff:vm.platformModel.cutoff,inputSnapshotId:snapshotId,
      cardLedgerVersion:vm.ledgerVersion,preferenceVersion:vm.preferenceVersion,assumptions:vm.recommendation.assumptions,evidenceQuality:vm.evidenceQuality,platformHistorySnapshotId:historySnapshotId};
    const prefix=`v3:${snapshotId}:${historySnapshotId}:${vm.now}:${vm.ledgerVersion}:${vm.preferenceVersion}`;
    void(async()=>{
      await journal.appendPrediction({...base,id:`${prefix}:platform`,target:'platform_notice',probability:vm.platformLongTerm.probability24h,modelVersion:'platform-v3:P0',featureContributions:vm.platformLongTerm.factors});
      let weekdayFailure:string|null=null;
      const d60={...base,id:`${prefix}:d60`,target:'platform_notice' as const,probability:vm.platformReference.decay.probability24h,modelVersion:'platform-v3.1:D60',featureContributions:[vm.platformReference.decay],assumptions:[...base.assumptions,'60天半衰期/7等效日收缩为固定假设，短期冻结发生率。']};
      const weekday=vm.weekdayShadow;
      if(weekday?.forecast&&Number.isFinite(weekday.forecast.probability)&&weekday.forecast.probability>=0&&weekday.forecast.probability<=1){
        try{
          const result=await journal.appendWeekdayPair(d60,{...base,id:`${prefix}:weekday`,target:'platform_notice',probability:weekday.forecast.probability,modelVersion:WEEKDAY_VERSION,
            featureContributions:[{version:weekday.model.version,timezone:weekday.model.timezone,shrinkagePerWeekdayDays:weekday.model.shrinkagePerWeekdayDays,
              counts:weekday.model.counts,exposures:weekday.model.exposures,multipliers:weekday.model.multipliers,rates:weekday.model.rates,baseRate:weekday.model.base.ratePerDay,
              segments:weekday.forecast.segments,integratedHazard:weekday.forecast.integratedHazard}],assumptions:[...base.assumptions,'每星期28等效日收缩至D60；北京时间分段积分，影子不改变账号映射或用卡规划。']});
          weekdayFailure=result.error;
        }catch(error){weekdayFailure=String(error);await journal.appendPrediction(d60);try{await journal.stopWeekdayShadow(weekdayFailure,vm.now);}catch{/* 主链继续，故障仍显示。 */}}
      }else{
        await journal.appendPrediction(d60);
        if(weekday?.forecast){weekdayFailure='星期影子概率非有限或越界，候选已停写';try{await journal.stopWeekdayShadow(weekdayFailure,vm.now);}catch{/* 保留故障提示与D60。 */}}
      }

      await journal.appendPrediction({...base,id:`${prefix}:r90`,target:'platform_notice',probability:vm.r90Probability,modelVersion:'platform-v3.1:R90-shadow',featureContributions:[]});
      await journal.appendPrediction({...base,id:`${prefix}:platform-shadow`,target:'platform_notice',probability:vm.platform.shadow.probability24h,modelVersion:'platform-v3:P1-shadow',featureContributions:vm.platform.shadowFactors});
      // v3 §2.1：平台目标不依赖账号读取；失败账号不追加个人预测/规划的成功输入。
      if(codex.status!=="ok"){if(alive)setJournalWriteError(weekdayFailure);return;}
      await journal.appendPrediction({...base,id:`${prefix}:account`,target:'account_external_reset',probability:vm.supply?.accountProbability24h??null,modelVersion:'account-v3:learning',featureContributions:[]});
      await journal.appendPrediction({...base,id:`${prefix}:demand`,target:'demand',probability:null,modelVersion:'demand-v3:empirical',featureContributions:[vm.demand]});
      if(vm.accountKey)await journal.appendAccountMapping(vm.accountKey,vm.mapping,vm.now);
      if(vm.planning)await journal.appendPlanning({id:`${prefix}:planning`,predictionId:`${prefix}:platform`,seed:vm.planning.seed,
        candidates:vm.planning.comparisons.map(c=>({id:c.id,firstAction:c.firstAction,Ltail:c.Ltail,Lmean:c.Lmean,Nspent:c.Nspent,Eexpire:c.Eexpire})),
        selected:vm.planning.selected,alternatives:vm.planning.selected?.scenarios??[]});
      if(alive)setJournalWriteError(weekdayFailure);
    })().catch(e=>{if(alive)setJournalWriteError(String(e));});
    return()=>{alive=false;};
  },[vm,codex,live,demo,journal.appendPrediction,journal.appendWeekdayPair,journal.stopWeekdayShadow,journal.appendPlanning,journal.appendAccountMapping,journal.historyDocument]);

  return (
    <main
      data-prediction-log-state={journalWriteError ? "error" : "v3"}
      data-shell-form={form}
      data-shell-dock={dockEdge ?? "free"}
      data-shell-popped={popped ? "true" : "false"}
      style={{
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        background: "transparent",
      }}
    >
      {display !== "expanded" && form === "bar" && (
        <div
          onPointerEnter={display === "collapsed" ? onPointerEnterBar : undefined}
          onPointerLeave={display === "collapsed" ? onPointerLeaveWidget : undefined}
        >
          <CompactBar vm={vm} phase={effectivePhase} demo={demo} onExpand={activate} expandRef={expandButtonRef} />
        </div>
      )}
      {display !== "expanded" && form === "orb" && (
        <Orb
          vm={null}
          readout={v3OrbReadout(vm,metric)}
          metric={metric}
          dockEdge={dockEdge}
          popped={popped}
          orbRef={orbRef}
          onExpand={() => {
            clearTimers();
            setPopped(true);
            setForm("bar");
            formRef.current = "bar";
            setDisplay("collapsed");
          }}
          onCycleMetric={onCycleMetric}
          onDragMove={onOrbDragMove}
          onDragEnd={onOrbDragEnd}
          onPointerEnter={onOrbEnter}
          onPointerLeave={onOrbLeave}
        />
      )}
      {display === "peek" && form === "bar" && (
        <div onPointerEnter={onPointerEnterPeek} onPointerLeave={onPointerLeaveWidget} className="rr-fade-in">
          <PeekCard vm={vm} cards={personal.state.cards} sprint={personal.state.cardSprint ?? null} phase={effectivePhase} demo={demo} onOpen={activate} />
        </div>
      )}
      {display === "expanded" && (
        <DashboardPanel
          vm={vm}
          controller={personal}
          calibration={calibrationV3}
          verdictSummaries={verdictSummaries}
          weekdayCalibration={weekdayCalibration}
          phase={effectivePhase}
          readError={readError}
          logError={journal.error ?? journalWriteError ?? planningWorker.error}
          subscriptionError={subscriptionError}
          refreshing={refreshing}
          demo={demo}
          planningPending={planningWorker.pending}
          compactionNote={journal.compaction}
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
