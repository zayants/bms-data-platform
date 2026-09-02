import { useEffect, useMemo, useState } from "react";
import { EyeOff, Info, RefreshCw, SlidersHorizontal } from "lucide-react";
import { fetchGatewayHistory } from "./gateway";
import { selectComparableCellSnapshots, type OperatingPointSettings } from "./operatingPointDiagnostics";
import { translator, type Language } from "./i18n";
import type { HistoryPoint } from "./types";

type Period = "month" | "quarter" | "year";
const PERIODS: Array<[Period, number]> = [
  ["month", 30 * 86_400_000], ["quarter", 90 * 86_400_000], ["year", 365 * 86_400_000],
];
const SETTINGS_KEY = "bms-operating-point-cell-settings-v1";
const PERIOD_KEY = "bms-operating-point-cell-period-v1";
const CELLS_KEY = "bms-operating-point-visible-cells-v1";
const COLORS = ["#e20d18", "#69bb23", "#00a875", "#d9e900", "#f19a26", "#e744ad", "#19c9d0", "#6d22db", "#2267c7", "#9c6b30", "#e4572e", "#5b8ff9", "#61d9a5", "#f6bd16", "#7262fd", "#78d3f8", "#9661bc", "#f6903d", "#008685", "#f08bb4", "#65789b", "#9ace6a", "#ff9d4d", "#269a99", "#d5658f", "#5d7092", "#6dc8ec", "#945fb9", "#ff9845", "#1e9493", "#cc5b82", "#536d8d"];

const DEFAULT_SETTINGS: OperatingPointSettings = {
  targetCurrentA: 5, currentToleranceA: 0.5,
  targetSocPercent: 70, socTolerancePercent: 2,
  temperatureFilterEnabled: true, targetTemperatureC: 25, temperatureToleranceC: 3,
};

const loadSettings = (): OperatingPointSettings => {
  try {
    const candidate = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") } as OperatingPointSettings;
    return {
      targetCurrentA: Math.max(0.2, Math.min(2_000, Number(candidate.targetCurrentA) || DEFAULT_SETTINGS.targetCurrentA)),
      currentToleranceA: Math.max(0.05, Math.min(100, Number(candidate.currentToleranceA) || DEFAULT_SETTINGS.currentToleranceA)),
      targetSocPercent: Math.max(0, Math.min(100, Number(candidate.targetSocPercent))),
      socTolerancePercent: Math.max(0.1, Math.min(50, Number(candidate.socTolerancePercent) || DEFAULT_SETTINGS.socTolerancePercent)),
      temperatureFilterEnabled: candidate.temperatureFilterEnabled !== false,
      targetTemperatureC: Math.max(-80, Math.min(150, Number(candidate.targetTemperatureC) || DEFAULT_SETTINGS.targetTemperatureC)),
      temperatureToleranceC: Math.max(0.1, Math.min(50, Number(candidate.temperatureToleranceC) || DEFAULT_SETTINGS.temperatureToleranceC)),
    };
  } catch { return DEFAULT_SETTINGS; }
};

function NumberControl({label,value,min,max,step,unit,onChange}:{label:string;value:number;min:number;max:number;step:number;unit:string;onChange:(value:number)=>void}) {
  return <label className="operating-point-number"><strong>{label}</strong><span><input type="number" value={value} min={min} max={max} step={step} onChange={(event)=>{const next=Number(event.target.value);if(Number.isFinite(next))onChange(Math.max(min,Math.min(max,next)));}}/><b>{unit}</b></span></label>;
}

export function OperatingPointCellComparisonPanel({gatewayUrl,language,t,onHide}:{gatewayUrl:string;language:Language;t:ReturnType<typeof translator>;onHide:()=>void}) {
  const [period,setPeriod]=useState<Period>(()=>{const saved=localStorage.getItem(PERIOD_KEY) as Period|null;return PERIODS.some(([value])=>value===saved)?saved!:"quarter";});
  const [settings,setSettings]=useState<OperatingPointSettings>(loadSettings);
  const [points,setPoints]=useState<HistoryPoint[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(false),[refreshToken,setRefreshToken]=useState(0);
  const [visibleCells,setVisibleCells]=useState<number[]>(()=>{try{return JSON.parse(localStorage.getItem(CELLS_KEY)??"[]");}catch{return[];}});

  useEffect(()=>{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));localStorage.setItem(PERIOD_KEY,period);},[settings,period]);
  useEffect(()=>localStorage.setItem(CELLS_KEY,JSON.stringify(visibleCells)),[visibleCells]);
  useEffect(()=>{
    let active=true;const duration=PERIODS.find(([value])=>value===period)?.[1]??PERIODS[1][1],to=Date.now();setLoading(true);setError(false);
    fetchGatewayHistory(gatewayUrl,to-duration,to,10_000).then((history)=>{if(active)setPoints(history.points);}).catch(()=>{if(active){setPoints([]);setError(true);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[gatewayUrl,period,refreshToken]);

  const diagnostics=useMemo(()=>selectComparableCellSnapshots(points,settings),[points,settings]);
  useEffect(()=>{if(diagnostics.cellCount>0&&visibleCells.length===0)setVisibleCells(Array.from({length:diagnostics.cellCount},(_,index)=>index));},[diagnostics.cellCount,visibleCells.length]);
  const activeCells=visibleCells.filter((index)=>index>=0&&index<diagnostics.cellCount);
  const snapshots=diagnostics.snapshots;
  const width=1040,height=420,left=68,right=24,top=28,bottom=64;
  const first=snapshots[0]?.timestamp??0,last=snapshots.at(-1)?.timestamp??first+1,timeRange=Math.max(1,last-first);
  const maxAbs=Math.max(5,...snapshots.flatMap((snapshot)=>activeCells.map((index)=>Math.abs(snapshot.deviationsMv[index]??0))));
  const yLimit=Math.ceil(maxAbs/5)*5;
  const x=(timestamp:number)=>left+(timestamp-first)/timeRange*(width-left-right);
  const y=(value:number)=>top+(yLimit-value)/(yLimit*2)*(height-top-bottom);
  const line=(cellIndex:number)=>snapshots.map((snapshot,index)=>`${index?"L":"M"}${x(snapshot.timestamp).toFixed(1)} ${y(snapshot.deviationsMv[cellIndex]??0).toFixed(1)}`).join(" ");
  const set=(patch:Partial<OperatingPointSettings>)=>setSettings((current)=>({...current,...patch}));
  const toggleCell=(index:number)=>setVisibleCells((current)=>current.includes(index)?current.filter((value)=>value!==index):[...current,index].sort((a,b)=>a-b));
  const periodLabel=(value:Period)=>value==="quarter"?t("quarter"):t(value);

  return <section className="panel operating-point-panel">
    <div className="operating-point-header"><div><span>{t("operatingPointEyebrow")}</span><h2>{t("operatingPointTitle")}</h2><p>{t("operatingPointIntro")}</p></div><button type="button" className="hide-chart-button" onClick={onHide} title={t("hideChart")}><EyeOff/></button></div>
    <div className="operating-point-controls">
      <div className="operating-period"><strong>{t("analysisPeriod")}</strong><div className="period-buttons">{PERIODS.map(([value])=><button type="button" key={value} className={period===value?"selected":""} onClick={()=>setPeriod(value)}>{periodLabel(value)}</button>)}</div></div>
      <NumberControl label={t("measurementCurrent")} value={settings.targetCurrentA} min={0.2} max={2000} step={0.1} unit="A" onChange={(value)=>set({targetCurrentA:value})}/>
      <NumberControl label={t("currentTolerance")} value={settings.currentToleranceA} min={0.05} max={100} step={0.05} unit="± A" onChange={(value)=>set({currentToleranceA:value})}/>
      <NumberControl label={t("measurementSoc")} value={settings.targetSocPercent} min={0} max={100} step={1} unit="%" onChange={(value)=>set({targetSocPercent:value})}/>
      <NumberControl label={t("socTolerance")} value={settings.socTolerancePercent} min={0.1} max={50} step={0.5} unit="± %" onChange={(value)=>set({socTolerancePercent:value})}/>
      <label className="temperature-filter-toggle"><strong>{t("temperatureFilter")}</strong><input type="checkbox" checked={settings.temperatureFilterEnabled} onChange={(event)=>set({temperatureFilterEnabled:event.target.checked})}/><span/></label>
      {settings.temperatureFilterEnabled&&<><NumberControl label={t("measurementTemperature")} value={settings.targetTemperatureC} min={-80} max={150} step={1} unit="°C" onChange={(value)=>set({targetTemperatureC:value})}/><NumberControl label={t("temperatureTolerance")} value={settings.temperatureToleranceC} min={0.1} max={50} step={0.5} unit="± °C" onChange={(value)=>set({temperatureToleranceC:value})}/></>}
      <button type="button" className="distribution-refresh" onClick={()=>setRefreshToken((value)=>value+1)} disabled={loading}><RefreshCw className={loading?"spin":""}/>{t("refresh")}</button>
    </div>
    <div className="operating-point-explanation"><Info/><div><strong>{t("operatingPointHowTitle")}</strong><p>{t("operatingPointHow")}</p><p>{t("operatingPointLimit")}</p></div></div>
    <div className="operating-point-summary">
      <span>{t("selectedOperatingPoint")}<strong>{settings.targetCurrentA.toFixed(1)} A · {settings.targetSocPercent.toFixed(0)}%</strong></span>
      <span>{t("matchingRecords")}<strong>{diagnostics.matchingPointCount.toLocaleString(language)}</strong></span>
      <span>{t("comparisonSnapshots")}<strong>{snapshots.length}</strong></span>
      <span>{t("cellCount")}<strong>{diagnostics.cellCount||"—"}</strong></span>
    </div>
    {diagnostics.cellCount>0&&<div className="operating-cell-selector"><strong>{t("displayedCells")}</strong><div><button type="button" onClick={()=>setVisibleCells(Array.from({length:diagnostics.cellCount},(_,index)=>index))}>{t("selectAll")}</button><button type="button" onClick={()=>setVisibleCells([])}>{t("clearCells")}</button>{Array.from({length:diagnostics.cellCount},(_,index)=><button type="button" className={activeCells.includes(index)?"selected":""} key={index} onClick={()=>toggleCell(index)}><i style={{background:COLORS[index%COLORS.length]}}/>C{index+1}</button>)}</div></div>}
    {loading&&points.length===0?<div className="distribution-empty"><RefreshCw className="spin"/>{t("loadingHistory")}</div>:error?<div className="distribution-empty error"><SlidersHorizontal/>{t("historyError")}</div>:snapshots.length<2?<div className="distribution-empty"><SlidersHorizontal/>{t("operatingPointNoData")}</div>:<>
      <div className="operating-point-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("operatingPointTitle")}>
        {Array.from({length:5},(_,index)=>{const value=yLimit-index*yLimit/2;const yy=y(value);return <g key={index}><line className={value===0?"operating-zero-line":"chart-grid"} x1={left} x2={width-right} y1={yy} y2={yy}/><text className="axis-label" x={left-10} y={yy+4} textAnchor="end">{value>0?"+":""}{value.toFixed(0)} mV</text></g>;})}
        {snapshots.map((snapshot,index)=><g key={snapshot.timestamp}><line className="chart-grid vertical" x1={x(snapshot.timestamp)} x2={x(snapshot.timestamp)} y1={top} y2={height-bottom}/>{(index===0||index===snapshots.length-1||index%Math.max(1,Math.floor(snapshots.length/6))===0)&&<text className="time-label" x={x(snapshot.timestamp)} y={height-37} textAnchor={index===0?"start":index===snapshots.length-1?"end":"middle"}>{new Date(snapshot.timestamp).toLocaleDateString(language,{day:"2-digit",month:"2-digit",year:"2-digit"})}</text>}</g>)}
        {activeCells.map((cellIndex)=><g key={cellIndex}><path d={line(cellIndex)} fill="none" stroke={COLORS[cellIndex%COLORS.length]} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>{snapshots.map((snapshot)=><circle key={snapshot.timestamp} cx={x(snapshot.timestamp)} cy={y(snapshot.deviationsMv[cellIndex]??0)} r="3.5" fill={COLORS[cellIndex%COLORS.length]}><title>{new Date(snapshot.timestamp).toLocaleString(language)} · C{cellIndex+1}: {(snapshot.deviationsMv[cellIndex]??0).toFixed(1)} mV · {Math.abs(snapshot.currentA).toFixed(2)} A · SOC {snapshot.socPercent.toFixed(1)}% · {snapshot.temperatureC.toFixed(1)} °C</title></circle>)}</g>)}
        <text className="axis-title" x={(left+width-right)/2} y={height-9} textAnchor="middle">{t("snapshotDate")}</text>
        <text className="axis-title" x="15" y={(top+height-bottom)/2} textAnchor="middle" transform={`rotate(-90 15 ${(top+height-bottom)/2})`}>{t("deviationFromMedian")}</text>
      </svg></div>
      <div className="operating-point-table"><table><thead><tr><th>{t("snapshotDate")}</th><th>{t("current")}</th><th>{t("soc")}</th><th>{t("temp")}</th><th>{t("imbalance")}</th><th>{t("minCell")}</th><th>{t("maxCell")}</th></tr></thead><tbody>{[...snapshots].reverse().slice(0,10).map((snapshot)=><tr key={snapshot.timestamp}><td>{new Date(snapshot.timestamp).toLocaleString(language)}</td><td>{Math.abs(snapshot.currentA).toFixed(2)} A</td><td>{snapshot.socPercent.toFixed(1)}%</td><td>{snapshot.temperatureC.toFixed(1)} °C</td><td>{snapshot.deltaMv.toFixed(0)} mV</td><td>C{snapshot.minimumCellIndex+1}</td><td>C{snapshot.maximumCellIndex+1}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
