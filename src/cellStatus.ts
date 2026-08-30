import type { GatewaySnapshot } from "./types";

export type CellSeverity = "normal" | "warning" | "critical" | "stale";
export type CellReason = "normal" | "low" | "high" | "deviation" | "stale";
export type CellBalanceRole = "receiving" | "donating" | null;
export type CellVisualStatus = { severity: CellSeverity; reason: CellReason; balanceRole: CellBalanceRole };

type Profile = { warnLow: number; criticalLow: number; warnHigh: number; criticalHigh: number; warnDeltaMv: number; criticalDeltaMv: number };

const PROFILES: Record<"lfp" | "li-ion" | "lto", Profile> = {
  lfp: { warnLow: 3.10, criticalLow: 3.00, warnHigh: 3.40, criticalHigh: 3.50, warnDeltaMv: 25, criticalDeltaMv: 80 },
  "li-ion": { warnLow: 3.40, criticalLow: 3.25, warnHigh: 4.10, criticalHigh: 4.18, warnDeltaMv: 30, criticalDeltaMv: 80 },
  lto: { warnLow: 1.90, criticalLow: 1.70, warnHigh: 2.65, criticalHigh: 2.75, warnDeltaMv: 30, criticalDeltaMv: 80 },
};

function profileFor(value?: string | null): Profile | null {
  const chemistry=(value??"").toLowerCase().replaceAll("_","-");
  if(chemistry.includes("lifepo")||chemistry.includes("lfp"))return PROFILES.lfp;
  if(chemistry.includes("nmc")||chemistry.includes("li-ion")||chemistry.includes("liion"))return PROFILES["li-ion"];
  if(chemistry.includes("lto"))return PROFILES.lto;
  return null;
}

export function classifyCell(snapshot: GatewaySnapshot, index: number): CellVisualStatus {
  const cells=snapshot.cellsV??[];
  const voltage=cells[index];
  if(!Number.isFinite(voltage)||snapshot.stale||!snapshot.connected)return {severity:"stale",reason:"stale",balanceRole:null};
  const average=cells.reduce((sum,value)=>sum+value,0)/Math.max(1,cells.length);
  const deviationMv=Math.abs(voltage-average)*1000;
  const minimumIndex=cells.indexOf(Math.min(...cells));
  const maximumIndex=cells.indexOf(Math.max(...cells));
  const profile=profileFor(snapshot.chemistry);
  const alarms=new Set(snapshot.alarms??[]);
  let severity:CellSeverity="normal";
  let reason:CellReason="normal";

  if((alarms.has("CELL_UNDER_VOLTAGE")&&index===minimumIndex)||(profile&&voltage<=profile.criticalLow)){severity="critical";reason="low";}
  else if((alarms.has("CELL_OVER_VOLTAGE")&&index===maximumIndex)||(profile&&voltage>=profile.criticalHigh)){severity="critical";reason="high";}
  else if(deviationMv>=(profile?.criticalDeltaMv??100)){severity="critical";reason="deviation";}
  else if(profile&&voltage<=profile.warnLow){severity="warning";reason="low";}
  else if(profile&&voltage>=profile.warnHigh){severity="warning";reason="high";}
  else if(deviationMv>=(profile?.warnDeltaMv??30)){severity="warning";reason="deviation";}

  const balancingIndices=snapshot.balancingCellIndices??[];
  const isBalancing=snapshot.balancing&&(balancingIndices.length?balancingIndices.includes(index):index===minimumIndex||index===maximumIndex);
  const balanceRole:CellBalanceRole=!isBalancing?null:index===minimumIndex?"receiving":index===maximumIndex?"donating":null;
  return {severity,reason,balanceRole};
}
