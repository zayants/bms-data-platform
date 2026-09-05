import React, { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import QRCode from "qrcode";
import {
  Activity, AlertTriangle, BatteryCharging, BatteryMedium, BrainCircuit, Cable, CheckCircle2,
  ChartNoAxesCombined, Clock3, Gauge, Languages, LayoutDashboard, ListTree, Maximize2, Minimize2,
  Download, EyeOff, Microscope, Moon, PlugZap, Radio, RefreshCw, ScanSearch, Settings2, ShieldCheck, SlidersHorizontal, Smartphone, Sun, Thermometer, Unplug, Waves, Zap,
} from "lucide-react";
import {
  calculateCellStats,
  cancelPulseResistanceTest,
  currentPowerCorrelation,
  fetchGatewayHistory,
  fetchPulseResistanceHistory,
  fetchPulseResistanceStatus,
  GatewayClient,
  normalizeGatewayUrl,
  startPulseResistanceTest,
} from "./gateway";
import { APP_VERSION, languages, systemLanguage, translator, type Language } from "./i18n";
import { calculateSocEventCellStats, inferSocBoundaryEvents } from "./historyDiagnostics";
import { calculateBalanceDiagnostics, type BalanceDiagnostics } from "./balanceDiagnostics";
import { analyzeCellCapacity, type CellCapacityAnalysis, type EstimateConfidence } from "./cellCapacityEstimate";
import { classifyCell, type CellVisualStatus } from "./cellStatus";
import { exportHistoryWorkbook, type HistoryExportLabels } from "./historyExcelExport";
import { cellVoltageAxisRange, packVoltageAxisRange, type VoltageAxisRange } from "./voltageAxis";
import { alarmCount, isPasswordReminderAlarm, passwordReminder, unknownAlarmMask } from "./alarmState";
import { DischargeCurrentDistributionPanel } from "./DischargeCurrentDistributionPanel";
import { OperatingPointCellComparisonPanel } from "./OperatingPointCellComparisonPanel";
import { subscribeHistorySync, type HistorySyncState } from "./historySync";
import { exportHistoryDatabaseSql } from "./historyCache";
import { GATEWAY_COMPATIBILITY_ID, type GatewayCompatibilityIssue } from "./apiCompatibility";
import { comparePulseResistanceTests, pulseTestsComparable } from "./pulseResistanceDiagnostics";

const makeId = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
import type { ChargeSessionRecord, ConnectionHistoryEvent, ConnectionState, GatewaySnapshot, HistoryPoint, HistoryResponse, MonitorEvent, PulseResistanceTestResult, PulseResistanceTestStatus, SocBoundaryEvent } from "./types";
import { loadChartSettings, saveChartSettings, THRESHOLD_BOUNDS, thresholdValidationIssue, validThresholdLimits, type BmsThresholdId, type ChartDisplaySettings, type HistorySectionVisibility, type IndividualChartMetric, type ThresholdMetric } from "./chartSettings";

type Page = "overview" | "history" | "functions" | "events" | "connection" | "settings";
type AppTheme = "light" | "dark";
type IconType = typeof Activity;
type DiagnosticSettings = { showAdvanced: boolean; showGattCodes: boolean };
declare global { interface Window { bmsDesktop?: { computerUrl?: string; computerUrls?: string[] } } }
const DEFAULT_DIAGNOSTIC_SETTINGS: DiagnosticSettings = { showAdvanced: false, showGattCodes: false };
function loadDiagnosticSettings(): DiagnosticSettings { try { const value=JSON.parse(localStorage.getItem("bms-diagnostic-settings-v1")??"null"); return {showAdvanced:value?.showAdvanced===true,showGattCodes:value?.showGattCodes===true}; } catch { return DEFAULT_DIAGNOSTIC_SETTINGS; } }

const DEFAULT_GATEWAY = "http://192.168.0.188:8765";
const MONITOR_EVENTS_STORAGE_KEY = "bms-monitor-events-v1";
const HISTORY_SYNC_BANNER_DELAY_MS = 5_000;
function loadMonitorEvents(): MonitorEvent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MONITOR_EVENTS_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((event): event is MonitorEvent => {
      if (!event || typeof event !== "object") return false;
      const candidate = event as Partial<MonitorEvent>;
      return typeof candidate.id === "string" && typeof candidate.timestamp === "number" &&
        (candidate.severity === "info" || candidate.severity === "warning" || candidate.severity === "critical") &&
        typeof candidate.title === "string" && typeof candidate.details === "string";
    }).slice(0, 100);
  } catch { return []; }
}
function thresholdValidationMessage(issue: ReturnType<typeof thresholdValidationIssue>, t: ReturnType<typeof translator>): string {
  if (issue === "number") return t("thresholdInvalidNumber");
  if (issue === "range") return t("thresholdInvalidRange");
  if (issue === "order") return t("thresholdInvalidOrder");
  return t("thresholdInvalid");
}
function monitorEventKind(event: MonitorEvent): MonitorEvent["kind"] {
  if (event.kind) return event.kind;
  const title = event.title.trim().toLowerCase();
  if (["connection restored", "связь восстановлена", "зв’язок відновлено"].includes(title)) return "restored";
  if (["connection lost", "связь потеряна", "зв’язок втрачено"].includes(title)) return "lost";
  if (["bms alarm detected", "обнаружена авария bms", "виявлено аварію bms"].includes(title)) return "alarmRaised";
  if (["bms alarms cleared", "аварии bms сброшены", "аварії bms скинуто"].includes(title)) return "alarmCleared";
  return undefined;
}
function monitorEventText(event: MonitorEvent, t: ReturnType<typeof translator>): { title: string; details: string } {
  const kind = monitorEventKind(event);
  const title = kind === "restored" ? t("restored") : kind === "lost" ? t("lost") : kind === "alarmRaised" ? t("alarmRaised") : kind === "alarmCleared" ? t("alarmCleared") : event.title;
  const normalDetails = kind === "alarmCleared" && ["normal", "норма"].includes(event.details.trim().toLowerCase());
  return { title, details: normalDetails ? t("normal") : event.details };
}

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("bms-language");
    return languages.some(([code]) => code === saved) ? saved as Language : systemLanguage();
  });
  const [gatewayUrl, setGatewayUrl] = useState(() =>
    localStorage.getItem("bms-gateway-url") ?? DEFAULT_GATEWAY,
  );
  const [draftUrl, setDraftUrl] = useState(gatewayUrl);
  const [snapshot, setSnapshot] = useState<GatewaySnapshot | null>(null);
  const [transportOnline, setTransportOnline] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [compatibilityIssue, setCompatibilityIssue] = useState<GatewayCompatibilityIssue | null>(null);
  const [events, setEvents] = useState<MonitorEvent[]>(loadMonitorEvents);
  const [chargeSessions, setChargeSessions] = useState<ChargeSessionRecord[]>([]);
  const [chargeSessionsResetAt, setChargeSessionsResetAt] = useState<number>(() => Number(localStorage.getItem("bms-charge-sessions-reset-at") ?? 0));
  const [theme,setTheme]=useState<AppTheme>(()=>localStorage.getItem("bms-app-theme")==="dark"?"dark":"light");
  const [acknowledgedAlarmKey,setAcknowledgedAlarmKey]=useState<string>("");
  const [chartSettings,setChartSettings]=useState<ChartDisplaySettings>(loadChartSettings);
  const [diagnosticSettings,setDiagnosticSettings]=useState<DiagnosticSettings>(loadDiagnosticSettings);
  const [historySync,setHistorySync]=useState<HistorySyncState>({status:"idle",deviceKey:"",deviceName:"",downloadedRecords:0,phoneRecordCount:0,cachedFrom:null,cachedTo:null});
  const [showHistorySyncBanner,setShowHistorySyncBanner]=useState(false);
  const historySyncStartedAt=useRef<number | null>(null);
  const previousOnline = useRef<boolean | null>(null);
  const hasConnectedOnce = useRef(false);
  const previousAlarms = useRef<string | null>(null);
  const t = useMemo(() => translator(language), [language]);
  const currentAlarmKey = (snapshot?.alarms ?? []).join(",");

  useEffect(() => {
    localStorage.setItem("bms-language", language);
    document.documentElement.lang = language;
  }, [language]);
  useEffect(()=>saveChartSettings(chartSettings),[chartSettings]);
  useEffect(()=>localStorage.setItem("bms-diagnostic-settings-v1",JSON.stringify(diagnosticSettings)),[diagnosticSettings]);
  useEffect(()=>localStorage.setItem("bms-app-theme",theme),[theme]);
  useEffect(()=>localStorage.setItem(MONITOR_EVENTS_STORAGE_KEY,JSON.stringify(events)),[events]);
  useEffect(()=>subscribeHistorySync(setHistorySync),[]);
  useEffect(()=>{
    const isActive=historySync.status==="checking"||historySync.status==="initial"||historySync.status==="incremental";
    const requiresImmediateAttention=historySync.status==="error"||historySync.status==="unsupported";
    if(requiresImmediateAttention){
      historySyncStartedAt.current=null;
      setShowHistorySyncBanner(true);
      return;
    }
    if(!isActive){
      historySyncStartedAt.current=null;
      setShowHistorySyncBanner(false);
      return;
    }
    const startedAt=historySyncStartedAt.current??Date.now();
    historySyncStartedAt.current=startedAt;
    const remaining=Math.max(0,HISTORY_SYNC_BANNER_DELAY_MS-(Date.now()-startedAt));
    const timer=window.setTimeout(()=>setShowHistorySyncBanner(true),remaining);
    return ()=>window.clearTimeout(timer);
  },[historySync.status]);

  useEffect(() => {
    const url = normalizeGatewayUrl(gatewayUrl);
    if (!url) { setConnectionState("idle"); return; }
    setSnapshot(null);
    setCompatibilityIssue(null);
    setConnectionState("connecting");
    const client = new GatewayClient(
      url,
      (next) => {
        setSnapshot(next);
        setConnectionState(next.stale ? "stale" : next.connected ? "live" : "offline");
      },
      (online) => {
        setTransportOnline(online);
        if (!online) setConnectionState("offline");
      },
      setCompatibilityIssue,
    );
    client.start();
    return () => client.stop();
  }, [gatewayUrl]);

  useEffect(() => {
    if (compatibilityIssue) return;
    let cancelled = false;
    const load = async () => {
      const now = Date.now();
      try {
        const history = await fetchGatewayHistory(gatewayUrl, now - 365 * 24 * 60 * 60 * 1000, now, 5000);
        if (!cancelled) setChargeSessions((history.chargeSessions ?? []).filter((session) => session.startedAt >= chargeSessionsResetAt));
      } catch { if (!cancelled) setChargeSessions([]); }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [gatewayUrl, chargeSessionsResetAt, compatibilityIssue]);

  useEffect(() => {
    if (transportOnline && previousOnline.current === false && hasConnectedOnce.current) {
      addEvent({ severity: "info", kind: "restored", title: t("restored"), details: normalizeGatewayUrl(gatewayUrl) });
    } else if (!transportOnline && previousOnline.current === true) {
      addEvent({ severity: "warning", kind: "lost", title: t("lost"), details: normalizeGatewayUrl(gatewayUrl) });
    }
    if (transportOnline) hasConnectedOnce.current = true;
    previousOnline.current = transportOnline;
  }, [transportOnline]);

  useEffect(() => {
    if (!snapshot) return;
    if (previousAlarms.current !== null && currentAlarmKey !== previousAlarms.current) {
      addEvent({
        severity: currentAlarmKey ? "critical" : "info",
        kind: currentAlarmKey ? "alarmRaised" : "alarmCleared",
        title: currentAlarmKey ? t("alarmRaised") : t("alarmCleared"),
        details: currentAlarmKey || t("normal"),
      });
    }
    if (currentAlarmKey !== acknowledgedAlarmKey) setAcknowledgedAlarmKey("");
    previousAlarms.current = currentAlarmKey;
  }, [currentAlarmKey]);

  function addEvent(event: Omit<MonitorEvent, "id" | "timestamp">) {
    setEvents((current) => [{ ...event, id: makeId(), timestamp: Date.now() }, ...current].slice(0, 100));
  }

  function connect() {
    const normalized = normalizeGatewayUrl(draftUrl);
    if (!normalized) return;
    localStorage.setItem("bms-gateway-url", normalized);
    setDraftUrl(normalized);
    setGatewayUrl(normalized);
    setPage("overview");
  }

  const stateLabel = t(connectionState === "live" ? "live" : connectionState === "stale" ? "stale" : connectionState === "connecting" ? "connecting" : "offline");
  const cells = snapshot?.cellsV ?? [];
  const cellStats = calculateCellStats(cells);

  const nav: Array<[Page, IconType, string]> = [
    ["overview", LayoutDashboard, t("overview")], ["history", ChartNoAxesCombined, t("history")],
    ["functions", BrainCircuit, t("functions")],
    ["events", ListTree, t("events")], ["connection", Settings2, t("connection")],
    ["settings", SlidersHorizontal, t("settings")],
  ];

  return <div className={`app-shell theme-${theme}`}>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">B</div><div><strong>{t("appTitle")}</strong><span>{t("subtitle")}</span></div></div>
      <nav>{nav.map(([id, Icon, label]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-foot"><ShieldCheck size={18}/><span>{t("readOnly")}</span></div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div><div className="eyebrow device-name">{snapshot?.deviceName || "JK / JIKONG BMS"}</div><h1>{nav.find(([id]) => id === page)?.[2]}</h1></div>
        <div className={`live-pill ${connectionState}`}><span className="pulse"/>{stateLabel}<small>{snapshot?.ageMs != null ? `${Math.round(snapshot.ageMs / 100) / 10}s` : "—"}</small></div>
      </header>
      {connectionState !== "live" && (snapshot || historySync.deviceKey) && <StaleDataBanner t={t}/>}
      {!compatibilityIssue&&showHistorySyncBanner&&historySync.status!=="idle"&&historySync.status!=="complete"&&<HistorySyncBanner state={historySync} t={t}/>}

      {compatibilityIssue && page === "connection" && <CompatibilityBlock issue={compatibilityIssue} t={t}/>}
      {compatibilityIssue && page !== "connection" ? <CompatibilityBlock issue={compatibilityIssue} t={t} onOpenConnection={()=>setPage("connection")}/> : <>
        {page === "overview" && <Overview snapshot={snapshot} t={t} cellStats={cellStats}/>}
        {page === "history" && <HistoryPage gatewayUrl={gatewayUrl} t={t} language={language} snapshot={snapshot} cellStats={cellStats} chartSettings={chartSettings} setChartSettings={setChartSettings}/>}
        {page === "functions" && <FunctionsPage t={t} diagnosticSettings={diagnosticSettings} setDiagnosticSettings={setDiagnosticSettings} gatewayUrl={gatewayUrl} snapshot={snapshot}/>}
        {page === "events" && <EventsPage events={events} chargeSessions={chargeSessions} snapshot={snapshot} t={t} acknowledgedAlarmKey={acknowledgedAlarmKey} onAcknowledge={(key)=>setAcknowledgedAlarmKey(key)} onClearEvents={()=>setEvents([])} onClearChargeSessions={()=>{const now=Date.now();localStorage.setItem("bms-charge-sessions-reset-at",String(now));setChargeSessionsResetAt(now);}}/>}
        {page === "connection" && <ConnectionPage t={t} gatewayUrl={gatewayUrl} draftUrl={draftUrl} setDraftUrl={setDraftUrl} connect={connect} language={language} state={connectionState} snapshot={snapshot} showGattCodes={diagnosticSettings.showGattCodes}/>}
        {page === "settings" && <GraphSettingsPage t={t} settings={chartSettings} setSettings={setChartSettings} snapshot={snapshot} language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} gatewayUrl={gatewayUrl}/>}
      </>}
    </main>
  </div>;
}

function CompatibilityBlock({ issue, t, onOpenConnection }: { issue: GatewayCompatibilityIssue; t: ReturnType<typeof translator>; onOpenConnection?: () => void }) {
  return <div className="page-content compatibility-page">
    <section className="panel compatibility-blocker" role="alert" aria-live="assertive">
      <AlertTriangle size={54}/>
      <div>
        <div className="eyebrow">{t("compatibilityEyebrow")}</div>
        <h2>{t("compatibilityTitle")}</h2>
        <p>{t("compatibilityMessage")}</p>
        <dl>
          <div><dt>{t("desktopVersion")}</dt><dd>{APP_VERSION}</dd></div>
          <div><dt>{t("phoneVersion")}</dt><dd>{issue.gatewayVersion ?? "—"}</dd></div>
          <div><dt>{t("compatibilityProtocol")}</dt><dd>{issue.received ?? "—"} / {GATEWAY_COMPATIBILITY_ID}</dd></div>
        </dl>
        {onOpenConnection && <button onClick={onOpenConnection}><Cable size={18}/>{t("openConnection")}</button>}
      </div>
    </section>
  </div>;
}

function Overview({ snapshot, t, cellStats }: { snapshot: GatewaySnapshot | null; t: ReturnType<typeof translator>; cellStats: ReturnType<typeof calculateCellStats> }) {
  const [showCellLegendDetails, setShowCellLegendDetails] = useState(false);
  const current = snapshot?.currentA ?? 0;
  const mode = current > .1 ? "charging" : current < -.1 ? "discharging" : "idle";
  const soc = snapshot?.socPercent;
  const alarms = alarmCount(snapshot);
  return <div className="page-content overview-page">
    {!snapshot?.available && <div className="empty-banner"><Radio/><div><strong>{t("noData")}</strong><span>{t("connectionInfo")}</span></div></div>}
    <section className="hero-grid">
      <article className="soc-card panel">
        <div className="panel-heading"><span>{t("soc")}</span><Gauge size={20}/></div>
        <div className="soc-body"><div className="soc-number">{soc ?? "—"}<small>{soc == null ? "" : "%"}</small></div><div className="battery-track"><div className="battery-fill" style={{width:`${soc ?? 0}%`}}/></div><div className="capacity-row"><span>{t("remaining")}</span><strong>{format(snapshot?.remainingCapacityAh, 1, "Ah")}</strong></div><div className="capacity-row"><span>{t("nominalCapacity")}</span><strong>{format(snapshot?.nominalCapacityAh ?? snapshot?.fullCapacityAh, 1, "Ah")}</strong></div><div className="capacity-row"><span>{t("chemistry")}</span><strong>{snapshot?.chemistry ?? "—"}</strong></div></div>
      </article>
      <div className="metric-grid primary-metrics">
        <Metric icon={Zap} label={t("power")} value={signed(snapshot?.powerW, 0, "W")} accent/>
        <Metric icon={Activity} label={t("current")} value={signed(snapshot?.currentA, 1, "A")}/>
        <Metric icon={BatteryCharging} label={t("voltage")} value={format(snapshot?.packVoltageV, 2, "V")}/>
        <Metric icon={Clock3} label={t("eta")} value={formatDuration(snapshot?.estimatedRemainingMinutes)}/>
      </div>
    </section>

    <section className="metric-grid secondary-metrics">
      <Metric icon={Thermometer} label={t("temp")} value={format(snapshot?.temperatureC, 1, "°C")}/>
      <Metric icon={Waves} label={t("imbalance")} value={snapshot?.deltaMv == null ? "—" : `${snapshot.deltaMv} mV`} warning={(snapshot?.deltaMv ?? 0) > 20}/>
      <Metric icon={Activity} label={t("balance")} value={snapshot?.balancing ? "ON" : "OFF"}/>
      <Metric icon={AlertTriangle} label={t("alarms")} value={`${alarms}`} warning={alarms > 0}/>
      <Metric icon={BatteryCharging} label={t("chargeSession")} value={format(snapshot?.chargeSessionAh ?? undefined, 2, "Ah")} accent={snapshot?.chargeSessionActive === true}/>
      <Metric icon={BatteryCharging} label={t("chargeChannel")} value={snapshot?.chargeMosEnabled == null ? "—" : snapshot.chargeMosEnabled ? t("chargeOn") : t("chargeOff")} accent={snapshot?.chargeMosEnabled === true}/>
    </section>

    <section className="panel flow-panel">
      <div className="panel-heading"><span>{t("energyFlow")}</span><b className={`mode ${mode}`}>{t(mode)}</b></div>
      <div className={`energy-flow ${mode}`}>
        <FlowNode className="source-node" icon={PlugZap} title={t("source")} detail={current > .1 ? signed(current,1,"A") : "—"} active={mode === "charging"}/>
        <FlowLine className="source-link" active={mode === "charging"} direction="charge" flowDirection="right"/>
        <FlowNode className="bms-node" icon={ShieldCheck} title={t("physicalBms")} detail={snapshot?.deviceName || "—"} active/>
        <FlowLine className="battery-link" active={mode !== "idle"} direction={mode === "charging" ? "charge" : "discharge"} flowDirection={mode === "discharging" ? "left" : "right"}/>
        <FlowNode className="battery-node" icon={BatteryMedium} title={t("battery")} detail={soc == null ? "—" : `${soc}%`} active={mode !== "idle"}/>
        <FlowLine className="load-link" active={mode === "discharging"} direction="discharge" flowDirection="down" vertical/>
        <FlowNode className="load-node" icon={Cable} title={t("load")} detail={current < -.1 ? signed(current,1,"A") : "—"} active={mode === "discharging"}/>
      </div>
    </section>

    <section className="panel cells-strip-panel">
      <div className="panel-heading"><span>{t("cellVoltage")}</span><small>{snapshot?.cellsV?.length ?? 0}S · Δ {cellStats.deltaMv ?? "—"} mV</small></div>
      {snapshot&&<><div className="cell-status-legend"><div className="cell-status-legend-items"><span className="normal">{t("cellNormal")}</span><span className="warning">{t("cellWarning")}</span><span className="critical">{t("cellCritical")}</span><span className="balancing">{t("cellBalancingEstimated")}</span></div><button type="button" onClick={()=>setShowCellLegendDetails(value=>!value)} aria-expanded={showCellLegendDetails}>{showCellLegendDetails?t("cellLegendDetailsClose"):t("cellLegendDetailsButton")}</button></div>{showCellLegendDetails&&<div className="cell-status-details"><strong>{t("cellLegendDetailsTitle")}</strong><p>{t("cellLegendDetailsText")}</p></div>}</>}
      <div className="cells-strip">{(snapshot?.cellsV ?? []).map((v,i)=><CellMini key={i} index={i} voltage={v} status={classifyCell(snapshot!,i)} t={t}/>)}</div>
    </section>
  </div>;
}

function CellsOverview({ snapshot, t, cellStats }: { snapshot: GatewaySnapshot | null; t: ReturnType<typeof translator>; cellStats: ReturnType<typeof calculateCellStats> }) {
  return <>
    <section className="metric-grid cell-stats">
      <Metric icon={BatteryMedium} label={t("minCell")} value={cellStats.min == null ? "—" : `C${cellStats.minIndex+1} · ${cellStats.min.toFixed(3)} V`} warning/>
      <Metric icon={BatteryCharging} label={t("maxCell")} value={cellStats.max == null ? "—" : `C${cellStats.maxIndex+1} · ${cellStats.max.toFixed(3)} V`}/>
      <Metric icon={Activity} label={t("average")} value={format(cellStats.average ?? undefined,3,"V")}/>
      <Metric icon={Waves} label={t("delta")} value={cellStats.deltaMv == null?"—":`${cellStats.deltaMv} mV`} warning={(cellStats.deltaMv??0)>20}/>
    </section>
    <div className="resistance-info"><AlertTriangle/><div><strong>{t("estimatedResistance")}</strong><span>{t("resistanceHint")}</span></div></div>
    <section className="panel cells-detail-panel"><div className="panel-heading"><span>{t("cellsOverview")}</span><small>{snapshot?.cellsV?.length ?? 0}S</small></div>
      <div className="cells-grid">{(snapshot?.cellsV ?? []).map((voltage,index)=><CellDetail key={index} index={index} voltage={voltage} resistance={snapshot?.cellResistanceMOhm?.[index]} average={cellStats.average ?? voltage} state={index===cellStats.minIndex?"min":index===cellStats.maxIndex?"max":"normal"} t={t}/>)}</div>
    </section>
  </>;
}

type HistoryPeriod = "hour" | "day" | "week" | "month" | "year";
type HistoryMetric = "packVoltageV" | "currentA" | "chargeCurrentA" | "dischargeCurrentA" | "powerW" | "socPercent" | "temperatureC" | "deltaMv";

type HistorySeries = {
  id: HistoryMetric;
  title: string;
  unit: string;
  color: string;
  decimals: number;
  thresholdMetric: ThresholdMetric | null;
  value: (point: HistoryPoint) => number;
  directionalColors?: { positive: string; negative: string };
};

type SignedHistoryMetric = "currentA" | "powerW";
type DirectionalColors = { positive: string; negative: string };
type ChartMarker = { id: string; timestamp: number; visible: boolean };

function seriesColorForValue(series: HistorySeries, value: number): string {
  return value < 0 ? series.directionalColors?.negative ?? series.color : series.directionalColors?.positive ?? series.color;
}

function HistorySyncBanner({state,t}:{state:HistorySyncState;t:ReturnType<typeof translator>}) {
  const initial=state.status==="initial",incremental=state.status==="incremental";
  const percent=state.phoneRecordCount>0?Math.min(100,state.downloadedRecords/state.phoneRecordCount*100):0;
  const title=t(initial?"historyInitialSync":incremental?"historyIncrementalSync":state.status==="checking"?"historySyncChecking":state.status==="unsupported"?"historySyncUnsupported":"historySyncError");
  const detail=initial?`${state.downloadedRecords.toLocaleString()} / ${state.phoneRecordCount.toLocaleString()} · ${percent.toFixed(1)}%`:incremental?`${state.downloadedRecords.toLocaleString()} ${t("recordedSamples")}`:state.status==="checking"?t("historySyncCheckingHint"):state.error??t("historySyncLegacy");
  return <section className={`history-sync-banner ${state.status}`}><RefreshCw className={initial||incremental||state.status==="checking"?"spin":""}/><div><strong>{title}</strong><span>{detail}</span>{(initial||incremental)&&<i><b style={{width:`${percent}%`}}/></i>}</div></section>;
}

function StaleDataBanner({t}:{t:ReturnType<typeof translator>}) {
  return <section className="stale-data-banner" role="status"><Clock3/><div><strong>{t("historyDataStale")}</strong><span>{t("historyDataStaleHint")}</span></div></section>;
}

const DEFAULT_SIGNED_COLORS: Record<SignedHistoryMetric, DirectionalColors> = {
  currentA: { positive: "#0e8e55", negative: "#d80712" },
  powerW: { positive: "#168447", negative: "#b40811" },
};

function loadSignedColors(): Record<SignedHistoryMetric, DirectionalColors> {
  try {
    const saved = JSON.parse(localStorage.getItem("bms-history-signed-colors") ?? "{}");
    return Object.fromEntries(Object.entries(DEFAULT_SIGNED_COLORS).map(([id, fallback]) => [id, {
      positive: typeof saved[id]?.positive === "string" ? saved[id].positive : fallback.positive,
      negative: typeof saved[id]?.negative === "string" ? saved[id].negative : fallback.negative,
    }])) as Record<SignedHistoryMetric, DirectionalColors>;
  } catch { return structuredClone(DEFAULT_SIGNED_COLORS); }
}

function splitSignedPaths<T>(points: T[], value: (point: T) => number, x: (point: T) => number, y: (value: number) => number) {
  const positive: Array<{ line: string; area: string }> = [];
  const negative: Array<{ line: string; area: string }> = [];
  for (let index = 1; index < points.length; index += 1) {
    const before = value(points[index - 1]);
    const after = value(points[index]);
    if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
    const x0 = x(points[index - 1]), x1 = x(points[index]);
    const add = (target: Array<{ line: string; area: string }>, fromX: number, fromY: number, toX: number, toY: number) => {
      const line = `M${fromX.toFixed(1)},${fromY.toFixed(1)} L${toX.toFixed(1)},${toY.toFixed(1)}`;
      target.push({ line, area: `${line} L${toX.toFixed(1)},${y(0).toFixed(1)} L${fromX.toFixed(1)},${y(0).toFixed(1)} Z` });
    };
    if ((before >= 0) === (after >= 0)) {
      add(before >= 0 ? positive : negative, x0, y(before), x1, y(after));
      continue;
    }
    const ratio = Math.abs(before) / (Math.abs(before) + Math.abs(after));
    const crossingX = x0 + (x1 - x0) * ratio;
    add(before >= 0 ? positive : negative, x0, y(before), crossingX, y(0));
    add(after >= 0 ? positive : negative, crossingX, y(0), x1, y(after));
  }
  return { positive, negative };
}

function SignedColorInputs({series,t,onChange}:{series:HistorySeries;t:ReturnType<typeof translator>;onChange:(direction:keyof DirectionalColors,color:string)=>void}) {
  if (!series.directionalColors) return null;
  return <span className="signed-color-controls"><label title={`${t("charging")}: ${t("curveColor")}`}><b>+</b><input type="color" value={series.directionalColors!.positive} aria-label={`${t("charging")}: ${t("curveColor")} · ${series.title}`} onChange={(event)=>onChange("positive",event.target.value)}/></label><label title={`${t("discharging")}: ${t("curveColor")}`}><b>−</b><input type="color" value={series.directionalColors!.negative} aria-label={`${t("discharging")}: ${t("curveColor")} · ${series.title}`} onChange={(event)=>onChange("negative",event.target.value)}/></label></span>;
}

type TimeViewport = {
  baseFrom:number;
  baseTo:number;
  from:number;
  to:number;
  setRange:(from:number,to:number)=>void;
  reset:()=>void;
};

type DragZoomSelection = {
  pointerId:number;
  startX:number;
  currentX:number;
  left:number;
  width:number;
  top:number;
  height:number;
};

type ChartThreshold = {
  id:string;
  metric:ThresholdMetric;
  value:number;
  label:string;
  source:"bms"|"custom";
  level:"warning"|"critical";
  description?:string;
  lineType?:string;
  color?:string;
};

type BmsThresholdReference = { id?:BmsThresholdId; label:string; value:number; unit:string };

function bmsThresholdReferences(metric:ThresholdMetric,protection:GatewaySnapshot["protectionSettings"],t:ReturnType<typeof translator>):BmsThresholdReference[]{
  if(!protection)return [];
  const value=(id:BmsThresholdId,label:string,raw:number|undefined,unit:string)=>Number.isFinite(raw)?[{id,label,value:raw!,unit}]:[];
  if(metric==="cellVoltageV")return [
    ...value("soc-0",t("bmsSoc0Voltage"),protection.soc0VoltageV,"V"),...value("soc-100",t("bmsSoc100Voltage"),protection.soc100VoltageV,"V"),
    ...value("balance-start",t("bmsBalanceStartVoltage"),protection.balanceStartVoltageV,"V"),...value("system-power-off",t("bmsSystemPowerOffVoltage"),protection.systemPowerOffVoltageV,"V"),
    ...value("cell-uvp",t("bmsCellUvp"),protection.cellUnderVoltageProtectionV,"V"),...value("cell-uvp-recovery",t("bmsCellUvpRecovery"),protection.cellUnderVoltageRecoveryV,"V"),
    ...value("cell-ovp",t("bmsCellOvp"),protection.cellOverVoltageProtectionV,"V"),...value("cell-ovp-recovery",t("bmsCellOvpRecovery"),protection.cellOverVoltageRecoveryV,"V"),
  ];
  if(metric==="temperatureC")return [
    ...value("charge-temp",t("bmsChargeTemperature"),protection.chargeOverTemperatureC,"°C"),...value("charge-temp-recovery",t("bmsChargeRecovery"),protection.chargeOverTemperatureRecoveryC,"°C"),
    ...value("discharge-temp",t("bmsDischargeTemperature"),protection.dischargeOverTemperatureC,"°C"),...value("discharge-temp-recovery",t("bmsDischargeRecovery"),protection.dischargeOverTemperatureRecoveryC,"°C"),
  ];
  if(metric==="deltaMv")return value("balance-trigger",t("bmsBalanceTriggerDelta"),protection.balanceTriggerDeltaV*1000,"mV");
  if(metric==="currentA")return [
    ...value("charge-current",t("bmsChargeCurrentLimit"),protection.chargeOverCurrentProtectionA,"A"),
    ...value("discharge-current",t("bmsDischargeCurrentLimit"),protection.dischargeOverCurrentProtectionA == null ? undefined : -protection.dischargeOverCurrentProtectionA,"A"),
  ];
  return [];
}

function chartThresholds(settings:ChartDisplaySettings,snapshot:GatewaySnapshot|null,t:ReturnType<typeof translator>):ChartThreshold[]{
  const result:ChartThreshold[]=[];
  const protection=snapshot?.protectionSettings;
  if(settings.showBmsThresholds&&protection){
    const add=(id:BmsThresholdId,metric:ThresholdMetric,value:number|undefined,label:string,level:"warning"|"critical")=>{
      const display=settings.bmsThresholdDisplay[id];
      if(display.visible&&Number.isFinite(value))result.push({id:`bms-${id}`,metric,value:value!,label,color:display.color,source:"bms",level});
    };
    add("soc-0","cellVoltageV",protection.soc0VoltageV,t("bmsSoc0Voltage"),"warning");
    add("soc-100","cellVoltageV",protection.soc100VoltageV,t("bmsSoc100Voltage"),"warning");
    add("balance-start","cellVoltageV",protection.balanceStartVoltageV,t("bmsBalanceStartVoltage"),"warning");
    add("system-power-off","cellVoltageV",protection.systemPowerOffVoltageV,t("bmsSystemPowerOffVoltage"),"critical");
    add("cell-uvp","cellVoltageV",protection.cellUnderVoltageProtectionV,t("bmsCellUvp"),"critical");
    add("cell-uvp-recovery","cellVoltageV",protection.cellUnderVoltageRecoveryV,t("bmsCellUvpRecovery"),"warning");
    add("cell-ovp","cellVoltageV",protection.cellOverVoltageProtectionV,t("bmsCellOvp"),"critical");
    add("cell-ovp-recovery","cellVoltageV",protection.cellOverVoltageRecoveryV,t("bmsCellOvpRecovery"),"warning");
    add("balance-trigger","deltaMv",protection.balanceTriggerDeltaV*1000,t("bmsBalanceTriggerDelta"),"warning");
    add("charge-temp","temperatureC",protection.chargeOverTemperatureC,t("bmsChargeTemperature"),"critical");
    add("charge-temp-recovery","temperatureC",protection.chargeOverTemperatureRecoveryC,t("bmsChargeRecovery"),"warning");
    add("discharge-temp","temperatureC",protection.dischargeOverTemperatureC,t("bmsDischargeTemperature"),"critical");
    add("discharge-temp-recovery","temperatureC",protection.dischargeOverTemperatureRecoveryC,t("bmsDischargeRecovery"),"warning");
    add("charge-current","currentA",protection.chargeOverCurrentProtectionA,t("bmsChargeCurrentLimit"),"critical");
    add("discharge-current","currentA",protection.dischargeOverCurrentProtectionA == null ? undefined : -protection.dischargeOverCurrentProtectionA,t("bmsDischargeCurrentLimit"),"critical");
  }
  if(settings.showCustomThresholds){
    for(const [metric,limits] of Object.entries(settings.customThresholds) as Array<[ThresholdMetric,{low:number|null;high:number|null}]>){
      if(!settings.customThresholdVisibility[metric])continue;
      if(limits.low!=null)result.push({id:`custom-${metric}-low`,metric,value:limits.low,label:`${t("customThreshold")} · ${t("lowerThreshold")}`,description:t("customLowerThresholdHint"),lineType:t("thresholdLegendLine"),color:settings.customThresholdColors[metric].low,source:"custom",level:"warning"});
      if(limits.high!=null)result.push({id:`custom-${metric}-high`,metric,value:limits.high,label:`${t("customThreshold")} · ${t("upperThreshold")}`,description:t("customUpperThresholdHint"),lineType:t("thresholdLegendLine"),color:settings.customThresholdColors[metric].high,source:"custom",level:"critical"});
    }
  }
  return result;
}

function FunctionsPage({t,diagnosticSettings,setDiagnosticSettings,gatewayUrl,snapshot}:{t:ReturnType<typeof translator>;diagnosticSettings:DiagnosticSettings;setDiagnosticSettings:(value:DiagnosticSettings)=>void;gatewayUrl:string;snapshot:GatewaySnapshot|null}) {
  const entries:Array<{icon:IconType;title:string;description:string;available:boolean}>=[
    {icon:Gauge,title:t("socBoundaryFunction"),description:t("socBoundaryFunctionHint"),available:true},
    {icon:Activity,title:t("resistanceFunction"),description:t("resistanceFunctionHint"),available:true},
    {icon:Radio,title:t("connectionFunction"),description:t("connectionFunctionHint"),available:true},
    {icon:ScanSearch,title:t("thresholdFunction"),description:t("thresholdFunctionHint"),available:true},
    {icon:Waves,title:t("balanceBehaviourFunction"),description:t("balanceBehaviourFunctionHint"),available:true},
    {icon:BatteryCharging,title:t("cellEnergyFunction"),description:t("cellEnergyFunctionHint"),available:true},
    {icon:Zap,title:t("chargeSessionFunction"),description:t("chargeSessionFunctionHint"),available:true},
    {icon:Gauge,title:t("workingCurrentFunction"),description:t("workingCurrentFunctionHint"),available:true},
    {icon:Microscope,title:t("operatingPointTitle"),description:t("operatingPointFunctionHint"),available:true},
    {icon:Microscope,title:t("cellHealthFunction"),description:t("cellHealthFunctionHint"),available:false},
    {icon:BrainCircuit,title:t("anomalyFunction"),description:t("anomalyFunctionHint"),available:false},
  ];
  return <div className="page-content functions-page">
    <section className="panel functions-intro"><div className="functions-intro-icon"><BrainCircuit/></div><div><span>{t("diagnosticCenter")}</span><h2>{t("functionsTitle")}</h2><p>{t("functionsIntro")}</p></div></section>
    <PulseResistancePanel t={t} gatewayUrl={gatewayUrl} snapshot={snapshot}/>
    <section className="panel function-controls"><SettingsToggle label={t("advancedDiagnostics")} detail={t("advancedDiagnosticsHint")} checked={diagnosticSettings.showAdvanced} onChange={(value)=>setDiagnosticSettings({...diagnosticSettings,showAdvanced:value,showGattCodes:value?diagnosticSettings.showGattCodes:false})}/><SettingsToggle label={t("showGattCodes")} detail={t("showGattCodesHint")} checked={diagnosticSettings.showGattCodes} onChange={(value)=>setDiagnosticSettings({...diagnosticSettings,showAdvanced:true,showGattCodes:value})}/></section>
    <section className="function-grid" aria-label={t("functionsTitle")}>{entries.map(({icon:Icon,title,description,available})=><article className={`panel function-card ${available?"available":"planned"}`} key={title}><div className="function-card-top"><div className="function-icon"><Icon/></div><span>{t(available?"functionAvailable":"functionPlanned")}</span></div><h3>{title}</h3><p>{description}</p></article>)}</section>
    {diagnosticSettings.showAdvanced&&<section className="panel diagnostic-method"><div className="panel-heading"><span>{t("diagnosticMethod")}</span><small>{t("diagnosticReadOnly")}</small></div><p>{t("diagnosticMethodIntro")}</p><ol><li>{t("methodStep1")}</li><li>{t("methodStep2")}</li><li>{t("methodStep3")}</li><li>{t("methodStep4")}</li></ol></section>}
    <section className="panel functions-safety"><ShieldCheck/><div><strong>{t("diagnosticReadOnly")}</strong><span>{t("diagnosticReadOnlyHint")}</span></div></section>
  </div>;
}

function PulseResistancePanel({t,gatewayUrl,snapshot}:{t:ReturnType<typeof translator>;gatewayUrl:string;snapshot:GatewaySnapshot|null}) {
  const [status,setStatus]=useState<PulseResistanceTestStatus|null>(null);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [targetSoc,setTargetSoc]=useState(50);
  const [socTolerance,setSocTolerance]=useState(3);
  const [minimumCurrent,setMinimumCurrent]=useState(3);
  const [confirmed,setConfirmed]=useState(false);
  const [requestError,setRequestError]=useState(false);
  useEffect(()=>{
    let active=true;
    const load=async()=>{try{const next=await fetchPulseResistanceStatus(gatewayUrl,{targetSoc,socTolerance,minimumCurrent});if(active){setStatus(next);setRequestError(false);}}catch{if(active)setRequestError(true);}};
    void load();
    const timer=window.setInterval(load,1200);
    return()=>{active=false;window.clearInterval(timer);};
  },[gatewayUrl,targetSoc,socTolerance,minimumCurrent]);
  const start=async()=>{setRequestError(false);try{setStatus(await startPulseResistanceTest(gatewayUrl,{targetSoc,socTolerance,minimumCurrent}));}catch(error){const next=(error as {status?:PulseResistanceTestStatus}).status;if(next)setStatus(next);setRequestError(true);}};
  const cancel=async()=>{setRequestError(false);try{setStatus(await cancelPulseResistanceTest(gatewayUrl));}catch{setRequestError(true);}};
  const readiness=status?pulseStatusText(status.readiness,t):t("pulseStatusUnavailable");
  const result=status?.result;
  return <section className="panel pulse-resistance-panel">
    <div className="pulse-resistance-heading"><div><span>{t("pulseEyebrow")}</span><h2>{t("pulseTitle")}</h2><p>{t("pulseIntro")}</p></div><div className="pulse-heading-actions"><button type="button" onClick={()=>setDetailsOpen(value=>!value)} aria-expanded={detailsOpen}>{detailsOpen?t("resistanceDetailsClose"):t("resistanceDetails")}</button><Microscope/></div></div>
    {detailsOpen&&<div className="pulse-algorithm-details">
      <div><strong>{t("pulseAlgorithmTitle")}</strong><p>{t("pulseAlgorithmIntro")}</p></div>
      <ol><li>{t("pulseAlgorithmStep1")}</li><li>{t("pulseAlgorithmStep2")}</li><li>{t("pulseAlgorithmStep3")}</li><li>{t("pulseAlgorithmStep4")}</li><li>{t("pulseAlgorithmStep5")}</li><li>{t("pulseAlgorithmStep6")}</li><li>{t("pulseAlgorithmStep7")}</li></ol>
      <div className="pulse-algorithm-notes"><p><strong>R = |ΔV / ΔI|</strong> · {t("pulseAlgorithmFormula")}</p><p>{t("pulseAlgorithmQuality")}</p></div>
    </div>}
    <div className="pulse-safety"><AlertTriangle/><div><strong>{t("pulseExperimental")}</strong><span>{t("pulseSafety")}</span></div></div>
    <div className="pulse-layout">
      <div className="pulse-controls">
        <label><strong>{t("pulseTargetSoc")}</strong><span><input type="number" min="5" max="95" value={targetSoc} onChange={e=>setTargetSoc(Number(e.target.value))}/><b>%</b></span></label>
        <label><strong>{t("pulseSocTolerance")}</strong><span><input type="number" min="1" max="15" value={socTolerance} onChange={e=>setSocTolerance(Number(e.target.value))}/><b>±%</b></span></label>
        <label><strong>{t("pulseMinimumCurrent")}</strong><span><input type="number" min="1" max="100" step="0.5" value={minimumCurrent} onChange={e=>setMinimumCurrent(Number(e.target.value))}/><b>A</b></span></label>
      </div>
      <div className="pulse-state">
        <div className={`pulse-state-strip ${status?.armed?"ready":"locked"}`}><strong>{status?.armed?t("pulseArmed"):t("pulseLocked")}</strong><span>{readiness}</span></div>
        <div className="pulse-progress"><i style={{width:`${status?.progressPercent??0}%`}}/></div>
        <small>{t("pulsePhoneArmHint")}</small>
      </div>
    </div>
    <label className="pulse-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>{t("pulseConfirm")}</span></label>
    {requestError&&<div className="threshold-validation-error">{t("pulseRequestError")}</div>}
    <div className="pulse-actions"><button type="button" onClick={()=>void start()} disabled={!confirmed||!status?.armed||status.readiness!=="ready"||status.active||snapshot?.connected!==true}>{t("pulseStart")}</button><button type="button" className="secondary" onClick={()=>void cancel()} disabled={!status?.active}>{t("pulseCancel")}</button></div>
    {result&&<div className="pulse-result">
      <div className="pulse-result-summary"><span>{t("pulseCompletedAt")}<strong>{new Date(result.completedAt).toLocaleString()}</strong></span><span>{t("pulseCurrentSequence")}<strong>{result.baselineCurrentA.toFixed(2)} → {result.interruptedCurrentA.toFixed(2)} → {result.restoredCurrentA?.toFixed(2)??"—"} A</strong></span><span>{t("soc")}<strong>{result.socPercent}%</strong></span><span>{t("temp")}<strong>{result.temperatureC.toFixed(1)} °C</strong></span></div>
      <div className="pulse-cell-grid">{result.cells.map(cell=><article className={`pulse-cell ${cell.quality.toLowerCase()}`} key={cell.index}><span>C{cell.index}</span><strong>{cell.estimateMOhm==null?"—":`${cell.estimateMOhm.toFixed(2)} mΩ`}</strong><div className="pulse-cell-edges"><span>{t("pulseOffEdge")}: {cell.fallingEdgeMOhm==null?"—":`${cell.fallingEdgeMOhm.toFixed(2)} mΩ`}</span><span>{t("pulseOnEdge")}: {cell.returnEdgeMOhm==null?"—":`${cell.returnEdgeMOhm.toFixed(2)} mΩ`}</span></div><small>{cell.quality==="HIGH"?t("pulseQualityHigh"):cell.quality==="MEDIUM"?t("pulseQualityMedium"):t("pulseQualityRejected")}</small></article>)}</div>
      <p className="pulse-result-note">{t("pulseResultLimit")}</p>
    </div>}
    <PulseResistanceHistory gatewayUrl={gatewayUrl} currentResult={result??null} t={t}/>
  </section>;
}

function PulseResistanceHistory({gatewayUrl,currentResult,t}:{gatewayUrl:string;currentResult:PulseResistanceTestResult|null;t:ReturnType<typeof translator>}) {
  const [records,setRecords]=useState<PulseResistanceTestResult[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const load=async()=>{
    try {
      const response=await fetchPulseResistanceHistory(gatewayUrl,500);
      setRecords(response.records);
      setError(false);
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(()=>{
    setLoading(true);
    void load();
    const timer=window.setInterval(()=>void load(),15_000);
    return()=>window.clearInterval(timer);
  },[gatewayUrl,currentResult?.completedAt]);
  const visibleRecords=useMemo(()=>{
    if(!currentResult||records.some(record=>record.completedAt===currentResult.completedAt))return records;
    return [...records,currentResult];
  },[records,currentResult]);
  const comparison=useMemo(()=>comparePulseResistanceTests(visibleRecords),[visibleRecords]);
  const anomalyCount=comparison.cells.filter(cell=>cell.severity==="warning"||cell.severity==="critical").length;
  const date=(timestamp:number|null|undefined)=>timestamp?new Date(timestamp).toLocaleString():"—";
  const signed=(value:number|null)=>value==null?"—":`${value>=0?"+":""}${value.toFixed(1)}%`;
  return <div className="pulse-history">
    <div className="pulse-history-heading"><div><span>{t("pulseHistoryEyebrow")}</span><h3>{t("pulseHistoryTitle")}</h3><p>{t("pulseHistoryIntro")}</p></div><button type="button" onClick={()=>void load()} disabled={loading}><RefreshCw/>{t("refresh")}</button></div>
    {error&&records.length===0?<div className="pulse-history-empty error"><AlertTriangle/><span>{t("pulseHistoryUnavailable")}</span></div>:comparison.records.length<2?<div className="pulse-history-empty"><Clock3/><span>{loading?t("pulseHistoryLoading"):t("pulseHistoryNeedTests")}</span></div>:<>
      <div className="pulse-history-summary"><span>{t("pulseHistoryTests")}<strong>{comparison.records.length}</strong></span><span>{t("pulseHistoryComparable")}<strong>{comparison.comparableCount}</strong></span><span>{t("pulseHistoryBaseline")}<strong>{date(comparison.baseline?.completedAt)}</strong></span><span className={anomalyCount?"alert":""}>{t("pulseHistoryAnomalies")}<strong>{anomalyCount}</strong></span></div>
      {!comparison.baseline&&<div className="pulse-history-notice"><AlertTriangle/><span>{t("pulseHistoryNoComparable")}</span></div>}
      <div className="pulse-trend-grid">{comparison.cells.map(cell=><article key={cell.index} className={`pulse-trend-cell ${cell.severity}`}><div><strong>C{cell.index}</strong><span>{cell.latestMOhm==null?"—":`${cell.latestMOhm.toFixed(2)} mΩ`}</span></div><dl><div><dt>{t("pulseFromFirst")}</dt><dd>{signed(cell.changeFromBaselinePercent)}</dd></div><div><dt>{t("pulseFromPrevious")}</dt><dd>{signed(cell.changeFromPreviousPercent)}</dd></div></dl><small>{cell.severity==="critical"?t("pulseAnomalyCritical"):cell.severity==="warning"?t("pulseAnomalyWarning"):cell.severity==="normal"?t("normal"):t("pulseNotComparable")}</small></article>)}</div>
      <div className="pulse-history-table"><table><thead><tr><th>{t("pulseHistoryDate")}</th><th>SOC</th><th>{t("temp")}</th><th>{t("current")}</th><th>{t("cells")}</th><th>{t("pulseHistoryCondition")}</th></tr></thead><tbody>{[...comparison.records].reverse().slice(0,20).map(record=><tr key={record.completedAt}><td>{date(record.completedAt)}</td><td>{record.socPercent}%</td><td>{record.temperatureC.toFixed(1)} °C</td><td>{record.baselineCurrentA.toFixed(2)} A</td><td>{record.cells.filter(cell=>cell.estimateMOhm!=null).length}/{record.cells.length}</td><td>{record===comparison.latest||comparison.latest&&pulseTestsComparable(record,comparison.latest)?t("pulseComparable"):t("pulseDifferentConditions")}</td></tr>)}</tbody></table></div>
      <p className="pulse-history-limit">{t("pulseHistoryLimit")}</p>
    </>}
  </div>;
}

function pulseStatusText(reason:string,t:ReturnType<typeof translator>):string {
  const keys:Record<string,Parameters<typeof t>[0]>={
    charge_mos_control_unsupported:"pulseMosUnsupported",
    ready:"pulseReady",not_armed:"pulseLocked",no_live_data:"pulseNoLiveData",charge_mos_state_unsupported:"pulseMosUnsupported",charge_mos_already_off:"pulseMosAlreadyOff",charge_current_not_positive:"pulseCurrentNotPositive",charge_current_too_low:"pulseCurrentLow",soc_outside_window:"pulseSocOutside",temperature_outside_window:"pulseTemperatureOutside",unsupported_cell_count:"pulseCellsUnsupported",balancing_active:"pulseBalancingActive",critical_alarm:"pulseCriticalAlarm",near_low_protection:"pulseNearProtection",near_high_protection:"pulseNearProtection",collecting_stability:"pulseCollecting",telemetry_gap:"pulseTelemetryGap",conditions_changed:"pulseConditionsChanged",current_unstable:"pulseCurrentUnstable",temperature_unstable:"pulseTemperatureUnstable",waiting_stability:"pulseCollecting",switching_charge_off:"pulseSwitchingOff",restoring_charge:"pulseRestoring",waiting_return_edge:"pulseReturnEdge",completed:"pulseCompleted",completed_one_edge:"pulseCompletedOneEdge",stability_timeout:"pulseStabilityTimeout",off_transition_timeout:"pulseOffTimeout",restore_write_failed:"pulseRestoreRequired",connection_lost_restore_required:"pulseRestoreRequired",cancelled:"pulseCancelled",cancelled_restored:"pulseCancelled",
  };
  return t(keys[reason]??"pulseStatusUnavailable");
}

function BalanceDiagnosticsPanel({gatewayUrl,language,t,onHide}:{gatewayUrl:string;language:Language;t:ReturnType<typeof translator>;onHide:()=>void}) {
  const [diagnostics,setDiagnostics]=useState<BalanceDiagnostics|null>(null);
  const [loading,setLoading]=useState(true);
  const [detailsOpen,setDetailsOpen]=useState(false);
  useEffect(()=>{
    let active=true;
    const load=async()=>{setLoading(true);try{const to=Date.now();const history=await fetchGatewayHistory(gatewayUrl,to-365*24*60*60_000,to,5000);if(active)setDiagnostics(calculateBalanceDiagnostics(history.points,to));}catch{if(active)setDiagnostics(null);}finally{if(active)setLoading(false);}};
    void load();
    return()=>{active=false;};
  },[gatewayUrl]);
  const cells=diagnostics?.cells??[];
  const chartDiagnostics=diagnostics??{sessionCount:0,opportunityHours:0,monthStarts:[],monthLabels:[],cells:[]};
  return <section className="panel balance-diagnostics-panel">
    <div className="balance-diagnostics-header"><div><span>{t("balanceAnalyticsEyebrow")}</span><h2>{t("balanceAnalyticsTitle")}</h2><p>{t("balanceAnalyticsIntro")}</p></div><div className="balance-heading-actions"><button type="button" className="hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("balanceAnalyticsTitle")}`}><EyeOff/></button><button type="button" onClick={()=>setDetailsOpen((value)=>!value)} aria-expanded={detailsOpen}>{detailsOpen?t("resistanceDetailsClose"):t("resistanceDetails")}</button></div></div>
    {detailsOpen&&<div className="balance-method-details"><strong>{t("balanceMethodTitle")}</strong><ol><li>{t("balanceMethod1")}</li><li>{t("balanceMethod2")}</li><li>{t("balanceMethod3")}</li><li>{t("balanceMethod4")}</li></ol><p>{t("balanceMethodLimit")}</p></div>}
    <div className="balance-diagnostics-summary"><span>{t("balanceSessions")}<strong>{diagnostics?.sessionCount??"—"}</strong></span><span>{t("balanceOpportunity")}<strong>{diagnostics?`${diagnostics.opportunityHours.toFixed(1)} h`:"—"}</strong></span></div>
    {loading?<div className="balance-diagnostics-empty"><RefreshCw className="spin"/>{t("loadingHistory")}</div>:<>{cells.length===0&&<div className="balance-diagnostics-empty compact"><ChartNoAxesCombined/>{t("balanceNoData")}</div>}<div className="balance-chart-grid">
      <BalanceBarChart title={t("balanceFrequency")} values={cells.map((cell)=>cell.frequencyPct)} unit="%"/>
      <BalanceBarChart title={t("balanceDuty")} values={cells.map((cell)=>cell.dutyPct)} unit="%"/>
      <BalanceBarChart title={t("balanceRelativeBurden")} values={cells.map((cell)=>cell.relativeBurdenPct)} unit="%" centered/>
      <BalanceYearChart title={t("balanceYearTrend")} diagnostics={chartDiagnostics} language={language}/>
    </div></>}
  </section>;
}

function BalanceBarChart({title,values,unit,centered=false}:{title:string;values:number[];unit:string;centered?:boolean}) {
  const width=560,height=250,left=44,right=16,top=26,bottom=38;
  const maximum=Math.max(1,...values.map(Math.abs));
  const y=(value:number)=>centered?top+(maximum-value)/(maximum*2)*(height-top-bottom):top+(maximum-value)/maximum*(height-top-bottom);
  const zeroY=y(0),barWidth=(width-left-right)/Math.max(1,values.length);
  return <article className="balance-mini-chart"><h3>{title}</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
    {[0,.5,1].map((step)=>{const gy=top+step*(height-top-bottom);return <line key={step} className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/>;})}
    {centered&&<line className="zero-line" x1={left} x2={width-right} y1={zeroY} y2={zeroY}/>}
    {values.map((value,index)=>{const barY=Math.min(zeroY,y(value)),barHeight=Math.max(2,Math.abs(y(value)-zeroY));return <g key={index}><rect x={left+index*barWidth+barWidth*.16} y={barY} width={barWidth*.68} height={barHeight} rx="2" fill={value<0?"var(--balance-negative)":CELL_COLORS[index%CELL_COLORS.length]}/><text className="balance-bar-value" x={left+(index+.5)*barWidth} y={Math.max(13,barY-4)} textAnchor="middle">{value.toFixed(0)}{unit}</text><text className="time-label" x={left+(index+.5)*barWidth} y={height-13} textAnchor="middle">C{index+1}</text></g>;})}
  </svg></article>;
}

function BalanceYearChart({title,diagnostics,language}:{title:string;diagnostics:BalanceDiagnostics;language:Language}) {
  const width=560,height=250,left=44,right=16,top=26,bottom=38;
  const values=diagnostics.cells.flatMap((cell)=>cell.monthlyBurdenPct.filter((value):value is number=>value!=null));
  const maximum=Math.max(1,...values),x=(index:number)=>left+index/11*(width-left-right),y=(value:number)=>top+(maximum-value)/maximum*(height-top-bottom);
  const labels=diagnostics.monthStarts.map((timestamp)=>new Date(timestamp).toLocaleDateString(language,{month:"short",year:"2-digit"}));
  return <article className="balance-mini-chart"><h3>{title}</h3><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
    {[0,.5,1].map((step)=><line key={step} className="chart-grid" x1={left} x2={width-right} y1={top+step*(height-top-bottom)} y2={top+step*(height-top-bottom)}/>)}
    {diagnostics.cells.map((cell)=>{const path=cell.monthlyBurdenPct.map((value,index)=>value==null?null:{value,index}).filter((item):item is {value:number;index:number}=>item!=null).map((item,index)=>`${index===0?"M":"L"}${x(item.index).toFixed(1)},${y(item.value).toFixed(1)}`).join(" ");return path?<path key={cell.cellIndex} d={path} fill="none" stroke={CELL_COLORS[cell.cellIndex%CELL_COLORS.length]} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>:null;})}
    {labels.map((label,index)=>index%2===0?<text key={index} className="time-label" x={x(index)} y={height-13} textAnchor="middle">{label}</text>:null)}
  </svg></article>;
}

function ThresholdLines({thresholds,y,left,right,unit,decimals,showLabels,valueAtY,onAdjust,step,clampY}:{thresholds:ChartThreshold[];y:(value:number)=>number;left:number;right:number;unit:string;decimals:number;showLabels:boolean;valueAtY?:(position:number)=>number;onAdjust?:(threshold:ChartThreshold,value:number)=>void;step?:number;clampY?:{top:number;bottom:number}}){
  const dragging=useRef<ChartThreshold|null>(null);
  const pointerValue=(event:ReactPointerEvent<SVGGElement>)=>{const svg=event.currentTarget.ownerSVGElement;if(!svg||!valueAtY)return null;const box=svg.getBoundingClientRect();return valueAtY((event.clientY-box.top)/box.height*svg.viewBox.baseVal.height);};
  const round=(value:number)=>step?Math.round(value/step)*step:value;
  return <>{thresholds.map((threshold)=>{const rawLineY=y(threshold.value);const lineY=clampY?Math.max(clampY.top,Math.min(clampY.bottom,rawLineY)):rawLineY;const value=`${threshold.value.toFixed(decimals)} ${unit}`;const markerX=left+5;const lineStart=left+24;const color=threshold.color;const editable=threshold.source==="custom"&&Boolean(onAdjust&&valueAtY);const clipped=rawLineY!==lineY;const tooltip=[threshold.label,value,threshold.source==="bms"?"BMS":"Custom",clipped?"outside the current scale":null,threshold.description].filter(Boolean).join(" · ");const update=(event:ReactPointerEvent<SVGGElement>)=>{const next=pointerValue(event);if(next!=null)onAdjust?.(threshold,round(next));};return <g className={`threshold-line ${threshold.source} ${threshold.level} ${editable?"editable":""} ${clipped?"clamped":""}`} key={threshold.id} onPointerDown={editable?(event)=>{dragging.current=threshold;event.currentTarget.setPointerCapture(event.pointerId);update(event);}:undefined} onPointerMove={editable?(event)=>{if(dragging.current?.id===threshold.id)update(event);}:undefined} onPointerUp={editable?()=>{dragging.current=null;}:undefined} onPointerCancel={editable?()=>{dragging.current=null;}:undefined} onWheel={editable?(event)=>{event.preventDefault();onAdjust?.(threshold,round(threshold.value+(event.deltaY<0?(step??1):-(step??1))));}:undefined}>{showLabels&&<title>{tooltip}</title>}<line x1={lineStart} x2={right} y1={lineY} y2={lineY} style={{stroke:color}}/><rect className="threshold-line-marker-frame" x={markerX-2} y={lineY-8} width="16" height="16" rx="3"/><rect className="threshold-line-marker" x={markerX} y={lineY-6} width="12" height="12" rx="2" style={{fill:color}}/><text className="threshold-line-marker-label" x={markerX+6} y={lineY+3} textAnchor="middle">{threshold.source==="bms"?"B":"U"}</text></g>;})}</>;
}

function adjustCustomThreshold(settings:ChartDisplaySettings,setSettings:(settings:ChartDisplaySettings)=>void,threshold:ChartThreshold,value:number){
  if(threshold.source!=="custom"||!Number.isFinite(value))return;
  const side=threshold.id.endsWith("-low")?"low":"high";
  const limits={...settings.customThresholds[threshold.metric],[side]:value};
  if(!validThresholdLimits(threshold.metric,limits))return;
  setSettings({...settings,showCustomThresholds:true,customThresholdVisibility:{...settings.customThresholdVisibility,[threshold.metric]:true},customThresholds:{...settings.customThresholds,[threshold.metric]:limits}});
}

const DEFAULT_HISTORY_COLORS: Record<HistoryMetric, string> = {
  packVoltageV: "#e20d18",
  currentA: "#181716",
  chargeCurrentA: "#0e8e55",
  dischargeCurrentA: "#d80712",
  powerW: "#a20b73",
  socPercent: "#168447",
  temperatureC: "#d47d00",
  deltaMv: "#2267c7",
};

const CELL_COLORS = [
  "#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00", "#332288", "#999933",
  "#44aa99", "#882255", "#aa4499", "#88ccee", "#117733", "#ddcc77", "#661100", "#6699cc",
  "#aa4466", "#4477aa", "#228833", "#ee6677", "#b284be", "#8c564b", "#17becf", "#bcbd22",
  "#1f77b4", "#ff7f0e", "#2ca02c", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#00a6a6",
];

function loadChartMarkers(storageKey: string): ChartMarker[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item): item is ChartMarker => typeof item?.id === "string" && Number.isFinite(item?.timestamp)).slice(0, 12).map((item) => ({ ...item, visible: item.visible !== false })) : [];
  } catch { return []; }
}

const HISTORY_PERIODS: Array<[HistoryPeriod, number]> = [
  ["hour", 60 * 60 * 1_000],
  ["day", 24 * 60 * 60 * 1_000],
  ["week", 7 * 24 * 60 * 60 * 1_000],
  ["month", 30 * 24 * 60 * 60 * 1_000],
  ["year", 365 * 24 * 60 * 60 * 1_000],
];

// Short ranges do not need thousands of SVG vertices. This keeps period
// switches quick while preserving enough detail for inspecting activity.
function historyPointLimit(period: HistoryPeriod): number {
  if (period === "hour") return 480;
  if (period === "day") return 900;
  if (period === "week") return 1_200;
  if (period === "month") return 1_400;
  return 1_800;
}

function HistoryPage({gatewayUrl,t,language,snapshot,cellStats,chartSettings,setChartSettings}:{gatewayUrl:string;t:ReturnType<typeof translator>;language:Language;snapshot:GatewaySnapshot|null;cellStats:ReturnType<typeof calculateCellStats>;chartSettings:ChartDisplaySettings;setChartSettings:(settings:ChartDisplaySettings)=>void}) {
  const [period, setPeriod] = useState<HistoryPeriod>(() => {
    const saved = localStorage.getItem("bms-history-period") as HistoryPeriod | null;
    return HISTORY_PERIODS.some(([id]) => id === saved) ? saved! : "day";
  });
  const [selectedMetrics, setSelectedMetrics] = useState<HistoryMetric[]>(loadHistoryMetrics);
  const [seriesColors, setSeriesColors] = useState<Record<HistoryMetric, string>>(loadHistoryColors);
  const [signedColors, setSignedColors] = useState<Record<SignedHistoryMetric, DirectionalColors>>(loadSignedColors);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [timeZoom, setTimeZoom] = useState<{from:number;to:number}|null>(null);
  const [dragSelection,setDragSelection]=useState<DragZoomSelection|null>(null);
  const autoRefreshInterval = period === "year" ? 60_000 : 15_000;
  const freshSnapshotTime = snapshot?.connected && !snapshot.stale
    ? snapshot.timestamp ?? snapshot.serverTime
    : 0;
  const autoRefreshBucket = freshSnapshotTime > 0
    ? Math.floor(freshSnapshotTime / autoRefreshInterval)
    : -1;

  useEffect(() => {
    let active = true;
    const duration = HISTORY_PERIODS.find(([id]) => id === period)?.[1] ?? HISTORY_PERIODS[1][1];
    const to = Date.now();
    setLoading(true);
    setError(false);
    fetchGatewayHistory(gatewayUrl, to - duration, to, historyPointLimit(period))
      .then((result) => { if (active) setHistory(result); })
      .catch(() => { if (active) { setHistory(null); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [gatewayUrl, period, refreshToken, autoRefreshBucket]);

  useEffect(() => setTimeZoom(null), [gatewayUrl, period]);
  useEffect(()=>{const resetAfterFullscreen=()=>{if(!document.fullscreenElement)setTimeZoom(null);};document.addEventListener("fullscreenchange",resetAfterFullscreen);return()=>document.removeEventListener("fullscreenchange",resetAfterFullscreen);},[]);

  useEffect(() => {
    localStorage.setItem("bms-history-period", period);
    localStorage.setItem("bms-history-metrics", JSON.stringify(selectedMetrics));
    localStorage.setItem("bms-history-colors", JSON.stringify(seriesColors));
    localStorage.setItem("bms-history-signed-colors", JSON.stringify(signedColors));
  }, [period, selectedMetrics, seriesColors, signedColors]);

  const series: HistorySeries[] = [
    { id: "packVoltageV", title: t("voltage"), unit: "V", color: seriesColors.packVoltageV, decimals: 2, thresholdMetric:"packVoltageV", value:(point)=>point.packVoltageV },
    { id: "currentA", title: t("current"), unit: "A", color: signedColors.currentA.positive, decimals: 1, thresholdMetric:"currentA", value:(point)=>point.currentA, directionalColors:signedColors.currentA },
    { id: "chargeCurrentA", title: t("chargeCurrent"), unit: "A", color: seriesColors.chargeCurrentA, decimals: 1, thresholdMetric:null, value:(point)=>Math.max(0,point.currentA) },
    { id: "dischargeCurrentA", title: t("dischargeCurrent"), unit: "A", color: seriesColors.dischargeCurrentA, decimals: 1, thresholdMetric:null, value:(point)=>Math.min(0,point.currentA) },
    { id: "powerW", title: t("power"), unit: "W", color: signedColors.powerW.positive, decimals: 0, thresholdMetric:"powerW", value:(point)=>point.powerW, directionalColors:signedColors.powerW },
    { id: "socPercent", title: t("soc"), unit: "%", color: seriesColors.socPercent, decimals: 0, thresholdMetric:"socPercent", value:(point)=>point.socPercent },
    { id: "temperatureC", title: t("temp"), unit: "°C", color: seriesColors.temperatureC, decimals: 1, thresholdMetric:"temperatureC", value:(point)=>point.temperatureC },
    { id: "deltaMv", title: t("imbalance"), unit: "mV", color: seriesColors.deltaMv, decimals: 0, thresholdMetric:"deltaMv", value:(point)=>point.deltaMv },
  ];
  const sourcePoints = history?.points ?? [];
  const applyTimeZoom=(from:number,to:number)=>{
    if(sourcePoints.length<2)return;
    const baseFrom=sourcePoints[0].timestamp,baseTo=sourcePoints.at(-1)!.timestamp;
    const safeFrom=Math.max(baseFrom,Math.min(from,to)),safeTo=Math.min(baseTo,Math.max(from,to));
    if(safeTo-safeFrom>=(baseTo-baseFrom)*.995){setTimeZoom(null);return;}
    if(sourcePoints.filter((point)=>point.timestamp>=safeFrom&&point.timestamp<=safeTo).length>=2)setTimeZoom({from:safeFrom,to:safeTo});
  };
  const points = useMemo(() => {
    if(!timeZoom)return sourcePoints;
    return sourcePoints.filter((point)=>point.timestamp>=timeZoom.from&&point.timestamp<=timeZoom.to);
  },[sourcePoints,timeZoom]);
  const selectedSeries = selectedMetrics.map((id) => series.find((item) => item.id === id)).filter((item): item is HistorySeries => Boolean(item));
  const visibleIndividualSeries = series.filter((item) => chartSettings.individualChartVisibility[item.id]);
  const thresholds=chartThresholds(chartSettings,snapshot,t);
  const socBoundaryEvents=history?.socEvents?.length?history.socEvents:inferSocBoundaryEvents(points);
  const voltageCellCount=Math.max(snapshot?.cellsV?.length??0,...points.map((point)=>point.cellsV?.length??0));
  const packVoltageRange=packVoltageAxisRange(snapshot?.chemistry,snapshot?.protectionSettings,voltageCellCount,[...points.map((point)=>point.packVoltageV),...thresholds.filter((threshold)=>threshold.metric==="packVoltageV").map((threshold)=>threshold.value)]);
  const addMetric = (id: HistoryMetric) => setSelectedMetrics((current) => current.includes(id) ? current : [...current, id]);
  const removeMetric = (id: HistoryMetric) => setSelectedMetrics((current) => current.filter((metric) => metric !== id));
  const toggleMetric = (id: HistoryMetric) => setSelectedMetrics((current) => current.includes(id) ? current.filter((metric) => metric !== id) : [...current, id]);
  const setSeriesColor = (id: HistoryMetric, color: string) => setSeriesColors((current) => ({...current,[id]:color}));
  const setSignedColor = (id: SignedHistoryMetric, direction: keyof DirectionalColors, color: string) => setSignedColors((current) => ({...current,[id]:{...current[id],[direction]:color}}));
  const selectPeriod = (nextPeriod: HistoryPeriod) => {
    if (nextPeriod === period) return;
    // Avoid showing old data under the newly selected time-range label.
    setTimeZoom(null);
    setHistory(null);
    setPeriod(nextPeriod);
  };
  const handleHistoryWheel = (event:ReactWheelEvent<HTMLDivElement>) => {
    const target=event.target as Element;
    const chart=target.closest("svg");
    if(!chart||!document.fullscreenElement||!document.fullscreenElement.contains(chart)||sourcePoints.length<3||(event.buttons&2)===0)return;
    event.preventDefault();
    const baseFrom=sourcePoints[0].timestamp,baseTo=sourcePoints.at(-1)!.timestamp,baseRange=Math.max(1,baseTo-baseFrom);
    const currentFrom=timeZoom?.from??baseFrom,currentTo=timeZoom?.to??baseTo,currentRange=currentTo-currentFrom;
    const factor = event.deltaY < 0 ? 0.78 : 1.28;
    const nextRange=Math.max(baseRange/250,Math.min(baseRange,currentRange*factor));
    if(nextRange>=baseRange*.995){setTimeZoom(null);return;}
    const bounds=chart.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(event.clientX-bounds.left)/Math.max(1,bounds.width)));
    const anchor=currentFrom+ratio*currentRange;
    let from=anchor-ratio*nextRange,to=from+nextRange;
    if(from<baseFrom){from=baseFrom;to=from+nextRange;}if(to>baseTo){to=baseTo;from=to-nextRange;}
    applyTimeZoom(from,to);
  };
  const handleChartContextMenu = (event:React.MouseEvent<HTMLDivElement>) => {
    const target=event.target as Element;
    if(document.fullscreenElement&&target.closest("svg")&&document.fullscreenElement.contains(target))event.preventDefault();
  };
  const handleZoomPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||!document.fullscreenElement)return;
    const target=event.target as Element;
    if(target.closest(".soc-event-marker,.soc-boundary-point-marker"))return;
    const chart=target.closest("svg") as SVGSVGElement|null;
    if(!chart||!document.fullscreenElement.contains(chart))return;
    const bounds=chart.getBoundingClientRect();
    chart.setPointerCapture(event.pointerId);
    setDragSelection({pointerId:event.pointerId,startX:event.clientX,currentX:event.clientX,left:bounds.left,width:bounds.width,top:bounds.top,height:bounds.height});
    event.preventDefault();
  };
  const handleZoomPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(dragSelection?.pointerId===event.pointerId)setDragSelection((current)=>current?{...current,currentX:event.clientX}:null);
  };
  const handleZoomPointerEnd=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const selection=dragSelection;
    if(!selection||selection.pointerId!==event.pointerId)return;
    setDragSelection(null);
    if(Math.abs(event.clientX-selection.startX)<18||sourcePoints.length<2)return;
    const baseFrom=sourcePoints[0].timestamp,baseTo=sourcePoints.at(-1)!.timestamp;
    const currentFrom=timeZoom?.from??baseFrom,currentTo=timeZoom?.to??baseTo,currentRange=currentTo-currentFrom;
    const first=Math.max(0,Math.min(1,(selection.startX-selection.left)/selection.width));
    const last=Math.max(0,Math.min(1,(event.clientX-selection.left)/selection.width));
    applyTimeZoom(currentFrom+Math.min(first,last)*currentRange,currentFrom+Math.max(first,last)*currentRange);
  };
  const handleChartDoubleClick=(event:React.MouseEvent<HTMLDivElement>)=>{
    const target=event.target as Element;
    if(document.fullscreenElement&&target.closest("svg")&&document.fullscreenElement.contains(target))setTimeZoom(null);
  };
  const zoomFactor=timeZoom&&sourcePoints.length>1?(sourcePoints.at(-1)!.timestamp-sourcePoints[0].timestamp)/(timeZoom.to-timeZoom.from):1;
  const viewport:TimeViewport={baseFrom:sourcePoints[0]?.timestamp??0,baseTo:sourcePoints.at(-1)?.timestamp??1,from:timeZoom?.from??sourcePoints[0]?.timestamp??0,to:timeZoom?.to??sourcePoints.at(-1)?.timestamp??1,setRange:applyTimeZoom,reset:()=>setTimeZoom(null)};
  const hideHistorySection=(section:keyof HistorySectionVisibility)=>setChartSettings({...chartSettings,historySections:{...chartSettings.historySections,[section]:false}});

  return <div className={`page-content history-page ${dragSelection?"selecting-time":""}`} onWheel={handleHistoryWheel} onContextMenu={handleChartContextMenu} onPointerDown={handleZoomPointerDown} onPointerMove={handleZoomPointerMove} onPointerUp={handleZoomPointerEnd} onPointerCancel={handleZoomPointerEnd} onDoubleClick={handleChartDoubleClick}>
    {dragSelection&&<div className="time-selection-overlay" style={{left:Math.min(dragSelection.startX,dragSelection.currentX),top:dragSelection.top,width:Math.abs(dragSelection.currentX-dragSelection.startX),height:dragSelection.height}}/>}
    {chartSettings.historySections.liveCells&&<CellsOverview snapshot={snapshot} t={t} cellStats={cellStats}/>}
    {chartSettings.historySections.dischargeCurrentDistribution&&<DischargeCurrentDistributionPanel gatewayUrl={gatewayUrl} language={language} t={t} onHide={()=>hideHistorySection("dischargeCurrentDistribution")}/>}
    {chartSettings.historySections.operatingPointCellComparison&&<OperatingPointCellComparisonPanel gatewayUrl={gatewayUrl} language={language} t={t} onHide={()=>hideHistorySection("operatingPointCellComparison")}/>}
    <section className="panel history-toolbar">
      <div><span>{t("period")}</span><div className="period-buttons">{HISTORY_PERIODS.map(([id]) =>
        <button key={id} className={period === id ? "selected" : ""} onClick={() => selectPeriod(id)} disabled={loading}>{t(id)}</button>,
      )}</div></div>
      <div className="history-summary">
        <span>{history?.pointCount ?? 0} {t("points")}</span>
        <span>{history?.sourceCount ?? 0} {t("recordedSamples")}</span>
        <span title={t("wheelZoomHint")}>{t("zoom")}: {zoomFactor.toFixed(1)}×</span>
        {timeZoom&&<button onClick={()=>setTimeZoom(null)}>{t("resetZoom")}</button>}
        <button onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}><RefreshCw size={16}/>{t("refresh")}</button>
      </div>
    </section>
    {loading && points.length === 0 && <div className="history-message"><RefreshCw className="spin"/><span>{t("loadingHistory")}</span></div>}
    {!loading && error && <div className="alarm-banner"><AlertTriangle/><div><strong>{t("historyError")}</strong><span>{normalizeGatewayUrl(gatewayUrl)}</span></div></div>}
    {!loading && !error && points.length === 0 && <div className="history-message"><ChartNoAxesCombined/><span>{t("noHistory")}</span></div>}
    {points.length > 0 && <>
      {chartSettings.historySections.compositeChart&&<><section className="panel chart-composer">
        <div className="composer-heading"><div><strong>{t("visibleCurves")}</strong><span>{t("dragHint")}</span></div>
        </div>
        <div className="series-palette">{series.map((item) => <div className="series-choice" key={item.id}><button draggable onDragStart={(event) => event.dataTransfer.setData("text/bms-history-metric", item.id)} onClick={() => toggleMetric(item.id)} className={selectedMetrics.includes(item.id) ? "selected" : ""} aria-pressed={selectedMetrics.includes(item.id)}><i style={{background:item.color}}/>{item.title}<span>{selectedMetrics.includes(item.id) ? "✓" : "+"}</span></button>{item.directionalColors?<SignedColorInputs series={item} t={t} onChange={(direction,color)=>setSignedColor(item.id as SignedHistoryMetric,direction,color)}/>:<label title={t("curveColor")}><input type="color" value={item.color} aria-label={`${t("curveColor")}: ${item.title}`} onChange={(event) => setSeriesColor(item.id,event.target.value)}/></label>}</div>)}</div>
      </section>
      <CompositeHistoryChart points={points} connectionEvents={history?.connectionEvents ?? []} socEvents={socBoundaryEvents} selectedSeries={selectedSeries} period={period} setPeriod={selectPeriod} language={language} t={t} addMetric={addMetric} removeMetric={removeMetric} viewport={viewport} thresholds={thresholds} chartSettings={chartSettings} packVoltageRange={packVoltageRange} onHide={()=>hideHistorySection("compositeChart")}/>
      </>}
      {chartSettings.historySections.cellVoltageChart&&<CellVoltageHistoryChart points={points} socEvents={history?.socEvents ?? []} connectionEvents={history?.connectionEvents ?? []} supportSeries={series} setSeriesColor={setSeriesColor} setSignedColor={setSignedColor} period={period} setPeriod={selectPeriod} language={language} t={t} viewport={viewport} thresholds={thresholds.filter((threshold)=>threshold.metric==="cellVoltageV")} bmsReferences={bmsThresholdReferences("cellVoltageV",snapshot?.protectionSettings,t)} chemistry={snapshot?.chemistry} protectionSettings={snapshot?.protectionSettings} chartSettings={chartSettings} setChartSettings={setChartSettings} onHide={()=>hideHistorySection("cellVoltageChart")}/>}
      {chartSettings.historySections.cellEnergyEstimate&&<CellEnergyEstimatePanel gatewayUrl={gatewayUrl} snapshot={snapshot} t={t} onHide={()=>hideHistorySection("cellEnergyEstimate")}/>}
      {chartSettings.historySections.cellResistanceChart&&<CellResistanceHistoryChart points={points} connectionEvents={history?.connectionEvents ?? []} period={period} setPeriod={selectPeriod} language={language} t={t} viewport={viewport} thresholds={thresholds} chartSettings={chartSettings} setChartSettings={setChartSettings} onHide={()=>hideHistorySection("cellResistanceChart")}/>}
      {visibleIndividualSeries.length>0&&<IndividualHistoryCharts points={points} connectionEvents={history?.connectionEvents ?? []} socEvents={socBoundaryEvents} series={visibleIndividualSeries} period={period} setPeriod={selectPeriod} language={language} t={t} viewport={viewport} thresholds={thresholds} protectionSettings={snapshot?.protectionSettings} packVoltageRange={packVoltageRange} chartSettings={chartSettings} setChartSettings={setChartSettings} setSeriesColor={setSeriesColor} setSignedColor={setSignedColor}/>}
      {chartSettings.historySections.correlationChart&&<CorrelationChart points={points} title={t("currentPowerCorrelation")} noDataLabel={t("noCorrelationData")} t={t} onHide={()=>hideHistorySection("correlationChart")}/>}
    </>}
    {chartSettings.historySections.balanceDiagnostics&&<BalanceDiagnosticsPanel gatewayUrl={gatewayUrl} language={language} t={t} onHide={()=>hideHistorySection("balanceDiagnostics")}/>}
  </div>;
}

function CellEnergyEstimatePanel({gatewayUrl,snapshot,t,onHide}:{gatewayUrl:string;snapshot:GatewaySnapshot|null;t:ReturnType<typeof translator>;onHide:()=>void}) {
  const [analysis,setAnalysis]=useState<CellCapacityAnalysis|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    const to=Date.now();
    setLoading(true);
    fetchGatewayHistory(gatewayUrl,to-365*24*60*60_000,to,5000)
      .then((history)=>{
        if(!active)return;
        const settings=snapshot?.protectionSettings;
        setAnalysis(analyzeCellCapacity(history.points,snapshot?.nominalCapacityAh??snapshot?.fullCapacityAh,settings?.soc0VoltageV??2.6,settings?.soc100VoltageV??3.55));
      })
      .catch(()=>{if(active)setAnalysis(null);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[gatewayUrl,snapshot?.deviceAddress,snapshot?.nominalCapacityAh,snapshot?.fullCapacityAh,snapshot?.protectionSettings?.soc0VoltageV,snapshot?.protectionSettings?.soc100VoltageV]);
  const confidenceLabel=(confidence:EstimateConfidence)=>t(confidence==="learning"?"cellEnergyConfidenceLearning":confidence==="low"?"cellEnergyConfidenceLow":confidence==="medium"?"cellEnergyConfidenceMedium":"cellEnergyConfidenceHigh");
  const cells=analysis?.cells??[];
  return <section className="panel cell-energy-panel">
    <div className="cell-energy-header"><div><span>{t("cellEnergyLearning")}</span><h2>{t("cellEnergyTitle")}</h2><p>{t("cellEnergyIntro")}</p></div><div className="cell-energy-header-actions"><div className="cell-energy-cycle-count"><strong>{analysis?.completedCycles??0}</strong><span>{t("cellEnergyCycles")} · {analysis?.requiredCycles??3} min</span></div><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("cellEnergyTitle")}`}><EyeOff/></button></div></div>
    <div className="cell-energy-warning"><AlertTriangle/><span>{t("cellEnergyWarning")}</span></div>
    {loading?<div className="balance-diagnostics-empty compact"><RefreshCw className="spin"/>{t("loadingHistory")}</div>:cells.length===0?<div className="chart-empty compact"><BatteryMedium/><span>{t("cellEnergyNoData")}</span></div>:<>
      <div className="cell-energy-grid">{cells.map((cell)=>{const energyColor=cellEnergyColor(cell.fillPercent);return <article className={`cell-energy-item confidence-${cell.confidence}`} style={{"--energy-color":energyColor} as React.CSSProperties} key={cell.cellIndex}>
        <div className="cell-energy-label"><strong>C{cell.cellIndex+1}</strong><b>{cell.fillPercent==null?"—":`${cell.fillPercent.toFixed(0)}%`}</b></div>
        <div className="cell-energy-track"><i style={{height:`${cell.fillPercent??0}%`,background:energyColor}}/></div>
        <div className="cell-energy-capacity"><span>{t("cellEnergyCapacity")}</span><strong>{cell.estimatedCapacityAh==null?"—":`${cell.estimatedCapacityAh.toFixed(2)} Ah`}</strong></div>
        <div className="cell-energy-meta"><span>{t("cellEnergyConfidence")}: {confidenceLabel(cell.confidence)}</span><span>n={cell.sampleCount}</span></div>
        {(cell.limitingAtEmptyCount>0||cell.limitingAtFullCount>0)&&<div className="cell-energy-limits">{cell.limitingAtEmptyCount>0&&<span>↓ {t("cellEnergyEmptyLimit")} ×{cell.limitingAtEmptyCount}</span>}{cell.limitingAtFullCount>0&&<span>↑ {t("cellEnergyFullLimit")} ×{cell.limitingAtFullCount}</span>}</div>}
      </article>})}</div>
      {(analysis?.completedCycles??0)<(analysis?.requiredCycles??3)&&<div className="cell-energy-learning-note"><BrainCircuit/><span>{t("cellEnergyNeedCycles")}</span></div>}
    </>}
  </section>;
}

function cellEnergyColor(fillPercent:number|null): string {
  if (fillPercent == null || !Number.isFinite(fillPercent)) return "#8b8580";
  const percent = Math.max(0, Math.min(100, fillPercent));
  return `hsl(${((percent / 100) * 120).toFixed(0)} 78% 42%)`;
}

function ConnectionEventHistory({events,language,t,showGattCodes}:{events:ConnectionHistoryEvent[];language:Language;t:ReturnType<typeof translator>;showGattCodes:boolean}) {
  return <section className="panel connection-history compact"><div className="panel-heading"><span>{t("connectionHistory")}</span><small>{events.length}</small></div>{events.length===0?<div className="connection-history-empty">{t("noConnectionHistory")}</div>:<div className="connection-history-list">{[...events].reverse().map((event,index)=><div className={`connection-history-event ${event.type.toLowerCase()}`} key={`${event.timestamp}-${event.type}-${index}`}><div className="connection-history-icon">{event.type==="LOST"?<Unplug/>:<Radio/>}</div><div><strong>{event.type==="LOST"?t("connectionLost"):t("connectionRestored")}</strong><span>{event.bmsName||"JK BMS"}{showGattCodes&&event.gattStatus!=null?` · ${t("gattCode")} ${event.gattStatus}`:""}</span></div><time>{new Date(event.timestamp).toLocaleString(language)}</time><b>{event.durationMs==null?t("outageOngoing"):formatOutageDuration(event.durationMs)}</b></div>)}</div>}</section>;
}

function loadHistoryMetrics(): HistoryMetric[] {
  const fallback: HistoryMetric[] = ["packVoltageV", "currentA", "socPercent"];
  try {
    const parsed = JSON.parse(localStorage.getItem("bms-history-metrics") ?? "null");
    const valid: HistoryMetric[] = ["packVoltageV", "currentA", "chargeCurrentA", "dischargeCurrentA", "powerW", "socPercent", "temperatureC", "deltaMv"];
    return Array.isArray(parsed) ? parsed.filter((item): item is HistoryMetric => valid.includes(item)) : fallback;
  } catch {
    return fallback;
  }
}

function loadHistoryColors(): Record<HistoryMetric, string> {
  try {
    const saved = JSON.parse(localStorage.getItem("bms-history-colors") ?? "{}");
    return Object.fromEntries(Object.entries(DEFAULT_HISTORY_COLORS).map(([id, fallback]) => [id, typeof saved[id] === "string" ? saved[id] : fallback])) as Record<HistoryMetric, string>;
  } catch {
    return {...DEFAULT_HISTORY_COLORS};
  }
}

function ChartMarkerToolbar({markers,setMarkers,firstTime,lastTime,language,t}:{markers:ChartMarker[];setMarkers:React.Dispatch<React.SetStateAction<ChartMarker[]>>;firstTime:number;lastTime:number;language:Language;t:ReturnType<typeof translator>}) {
  const addMarker=()=>setMarkers((current)=>[...current,{id:makeId(),timestamp:firstTime+(lastTime-firstTime)/2,visible:true}]);
  const update=(id:string,patch:Partial<ChartMarker>)=>setMarkers((current)=>current.map((marker)=>marker.id===id?{...marker,...patch}:marker));
  const remove=(id:string)=>setMarkers((current)=>current.filter((marker)=>marker.id!==id));
  return <div className="chart-markers" aria-label={t("markers")}><div><strong>{t("markers")}</strong><span>{t("markerHint")}</span></div><button type="button" onClick={addMarker}>+ {t("addMarker")}</button>{markers.map((marker,index)=><label key={marker.id} className="marker-control"><input type="checkbox" checked={marker.visible} onChange={(event)=>update(marker.id,{visible:event.target.checked})}/><i/><span>M{index+1} · {new Date(marker.timestamp).toLocaleString(language,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span><button type="button" onClick={()=>remove(marker.id)} title={t("removeMarker")} aria-label={`${t("removeMarker")} M${index+1}`}>×</button></label>)}</div>;
}

function ChartMarkerLines({markers,x,top,bottom,onPointerDown}:{markers:ChartMarker[];x:(timestamp:number)=>number;top:number;bottom:number;onPointerDown?:(id:string,event:ReactPointerEvent<SVGRectElement>)=>void}) {
  return <>{markers.map((marker,index)=>marker.visible&&<g className="chart-marker" key={marker.id}><line x1={x(marker.timestamp)} x2={x(marker.timestamp)} y1={top} y2={bottom}/><rect x={x(marker.timestamp)-12} y={top+2} width="24" height="18" rx="4" onPointerDown={(event)=>{event.stopPropagation();onPointerDown?.(marker.id,event);}}/><text x={x(marker.timestamp)} y={top+15} textAnchor="middle">M{index+1}</text></g>)}</>;
}

function ConnectionEventMarkers({events,points,x,yValue,left,right,top,bottom,language,t}:{events:ConnectionHistoryEvent[];points:HistoryPoint[];x:(timestamp:number)=>number;yValue:(point:HistoryPoint)=>number|null|undefined;left:number;right:number;top:number;bottom:number;language:Language;t:ReturnType<typeof translator>}) {
  if(points.length===0||events.length===0)return null;
  const firstTime=points[0].timestamp,lastTime=points.at(-1)!.timestamp;
  return <>{events.filter((event)=>event.timestamp>=firstTime&&event.timestamp<=lastTime).map((event,index)=>{
    const usable=points.map((point)=>({point,y:yValue(point)})).filter((item):item is {point:HistoryPoint;y:number}=>Number.isFinite(item.y));
    if(usable.length===0)return null;
    const directional=event.type==="LOST"
      ? [...usable].reverse().find((item)=>item.point.timestamp<=event.timestamp)
      : usable.find((item)=>item.point.timestamp>=event.timestamp);
    const anchor=directional??usable.reduce((nearest,item)=>Math.abs(item.point.timestamp-event.timestamp)<Math.abs(nearest.point.timestamp-event.timestamp)?item:nearest);
    const cx=Math.max(left+14,Math.min(right-14,x(anchor.point.timestamp)));
    const cy=Math.max(top+14,Math.min(bottom-14,anchor.y));
    const label=`${t(event.type==="LOST"?"connectionLost":"connectionRestored")} · ${new Date(event.timestamp).toLocaleString(language)}${event.bmsName?` · ${event.bmsName}`:""}`;
    return <g className={`bms-connection-marker ${event.type.toLowerCase()}`} key={`${event.timestamp}-${event.type}-${index}`} role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={cx-13} y={cy-13} width="26" height="26" rx="5"/>
      <path d={`M ${cx-4} ${cy-6} L ${cx+4} ${cy+2} L ${cx} ${cy+6} V ${cy-6} L ${cx+4} ${cy-2} L ${cx-4} ${cy+6}`}/>
      {event.type==="LOST"&&<line x1={cx-9} y1={cy-9} x2={cx+9} y2={cy+9}/>}
    </g>;
  })}</>;
}

function SocBoundaryPointMarkers({events,x,yValue,left,right,top,bottom,language,t}:{events:SocBoundaryEvent[];x:(timestamp:number)=>number;yValue:(event:SocBoundaryEvent)=>number;left:number;right:number;top:number;bottom:number;language:Language;t:ReturnType<typeof translator>}){
  return <>{events.map((event,index)=>{
    const cx=Math.max(left+15,Math.min(right-15,x(event.timestamp)));
    const cy=Math.max(top+15,Math.min(bottom-15,yValue(event)));
    const value=event.socPercent<=1?0:100;
    const label=`${t("socTransition")}: ${event.previousSocPercent.toFixed(0)}% → ${event.socPercent.toFixed(0)}% · ${new Date(event.timestamp).toLocaleString(language)}`;
    return <g className={`soc-boundary-point-marker soc-${value}`} key={`${event.timestamp}-${value}-${index}`} role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={cx-14} y={cy-14} width="28" height="28" rx="5"/>
      <text x={cx} y={cy+4} textAnchor="middle">{value}</text>
    </g>;
  })}</>;
}

/** A square marker for a real JK Charge MOS transition reported by the BMS. */
function ChargeChannelMarkers({points,thresholds,x,y,left,right,top,bottom,language,t}:{points:HistoryPoint[];thresholds:ChartThreshold[];x:(timestamp:number)=>number;y:(value:number)=>number;left:number;right:number;top:number;bottom:number;language:Language;t:ReturnType<typeof translator>}) {
  const protection = thresholds.find((threshold) => threshold.id === "bms-cell-ovp");
  const recovery = thresholds.find((threshold) => threshold.id === "bms-cell-ovp-recovery");
  if (points.length < 2 || (!protection && !recovery)) return null;
  const events: Array<{timestamp:number;active:boolean;threshold:ChartThreshold}> = [];
  let previousKnown: boolean | null = null;
  points.forEach((point) => {
    const active = point.chargeMosEnabled;
    if (active == null) return;
    if (previousKnown != null && previousKnown !== active) {
      const threshold = active ? recovery : protection;
      if (threshold) events.push({timestamp:point.timestamp,active,threshold});
    }
    previousKnown = active;
  });
  return <>{events.map((event, index) => {
    const cx = Math.max(left + 13, Math.min(right - 13, x(event.timestamp)));
    const cy = Math.max(top + 13, Math.min(bottom - 13, y(event.threshold.value)));
    const color = event.active ? "#159447" : "#dd2030";
    const state = event.active ? t("chargeOn") : t("chargeOff");
    const label = `${t("chargeChannel")}: ${state} · ${event.threshold.label} · ${new Date(event.timestamp).toLocaleString(language)}`;
    return <g key={`charge-channel-${event.timestamp}-${index}`} className={`charge-channel-marker ${event.active ? "enabled" : "disabled"}`} role="img" aria-label={label}>
      <title>{label}</title>
      <rect x={cx - 12} y={cy - 12} width="24" height="24" rx="4" fill={color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      <path d={`M ${cx-2} ${cy-8} L ${cx-7} ${cy+1} H ${cx-2} L ${cx-4} ${cy+8} L ${cx+7} ${cy-3} H ${cx+2} L ${cx+4} ${cy-8} Z`} fill="#fff"/>
      {!event.active && <line x1={cx-8} y1={cy-8} x2={cx+8} y2={cy+8} stroke="#fff" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/>}
    </g>;
  })}</>;
}

function CompositeHistoryChart({ points, connectionEvents, socEvents, selectedSeries, period, setPeriod, language, t, addMetric, removeMetric, viewport, thresholds, chartSettings, packVoltageRange, onHide }: {
  points: HistoryPoint[];
  connectionEvents: ConnectionHistoryEvent[];
  socEvents:SocBoundaryEvent[];
  selectedSeries: HistorySeries[];
  period: HistoryPeriod;
  setPeriod: (period: HistoryPeriod) => void;
  language: Language;
  t: ReturnType<typeof translator>;
  addMetric: (metric: HistoryMetric) => void;
  removeMetric: (metric: HistoryMetric) => void;
  viewport: TimeViewport;
  thresholds: ChartThreshold[];
  chartSettings:ChartDisplaySettings;
  packVoltageRange:VoltageAxisRange;
  onHide:()=>void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [draggingMarkerId, setDraggingMarkerId] = useState<string | null>(null);
  const [markers, setMarkers] = useState<ChartMarker[]>(() => loadChartMarkers("bms-history-markers-composite-v1"));
  const chartRef = useRef<HTMLElement | null>(null);
  useEffect(() => localStorage.setItem("bms-history-markers-composite-v1", JSON.stringify(markers)), [markers]);
  const width = 1200;
  const left = 116;
  const right = 26;
  const top = 18;
  const bottom = 52;
  const laneHeight = 116;
  const laneGap = 12;
  const lanesHeight = selectedSeries.length * laneHeight + Math.max(0, selectedSeries.length - 1) * laneGap;
  const height = top + lanesHeight + bottom;
  const firstTime = points[0].timestamp;
  const lastTime = points[points.length - 1].timestamp;
  const timeRange = Math.max(1, lastTime - firstTime);
  const x = (timestamp: number) => left + (timestamp - firstTime) / timeRange * (width - left - right);
  const updateMarker = (id: string, patch: Partial<ChartMarker>) => setMarkers((current) => current.map((marker) => marker.id === id ? { ...marker, ...patch } : marker));
  const ranges = new Map(selectedSeries.map((series) => {
    const dataValues = points.map(series.value).filter(Number.isFinite);
    const values = dataValues;
    let minimum = series.id === "packVoltageV" ? packVoltageRange.minimum : Math.min(...values);
    let maximum = series.id === "packVoltageV" ? packVoltageRange.maximum : Math.max(...values);
    if (chartSettings.symmetricBidirectionalScale && (series.id === "currentA" || series.id === "powerW")) {
      const magnitude = Math.max(1, ...values.map(Math.abs));
      minimum = -magnitude;
      maximum = magnitude;
    } else if (minimum === maximum) { minimum -= .5; maximum += .5; }
    if(series.id === "packVoltageV")return [series.id,{minimum,maximum}] as const;
    const padding = (maximum - minimum) * .06;
    return [series.id, { minimum: minimum - padding, maximum: maximum + padding }] as const;
  }));
  const laneTop = (index: number) => top + index * (laneHeight + laneGap);
  const laneBottom = (index: number) => laneTop(index) + laneHeight;
  const y = (series: HistorySeries, value: number, index: number) => {
    const range = ranges.get(series.id)!;
    return laneTop(index) + (range.maximum - value) / (range.maximum - range.minimum) * laneHeight;
  };
  const socSeriesIndex=selectedSeries.findIndex((series)=>series.id==="socPercent");
  const paths = selectedSeries.map((series, seriesIndex) => {
    const path = points.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"}${x(point.timestamp).toFixed(1)},${y(series, series.value(point), seriesIndex).toFixed(1)}`).join(" ");
    const baseline = series.id === "currentA" || series.id === "powerW" ? y(series, 0, seriesIndex) : laneBottom(seriesIndex);
    const areaPath = `${path} L${x(points[points.length - 1].timestamp).toFixed(1)},${baseline.toFixed(1)} L${x(points[0].timestamp).toFixed(1)},${baseline.toFixed(1)} Z`;
    const directionalPaths = series.directionalColors ? splitSignedPaths(points, series.value, (point)=>x(point.timestamp), (value)=>y(series,value,seriesIndex)) : null;
    return { series, seriesIndex, path, areaPath, directionalPaths };
  });
  const date = (timestamp: number) => new Date(timestamp).toLocaleString(language, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const hoveredPoint = hoveredIndex == null ? null : points[hoveredIndex];
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.max(left, Math.min(width - right, (event.clientX - bounds.left) / bounds.width * width));
    const timestamp = firstTime + (position - left) / (width - left - right) * timeRange;
    if (draggingMarkerId) { updateMarker(draggingMarkerId, { timestamp }); return; }
    let nearest = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(points[index].timestamp - timestamp) < Math.abs(points[nearest].timestamp - timestamp)) nearest = index;
    }
    setHoveredIndex(nearest);
  };
  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(document.fullscreenElement === chartRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await chartRef.current?.requestFullscreen();
  };

  return <article ref={chartRef} className={`panel composite-chart ${chartSettings.showCurveShadows?"":"no-curve-shadows"}`} onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("dragging"); }} onDragLeave={(event) => event.currentTarget.classList.remove("dragging")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); const metric = event.dataTransfer.getData("text/bms-history-metric") as HistoryMetric; if (metric) addMetric(metric); }}>
    <div className="panel-heading"><span>{t("historyTitle")}</span><div className="chart-heading-actions"><small>{t("individualScale")}</small><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("historyTitle")}`}><EyeOff/></button><button type="button" className="fullscreen-chart-button" onClick={toggleFullscreen} title={isFullscreen ? t("exitFullscreen") : t("fullscreen")} aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}>{isFullscreen ? <Minimize2/> : <Maximize2/>}</button></div></div>
    <FullscreenPeriodPicker period={period} setPeriod={setPeriod} t={t}/>
    <FullscreenTimeNavigator viewport={viewport} language={language} t={t}/>
    <ChartMarkerToolbar markers={markers} setMarkers={setMarkers} firstTime={firstTime} lastTime={lastTime} language={language} t={t}/>
    <div className="selected-series">{selectedSeries.map((series) => { const range = ranges.get(series.id)!; const latest = series.value(points[points.length - 1]); const displayColor=seriesColorForValue(series,latest); return <button key={series.id} onClick={() => removeMetric(series.id)} title={t("removeCurve")}><i style={{background:displayColor}}/><span><b>{series.title}</b><small>{range.minimum.toFixed(series.decimals)}…{range.maximum.toFixed(series.decimals)} {series.unit}</small></span><strong style={{color:displayColor}}>{latest.toFixed(series.decimals)} {series.unit}</strong><em>×</em></button>; })}</div>
    {selectedSeries.length === 0 ? <div className="chart-empty chart-drop-empty"><ChartNoAxesCombined/><strong>{t("noSelectedCurves")}</strong><span>{t("dragHint")}</span></div> : <div className="composite-plot">
    <svg viewBox={`0 0 ${width} ${height}`} style={{height:"auto",aspectRatio:`${width} / ${height}`}} role="img" aria-label={t("historyTitle")} onPointerMove={handlePointerMove} onPointerUp={() => setDraggingMarkerId(null)} onPointerLeave={() => { setHoveredIndex(null); setDraggingMarkerId(null); }}>
      <defs>{selectedSeries.map((series,seriesIndex) => <React.Fragment key={series.id}><clipPath id={`lane-clip-${series.id}`}><rect x={left} y={laneTop(seriesIndex)} width={width-left-right} height={laneHeight} rx="7"/></clipPath><linearGradient id={`lane-fill-${series.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.color} stopOpacity="0.24"/><stop offset="100%" stopColor={series.color} stopOpacity="0.015"/></linearGradient>{series.directionalColors&&<><linearGradient id={`lane-fill-${series.id}-positive`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.directionalColors!.positive} stopOpacity=".28"/><stop offset="100%" stopColor={series.directionalColors!.positive} stopOpacity=".015"/></linearGradient><linearGradient id={`lane-fill-${series.id}-negative`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.directionalColors!.negative} stopOpacity=".015"/><stop offset="100%" stopColor={series.directionalColors!.negative} stopOpacity=".28"/></linearGradient></>}</React.Fragment>)}</defs>
      {selectedSeries.map((series, seriesIndex) => {
        const range = ranges.get(series.id)!;
        const displayColor=seriesColorForValue(series,series.value(points[points.length-1]));
        return <g key={`lane-${series.id}`}>
          <rect className={`chart-lane ${seriesIndex % 2 ? "alternate" : ""} ${(series.id === "currentA" || series.id === "powerW") ? "current-lane" : ""}`} x={left} y={laneTop(seriesIndex)} width={width-left-right} height={laneHeight} rx="7"/>
          {[0,.5,1].map((step) => {
            const gy = laneTop(seriesIndex) + step * laneHeight;
            const value = range.maximum - step * (range.maximum - range.minimum);
            return <g key={`${series.id}-y-${step}`}><line className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/><text className="lane-axis-label" x={left-10} y={gy+4} textAnchor="end">{value.toFixed(series.decimals)} {series.unit}</text></g>;
          })}
           <rect x={left} y={laneTop(seriesIndex)} width="4" height={laneHeight} rx="2" fill={displayColor}/>
            <rect className="lane-title-bg" x={left+7} y={laneTop(seriesIndex)+4} width={Math.min(175,series.title.length*8+18)} height="20" rx="4"/>
            <text className="lane-title" x={left+12} y={laneTop(seriesIndex)+18} fill={displayColor}>{series.title}</text>
           {(series.id === "currentA" || series.id === "powerW") && range.minimum<=0&&range.maximum>=0 && <line className="zero-line" x1={left} x2={width-right} y1={y(series, 0, seriesIndex)} y2={y(series, 0, seriesIndex)}/>}
           {series.thresholdMetric && <ThresholdLines thresholds={thresholds.filter((threshold) => threshold.metric === series.thresholdMetric)} y={(value) => y(series, value, seriesIndex)} left={left} right={width-right} unit={series.unit} decimals={series.decimals} showLabels={chartSettings.showThresholdLabels} clampY={{top:laneTop(seriesIndex)+8,bottom:laneBottom(seriesIndex)-8}}/>}
         </g>;
      })}
      {[0,1,2,3,4].map((step) => {
        const gx = left + step / 4 * (width - left - right);
        const timestamp = firstTime + step / 4 * timeRange;
        return <g key={`x-${step}`}><line className="chart-grid vertical" x1={gx} x2={gx} y1={top} y2={height-bottom}/><text className="time-label" x={gx} y={height-18} textAnchor={step===0?"start":step===4?"end":"middle"}>{date(timestamp)}</text></g>;
      })}
      <ChartMarkerLines markers={markers} x={x} top={top} bottom={height-bottom} onPointerDown={(id,event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setDraggingMarkerId(id);}}/>
      {chartSettings.showCurveShadows&&paths.filter(({series})=>!series.directionalColors).map(({series,areaPath}) => <path key={`${series.id}-area`} d={areaPath} fill={`url(#lane-fill-${series.id})`} clipPath={`url(#lane-clip-${series.id})`} className="lane-area"/>)}
      {chartSettings.showCurveShadows&&paths.map(({series,directionalPaths})=>directionalPaths&&series.directionalColors?<g key={`${series.id}-directional-area`} clipPath={`url(#lane-clip-${series.id})`}>{directionalPaths.positive.map((segment,index)=><path key={`positive-${index}`} d={segment.area} fill={`url(#lane-fill-${series.id}-positive)`}/>)}{directionalPaths.negative.map((segment,index)=><path key={`negative-${index}`} d={segment.area} fill={`url(#lane-fill-${series.id}-negative)`}/>)}</g>:null)}
      {paths.map(({series,path,directionalPaths}) => directionalPaths&&series.directionalColors ? <g key={series.id} clipPath={`url(#lane-clip-${series.id})`}>{directionalPaths.positive.map((segment,index)=><path key={`positive-${index}`} d={segment.line} fill="none" stroke={series.directionalColors!.positive} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line composite-line" style={{filter:"none"}}/>)}{directionalPaths.negative.map((segment,index)=><path key={`negative-${index}`} d={segment.line} fill="none" stroke={series.directionalColors!.negative} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line composite-line" style={{filter:"none"}}/>)}</g> : <path key={series.id} d={path} fill="none" stroke={series.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line composite-line" clipPath={`url(#lane-clip-${series.id})`}/>) }
      {selectedSeries[0]&&<ConnectionEventMarkers events={connectionEvents} points={points} x={x} yValue={(point)=>y(selectedSeries[0],selectedSeries[0].value(point),0)} left={left} right={width-right} top={laneTop(0)} bottom={laneBottom(0)} language={language} t={t}/>}
      {chartSettings.showSocEvents&&socSeriesIndex>=0&&<SocBoundaryPointMarkers events={socEvents.filter((event)=>event.timestamp>=firstTime&&event.timestamp<=lastTime)} x={x} yValue={(event)=>y(selectedSeries[socSeriesIndex],event.socPercent,socSeriesIndex)} left={left} right={width-right} top={laneTop(socSeriesIndex)} bottom={laneBottom(socSeriesIndex)} language={language} t={t}/>}
      {hoveredPoint && <><line className="cursor-line" x1={x(hoveredPoint.timestamp)} x2={x(hoveredPoint.timestamp)} y1={top} y2={height-bottom}/>{selectedSeries.map((series, seriesIndex) => <circle key={series.id} cx={x(hoveredPoint.timestamp)} cy={y(series, series.value(hoveredPoint), seriesIndex)} r="6" fill={series.value(hoveredPoint)>=0?series.directionalColors?.positive??series.color:series.directionalColors?.negative??series.color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</>}
    </svg>
    {hoveredPoint && <div className={`chart-readout ${Number(hoveredIndex) > points.length * .65 ? "readout-left" : Number(hoveredIndex) < points.length * .25 ? "readout-right" : "readout-center"}`}><time>{new Date(hoveredPoint.timestamp).toLocaleString(language)}</time>{selectedSeries.map((series) => <span key={series.id}><i style={{background:seriesColorForValue(series,series.value(hoveredPoint))}}/>{series.title}<strong style={{color:seriesColorForValue(series,series.value(hoveredPoint))}}>{series.value(hoveredPoint).toFixed(series.decimals)} {series.unit}</strong></span>)}</div>}
    </div>}
  </article>;
}

function CellVoltageHistoryChart({ points, socEvents, connectionEvents, supportSeries, setSeriesColor, setSignedColor, period, setPeriod, language, t, viewport, thresholds, bmsReferences, chemistry, protectionSettings, chartSettings, setChartSettings, onHide }: {
  points: HistoryPoint[];
  socEvents: SocBoundaryEvent[];
  connectionEvents: ConnectionHistoryEvent[];
  supportSeries: HistorySeries[];
  setSeriesColor: (id: HistoryMetric, color: string) => void;
  setSignedColor: (id: SignedHistoryMetric, direction: keyof DirectionalColors, color: string) => void;
  period: HistoryPeriod;
  setPeriod: (period: HistoryPeriod) => void;
  language: Language;
  t: ReturnType<typeof translator>;
  viewport: TimeViewport;
  thresholds:ChartThreshold[];
  bmsReferences:BmsThresholdReference[];
  chemistry?:string|null;
  protectionSettings:GatewaySnapshot["protectionSettings"];
  chartSettings:ChartDisplaySettings;
  setChartSettings:(settings:ChartDisplaySettings)=>void;
  onHide:()=>void;
}) {
  const cellCount = Math.min(32, Math.max(0, ...points.map((point) => point.cellsV?.length ?? 0)));
  const [selectedCells, setSelectedCells] = useState<number[]>(() => loadSelectedCells(cellCount));
  const [cellColors, setCellColors] = useState<Record<number, string>>(() => loadCellColors(cellCount));
  const [supportMetrics, setSupportMetrics] = useState<HistoryMetric[]>(loadCellSupportMetrics);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThresholdEditor,setShowThresholdEditor]=useState(false);
  const [markers,setMarkers]=useState<ChartMarker[]>(()=>loadChartMarkers("bms-history-markers-cells-v1"));
  const [draggingMarkerId,setDraggingMarkerId]=useState<string|null>(null);
  const boundaryEvents = socEvents.length ? socEvents : inferSocBoundaryEvents(points);
  const [selectedEventTimestamp, setSelectedEventTimestamp] = useState<number | null>(() => boundaryEvents.at(-1)?.timestamp ?? null);
  const panelRef = useRef<HTMLElement | null>(null);
  useEffect(()=>localStorage.setItem("bms-history-markers-cells-v1",JSON.stringify(markers)),[markers]);

  useEffect(() => {
    setSelectedCells((current) => current.filter((index) => index < cellCount));
  }, [cellCount]);
  useEffect(() => {
    localStorage.setItem("bms-cell-history-selection", JSON.stringify(selectedCells));
    localStorage.setItem("bms-cell-history-colors", JSON.stringify(cellColors));
    localStorage.setItem("bms-cell-support-metrics", JSON.stringify(supportMetrics));
  }, [selectedCells, cellColors, supportMetrics]);
  useEffect(() => {
    if (boundaryEvents.length && !boundaryEvents.some((event) => event.timestamp === selectedEventTimestamp)) setSelectedEventTimestamp(boundaryEvents.at(-1)!.timestamp);
  }, [boundaryEvents, selectedEventTimestamp]);
  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await panelRef.current?.requestFullscreen();
  };
  const toggleCell = (index: number) => setSelectedCells((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index].sort((a,b) => a-b));
  const toggleSupportMetric = (id: HistoryMetric) => setSupportMetrics((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current,id]);
  const activeCells = selectedCells.filter((index) => index < cellCount);
  const activeSupportSeries = supportMetrics.map((id) => supportSeries.find((series) => series.id===id)).filter((series): series is HistorySeries => Boolean(series));
  const standaloneMode=activeSupportSeries.length===0;
  const visibleCellThresholds=standaloneMode?thresholds:[];

  if (cellCount === 0) return <article ref={panelRef} className="panel cell-history-chart">
    <div className="panel-heading"><span>{t("cellHistory")}</span><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("cellHistory")}`}><EyeOff/></button></div>
    <div className="chart-empty"><ChartNoAxesCombined/><span>{t("noCellHistory")}</span></div>
  </article>;

  const width = 1200;
  const left = 78;
  const right = 28;
  const top = 24;
  const bottom = 54;
  const cellLaneHeight = 300;
  const supportLaneHeight = 104;
  const laneGap = 12;
  const supportHeight = activeSupportSeries.length ? laneGap+activeSupportSeries.length*supportLaneHeight+Math.max(0,activeSupportSeries.length-1)*laneGap : 0;
  const height = top+cellLaneHeight+supportHeight+bottom;
  const firstTime = points[0].timestamp;
  const lastTime = points[points.length - 1].timestamp;
  const timeRange = Math.max(1, lastTime - firstTime);
  const x = (timestamp: number) => left + (timestamp - firstTime) / timeRange * (width-left-right);
  // Keep the cell traces readable. Distant BMS thresholds are clamped to the
  // chart edge instead of expanding the Y axis and flattening millivolt detail.
  const values = points.flatMap((point) => activeCells.map((index) => point.cellsV?.[index]).filter((value): value is number => Number.isFinite(value)));
  const cellVoltageRange=cellVoltageAxisRange(chemistry,protectionSettings,values);
  let minimum=cellVoltageRange.minimum;
  let maximum=cellVoltageRange.maximum;
  const cellY = (value: number) => top + (maximum-value)/(maximum-minimum)*cellLaneHeight;
  const supportTop = (index: number) => top+cellLaneHeight+laneGap+index*(supportLaneHeight+laneGap);
  const supportRanges = new Map(activeSupportSeries.map((series) => {
    const seriesValues = points.map(series.value).filter(Number.isFinite);
    let min=Math.min(...seriesValues);let max=Math.max(...seriesValues);
    if(chartSettings.symmetricBidirectionalScale&&(series.id==="currentA"||series.id==="powerW")){const magnitude=Math.max(1,...seriesValues.map(Math.abs));min=-magnitude;max=magnitude;}
    else if(min===max){min-=series.id==="socPercent"?1:.5;max+=series.id==="socPercent"?1:.5;}
    const pad=(max-min)*.06;
    return [series.id,{minimum:min-pad,maximum:max+pad}] as const;
  }));
  const supportY = (series: HistorySeries,value:number,index:number) => {const range=supportRanges.get(series.id)!;return supportTop(index)+(range.maximum-value)/(range.maximum-range.minimum)*supportLaneHeight;};
  const date = (timestamp: number) => new Date(timestamp).toLocaleString(language,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  const paths = activeCells.map((cellIndex) => ({
    cellIndex,
    path: points.map((point) => ({timestamp:point.timestamp,value:point.cellsV?.[cellIndex]})).filter((item): item is {timestamp:number;value:number} => Number.isFinite(item.value)).map((item,index) => `${index===0?"M":"L"}${x(item.timestamp).toFixed(1)},${cellY(item.value).toFixed(1)}`).join(" "),
  })).filter((item) => item.path);
  const supportPaths = activeSupportSeries.map((series,seriesIndex)=>({series,seriesIndex,path:points.map((point,index)=>`${index===0?"M":"L"}${x(point.timestamp).toFixed(1)},${supportY(series,series.value(point),seriesIndex).toFixed(1)}`).join(" "),directionalPaths:series.directionalColors?splitSignedPaths(points,series.value,(point)=>x(point.timestamp),(value)=>supportY(series,value,seriesIndex)):null}));
  const hoveredPoint = hoveredIndex == null ? null : points[hoveredIndex];
  const selectedEvent = boundaryEvents.find((event)=>event.timestamp===selectedEventTimestamp) ?? null;
  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.max(left,Math.min(width-right,(event.clientX-bounds.left)/bounds.width*width));
    const timestamp = firstTime+(position-left)/(width-left-right)*timeRange;
    if(draggingMarkerId){setMarkers((current)=>current.map((marker)=>marker.id===draggingMarkerId?{...marker,timestamp}:marker));return;}
    let nearest = 0;
    for (let index=1; index<points.length; index+=1) if (Math.abs(points[index].timestamp-timestamp)<Math.abs(points[nearest].timestamp-timestamp)) nearest=index;
    setHoveredIndex(nearest);
  };

  return <article ref={panelRef} className={`panel cell-history-chart ${chartSettings.showCurveShadows?"":"no-curve-shadows"}`}>
    <div className="panel-heading"><span>{t("cellHistory")}</span><div className="chart-heading-actions"><small>{cellCount}S · {t("cellCurves")}</small><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("cellHistory")}`}><EyeOff/></button><button type="button" className={`fullscreen-chart-button threshold-chart-button ${showThresholdEditor?"active":""}`} onClick={()=>setShowThresholdEditor((value)=>!value)} title={t("thresholdSettings")} aria-label={t("thresholdSettings")}><SlidersHorizontal/></button><button type="button" className="fullscreen-chart-button" onClick={toggleFullscreen} title={isFullscreen?t("exitFullscreen"):t("fullscreen")} aria-label={isFullscreen?t("exitFullscreen"):t("fullscreen")}>{isFullscreen?<Minimize2/>:<Maximize2/>}</button></div></div>
    <FullscreenPeriodPicker period={period} setPeriod={setPeriod} t={t}/>
    <FullscreenTimeNavigator viewport={viewport} language={language} t={t}/>
    <ChartMarkerToolbar markers={markers} setMarkers={setMarkers} firstTime={firstTime} lastTime={lastTime} language={language} t={t}/>
    {showThresholdEditor&&<><InlineThresholdEditor metric="cellVoltageV" unit="V" step={.001} settings={chartSettings} setSettings={setChartSettings} t={t} bmsReferences={bmsReferences}/>{!standaloneMode&&<div className="combined-threshold-note"><AlertTriangle/>{t("combinedThresholdsHidden")}</div>}</>}
    <div className="cell-series-toolbar"><div><button type="button" onClick={() => setSelectedCells(Array.from({length:cellCount},(_,index)=>index))}>{t("selectAll")}</button><button type="button" onClick={() => setSelectedCells([])}>{t("clearCells")}</button></div><span>{t("cellHistoryHint")}</span></div>
    <div className="cell-series-list">{Array.from({length:cellCount},(_,index) => <div className={`cell-series-choice ${activeCells.includes(index)?"selected":""}`} key={index}><button type="button" onClick={() => toggleCell(index)} aria-pressed={activeCells.includes(index)}><i style={{background:cellColors[index]}}/>{activeCells.includes(index)?"✓ ":""}C{index+1}</button><label title={t("curveColor")}><input type="color" value={cellColors[index]} aria-label={`${t("curveColor")}: C${index+1}`} onChange={(event) => setCellColors((current) => ({...current,[index]:event.target.value}))}/></label></div>)}</div>
    <div className="support-series-list"><strong>{t("combineWith")}</strong>{supportSeries.map((series)=><div className={`series-choice support-series-choice ${supportMetrics.includes(series.id)?"selected":""}`} key={series.id}><button type="button" onClick={()=>toggleSupportMetric(series.id)} aria-pressed={supportMetrics.includes(series.id)}><i style={{background:series.color}}/>{supportMetrics.includes(series.id)?"✓ ":""}{series.title}</button>{series.directionalColors?<SignedColorInputs series={series} t={t} onChange={(direction,color)=>setSignedColor(series.id as SignedHistoryMetric,direction,color)}/>:<label title={t("curveColor")}><input type="color" value={series.color} aria-label={`${t("curveColor")}: ${series.title}`} onChange={(event)=>setSeriesColor(series.id,event.target.value)}/></label>}</div>)}</div>
    {activeCells.length===0&&activeSupportSeries.length===0?<div className="chart-empty"><ChartNoAxesCombined/><span>{t("noSelectedCurves")}</span></div>:<div className="cell-history-plot"><svg viewBox={`0 0 ${width} ${height}`} style={{height:"auto",aspectRatio:`${width} / ${height}`}} role="img" aria-label={t("cellHistory")} onPointerMove={handlePointerMove} onPointerUp={()=>setDraggingMarkerId(null)} onPointerLeave={()=>{setHoveredIndex(null);setDraggingMarkerId(null);}}><defs>{activeSupportSeries.map((series,seriesIndex)=><React.Fragment key={series.id}><clipPath id={`support-lane-clip-${series.id}`}><rect x={left} y={supportTop(seriesIndex)} width={width-left-right} height={supportLaneHeight} rx="7"/></clipPath>{series.directionalColors&&<><linearGradient id={`support-fill-${series.id}-positive`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.directionalColors!.positive} stopOpacity=".28"/><stop offset="100%" stopColor={series.directionalColors!.positive} stopOpacity=".015"/></linearGradient><linearGradient id={`support-fill-${series.id}-negative`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.directionalColors!.negative} stopOpacity=".015"/><stop offset="100%" stopColor={series.directionalColors!.negative} stopOpacity=".28"/></linearGradient></>}</React.Fragment>)}</defs>
      <rect className="chart-lane" x={left} y={top} width={width-left-right} height={cellLaneHeight} rx="7"/>
      {[0,1,2,3,4].map((step)=>{const gy=top+step/4*cellLaneHeight;const value=maximum-step/4*(maximum-minimum);return <g key={`cell-y-${step}`}><line className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/><text className="axis-label" x={left-10} y={gy+4} textAnchor="end">{value.toFixed(3)} V</text></g>;})}
      {[0,1,2,3,4].map((step)=>{const gx=left+step/4*(width-left-right);const timestamp=firstTime+step/4*timeRange;return <g key={`cell-x-${step}`}><line className="chart-grid vertical" x1={gx} x2={gx} y1={top} y2={height-bottom}/><text className="time-label" x={gx} y={height-18} textAnchor={step===0?"start":step===4?"end":"middle"}>{date(timestamp)}</text></g>;})}
      <ChartMarkerLines markers={markers} x={x} top={top} bottom={height-bottom} onPointerDown={(id,event)=>{event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);setDraggingMarkerId(id);}}/>
      {paths.map(({cellIndex,path})=><path key={cellIndex} d={path} fill="none" stroke={cellColors[cellIndex]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line cell-history-line"/>)}
      <ThresholdLines thresholds={visibleCellThresholds} y={cellY} left={left} right={width-right} unit="V" decimals={3} showLabels={chartSettings.showThresholdLabels} valueAtY={(position)=>maximum-(position-top)/cellLaneHeight*(maximum-minimum)} step={.001} onAdjust={(threshold,value)=>adjustCustomThreshold(chartSettings,setChartSettings,threshold,value)} clampY={{top:top+8,bottom:top+cellLaneHeight-8}}/>
      <ChargeChannelMarkers points={points} thresholds={visibleCellThresholds} x={x} y={cellY} left={left} right={width-right} top={top} bottom={top+cellLaneHeight} language={language} t={t}/>
      {activeSupportSeries.map((series,seriesIndex)=>{const range=supportRanges.get(series.id)!;const signed=series.id==="currentA"||series.id==="powerW";const displayColor=seriesColorForValue(series,series.value(points.at(-1)!));return <g key={`support-lane-${series.id}`}><rect className={`chart-lane ${seriesIndex%2?"alternate":""} ${signed?"current-lane":""}`} x={left} y={supportTop(seriesIndex)} width={width-left-right} height={supportLaneHeight} rx="7"/>{[0,.5,1].map((step)=>{const gy=supportTop(seriesIndex)+step*supportLaneHeight;const value=range.maximum-step*(range.maximum-range.minimum);return <g key={`${series.id}-${step}`}><line className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/><text className="lane-axis-label" x={left-10} y={gy+4} textAnchor="end">{value.toFixed(series.decimals)} {series.unit}</text></g>;})}{signed&&range.minimum<=0&&range.maximum>=0&&<line className="zero-line" x1={left} x2={width-right} y1={supportY(series,0,seriesIndex)} y2={supportY(series,0,seriesIndex)}/>}<rect className="lane-title-bg" x={left+7} y={supportTop(seriesIndex)+4} width={Math.min(175,series.title.length*8+18)} height="20" rx="4"/><text className="lane-title" x={left+12} y={supportTop(seriesIndex)+18} fill={displayColor}>{series.title}</text></g>;})}
      {chartSettings.showCurveShadows&&supportPaths.map(({series,directionalPaths})=>directionalPaths&&series.directionalColors?<g key={`support-${series.id}-area`} clipPath={`url(#support-lane-clip-${series.id})`}>{directionalPaths.positive.map((segment,index)=><path key={`positive-${index}`} d={segment.area} fill={`url(#support-fill-${series.id}-positive)`}/>)}{directionalPaths.negative.map((segment,index)=><path key={`negative-${index}`} d={segment.area} fill={`url(#support-fill-${series.id}-negative)`}/>)}</g>:null)}
      {supportPaths.map(({series,path,directionalPaths})=>directionalPaths&&series.directionalColors?<g key={`support-${series.id}`} clipPath={`url(#support-lane-clip-${series.id})`}>{directionalPaths.positive.map((segment,index)=><path key={`positive-${index}`} d={segment.line} fill="none" stroke={series.directionalColors!.positive} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line composite-line" style={{filter:"none"}}/>)}{directionalPaths.negative.map((segment,index)=><path key={`negative-${index}`} d={segment.line} fill="none" stroke={series.directionalColors!.negative} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line composite-line" style={{filter:"none"}}/>)}</g>:<path key={`support-${series.id}`} d={path} fill="none" stroke={series.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line composite-line" clipPath={`url(#support-lane-clip-${series.id})`}/>) }
      {activeCells[0]!=null&&<ConnectionEventMarkers events={connectionEvents} points={points} x={x} yValue={(point)=>{const value=point.cellsV?.[activeCells[0]];return Number.isFinite(value)?cellY(value!):null;}} left={left} right={width-right} top={top} bottom={top+cellLaneHeight} language={language} t={t}/>}
      {chartSettings.showSocEvents&&boundaryEvents.filter((event)=>event.timestamp>=firstTime&&event.timestamp<=lastTime).map((event)=><g key={`soc-event-${event.timestamp}`} className={`soc-event-marker ${selectedEventTimestamp===event.timestamp?"selected":""}`} onClick={()=>setSelectedEventTimestamp(event.timestamp)} role="button" tabIndex={0} onKeyDown={(keyboardEvent)=>{if(keyboardEvent.key==="Enter"||keyboardEvent.key===" ")setSelectedEventTimestamp(event.timestamp);}}><line x1={x(event.timestamp)} x2={x(event.timestamp)} y1={top} y2={height-bottom}/><circle cx={x(event.timestamp)} cy={top+12} r="9"/><text x={x(event.timestamp)} y={top+16} textAnchor="middle">{event.socPercent===0?"0":"100"}</text></g>)}
      {hoveredPoint&&<><line className="cursor-line" x1={x(hoveredPoint.timestamp)} x2={x(hoveredPoint.timestamp)} y1={top} y2={height-bottom}/>{activeCells.map((cellIndex)=>{const value=hoveredPoint.cellsV?.[cellIndex];return Number.isFinite(value)?<circle key={cellIndex} cx={x(hoveredPoint.timestamp)} cy={cellY(value!)} r="5" fill={cellColors[cellIndex]} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>:null;})}{activeSupportSeries.map((series,seriesIndex)=><circle key={series.id} cx={x(hoveredPoint.timestamp)} cy={supportY(series,series.value(hoveredPoint),seriesIndex)} r="5" fill={series.value(hoveredPoint)>=0?series.directionalColors?.positive??series.color:series.directionalColors?.negative??series.color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</>}
    </svg>{hoveredPoint&&<div className={`chart-readout cell-readout ${Number(hoveredIndex) > points.length * .65 ? "readout-left" : Number(hoveredIndex) < points.length * .25 ? "readout-right" : "readout-center"}`}><time>{new Date(hoveredPoint.timestamp).toLocaleString(language)}</time>{activeSupportSeries.map((series)=>{const color=seriesColorForValue(series,series.value(hoveredPoint));return <span key={series.id}><i style={{background:color}}/>{series.title}<strong style={{color}}>{series.value(hoveredPoint).toFixed(series.decimals)} {series.unit}</strong></span>;})}{activeCells.map((cellIndex)=>{const value=hoveredPoint.cellsV?.[cellIndex];return Number.isFinite(value)?<span key={cellIndex}><i style={{background:cellColors[cellIndex]}}/>C{cellIndex+1}<strong>{value!.toFixed(3)} V</strong></span>:null;})}</div>}</div>}
    {chartSettings.showSocEvents&&boundaryEvents.length>0&&<SocDiagnosticPanel events={boundaryEvents} selectedEvent={selectedEvent} selectEvent={setSelectedEventTimestamp} language={language} t={t}/>}
  </article>;
}

function loadSelectedCells(cellCount: number,storageKey="bms-cell-history-selection"): number[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return Array.isArray(saved) ? saved.filter((index): index is number => Number.isInteger(index)&&index>=0&&index<cellCount) : Array.from({length:cellCount},(_,index)=>index);
  } catch {
    return Array.from({length:cellCount},(_,index)=>index);
  }
}

function InlineThresholdEditor({metric,unit,step,settings,setSettings,t,bmsReferences=[]}:{metric:ThresholdMetric;unit:string;step:number;settings:ChartDisplaySettings;setSettings:(settings:ChartDisplaySettings)=>void;t:ReturnType<typeof translator>;bmsReferences?:BmsThresholdReference[]}) {
  const limits=settings.customThresholds[metric];
  const visible=settings.showCustomThresholds&&settings.customThresholdVisibility[metric];
  const [validationError,setValidationError]=useState<string|null>(null);
  const update=(side:"low"|"high",raw:string)=>{
    const value=raw===""?null:Number(raw);
    if(value!==null&&!Number.isFinite(value))return;
    const next={...limits,[side]:value};
    const issue=thresholdValidationIssue(metric,next);
    if(issue){setValidationError(thresholdValidationMessage(issue,t));return;}
    setValidationError(null);
    setSettings({...settings,showCustomThresholds:value!==null?true:settings.showCustomThresholds,customThresholdVisibility:value!==null?{...settings.customThresholdVisibility,[metric]:true}:settings.customThresholdVisibility,customThresholds:{...settings.customThresholds,[metric]:next}});
  };
  const clear=()=>{setValidationError(null);setSettings({...settings,customThresholds:{...settings.customThresholds,[metric]:{low:null,high:null}}});};
  const setColor=(side:"low"|"high",color:string)=>setSettings({...settings,customThresholdColors:{...settings.customThresholdColors,[metric]:{...settings.customThresholdColors[metric],[side]:color}}});
  const setBmsDisplay=(id:BmsThresholdId,patch:Partial<{visible:boolean;color:string}>)=>setSettings({...settings,showBmsThresholds:patch.visible===true?true:settings.showBmsThresholds,bmsThresholdDisplay:{...settings.bmsThresholdDisplay,[id]:{...settings.bmsThresholdDisplay[id],...patch}}});
  const setVisible=(value:boolean)=>setSettings({...settings,showCustomThresholds:value?true:settings.showCustomThresholds,customThresholdVisibility:{...settings.customThresholdVisibility,[metric]:value}});
  return <div className="inline-threshold-editor">
    <div className="inline-threshold-heading"><span><SlidersHorizontal/><strong>{t("thresholdSettings")}</strong></span><label><input type="checkbox" checked={visible} onChange={(event)=>setVisible(event.target.checked)}/><i/>{t("showOnChart")}</label></div>
    <div className="inline-threshold-fields">
      <label><span>{t("lowerThreshold")}</span><div><input type="number" min={THRESHOLD_BOUNDS[metric][0]} max={THRESHOLD_BOUNDS[metric][1]} step={step} value={limits.low??""} placeholder="—" onChange={(event)=>update("low",event.target.value)}/><b>{unit}</b><input className="threshold-color-input" type="color" value={settings.customThresholdColors[metric].low} onChange={(event)=>setColor("low",event.target.value)} aria-label={`${t("thresholdColor")}: ${t("lowerThreshold")}`}/></div></label>
      <label><span>{t("upperThreshold")}</span><div><input type="number" min={THRESHOLD_BOUNDS[metric][0]} max={THRESHOLD_BOUNDS[metric][1]} step={step} value={limits.high??""} placeholder="—" onChange={(event)=>update("high",event.target.value)}/><b>{unit}</b><input className="threshold-color-input" type="color" value={settings.customThresholdColors[metric].high} onChange={(event)=>setColor("high",event.target.value)} aria-label={`${t("thresholdColor")}: ${t("upperThreshold")}`}/></div></label>
      <button type="button" onClick={clear}>{t("clearThresholds")}</button>
    </div>
    {bmsReferences.length>0&&<div className="bms-threshold-references"><strong>{t("bmsThresholdReferences")}</strong><div>{bmsReferences.map((item)=>{const display=item.id?settings.bmsThresholdDisplay[item.id]:null;return <span className={display?.visible?"shown":""} key={item.label}>{item.id&&<input type="checkbox" checked={display?.visible??false} onChange={(event)=>setBmsDisplay(item.id!,{visible:event.target.checked})} aria-label={`${t("showOnChart")}: ${item.label}`}/>}<b>{item.label}</b>{item.value.toFixed(item.unit==="V"?3:item.unit==="mV"?0:1)} {item.unit}{display&&<input className="bms-threshold-color" type="color" value={display.color} onChange={(event)=>setBmsDisplay(item.id!,{color:event.target.value})} aria-label={`${t("thresholdColor")}: ${item.label}`}/>}</span>;})}</div></div>}
    {validationError&&<small className="threshold-validation-error" role="alert">{validationError}</small>}<small>{t("thresholdReadOnlyHint")}</small>
  </div>;
}

function CellResistanceHistoryChart({points,connectionEvents,period,setPeriod,language,t,viewport,thresholds,chartSettings,setChartSettings,onHide}:{points:HistoryPoint[];connectionEvents:ConnectionHistoryEvent[];period:HistoryPeriod;setPeriod:(period:HistoryPeriod)=>void;language:Language;t:ReturnType<typeof translator>;viewport:TimeViewport;thresholds:ChartThreshold[];chartSettings:ChartDisplaySettings;setChartSettings:(settings:ChartDisplaySettings)=>void;onHide:()=>void}) {
  const cellCount=Math.min(32,Math.max(0,...points.map((point)=>point.cellResistanceMOhm?.length??0)));
  const [selectedCells,setSelectedCells]=useState<number[]>(()=>Array.from({length:cellCount},(_,index)=>index));
  const [hoveredIndex,setHoveredIndex]=useState<number|null>(null);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [showThresholdEditor,setShowThresholdEditor]=useState(false);
  const [markers,setMarkers]=useState<ChartMarker[]>(()=>loadChartMarkers("bms-history-markers-resistance-v1"));
  const [draggingMarkerId,setDraggingMarkerId]=useState<string|null>(null);
  const [showResistanceMethod,setShowResistanceMethod]=useState(false);
  const panelRef=useRef<HTMLElement|null>(null);
  useEffect(()=>localStorage.setItem("bms-history-markers-resistance-v1",JSON.stringify(markers)),[markers]);
  useEffect(()=>setSelectedCells((current)=>current.filter((index)=>index<cellCount)),[cellCount]);
  useEffect(()=>{const update=()=>setIsFullscreen(document.fullscreenElement===panelRef.current);document.addEventListener("fullscreenchange",update);return()=>document.removeEventListener("fullscreenchange",update);},[]);
  const toggleFullscreen=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await panelRef.current?.requestFullscreen();};
  const validPoints=points.filter((point)=>point.cellResistanceMOhm?.some((value)=>Number.isFinite(value)));
  const activeCells=selectedCells.filter((index)=>index<cellCount);
  if(validPoints.length===0)return <article ref={panelRef} className="panel cell-history-chart resistance-history-chart"><div className="panel-heading"><span>{t("resistanceHistory")}</span><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("resistanceHistory")}`}><EyeOff/></button></div><ResistanceMethodNote t={t} open={showResistanceMethod} setOpen={setShowResistanceMethod}/><div className="chart-empty"><Activity/><span>{t("noResistanceHistory")}</span></div></article>;
  const width=1200,height=430,left=78,right=28,top=28,bottom=58;
  const firstTime=points[0].timestamp,lastTime=points.at(-1)!.timestamp,timeRange=Math.max(1,lastTime-firstTime);
  const x=(timestamp:number)=>left+(timestamp-firstTime)/timeRange*(width-left-right);
  const resistanceThresholds=thresholds.filter((threshold)=>threshold.metric==="cellResistanceMOhm");
  const values=[...points.flatMap((point)=>activeCells.map((index)=>point.cellResistanceMOhm?.[index]).filter((value):value is number=>Number.isFinite(value))),...resistanceThresholds.map((threshold)=>threshold.value)];
  let minimum=values.length?Math.min(...values):0,maximum=values.length?Math.max(...values):1;
  if(minimum===maximum){minimum=Math.max(0,minimum-.1);maximum+=.1;}const padding=(maximum-minimum)*.08;minimum=Math.max(0,minimum-padding);maximum+=padding;
  const y=(value:number)=>top+(maximum-value)/(maximum-minimum)*(height-top-bottom);
  const date=(timestamp:number)=>new Date(timestamp).toLocaleString(language,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  const paths=activeCells.map((cellIndex)=>({cellIndex,path:points.map((point)=>({timestamp:point.timestamp,value:point.cellResistanceMOhm?.[cellIndex]})).filter((item):item is {timestamp:number;value:number}=>Number.isFinite(item.value)).map((item,index)=>`${index===0?"M":"L"}${x(item.timestamp).toFixed(1)},${y(item.value).toFixed(1)}`).join(" ")})).filter((item)=>item.path);
  const hoveredPoint=hoveredIndex==null?null:points[hoveredIndex];
  const move=(event:ReactPointerEvent<SVGSVGElement>)=>{const bounds=event.currentTarget.getBoundingClientRect();const position=Math.max(left,Math.min(width-right,(event.clientX-bounds.left)/bounds.width*width));const timestamp=firstTime+(position-left)/(width-left-right)*timeRange;if(draggingMarkerId){setMarkers((current)=>current.map((marker)=>marker.id===draggingMarkerId?{...marker,timestamp}:marker));return;}let nearest=0;for(let index=1;index<points.length;index+=1)if(Math.abs(points[index].timestamp-timestamp)<Math.abs(points[nearest].timestamp-timestamp))nearest=index;setHoveredIndex(nearest);};
  return <article ref={panelRef} className={`panel cell-history-chart resistance-history-chart ${chartSettings.showCurveShadows?"":"no-curve-shadows"}`}>
    <div className="panel-heading"><span>{t("resistanceHistory")}</span><div className="chart-heading-actions"><small>{t("resistanceMedian")}</small><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${t("resistanceHistory")}`}><EyeOff/></button><button type="button" className={`fullscreen-chart-button threshold-chart-button ${showThresholdEditor?"active":""}`} onClick={()=>setShowThresholdEditor((value)=>!value)} title={t("thresholdSettings")} aria-label={t("thresholdSettings")}><SlidersHorizontal/></button><button type="button" className="fullscreen-chart-button" onClick={toggleFullscreen} title={isFullscreen?t("exitFullscreen"):t("fullscreen")} aria-label={isFullscreen?t("exitFullscreen"):t("fullscreen")}>{isFullscreen?<Minimize2/>:<Maximize2/>}</button></div></div>
    <FullscreenPeriodPicker period={period} setPeriod={setPeriod} t={t}/>
    <FullscreenTimeNavigator viewport={viewport} language={language} t={t}/>
    <ChartMarkerToolbar markers={markers} setMarkers={setMarkers} firstTime={firstTime} lastTime={lastTime} language={language} t={t}/>
    {showThresholdEditor&&<InlineThresholdEditor metric="cellResistanceMOhm" unit="mΩ" step={.01} settings={chartSettings} setSettings={setChartSettings} t={t}/>}
    <ResistanceMethodNote t={t} open={showResistanceMethod} setOpen={setShowResistanceMethod}/>
    <div className="cell-series-toolbar"><div><button type="button" onClick={()=>setSelectedCells(Array.from({length:cellCount},(_,index)=>index))}>{t("selectAll")}</button><button type="button" onClick={()=>setSelectedCells([])}>{t("clearCells")}</button></div><span>{t("cellHistoryHint")}</span></div>
    <div className="cell-series-list">{Array.from({length:cellCount},(_,index)=><div className={`cell-series-choice ${activeCells.includes(index)?"selected":""}`} key={index}><button type="button" onClick={()=>setSelectedCells((current)=>current.includes(index)?current.filter((item)=>item!==index):[...current,index].sort((a,b)=>a-b))} aria-pressed={activeCells.includes(index)}><i style={{background:CELL_COLORS[index%CELL_COLORS.length]}}/>{activeCells.includes(index)?"✓ ":""}C{index+1}</button></div>)}</div>
    {activeCells.length===0?<div className="chart-empty"><ChartNoAxesCombined/><span>{t("noSelectedCurves")}</span></div>:<div className="cell-history-plot"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("resistanceHistory")} onPointerMove={move} onPointerUp={()=>setDraggingMarkerId(null)} onPointerLeave={()=>{setHoveredIndex(null);setDraggingMarkerId(null);}}>
      {[0,1,2,3,4].map((step)=>{const gy=top+step/4*(height-top-bottom);const value=maximum-step/4*(maximum-minimum);return <g key={`r-y-${step}`}><line className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/><text className="axis-label" x={left-10} y={gy+4} textAnchor="end">{value.toFixed(2)} mΩ</text></g>;})}
      {[0,1,2,3,4].map((step)=>{const gx=left+step/4*(width-left-right);const timestamp=firstTime+step/4*timeRange;return <g key={`r-x-${step}`}><line className="chart-grid vertical" x1={gx} x2={gx} y1={top} y2={height-bottom}/><text className="time-label" x={gx} y={height-18} textAnchor={step===0?"start":step===4?"end":"middle"}>{date(timestamp)}</text></g>;})}
      <ChartMarkerLines markers={markers} x={x} top={top} bottom={height-bottom} onPointerDown={(id,event)=>{event.currentTarget.setPointerCapture(event.pointerId);setDraggingMarkerId(id);}}/>
      {paths.map(({cellIndex,path})=><path key={cellIndex} d={path} fill="none" stroke={CELL_COLORS[cellIndex%CELL_COLORS.length]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line cell-history-line"/>)}
      <ThresholdLines thresholds={resistanceThresholds} y={y} left={left} right={width-right} unit="mΩ" decimals={2} showLabels={chartSettings.showThresholdLabels} valueAtY={(position)=>maximum-(position-top)/(height-top-bottom)*(maximum-minimum)} step={.01} onAdjust={(threshold,value)=>adjustCustomThreshold(chartSettings,setChartSettings,threshold,value)}/>
      {activeCells[0]!=null&&<ConnectionEventMarkers events={connectionEvents} points={points} x={x} yValue={(point)=>{const value=point.cellResistanceMOhm?.[activeCells[0]];return Number.isFinite(value)?y(value!):null;}} left={left} right={width-right} top={top} bottom={height-bottom} language={language} t={t}/>}
      {hoveredPoint&&<><line className="cursor-line" x1={x(hoveredPoint.timestamp)} x2={x(hoveredPoint.timestamp)} y1={top} y2={height-bottom}/>{activeCells.map((cellIndex)=>{const value=hoveredPoint.cellResistanceMOhm?.[cellIndex];return Number.isFinite(value)?<circle key={cellIndex} cx={x(hoveredPoint.timestamp)} cy={y(value!)} r="5" fill={CELL_COLORS[cellIndex%CELL_COLORS.length]} stroke="#fff" strokeWidth="2"/>:null;})}</>}
    </svg>{hoveredPoint&&<div className={`chart-readout cell-readout ${Number(hoveredIndex) > points.length * .65 ? "readout-left" : Number(hoveredIndex) < points.length * .25 ? "readout-right" : "readout-center"}`}><time>{new Date(hoveredPoint.timestamp).toLocaleString(language)}</time>{activeCells.map((cellIndex)=>{const value=hoveredPoint.cellResistanceMOhm?.[cellIndex];return Number.isFinite(value)?<span key={cellIndex}><i style={{background:CELL_COLORS[cellIndex%CELL_COLORS.length]}}/>C{cellIndex+1}<strong>{value!.toFixed(2)} mΩ</strong></span>:null;})}</div>}</div>}
  </article>;
}

function ResistanceMethodNote({t,open,setOpen}:{t:ReturnType<typeof translator>;open:boolean;setOpen:(value:boolean)=>void}) {
  return <div className={`resistance-method-note ${open?"open":""}`}>
    <div className="resistance-method-warning"><AlertTriangle/><strong>{t("resistanceHint")}</strong><button type="button" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?t("resistanceDetailsClose"):t("resistanceDetails")}</button></div>
    {open&&<div className="resistance-method-details"><strong>{t("resistanceMethodTitle")}</strong><p>{t("resistanceMethodBody")}</p><p>{t("resistanceMethodUse")}</p><p>{t("resistanceMethodLimits")}</p></div>}
  </div>;
}

function loadCellColors(cellCount: number): Record<number,string> {
  try {
    const saved = JSON.parse(localStorage.getItem("bms-cell-history-colors") ?? "{}");
    return Object.fromEntries(Array.from({length:cellCount},(_,index)=>[index,typeof saved[index] === "string" ? saved[index] : CELL_COLORS[index%CELL_COLORS.length]]));
  } catch {
    return Object.fromEntries(Array.from({length:cellCount},(_,index)=>[index,CELL_COLORS[index%CELL_COLORS.length]]));
  }
}

function loadCellSupportMetrics(): HistoryMetric[] {
  const fallback: HistoryMetric[] = ["currentA","socPercent","deltaMv"];
  try {
    const saved=JSON.parse(localStorage.getItem("bms-cell-support-metrics")??"null");
    const valid: HistoryMetric[]=["packVoltageV","currentA","chargeCurrentA","dischargeCurrentA","powerW","socPercent","temperatureC","deltaMv"];
    return Array.isArray(saved)?saved.filter((item):item is HistoryMetric=>valid.includes(item)):fallback;
  } catch {
    return fallback;
  }
}

function SocDiagnosticPanel({events,selectedEvent,selectEvent,language,t}:{events:SocBoundaryEvent[];selectedEvent:SocBoundaryEvent|null;selectEvent:(timestamp:number)=>void;language:Language;t:ReturnType<typeof translator>}){
  if(!selectedEvent)return null;
  const cells=selectedEvent.cellsV??[];
  const {minimum,maximum,minimumIndex,maximumIndex}=calculateSocEventCellStats(selectedEvent);
  return <section className="soc-diagnostics"><div className="diagnostic-heading"><div><strong>{t("socDiagnostics")}</strong><span>{t("socDiagnosticsHint")}</span></div><div className="soc-event-tabs">{events.map((event)=><button type="button" className={event.timestamp===selectedEvent.timestamp?"selected":""} key={event.timestamp} onClick={()=>selectEvent(event.timestamp)}><time>{new Date(event.timestamp).toLocaleString(language,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</time><b>{event.previousSocPercent.toFixed(0)}% → {event.socPercent.toFixed(0)}%</b></button>)}</div></div><div className="diagnostic-grid">
    <DiagnosticValue label={t("eventTime")} value={new Date(selectedEvent.timestamp).toLocaleString(language)}/>
    <DiagnosticValue label={t("socTransition")} value={`${selectedEvent.previousSocPercent.toFixed(0)}% → ${selectedEvent.socPercent.toFixed(0)}%`} accent/>
    <DiagnosticValue label={t("current")} value={`${selectedEvent.currentA>=0?"+":""}${selectedEvent.currentA.toFixed(2)} A`}/>
    <DiagnosticValue label={t("power")} value={`${selectedEvent.powerW>=0?"+":""}${selectedEvent.powerW.toFixed(0)} W`}/>
    <DiagnosticValue label={t("voltage")} value={`${selectedEvent.packVoltageV.toFixed(2)} V`}/>
    <DiagnosticValue label={t("minCell")} value={minimum==null?"—":`C${minimumIndex+1} · ${minimum.toFixed(3)} V`} warning/>
    <DiagnosticValue label={t("maxCell")} value={maximum==null?"—":`C${maximumIndex+1} · ${maximum.toFixed(3)} V`}/>
    <DiagnosticValue label={t("imbalance")} value={`${selectedEvent.deltaMv.toFixed(0)} mV`}/>
    <DiagnosticValue label={t("temp")} value={`${selectedEvent.temperatureC.toFixed(1)} °C`}/>
    <DiagnosticValue label={t("alarms")} value={selectedEvent.alarmMask?`0x${selectedEvent.alarmMask.toString(16).toUpperCase()}`:t("normal")}/>
  </div>{cells.length>0&&<div className="diagnostic-cells"><strong>{t("cellVoltageAtEvent")}</strong><div>{cells.map((voltage,index)=><span className={index===minimumIndex?"minimum":index===maximumIndex?"maximum":""} key={index}><b>C{index+1}</b>{voltage.toFixed(3)} V</span>)}</div></div>}</section>;
}

function DiagnosticValue({label,value,accent=false,warning=false}:{label:string;value:string;accent?:boolean;warning?:boolean}){
  return <div className={`diagnostic-value ${accent?"accent":""} ${warning?"warning":""}`}><span>{label}</span><strong>{value}</strong></div>;
}

function IndividualHistoryCharts({points,connectionEvents,socEvents,series,period,setPeriod,language,t,viewport,thresholds,protectionSettings,packVoltageRange,chartSettings,setChartSettings,setSeriesColor,setSignedColor}:{points:HistoryPoint[];connectionEvents:ConnectionHistoryEvent[];socEvents:SocBoundaryEvent[];series:HistorySeries[];period:HistoryPeriod;setPeriod:(period:HistoryPeriod)=>void;language:Language;t:ReturnType<typeof translator>;viewport:TimeViewport;thresholds:ChartThreshold[];protectionSettings:GatewaySnapshot["protectionSettings"];packVoltageRange:VoltageAxisRange;chartSettings:ChartDisplaySettings;setChartSettings:(settings:ChartDisplaySettings)=>void;setSeriesColor:(id:HistoryMetric,color:string)=>void;setSignedColor:(id:SignedHistoryMetric,direction:keyof DirectionalColors,color:string)=>void}){
  return <section className="individual-history-section"><div className="section-heading"><strong>{t("individualCharts")}</strong><span>{t("individualChartsHint")}</span></div><div className="individual-history-grid">{series.map((item)=><IndividualMetricChart key={item.id} points={points} connectionEvents={connectionEvents} socEvents={socEvents} series={item} period={period} setPeriod={setPeriod} language={language} t={t} viewport={viewport} thresholds={item.thresholdMetric ? thresholds.filter((threshold)=>threshold.metric===item.thresholdMetric) : []} bmsReferences={item.thresholdMetric ? bmsThresholdReferences(item.thresholdMetric,protectionSettings,t) : []} packVoltageRange={packVoltageRange} chartSettings={chartSettings} setChartSettings={setChartSettings} setSeriesColor={setSeriesColor} setSignedColor={setSignedColor}/>)}</div></section>;
}

function FullscreenPeriodPicker({period,setPeriod,t}:{period:HistoryPeriod;setPeriod:(period:HistoryPeriod)=>void;t:ReturnType<typeof translator>}){
  return <div className="fullscreen-period-picker"><span>{t("period")}</span>{HISTORY_PERIODS.map(([id])=><button type="button" key={id} className={period===id?"selected":""} onClick={()=>setPeriod(id)}>{t(id)}</button>)}</div>;
}

function FullscreenTimeNavigator({viewport,language,t}:{viewport:TimeViewport;language:Language;t:ReturnType<typeof translator>}){
  const trackRef=useRef<HTMLDivElement|null>(null);
  const dragRef=useRef<{mode:"move"|"start"|"end";clientX:number;from:number;to:number}|null>(null);
  const baseRange=Math.max(1,viewport.baseTo-viewport.baseFrom);
  const currentRange=Math.max(1,viewport.to-viewport.from);
  const leftPercent=Math.max(0,Math.min(100,(viewport.from-viewport.baseFrom)/baseRange*100));
  const widthPercent=Math.max(.4,Math.min(100-leftPercent,currentRange/baseRange*100));
  const format=(timestamp:number)=>new Date(timestamp).toLocaleString(language,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  const applyRange=(from:number,to:number)=>{
    const span=Math.min(baseRange,Math.max(baseRange/250,to-from));
    let nextFrom=from,nextTo=from+span;
    if(nextFrom<viewport.baseFrom){nextFrom=viewport.baseFrom;nextTo=nextFrom+span;}
    if(nextTo>viewport.baseTo){nextTo=viewport.baseTo;nextFrom=nextTo-span;}
    viewport.setRange(nextFrom,nextTo);
  };
  const pan=(direction:-1|1)=>applyRange(viewport.from+currentRange*.2*direction,viewport.to+currentRange*.2*direction);
  const beginDrag=(mode:"move"|"start"|"end",event:ReactPointerEvent<HTMLDivElement>)=>{
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current={mode,clientX:event.clientX,from:viewport.from,to:viewport.to};
  };
  const continueDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current,track=trackRef.current;
    if(!drag||!track)return;
    event.preventDefault();
    event.stopPropagation();
    const delta=(event.clientX-drag.clientX)/Math.max(1,track.getBoundingClientRect().width)*baseRange;
    const minimumSpan=baseRange/250;
    if(drag.mode==="move")applyRange(drag.from+delta,drag.to+delta);
    else if(drag.mode==="start")viewport.setRange(Math.max(viewport.baseFrom,Math.min(drag.to-minimumSpan,drag.from+delta)),drag.to);
    else viewport.setRange(drag.from,Math.min(viewport.baseTo,Math.max(drag.from+minimumSpan,drag.to+delta)));
  };
  const endDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    event.stopPropagation();
    dragRef.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="fullscreen-time-navigator" onPointerDown={(event)=>event.stopPropagation()}>
    <div className="time-navigator-heading"><span><strong>{t("timeNavigator")}</strong>{t("selectionZoomHint")}</span><time>{format(viewport.from)} — {format(viewport.to)}</time></div>
    <div className="time-navigator-controls">
      <button type="button" onClick={()=>pan(-1)} title={t("panLeft")} aria-label={t("panLeft")}>←</button>
      <div ref={trackRef} className="time-navigator-track">
        <div className="time-navigator-window" style={{left:`${leftPercent}%`,width:`${widthPercent}%`}} onPointerDown={(event)=>beginDrag("move",event)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="time-navigator-handle start" onPointerDown={(event)=>beginDrag("start",event)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={endDrag}/>
          <span/>
          <div className="time-navigator-handle end" onPointerDown={(event)=>beginDrag("end",event)} onPointerMove={continueDrag} onPointerUp={endDrag} onPointerCancel={endDrag}/>
        </div>
      </div>
      <button type="button" onClick={()=>pan(1)} title={t("panRight")} aria-label={t("panRight")}>→</button>
      <button type="button" className="time-navigator-reset" onClick={viewport.reset}>{t("resetZoom")}</button>
    </div>
  </div>;
}

function IndividualMetricChart({points,connectionEvents,socEvents,series,period,setPeriod,language,t,viewport,thresholds,bmsReferences,packVoltageRange,chartSettings,setChartSettings,setSeriesColor,setSignedColor}:{points:HistoryPoint[];connectionEvents:ConnectionHistoryEvent[];socEvents:SocBoundaryEvent[];series:HistorySeries;period:HistoryPeriod;setPeriod:(period:HistoryPeriod)=>void;language:Language;t:ReturnType<typeof translator>;viewport:TimeViewport;thresholds:ChartThreshold[];bmsReferences:BmsThresholdReference[];packVoltageRange:VoltageAxisRange;chartSettings:ChartDisplaySettings;setChartSettings:(settings:ChartDisplaySettings)=>void;setSeriesColor:(id:HistoryMetric,color:string)=>void;setSignedColor:(id:SignedHistoryMetric,direction:keyof DirectionalColors,color:string)=>void}){
  const [hoveredIndex,setHoveredIndex]=useState<number|null>(null);
  const [isFullscreen,setIsFullscreen]=useState(false);
  const [showThresholdEditor,setShowThresholdEditor]=useState(false);
  const [markers,setMarkers]=useState<ChartMarker[]>(()=>loadChartMarkers(`bms-history-markers-${series.id}-v1`));
  const [draggingMarkerId,setDraggingMarkerId]=useState<string|null>(null);
  const panelRef=useRef<HTMLElement|null>(null);
  useEffect(()=>localStorage.setItem(`bms-history-markers-${series.id}-v1`,JSON.stringify(markers)),[markers,series.id]);
  useEffect(()=>{
    const update=()=>setIsFullscreen(document.fullscreenElement===panelRef.current);
    document.addEventListener("fullscreenchange",update);
    return()=>document.removeEventListener("fullscreenchange",update);
  },[]);
  const toggleFullscreen=async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await panelRef.current?.requestFullscreen();};
  const hideChart=async()=>{
    if(document.fullscreenElement===panelRef.current)await document.exitFullscreen();
    setChartSettings({...chartSettings,individualChartVisibility:{...chartSettings.individualChartVisibility,[series.id]:false}});
  };
  const width=1000;
  const height=360;
  const left=82;
  const right=28;
  const top=24;
  const bottom=54;
  const firstTime=points[0].timestamp;
  const lastTime=points[points.length-1].timestamp;
  const timeRange=Math.max(1,lastTime-firstTime);
  const x=(timestamp:number)=>left+(timestamp-firstTime)/timeRange*(width-left-right);
  const dataValues=points.map(series.value).filter(Number.isFinite);
  const values=dataValues;
  let minimum=series.id==="packVoltageV"?packVoltageRange.minimum:Math.min(...values);
  let maximum=series.id==="packVoltageV"?packVoltageRange.maximum:Math.max(...values);
  // Current and power stay centred on zero. This keeps charging and load
  // sides visible and directly comparable even while only one direction is active.
  if(chartSettings.symmetricBidirectionalScale&&(series.id==="powerW"||series.id==="currentA")){const magnitude=Math.max(1,...values.map(Math.abs));minimum=-magnitude;maximum=magnitude;}
  else if(minimum===maximum){const spread:Record<HistoryMetric,number>={packVoltageV:.01,currentA:.5,chargeCurrentA:.5,dischargeCurrentA:.5,powerW:1,socPercent:1,temperatureC:.2,deltaMv:1};minimum-=spread[series.id];maximum+=spread[series.id];}
  if(series.id!=="packVoltageV"){
    const padding=(maximum-minimum)*.07;
    minimum-=padding;
    maximum+=padding;
  }
  const y=(value:number)=>top+(maximum-value)/(maximum-minimum)*(height-top-bottom);
  const linePath=points.map((point,index)=>`${index===0?"M":"L"}${x(point.timestamp).toFixed(1)},${y(series.value(point)).toFixed(1)}`).join(" ");
  const baseline=series.directionalColors?y(0):height-bottom;
  const areaPath=`${linePath} L${x(lastTime).toFixed(1)},${baseline.toFixed(1)} L${x(firstTime).toFixed(1)},${baseline.toFixed(1)} Z`;
  const directionalPaths=series.directionalColors?splitSignedPaths(points,series.value,(point)=>x(point.timestamp),y):null;
  const date=(timestamp:number)=>new Date(timestamp).toLocaleString(language,{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  const hoveredPoint=hoveredIndex==null?null:points[hoveredIndex];
  const handlePointerMove=(event:ReactPointerEvent<SVGSVGElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    const position=Math.max(left,Math.min(width-right,(event.clientX-bounds.left)/bounds.width*width));
    const timestamp=firstTime+(position-left)/(width-left-right)*timeRange;
    if(draggingMarkerId){setMarkers((current)=>current.map((marker)=>marker.id===draggingMarkerId?{...marker,timestamp}:marker));return;}
    let nearest=0;
    for(let index=1;index<points.length;index+=1)if(Math.abs(points[index].timestamp-timestamp)<Math.abs(points[nearest].timestamp-timestamp))nearest=index;
    setHoveredIndex(nearest);
  };
  const latest=series.value(points[points.length-1]);
  const axisDecimals=series.id==="packVoltageV"?3:series.decimals;
  const thresholdMetric=series.thresholdMetric;
  const supportsThresholds=thresholdMetric!=null;
  const thresholdStep=thresholdMetric==="packVoltageV"?.01:thresholdMetric==="temperatureC"?.1:thresholdMetric==="currentA"?.1:thresholdMetric==="powerW"?1:thresholdMetric==="socPercent"?1:thresholdMetric==="deltaMv"?1:.1;
  const displayColor=seriesColorForValue(series,latest);
  return <article ref={panelRef} className={`panel individual-history-chart ${chartSettings.showCurveShadows?"":"no-curve-shadows"}`}><div className="panel-heading"><span><i style={{background:displayColor}}/>{series.title}</span><div className="chart-heading-actions"><strong style={{color:displayColor}}>{latest.toFixed(series.decimals)} {series.unit}</strong>{series.directionalColors?<SignedColorInputs series={series} t={t} onChange={(direction,color)=>setSignedColor(series.id as SignedHistoryMetric,direction,color)}/>:<label className="single-color-input" title={t("curveColor")}><input type="color" value={series.color} aria-label={`${t("curveColor")}: ${series.title}`} onChange={(event)=>setSeriesColor(series.id,event.target.value)}/></label>}<button type="button" className="fullscreen-chart-button hide-chart-button" onClick={hideChart} title={t("hideChart")} aria-label={`${t("hideChart")}: ${series.title}`}><EyeOff/></button>{supportsThresholds&&<button type="button" className={`fullscreen-chart-button threshold-chart-button ${showThresholdEditor?"active":""}`} onClick={()=>setShowThresholdEditor((value)=>!value)} title={t("thresholdSettings")} aria-label={`${t("thresholdSettings")}: ${series.title}`}><SlidersHorizontal/></button>}<button type="button" className="fullscreen-chart-button" onClick={toggleFullscreen} title={isFullscreen?t("exitFullscreen"):t("fullscreen")} aria-label={`${isFullscreen?t("exitFullscreen"):t("fullscreen")}: ${series.title}`}>{isFullscreen?<Minimize2/>:<Maximize2/>}</button></div></div><FullscreenPeriodPicker period={period} setPeriod={setPeriod} t={t}/><FullscreenTimeNavigator viewport={viewport} language={language} t={t}/><ChartMarkerToolbar markers={markers} setMarkers={setMarkers} firstTime={firstTime} lastTime={lastTime} language={language} t={t}/>{showThresholdEditor&&thresholdMetric&&<InlineThresholdEditor metric={thresholdMetric} unit={series.unit} step={thresholdStep} settings={chartSettings} setSettings={setChartSettings} t={t} bmsReferences={bmsReferences}/>}<div className="individual-chart-plot"><svg viewBox={`0 0 ${width} ${height}`} style={{height:"auto",aspectRatio:`${width} / ${height}`}} role="img" aria-label={series.title} onPointerMove={handlePointerMove} onPointerUp={()=>setDraggingMarkerId(null)} onPointerLeave={()=>{setHoveredIndex(null);setDraggingMarkerId(null);}}><defs><clipPath id={`individual-clip-${series.id}`}><rect x={left} y={top} width={width-left-right} height={height-top-bottom}/></clipPath><linearGradient id={`individual-fill-${series.id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.color} stopOpacity=".3"/><stop offset="100%" stopColor={series.color} stopOpacity=".02"/></linearGradient>{series.directionalColors&&<><linearGradient id={`individual-fill-${series.id}-positive`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.directionalColors!.positive} stopOpacity=".28"/><stop offset="100%" stopColor={series.directionalColors!.positive} stopOpacity=".015"/></linearGradient><linearGradient id={`individual-fill-${series.id}-negative`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={series.directionalColors!.negative} stopOpacity=".015"/><stop offset="100%" stopColor={series.directionalColors!.negative} stopOpacity=".28"/></linearGradient></>}</defs>
    {[0,1,2,3,4].map((step)=>{const gy=top+step/4*(height-top-bottom);const value=maximum-step/4*(maximum-minimum);return <g key={`iy-${step}`}><line className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/><text className="axis-label" x={left-10} y={gy+4} textAnchor="end">{value.toFixed(axisDecimals)} {series.unit}</text></g>;})}
    {[0,1,2,3,4].map((step)=>{const gx=left+step/4*(width-left-right);const timestamp=firstTime+step/4*timeRange;return <g key={`ix-${step}`}><line className="chart-grid vertical" x1={gx} x2={gx} y1={top} y2={height-bottom}/><text className="time-label" x={gx} y={height-18} textAnchor={step===0?"start":step===4?"end":"middle"}>{date(timestamp)}</text></g>;})}
    <ChartMarkerLines markers={markers} x={x} top={top} bottom={height-bottom} onPointerDown={(id,event)=>{event.currentTarget.setPointerCapture(event.pointerId);setDraggingMarkerId(id);}}/>
    {minimum<0&&maximum>0&&<line className="zero-line" x1={left} x2={width-right} y1={y(0)} y2={y(0)}/>}<ThresholdLines thresholds={thresholds} y={y} left={left} right={width-right} unit={series.unit} decimals={series.decimals} showLabels={chartSettings.showThresholdLabels} valueAtY={supportsThresholds?(position)=>maximum-(position-top)/(height-top-bottom)*(maximum-minimum):undefined} step={thresholdStep} onAdjust={supportsThresholds?(threshold,value)=>adjustCustomThreshold(chartSettings,setChartSettings,threshold,value):undefined} clampY={{top:top+8,bottom:height-bottom-8}}/>{chartSettings.showCurveShadows&&!series.directionalColors&&<path d={areaPath} fill={`url(#individual-fill-${series.id})`} clipPath={`url(#individual-clip-${series.id})`} className="chart-area"/>}{chartSettings.showCurveShadows&&directionalPaths&&series.directionalColors&&<g clipPath={`url(#individual-clip-${series.id})`}>{directionalPaths.positive.map((segment,index)=><path key={`positive-area-${index}`} d={segment.area} fill={`url(#individual-fill-${series.id}-positive)`}/>)}{directionalPaths.negative.map((segment,index)=><path key={`negative-area-${index}`} d={segment.area} fill={`url(#individual-fill-${series.id}-negative)`}/>)}</g>}{directionalPaths&&series.directionalColors?<g clipPath={`url(#individual-clip-${series.id})`}>{directionalPaths.positive.map((segment,index)=><path key={`positive-${index}`} d={segment.line} fill="none" stroke={series.directionalColors!.positive} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line" style={{filter:"none"}}/>)}{directionalPaths.negative.map((segment,index)=><path key={`negative-${index}`} d={segment.line} fill="none" stroke={series.directionalColors!.negative} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line" style={{filter:"none"}}/>)}</g>:<path d={linePath} fill="none" stroke={series.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-line" clipPath={`url(#individual-clip-${series.id})`}/>}<ConnectionEventMarkers events={connectionEvents} points={points} x={x} yValue={(point)=>y(series.value(point))} left={left} right={width-right} top={top} bottom={height-bottom} language={language} t={t}/>{series.id==="socPercent"&&chartSettings.showSocEvents&&<SocBoundaryPointMarkers events={socEvents.filter((event)=>event.timestamp>=firstTime&&event.timestamp<=lastTime)} x={x} yValue={(event)=>y(event.socPercent)} left={left} right={width-right} top={top} bottom={height-bottom} language={language} t={t}/>} {hoveredPoint&&<><line className="cursor-line" x1={x(hoveredPoint.timestamp)} x2={x(hoveredPoint.timestamp)} y1={top} y2={height-bottom}/><circle cx={x(hoveredPoint.timestamp)} cy={y(series.value(hoveredPoint))} r="6" fill={series.value(hoveredPoint)>=0?series.directionalColors?.positive??series.color:series.directionalColors?.negative??series.color} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></>}
  </svg>{hoveredPoint&&<div className={`chart-readout individual-readout ${Number(hoveredIndex) > points.length * .65 ? "readout-left" : Number(hoveredIndex) < points.length * .25 ? "readout-right" : "readout-center"}`}><time>{new Date(hoveredPoint.timestamp).toLocaleString(language)}</time><span><i style={{background:seriesColorForValue(series,series.value(hoveredPoint))}}/>{series.title}<strong style={{color:seriesColorForValue(series,series.value(hoveredPoint))}}>{series.value(hoveredPoint).toFixed(series.decimals)} {series.unit}</strong></span></div>}</div></article>;
}

function CorrelationChart({ points, title, noDataLabel, t, onHide }: { points: HistoryPoint[]; title: string; noDataLabel: string;t:ReturnType<typeof translator>;onHide:()=>void }) {
  const usable = points.filter((point) => Number.isFinite(point.currentA) && Number.isFinite(point.powerW));
  const correlation = currentPowerCorrelation(usable);
  if (usable.length < 2) {
    return <article className="panel history-chart correlation-chart">
      <div className="panel-heading"><span>{title}</span><div className="chart-heading-actions"><strong>—</strong><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${title}`}><EyeOff/></button></div></div>
      <div className="chart-empty"><ChartNoAxesCombined/><span>{noDataLabel}</span></div>
    </article>;
  }

  const width = 1000;
  const height = 280;
  const left = 76;
  const right = 24;
  const top = 18;
  const bottom = 46;
  const currents = usable.map((point) => point.currentA);
  const powers = usable.map((point) => point.powerW);
  const paddedRange = (values: number[]) => {
    let minimum = Math.min(...values);
    let maximum = Math.max(...values);
    if (minimum === maximum) { minimum -= 1; maximum += 1; }
    const padding = (maximum - minimum) * .08;
    return [minimum - padding, maximum + padding] as const;
  };
  const [minimumCurrent, maximumCurrent] = paddedRange(currents);
  const [minimumPower, maximumPower] = paddedRange(powers);
  const x = (value: number) => left + (value - minimumCurrent) / (maximumCurrent - minimumCurrent) * (width - left - right);
  const y = (value: number) => top + (maximumPower - value) / (maximumPower - minimumPower) * (height - top - bottom);
  const currentAverage = currents.reduce((sum, value) => sum + value, 0) / currents.length;
  const powerAverage = powers.reduce((sum, value) => sum + value, 0) / powers.length;
  const currentVariance = currents.reduce((sum, value) => sum + (value - currentAverage) ** 2, 0);
  const covariance = usable.reduce((sum, point) => sum + (point.currentA - currentAverage) * (point.powerW - powerAverage), 0);
  const slope = currentVariance === 0 ? 0 : covariance / currentVariance;
  const intercept = powerAverage - slope * currentAverage;
  const sampleStep = Math.max(1, Math.ceil(usable.length / 500));
  const samples = usable.filter((_, index) => index % sampleStep === 0 || index === usable.length - 1);

  return <article className="panel history-chart correlation-chart">
    <div className="panel-heading"><span>{title}</span><div className="chart-heading-actions"><strong>{correlation == null ? "—" : `r = ${correlation.toFixed(3)}`}</strong><button type="button" className="fullscreen-chart-button hide-chart-button" onClick={onHide} title={t("hideChart")} aria-label={`${t("hideChart")}: ${title}`}><EyeOff/></button></div></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {[0,1,2,3,4].map((step) => {
        const gy = top + step / 4 * (height - top - bottom);
        const value = maximumPower - step / 4 * (maximumPower - minimumPower);
        return <g key={`cy-${step}`}><line className="chart-grid" x1={left} x2={width-right} y1={gy} y2={gy}/><text className="axis-label" x={left-10} y={gy+4} textAnchor="end">{value.toFixed(0)}</text></g>;
      })}
      {[0,1,2,3,4].map((step) => {
        const gx = left + step / 4 * (width - left - right);
        const value = minimumCurrent + step / 4 * (maximumCurrent - minimumCurrent);
        return <g key={`cx-${step}`}><line className="chart-grid vertical" x1={gx} x2={gx} y1={top} y2={height-bottom}/><text className="axis-label" x={gx} y={height-18} textAnchor="middle">{value.toFixed(1)}</text></g>;
      })}
      {minimumCurrent < 0 && maximumCurrent > 0 && <line className="zero-line vertical-zero" x1={x(0)} x2={x(0)} y1={top} y2={height-bottom}/>}
      {minimumPower < 0 && maximumPower > 0 && <line className="zero-line" x1={left} x2={width-right} y1={y(0)} y2={y(0)}/>}
      <line className="trend-line" x1={x(minimumCurrent)} y1={y(slope * minimumCurrent + intercept)} x2={x(maximumCurrent)} y2={y(slope * maximumCurrent + intercept)}/>
      {samples.map((point, index) => <circle key={`${point.timestamp}-${index}`} cx={x(point.currentA)} cy={y(point.powerW)} r="4" className={point.currentA >= 0 ? "correlation-point charge" : "correlation-point discharge"}/>)}
      <text className="axis-title" x={(left+width-right)/2} y={height-4} textAnchor="middle">A</text>
      <text className="axis-title" x="17" y={(top+height-bottom)/2} textAnchor="middle" transform={`rotate(-90 17 ${(top+height-bottom)/2})`}>W</text>
    </svg>
  </article>;
}

function EventsPage({events,chargeSessions,snapshot,t,acknowledgedAlarmKey,onAcknowledge,onClearEvents,onClearChargeSessions}:{events:MonitorEvent[];chargeSessions:ChargeSessionRecord[];snapshot:GatewaySnapshot|null;t:ReturnType<typeof translator>;acknowledgedAlarmKey:string;onAcknowledge:(key:string)=>void;onClearEvents:()=>void;onClearChargeSessions:()=>void}) {
  const unknownMask = unknownAlarmMask(snapshot);
  const hasPasswordReminder = passwordReminder(snapshot);
  const alarms = [...(snapshot?.alarms ?? []).filter((alarm) => !isPasswordReminderAlarm(alarm)), ...(unknownMask ? [`${t("unknownAlarm")} · 0x${unknownMask.toString(16).toUpperCase()}`] : [])];
  const alarmKey=alarms.join(",");
  const acknowledged=Boolean(alarmKey)&&acknowledgedAlarmKey===alarmKey;
  return <div className="page-content events-layout">
    {snapshot?.stale&&<section className="stale-alarm-note"><Clock3/><div><strong>{t("alarmStateUnknown")}</strong><span>{t("alarmStateUnknownHint")}</span></div></section>}
    {hasPasswordReminder && <section className="alarm-banner password-reminder-banner"><AlertTriangle/><div><strong>{t("passwordReminder")}</strong><span>{t("passwordReminderHint")}</span></div></section>}
    {alarms.length > 0 && <section className={`alarm-banner active-alarm-banner ${acknowledged?"acknowledged":""}`}><AlertTriangle/><div><strong>{t("alarmRaised")}</strong><span>{alarms.join(" · ")}</span>{acknowledged&&<em>{t("alarmAcknowledged")}</em>}</div><button type="button" disabled={acknowledged} onClick={()=>onAcknowledge(alarmKey)}><CheckCircle2/>{t(acknowledged?"alarmAcknowledged":"acknowledgeAlarm")}</button></section>}
    <section className="panel event-panel"><div className="panel-heading"><span>{t("eventsTitle")}</span><div className="event-heading-actions"><small>{events.length}</small><button type="button" disabled={events.length===0} onClick={onClearEvents}>{t("clearLocalLog")}</button></div></div>
      <small className="event-storage-hint">{t("localClearHint")}</small>
      {events.length===0?<div className="empty-state"><CheckCircle2/><span>{t("noEvents")}</span></div>:<div className="event-list">{events.map(event=>{const text=monitorEventText(event,t);return <div className={`event ${event.severity}`} key={event.id}><div className="event-icon">{event.severity==="critical"?<AlertTriangle/>:event.severity==="warning"?<Unplug/>:<CheckCircle2/>}</div><div><strong>{text.title}</strong><span>{text.details}</span></div><time>{new Date(event.timestamp).toLocaleString()}</time></div>})}</div>}
    </section>
    <section className="panel event-panel"><div className="panel-heading"><span>{t("chargeSession")}</span><div className="event-heading-actions"><small>{chargeSessions.length}</small><button type="button" disabled={chargeSessions.length===0} onClick={onClearChargeSessions}>{t("hideLocalHistory")}</button></div></div>
      <small className="event-storage-hint">{t("chargeHistoryHideHint")}</small>
      {chargeSessions.length===0?<div className="empty-state"><BatteryCharging/><span>{t("noEvents")}</span></div>:<div className="event-list">{chargeSessions.map((session)=><div className={`event ${session.endedAt==null?"info":"warning"}`} key={session.id}><div className="event-icon"><BatteryCharging/></div><div><strong>{session.endedAt==null?t("chargeOn"):t("chargeOff")}</strong><span>{new Date(session.startedAt).toLocaleString()} · {session.endedAt==null?"…":`${new Date(session.endedAt).toLocaleString()} · `}{session.deliveredAh.toFixed(2)} Ah · max ${session.maxCurrentA.toFixed(1)} A</span></div><time>{session.endedAt==null?t("chargeOn"):t("chargeOff")}</time></div>)}</div>}
    </section>
  </div>;
}

function DataExportSettingsPanel({t,gatewayUrl}:{t:ReturnType<typeof translator>;gatewayUrl:string}){
  const [busy,setBusy]=useState<"sql"|"excel"|null>(null);
  const [error,setError]=useState(false);
  const labels:HistoryExportLabels={dataSheet:t("exportDataSheet"),socSheet:t("exportSocSheet"),connectionSheet:t("exportConnectionSheet"),informationSheet:t("exportInformationSheet"),timestamp:t("exportTimestamp"),timestampMs:t("exportTimestampMs"),voltage:t("voltage"),current:t("current"),power:t("power"),soc:t("soc"),temperature:t("temp"),imbalance:t("imbalance"),balancing:t("balance"),alarmMask:t("exportAlarmMask"),cellVoltage:t("cellVoltage"),cellResistance:t("estimatedResistance"),previousSoc:t("exportPreviousSoc"),connectionEvent:t("exportConnectionEvent"),durationSeconds:t("exportDurationSeconds"),bmsName:t("exportBmsName"),gattStatus:t("gattCode"),exportCreated:t("exportCreated"),periodFrom:t("exportPeriodFrom"),periodTo:t("exportPeriodTo"),sourceRecords:t("recordedSamples"),exportedPoints:t("exportedPoints"),aggregationInterval:t("exportAggregationSeconds"),lost:t("connectionLost"),restored:t("connectionRestored")};
  async function downloadSql(){setBusy("sql");setError(false);try{const result=await exportHistoryDatabaseSql();const url=URL.createObjectURL(new Blob([result.sql],{type:"application/sql;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`bms-history-${new Date().toISOString().slice(0,10)}.sql`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setError(true);}finally{setBusy(null);}}
  async function downloadExcel(){setBusy("excel");setError(false);try{const to=Date.now();const history=await fetchGatewayHistory(gatewayUrl,to-365*24*60*60_000,to,5000);if(history.points.length===0)throw new Error("No history");await exportHistoryWorkbook(history,labels);}catch{setError(true);}finally{setBusy(null);}}
  return <section className="panel data-export-panel"><div className="panel-heading"><span>{t("historyTitle")}</span><small>{t("savedLocally")}</small></div><p>{t("historySectionsHint")}</p><div className="data-export-actions"><button className="database-export-button" onClick={downloadSql} disabled={busy!==null} title={t("databaseExportHint")}><Download size={16}/>{busy==="sql"?t("databaseExporting"):t("databaseExport")}</button><button className="database-export-button" onClick={downloadExcel} disabled={busy!==null} title={t("exportExcel")}><Download size={16}/>{busy==="excel"?t("exportingExcel"):t("exportExcel")}</button></div>{error&&<div className="threshold-validation-error" role="alert">{t("exportFailed")}</div>}</section>;
}

function GraphSettingsPage({t,settings,setSettings,snapshot,language,setLanguage,theme,setTheme,gatewayUrl}:{t:ReturnType<typeof translator>;settings:ChartDisplaySettings;setSettings:(settings:ChartDisplaySettings)=>void;snapshot:GatewaySnapshot|null;language:Language;setLanguage:(value:Language)=>void;theme:AppTheme;setTheme:(value:AppTheme)=>void;gatewayUrl:string}){
  const [thresholdError,setThresholdError]=useState<string|null>(null);
  const metricRows:Array<[ThresholdMetric,string,string,number]>=[
    ["cellVoltageV",t("cellVoltage"),"V",.001],
    ["packVoltageV",t("voltage"),"V",.01],
    ["currentA",t("current"),"A",.1],
    ["powerW",t("power"),"W",1],
    ["socPercent",t("soc"),"%",1],
    ["temperatureC",t("temp"),"°C",.1],
    ["deltaMv",t("imbalance"),"mV",1],
    ["cellResistanceMOhm",t("estimatedResistance"),"mΩ",.01],
  ];
  const setFlag=(key:keyof Pick<ChartDisplaySettings,"showBmsThresholds"|"showCustomThresholds"|"showThresholdLabels"|"showSocEvents"|"showCurveShadows"|"symmetricBidirectionalScale">,value:boolean)=>setSettings({...settings,[key]:value});
  const setHistorySection=(key:keyof HistorySectionVisibility,value:boolean)=>setSettings({...settings,historySections:{...settings.historySections,[key]:value}});
  const setIndividualChart=(key:IndividualChartMetric,value:boolean)=>setSettings({...settings,individualChartVisibility:{...settings.individualChartVisibility,[key]:value}});
  const setAllCustomThresholds=(value:boolean)=>setSettings({...settings,showCustomThresholds:value,customThresholdVisibility:Object.fromEntries(Object.keys(settings.customThresholdVisibility).map((metric)=>[metric,value])) as Record<ThresholdMetric,boolean>});
  const setBmsThreshold=(id:BmsThresholdId,patch:Partial<{visible:boolean;color:string}>)=>setSettings({...settings,bmsThresholdDisplay:{...settings.bmsThresholdDisplay,[id]:{...settings.bmsThresholdDisplay[id],...patch}}});
  const setLimit=(metric:ThresholdMetric,side:"low"|"high",raw:string)=>{
    const value=raw===""?null:Number(raw);
    if(value!=null&&!Number.isFinite(value))return;
    const limits={...settings.customThresholds[metric],[side]:value};
    const issue=thresholdValidationIssue(metric,limits);
    if(issue){setThresholdError(thresholdValidationMessage(issue,t));return;}
    setThresholdError(null);
    setSettings({...settings,customThresholds:{...settings.customThresholds,[metric]:limits}});
  };
  const protection=snapshot?.protectionSettings;
  const voltageSettingsReady=Boolean(protection&&Number.isFinite(protection.soc0VoltageV)&&Number.isFinite(protection.balanceStartVoltageV));
  return <div className="page-content graph-settings-page">
    <DataExportSettingsPanel t={t} gatewayUrl={gatewayUrl}/>
    <section className="panel setting-panel language-setting-panel"><div className="setting-icon"><Languages/></div><div><h2>{t("language")}</h2><p>{t("languageInfo")}</p><div className="language-grid">{languages.map(([code,label])=><button className={language===code?"selected":""} key={code} onClick={()=>setLanguage(code)}>{language===code&&"✓ "}{label}</button>)}</div></div></section>
    <section className="panel setting-panel theme-setting-panel"><div className="setting-icon">{theme==="dark"?<Moon/>:<Sun/>}</div><div><h2>{t("appearance")}</h2><p>{t("appearanceHint")}</p><div className="theme-toggle-row"><SettingsToggle label={t("darkTheme")} detail={theme==="dark"?t("darkThemeActive"):t("lightThemeActive")} checked={theme==="dark"} onChange={(enabled)=>setTheme(enabled?"dark":"light")}/></div></div></section>
    <section className="panel graph-feature-panel graph-options-panel"><div className="panel-heading"><span>{t("graphFunctions")}</span><small>{t("savedLocally")}</small></div><div className="graph-feature-list">
      <SettingsToggle label={t("showCustomThresholds")} detail={t("showCustomThresholdsHint")} checked={settings.showCustomThresholds&&Object.values(settings.customThresholdVisibility).every(Boolean)} onChange={setAllCustomThresholds}/>
      <SettingsToggle label={t("showThresholdLabels")} detail={t("showThresholdLabelsHint")} checked={settings.showThresholdLabels} onChange={(value)=>setFlag("showThresholdLabels",value)}/>
      <SettingsToggle label={t("showSocEvents")} detail={t("showSocEventsHint")} checked={settings.showSocEvents} onChange={(value)=>setFlag("showSocEvents",value)}/>
      <SettingsToggle label={t("showCurveShadows")} detail={t("showCurveShadowsHint")} checked={settings.showCurveShadows} onChange={(value)=>setFlag("showCurveShadows",value)}/>
      <SettingsToggle label={t("symmetricBidirectionalScale")} detail={t("symmetricBidirectionalScaleHint")} checked={settings.symmetricBidirectionalScale} onChange={(value)=>setFlag("symmetricBidirectionalScale",value)}/>
    </div></section>
    <section className="panel bms-threshold-panel"><div className="panel-heading"><span>{t("bmsThresholds")}</span><small>{protection?t("receivedFromBms"):t("notReceivedFromBms")}</small></div>{protection?<div className="bms-threshold-grid">
      {voltageSettingsReady&&<><BmsThresholdCard id="soc-0" label={t("bmsSoc0Voltage")} detail={t("bmsSoc0VoltageHint")} value={`${protection.soc0VoltageV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["soc-0"]} setDisplay={setBmsThreshold} t={t}/>
      <BmsThresholdCard id="soc-100" label={t("bmsSoc100Voltage")} detail={t("bmsSoc100VoltageHint")} value={`${protection.soc100VoltageV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["soc-100"]} setDisplay={setBmsThreshold} t={t}/>
      <BmsThresholdCard id="balance-start" label={t("bmsBalanceStartVoltage")} detail={t("bmsBalanceStartVoltageHint")} value={`${protection.balanceStartVoltageV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["balance-start"]} setDisplay={setBmsThreshold} t={t}/>
      <BmsThresholdCard id="balance-trigger" label={t("bmsBalanceTriggerDelta")} detail={t("bmsBalanceTriggerDeltaHint")} value={`${(protection.balanceTriggerDeltaV*1000).toFixed(0)} mV`} display={settings.bmsThresholdDisplay["balance-trigger"]} setDisplay={setBmsThreshold} t={t}/>
      <BmsThresholdCard id="system-power-off" label={t("bmsSystemPowerOffVoltage")} detail={t("bmsSystemPowerOffVoltageHint")} value={`${protection.systemPowerOffVoltageV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["system-power-off"]} setDisplay={setBmsThreshold} t={t} critical/>
      <BmsThresholdCard id="cell-uvp" label={t("bmsCellUvp")} detail={t("bmsCellUvpHint")} value={`${protection.cellUnderVoltageProtectionV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["cell-uvp"]} setDisplay={setBmsThreshold} t={t} critical/>
      <BmsThresholdCard id="cell-uvp-recovery" label={t("bmsCellUvpRecovery")} value={`${protection.cellUnderVoltageRecoveryV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["cell-uvp-recovery"]} setDisplay={setBmsThreshold} t={t}/>
      <BmsThresholdCard id="cell-ovp" label={t("bmsCellOvp")} detail={t("bmsCellOvpHint")} value={`${protection.cellOverVoltageProtectionV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["cell-ovp"]} setDisplay={setBmsThreshold} t={t} critical/>
      <BmsThresholdCard id="cell-ovp-recovery" label={t("bmsCellOvpRecovery")} value={`${protection.cellOverVoltageRecoveryV.toFixed(3)} V`} display={settings.bmsThresholdDisplay["cell-ovp-recovery"]} setDisplay={setBmsThreshold} t={t}/></>}
      <BmsThresholdCard id="charge-temp" label={t("bmsChargeTemperature")} value={`${protection.chargeOverTemperatureC.toFixed(1)} °C`} display={settings.bmsThresholdDisplay["charge-temp"]} setDisplay={setBmsThreshold} t={t} critical/>
      <BmsThresholdCard id="charge-temp-recovery" label={t("bmsChargeRecovery")} value={`${protection.chargeOverTemperatureRecoveryC.toFixed(1)} °C`} display={settings.bmsThresholdDisplay["charge-temp-recovery"]} setDisplay={setBmsThreshold} t={t}/>
      <BmsThresholdCard id="discharge-temp" label={t("bmsDischargeTemperature")} value={`${protection.dischargeOverTemperatureC.toFixed(1)} °C`} display={settings.bmsThresholdDisplay["discharge-temp"]} setDisplay={setBmsThreshold} t={t} critical/>
      <BmsThresholdCard id="discharge-temp-recovery" label={t("bmsDischargeRecovery")} value={`${protection.dischargeOverTemperatureRecoveryC.toFixed(1)} °C`} display={settings.bmsThresholdDisplay["discharge-temp-recovery"]} setDisplay={setBmsThreshold} t={t}/>
      {Number.isFinite(protection.chargeOverCurrentProtectionA)&&<BmsThresholdCard id="charge-current" label={t("bmsChargeCurrentLimit")} value={`+${protection.chargeOverCurrentProtectionA!.toFixed(1)} A`} display={settings.bmsThresholdDisplay["charge-current"]} setDisplay={setBmsThreshold} t={t} critical/>}
      {Number.isFinite(protection.dischargeOverCurrentProtectionA)&&<BmsThresholdCard id="discharge-current" label={t("bmsDischargeCurrentLimit")} value={`−${protection.dischargeOverCurrentProtectionA!.toFixed(1)} A`} display={settings.bmsThresholdDisplay["discharge-current"]} setDisplay={setBmsThreshold} t={t} critical/>}
    </div>:<div className="bms-threshold-empty"><AlertTriangle/><div><strong>{t("bmsThresholdUnavailable")}</strong><span>{t("bmsThresholdUnavailableHint")}</span></div></div>}</section>
    <section className="panel graph-feature-panel history-visibility-panel"><div className="panel-heading"><span>{t("historySections")}</span><small>{t("savedLocally")}</small></div><p className="history-sections-hint">{t("historySectionsHint")}</p><div className="graph-feature-list">
      {([['packVoltageV',t('voltage')],['currentA',t('current')],['chargeCurrentA',t('chargeCurrent')],['dischargeCurrentA',t('dischargeCurrent')],['powerW',t('power')],['socPercent',t('soc')],['temperatureC',t('temp')],['deltaMv',t('imbalance')]] as Array<[IndividualChartMetric,string]>).map(([metric,label])=><SettingsToggle key={metric} label={label} detail={`${t("individualChart")} · ${t("individualChartToggleHint")}`} checked={settings.individualChartVisibility[metric]} onChange={(value)=>setIndividualChart(metric,value)}/>)}
      <SettingsToggle label={t("showLiveCells")} detail={t("showLiveCellsHint")} checked={settings.historySections.liveCells} onChange={(value)=>setHistorySection("liveCells",value)}/>
      <SettingsToggle label={t("showWorkingCurrentDistribution")} detail={t("showWorkingCurrentDistributionHint")} checked={settings.historySections.dischargeCurrentDistribution} onChange={(value)=>setHistorySection("dischargeCurrentDistribution",value)}/>
      <SettingsToggle label={t("operatingPointTitle")} detail={t("showOperatingPointComparisonHint")} checked={settings.historySections.operatingPointCellComparison} onChange={(value)=>setHistorySection("operatingPointCellComparison",value)}/>
      <SettingsToggle label={t("showCompositeChart")} detail={t("showCompositeChartHint")} checked={settings.historySections.compositeChart} onChange={(value)=>setHistorySection("compositeChart",value)}/>
      <SettingsToggle label={t("showCellVoltageChart")} detail={t("showCellVoltageChartHint")} checked={settings.historySections.cellVoltageChart} onChange={(value)=>setHistorySection("cellVoltageChart",value)}/>
      <SettingsToggle label={t("showCellEnergyEstimate")} detail={t("showCellEnergyEstimateHint")} checked={settings.historySections.cellEnergyEstimate} onChange={(value)=>setHistorySection("cellEnergyEstimate",value)}/>
      <SettingsToggle label={t("showCellResistanceChart")} detail={t("showCellResistanceChartHint")} checked={settings.historySections.cellResistanceChart} onChange={(value)=>setHistorySection("cellResistanceChart",value)}/>
      <SettingsToggle label={t("showCorrelationChart")} detail={t("showCorrelationChartHint")} checked={settings.historySections.correlationChart} onChange={(value)=>setHistorySection("correlationChart",value)}/>
      <SettingsToggle label={t("showBalanceDiagnostics")} detail={t("showBalanceDiagnosticsHint")} checked={settings.historySections.balanceDiagnostics} onChange={(value)=>setHistorySection("balanceDiagnostics",value)}/>
    </div></section>
    <section className="panel custom-threshold-panel"><div className="panel-heading"><span>{t("customThresholds")}</span><small>{t("customThresholdsHint")}</small></div><div className="threshold-table"><div className="threshold-table-head"><span>{t("parameter")}</span><span>{t("lowerThreshold")}</span><span>{t("upperThreshold")}</span></div>{metricRows.map(([metric,label,unit,step])=>{const limits=settings.customThresholds[metric];const [min,max]=THRESHOLD_BOUNDS[metric];return <div className="threshold-row" key={metric}><strong>{label}<small>{unit} · {t("thresholdRangeHint")}: {min}…{max}</small></strong><label><input type="number" min={min} max={max} step={step} value={limits.low??""} onChange={(event)=>setLimit(metric,"low",event.target.value)} placeholder="—" aria-label={`${label}: ${t("lowerThreshold")}`}/><span>{unit}</span></label><label><input type="number" min={min} max={max} step={step} value={limits.high??""} onChange={(event)=>setLimit(metric,"high",event.target.value)} placeholder="—" aria-label={`${label}: ${t("upperThreshold")}`}/><span>{unit}</span></label></div>;})}</div>{thresholdError&&<div className="threshold-validation-error" role="alert">{thresholdError}</div>}<div className="threshold-note"><ShieldCheck/><span>{t("thresholdReadOnlyHint")}</span></div></section>
  </div>;
}

function SettingsToggle({label,detail,checked,onChange}:{label:string;detail:string;checked:boolean;onChange:(checked:boolean)=>void}){
  return <label className="settings-toggle"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)}/><i/></label>;
}

function ThresholdValue({label,detail,value,critical=false}:{label:string;detail?:string;value:string;critical?:boolean}){
  return <div className={`bms-threshold-value ${critical?"critical":""}`}><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>;
}

function BmsThresholdCard({label,detail,value,critical}:{id:BmsThresholdId;label:string;detail?:string;value:string;critical?:boolean;display:{visible:boolean;color:string};setDisplay:(id:BmsThresholdId,patch:Partial<{visible:boolean;color:string}>)=>void;t:ReturnType<typeof translator>}){
  return <ThresholdValue label={label} detail={detail} value={value} critical={critical}/>;
}

function ConnectionPage({ t,gatewayUrl,draftUrl,setDraftUrl,connect,language,state,snapshot,showGattCodes }: { t:ReturnType<typeof translator>;gatewayUrl:string;draftUrl:string;setDraftUrl:(v:string)=>void;connect:()=>void;language:Language;state:ConnectionState;snapshot:GatewaySnapshot|null;showGattCodes:boolean }) {
  const [connectionEvents,setConnectionEvents]=useState<ConnectionHistoryEvent[]>([]);
  const [computerQr,setComputerQr]=useState<string>("");
  const browserUrl=typeof window!=="undefined"&&window.location.protocol.startsWith("http")?`${window.location.protocol}//${window.location.host}`:"";
  const computerUrls=typeof window!=="undefined"?(window.bmsDesktop?.computerUrls?.length?window.bmsDesktop.computerUrls:[window.bmsDesktop?.computerUrl||browserUrl].filter(Boolean)):[];
  const computerUrl=computerUrls[0]??"";
  const loopback=(()=>{try{return ["localhost","127.0.0.1","::1"].includes(new URL(computerUrl).hostname);}catch{return false;}})();
  useEffect(()=>{let active=true;if(!computerUrl){setComputerQr("");return()=>{active=false;};}QRCode.toDataURL(computerUrl,{width:180,margin:1,errorCorrectionLevel:"M"}).then(value=>{if(active)setComputerQr(value);}).catch(()=>{if(active)setComputerQr("");});return()=>{active=false;};},[computerUrl]);
  useEffect(()=>{
    let active=true;
    const to=Date.now();
    fetchGatewayHistory(gatewayUrl,to-HISTORY_PERIODS.at(-1)![1],to,50)
      .then((result)=>{if(active)setConnectionEvents((result.connectionEvents??[]).slice(-100));})
      .catch(()=>{if(active)setConnectionEvents([]);});
    return()=>{active=false;};
  },[gatewayUrl,snapshot?.connected]);
  return <div className="page-content settings-grid">
    <section className="panel setting-panel"><div className="setting-icon"><Smartphone/></div><div><h2>{t("connectionTitle")}</h2><p>{t("connectionInfo")}</p><label>{t("gatewayAddress")}</label><div className="input-row"><input value={draftUrl} onChange={e=>setDraftUrl(e.target.value)} onKeyDown={e=>e.key==="Enter"&&connect()} placeholder={t("addressHint")}/><button onClick={connect}><Cable size={18}/>{t("connect")}</button></div><div className={`api-state ${state}`}><Radio size={18}/><span>{t("apiStatus")}</span><strong>{snapshot?.apiVersion ? `${t("detected")} · v${snapshot.apiVersion}` : t("notDetected")}</strong></div></div></section>
    <section className="panel setting-panel computer-access-panel"><div className="setting-icon"><ScanSearch/></div><div><h2>{t("computerAccessTitle")}</h2><p>{t("computerAccessHint")}</p><label>{t("computerAccessAddress")}</label><div className="computer-access-content"><div>{computerUrls.map((url,index)=><div key={url} className={`${index===0?"computer-url":"computer-url alternative"} ${loopback?"loopback":""}`}>{url}</div>)}</div>{computerQr&&<div className="computer-qr"><img src={computerQr} alt={t("computerAccessTitle")} /><code>{computerUrl||"—"}</code></div>}</div>{loopback&&<small className="event-storage-hint">{t("computerAccessLoopback")}</small>}</div></section>
    <section className="panel about-panel"><ShieldCheck/><div><strong>BMS DATA PLATFORM {APP_VERSION}</strong><span>{t("readOnly")}</span></div></section>
    <ConnectionEventHistory events={connectionEvents} language={language} t={t} showGattCodes={showGattCodes}/>
  </div>;
}

function Metric({icon:Icon,label,value,accent=false,warning=false}:{icon:IconType;label:string;value:string;accent?:boolean;warning?:boolean}) { return <article className={`metric-card panel ${accent?"accent":""} ${warning?"warning":""}`}><div className="metric-top"><span>{label}</span><Icon size={19}/></div><strong>{value}</strong></article>; }
function FlowNode({icon:Icon,title,detail,active=false,className=""}:{icon:IconType;title:string;detail:string;active?:boolean;className?:string}) { return <div className={`flow-node ${className} ${active?"active":""}`}><div><Icon size={26}/></div><strong>{title}</strong><span>{detail}</span></div>; }
function FlowLine({active,direction,flowDirection,vertical=false,className=""}:{active:boolean;direction:"charge"|"discharge";flowDirection:"left"|"right"|"down";vertical?:boolean;className?:string}) { return <div className={`flow-line ${className} ${vertical?"vertical":""} ${active?`active ${direction} to-${flowDirection}`:""}`}><i/><i/><i/></div>; }
function CellMini({index,voltage,status,t}:{index:number;voltage:number;status:CellVisualStatus;t:ReturnType<typeof translator>}) {
  const reason={normal:t("cellOk"),low:t("cellLow"),high:t("cellHigh"),deviation:"Δ",stale:t("stale")}[status.reason];
  const balancing=status.balanceRole==="receiving"?t("balanceReceiving"):status.balanceRole==="donating"?t("balanceDonating"):null;
  return <div className={`cell-mini ${status.severity} ${status.balanceRole?"balancing":""}`}><b>C{index+1}<em>{reason}</em></b><span>{voltage.toFixed(3)} V</span>{balancing&&<strong title={t("balanceInferenceHint")}>{balancing}</strong>}<i/></div>;
}
function CellDetail({index,voltage,resistance,average,state,t}:{index:number;voltage:number;resistance:number|null|undefined;average:number;state:string;t:ReturnType<typeof translator>}) { const offset=Math.round((voltage-average)*1000); return <div className={`cell-detail ${state}`}><div><strong>C{index+1}</strong><span>{state==="min"?t("minimum"):state==="max"?t("maximum"):t("normal")}</span></div><b>{voltage.toFixed(3)} <small>V</small></b><div className="cell-bar"><i style={{width:`${Math.max(8,Math.min(100,(voltage-2.5)/1.15*100))}%`}}/></div><div className="cell-detail-footer"><em>{offset>=0?"+":""}{offset} mV</em><strong>R ≈ {Number.isFinite(resistance)?`${resistance!.toFixed(2)} mΩ`:"—"}</strong></div></div>; }

function format(value:number|undefined|null,decimals:number,unit:string){return value==null?"—":`${value.toFixed(decimals)} ${unit}`;}
function signed(value:number|undefined|null,decimals:number,unit:string){return value==null?"—":`${value>=0?"+":""}${value.toFixed(decimals)} ${unit}`;}
function formatDuration(minutes:number|undefined|null){if(minutes==null)return"—";return `${Math.floor(minutes/60).toString().padStart(2,"0")}:${Math.round(minutes%60).toString().padStart(2,"0")}`;}
function formatOutageDuration(milliseconds:number){const seconds=Math.max(0,Math.round(milliseconds/1000));const hours=Math.floor(seconds/3600);const minutes=Math.floor(seconds%3600/60);const rest=seconds%60;return hours>0?`${hours} h ${minutes} min ${rest} s`:minutes>0?`${minutes} min ${rest} s`:`${rest} s`;}

export default App;
