import type { PulseResistanceCellResult, PulseResistanceTestResult } from "./types";

export type PulseResistanceTrendCell = {
  index: number;
  baselineMOhm: number | null;
  previousMOhm: number | null;
  latestMOhm: number | null;
  changeFromBaselinePercent: number | null;
  changeFromPreviousPercent: number | null;
  relativeChangePercent: number | null;
  severity: "normal" | "warning" | "critical" | "unknown";
};

export type PulseResistanceComparison = {
  records: PulseResistanceTestResult[];
  latest: PulseResistanceTestResult | null;
  baseline: PulseResistanceTestResult | null;
  previous: PulseResistanceTestResult | null;
  cells: PulseResistanceTrendCell[];
  comparableCount: number;
};

const validEstimate = (cell: PulseResistanceCellResult | undefined): number | null =>
  cell?.estimateMOhm != null && Number.isFinite(cell.estimateMOhm) && cell.estimateMOhm > 0 ? cell.estimateMOhm : null;

export function pulseTestsComparable(a: PulseResistanceTestResult, b: PulseResistanceTestResult): boolean {
  if (a.cells.length !== b.cells.length || a.cells.length === 0) return false;
  if (Math.abs(a.socPercent - b.socPercent) > 5) return false;
  if (Math.abs(a.temperatureC - b.temperatureC) > 5) return false;
  const smallerCurrent = Math.max(1, Math.min(Math.abs(a.baselineCurrentA), Math.abs(b.baselineCurrentA)));
  return Math.abs(a.baselineCurrentA - b.baselineCurrentA) <= Math.max(1, smallerCurrent * 0.25);
}

const percentChange = (from: number | null, to: number | null): number | null =>
  from == null || to == null || from <= 0 ? null : ((to - from) / from) * 100;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function comparePulseResistanceTests(input: PulseResistanceTestResult[]): PulseResistanceComparison {
  const records = [...input].filter((record) => Number.isFinite(record.completedAt)).sort((a, b) => a.completedAt - b.completedAt);
  const latest = records.at(-1) ?? null;
  if (!latest) return { records, latest: null, baseline: null, previous: null, cells: [], comparableCount: 0 };
  const comparable = records.slice(0, -1).filter((record) => pulseTestsComparable(record, latest));
  const baseline = comparable[0] ?? null;
  const previous = comparable.at(-1) ?? null;
  const rawChanges = latest.cells.map((cell, index) => percentChange(validEstimate(baseline?.cells[index]), validEstimate(cell)));
  const packMedianChange = median(rawChanges.filter((value): value is number => value != null));
  const cells = latest.cells.map((cell, index): PulseResistanceTrendCell => {
    const baselineMOhm = validEstimate(baseline?.cells[index]);
    const previousMOhm = validEstimate(previous?.cells[index]);
    const latestMOhm = validEstimate(cell);
    const changeFromBaselinePercent = percentChange(baselineMOhm, latestMOhm);
    const changeFromPreviousPercent = percentChange(previousMOhm, latestMOhm);
    const relativeChangePercent = changeFromBaselinePercent == null ? null : changeFromBaselinePercent - packMedianChange;
    const absoluteGrowth = baselineMOhm == null || latestMOhm == null ? null : latestMOhm - baselineMOhm;
    const severity = latestMOhm == null || baselineMOhm == null || relativeChangePercent == null || absoluteGrowth == null
      ? "unknown"
      : absoluteGrowth >= 0.2 && relativeChangePercent >= 40 ? "critical"
        : absoluteGrowth >= 0.1 && relativeChangePercent >= 20 ? "warning"
          : "normal";
    return { index: cell.index, baselineMOhm, previousMOhm, latestMOhm, changeFromBaselinePercent, changeFromPreviousPercent, relativeChangePercent, severity };
  });
  return { records, latest, baseline, previous, cells, comparableCount: comparable.length + 1 };
}
