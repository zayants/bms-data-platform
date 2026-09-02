import { useEffect, useMemo, useState } from "react";
import { ChartNoAxesCombined, EyeOff, Info, RefreshCw } from "lucide-react";
import { calculateDischargeCurrentDistribution } from "./dischargeCurrentDistribution";
import { fetchGatewayHistory } from "./gateway";
import { translator, type Language } from "./i18n";
import type { HistoryPoint } from "./types";

type AnalysisPeriod = "day" | "week" | "month" | "quarter" | "year";
const PERIODS: Array<[AnalysisPeriod, number]> = [
  ["day", 24 * 60 * 60_000], ["week", 7 * 24 * 60 * 60_000],
  ["month", 30 * 24 * 60 * 60_000], ["quarter", 90 * 24 * 60 * 60_000],
  ["year", 365 * 24 * 60 * 60_000],
];
const PERIOD_KEY = "bms-discharge-distribution-period-v1";
const MAXIMUM_KEY = "bms-discharge-distribution-maximum-a-v1";

const durationLabel = (milliseconds: number): string => {
  const minutes = Math.round(milliseconds / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor(minutes % 1_440 / 60);
  const rest = minutes % 60;
  return days > 0 ? `${days} d ${hours} h` : hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
};

const niceMaximum = (value: number): number => {
  const step = value <= 10 ? 2 : value <= 25 ? 5 : 10;
  return Math.min(100, Math.max(step, Math.ceil(value / step) * step));
};

export function DischargeCurrentDistributionPanel({
  gatewayUrl, language, t, onHide,
}: {
  gatewayUrl: string;
  language: Language;
  t: ReturnType<typeof translator>;
  onHide: () => void;
}) {
  const [period, setPeriod] = useState<AnalysisPeriod>(() => {
    const saved = localStorage.getItem(PERIOD_KEY) as AnalysisPeriod | null;
    return PERIODS.some(([value]) => value === saved) ? saved! : "month";
  });
  const [maximumCurrentA, setMaximumCurrentA] = useState(() => {
    const saved = Number(localStorage.getItem(MAXIMUM_KEY));
    return Number.isFinite(saved) && saved >= 1 && saved <= 2_000 ? Math.ceil(saved) : 100;
  });
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    localStorage.setItem(PERIOD_KEY, period);
    localStorage.setItem(MAXIMUM_KEY, String(maximumCurrentA));
  }, [period, maximumCurrentA]);

  useEffect(() => {
    let active = true;
    const duration = PERIODS.find(([value]) => value === period)?.[1] ?? PERIODS[2][1];
    const to = Date.now();
    setLoading(true);
    setError(false);
    fetchGatewayHistory(gatewayUrl, to - duration, to, 5_000)
      .then((history) => { if (active) { setPoints(history.points); setSourceCount(history.sourceCount); } })
      .catch(() => { if (active) { setPoints([]); setSourceCount(0); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [gatewayUrl, period, refreshToken]);

  const distribution = useMemo(() => calculateDischargeCurrentDistribution(points, maximumCurrentA), [points, maximumCurrentA]);
  const maximumPercent = niceMaximum(Math.max(0, ...distribution.bins.map((bin) => bin.percent)));
  const width = Math.max(920, distribution.bins.length * 19 + 94);
  const height = 370, left = 58, right = 20, top = 24, bottom = 58;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const barStep = plotWidth / distribution.bins.length;
  const typical = distribution.typicalBin;
  const outsidePercent = distribution.totalDischargeMs > 0 ? distribution.outsideRangeMs / distribution.totalDischargeMs * 100 : 0;
  const periodLabel = (value: AnalysisPeriod) => value === "quarter" ? t("quarter") : t(value);

  return <section className="panel discharge-distribution-panel">
    <div className="discharge-distribution-header"><div><span>{t("workingCurrentEyebrow")}</span><h2>{t("workingCurrentTitle")}</h2><p>{t("workingCurrentIntro")}</p></div><button type="button" className="hide-chart-button" onClick={onHide} title={t("hideChart")}><EyeOff/></button></div>
    <div className="discharge-distribution-controls">
      <div><strong>{t("analysisPeriod")}</strong><div className="period-buttons">{PERIODS.map(([value]) => <button type="button" key={value} className={period === value ? "selected" : ""} onClick={() => setPeriod(value)}>{periodLabel(value)}</button>)}</div></div>
      <label><strong>{t("systemMaximumCurrent")}</strong><span><input type="number" min="1" max="2000" step="1" value={maximumCurrentA} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) setMaximumCurrentA(Math.max(1, Math.min(2_000, Math.ceil(value)))); }}/><b>A</b></span><small>{t("systemMaximumCurrentHint")}</small></label>
      <button type="button" className="distribution-refresh" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}><RefreshCw className={loading ? "spin" : ""}/>{t("refresh")}</button>
    </div>
    <div className="discharge-distribution-explanation"><Info/><div><strong>{t("workingCurrentHowTitle")}</strong><p>{t("workingCurrentHow")}</p><p>{t("workingCurrentSafety")}</p></div></div>
    {loading && points.length === 0 ? <div className="distribution-empty"><RefreshCw className="spin"/>{t("loadingHistory")}</div> : error ? <div className="distribution-empty error"><ChartNoAxesCombined/>{t("historyError")}</div> : distribution.totalDischargeMs === 0 ? <div className="distribution-empty"><ChartNoAxesCombined/>{t("workingCurrentNoData")}</div> : <>
      <div className="distribution-summary">
        <span>{t("typicalCurrentRange")}<strong>{typical ? `${typical.fromA}–${typical.toA} A` : "—"}</strong></span>
        <span>{t("shareOfDischargeTime")}<strong>{typical ? `${typical.percent.toFixed(1)}%` : "—"}</strong></span>
        <span>{t("analysedDischargeTime")}<strong>{durationLabel(distribution.totalDischargeMs)}</strong></span>
        <span>{t("dataCoverage")}<strong>{sourceCount.toLocaleString(language)}</strong></span>
        {distribution.outsideRangeMs > 0 && <span className="outside-range">{t("aboveDisplayRange")}<strong>{outsidePercent.toFixed(1)}%</strong></span>}
      </div>
      <div className="discharge-distribution-scroll"><svg viewBox={`0 0 ${width} ${height}`} style={{ width }} role="img" aria-label={t("workingCurrentTitle")}>
        {Array.from({ length: 6 }, (_, index) => { const value = maximumPercent * index / 5; const y = top + plotHeight - plotHeight * index / 5; return <g key={index}><line className="chart-grid" x1={left} x2={width - right} y1={y} y2={y}/><text className="axis-label" x={left - 9} y={y + 4} textAnchor="end">{value.toFixed(0)}%</text></g>; })}
        {distribution.bins.map((bin, index) => { const barHeight = bin.percent / maximumPercent * plotHeight; const x = left + index * barStep + 2; const y = top + plotHeight - barHeight; const isTypical = typical?.fromA === bin.fromA; const showLabel = distribution.bins.length <= 40 || index % Math.ceil(distribution.bins.length / 20) === 0; return <g key={bin.fromA} className={isTypical ? "typical-current-bin" : ""}><rect className="distribution-bar" x={x} y={y} width={Math.max(2, barStep - 4)} height={Math.max(bin.percent > 0 ? 1 : 0, barHeight)} rx="2"><title>{bin.fromA}–{bin.toA} A · {bin.percent.toFixed(2)}% · {durationLabel(bin.durationMs)}</title></rect>{showLabel && <text className="time-label" x={x + Math.max(2, barStep - 4) / 2} y={height - 34} textAnchor="middle">{bin.fromA}</text>}</g>; })}
        <line className="distribution-axis" x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight}/>
        <text className="axis-title" x={(left + width - right) / 2} y={height - 9} textAnchor="middle">{t("dischargeCurrentAxis")}</text>
        <text className="axis-title" x="14" y={top + plotHeight / 2} textAnchor="middle" transform={`rotate(-90 14 ${top + plotHeight / 2})`}>{t("operatingTimePercent")}</text>
      </svg></div>
      <div className="distribution-footnote">{t("workingCurrentFootnote")}</div>
    </>}
  </section>;
}

