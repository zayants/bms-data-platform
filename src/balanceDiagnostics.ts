import type { HistoryPoint } from "./types";

export type BalanceCellDiagnostic = {
  cellIndex: number;
  sessionCount: number;
  frequencyPct: number;
  dutyPct: number;
  relativeBurdenPct: number;
  monthlyBurdenPct: Array<number | null>;
};

export type BalanceDiagnostics = {
  sessionCount: number;
  opportunityHours: number;
  monthStarts: number[];
  monthLabels: string[];
  cells: BalanceCellDiagnostic[];
};

const SESSION_GAP_MS = 30 * 60_000;
const MAX_SAMPLE_INTERVAL_MS = 60_000;

export function calculateBalanceDiagnostics(points: HistoryPoint[], now = Date.now()): BalanceDiagnostics {
  const sorted = [...points].filter((point) => point.cellsV?.length).sort((a, b) => a.timestamp - b.timestamp);
  const cellCount = Math.min(32, Math.max(0, ...sorted.map((point) => point.cellsV?.length ?? 0)));
  const firstRecordedAt = sorted[0]?.timestamp ?? now;
  const latestRecordedAt = sorted.at(-1)?.timestamp ?? firstRecordedAt;
  const firstRecordedMonth = startOfMonth(firstRecordedAt);
  const latestRecordedMonth = startOfMonth(latestRecordedAt);
  const recordedMonthSpan = monthDistance(firstRecordedMonth, latestRecordedMonth);
  const windowStart = recordedMonthSpan < 12 ? firstRecordedMonth : addMonths(latestRecordedMonth, -11);
  const monthStarts = Array.from({ length: 12 }, (_, index) => {
    return addMonths(windowStart, index);
  });
  const monthLabels = monthStarts.map((timestamp) => new Date(timestamp).toLocaleDateString(undefined, { month: "short" }));
  const participation = Array.from({ length: cellCount }, () => new Set<number>());
  const activeMs = Array(cellCount).fill(0) as number[];
  const opportunityMsByMonth = Array(12).fill(0) as number[];
  const activeMsByMonth = Array.from({ length: cellCount }, () => Array(12).fill(0) as number[]);
  let opportunityMs = 0;
  let sessionIndex = -1;
  let previousOpportunityAt = -Infinity;

  for (let index = 0; index < sorted.length; index += 1) {
    const point = sorted[index];
    const cells = point.cellsV ?? [];
    const topZone = point.balancing || (point.currentA > 0.1 && point.socPercent >= 90);
    if (!topZone || cells.length < 2) continue;
    if (point.timestamp - previousOpportunityAt > SESSION_GAP_MS) sessionIndex += 1;
    const nextTimestamp = sorted[index + 1]?.timestamp ?? point.timestamp;
    const interval = Math.max(0, Math.min(MAX_SAMPLE_INTERVAL_MS, nextTimestamp - point.timestamp));
    opportunityMs += interval;
    previousOpportunityAt = point.timestamp;
    let monthIndex = -1;
    for (let candidate = monthStarts.length - 1; candidate >= 0; candidate -= 1) {
      if (point.timestamp >= monthStarts[candidate]) { monthIndex = candidate; break; }
    }
    if (monthIndex >= 0) opportunityMsByMonth[monthIndex] += interval;
    if (!point.balancing) continue;
    const minIndex = cells.indexOf(Math.min(...cells));
    const maxIndex = cells.indexOf(Math.max(...cells));
    for (const cellIndex of new Set([minIndex, maxIndex])) {
      participation[cellIndex]?.add(sessionIndex);
      activeMs[cellIndex] += interval;
      if (monthIndex >= 0) activeMsByMonth[cellIndex][monthIndex] += interval;
    }
  }

  const positive = activeMs.filter((value) => value > 0).sort((a, b) => a - b);
  const median = positive.length ? positive[Math.floor(positive.length / 2)] : 0;
  return {
    sessionCount: sessionIndex + 1,
    opportunityHours: opportunityMs / 3_600_000,
    monthStarts,
    monthLabels,
    cells: Array.from({ length: cellCount }, (_, cellIndex) => ({
      cellIndex,
      sessionCount: participation[cellIndex].size,
      frequencyPct: sessionIndex >= 0 ? participation[cellIndex].size / (sessionIndex + 1) * 100 : 0,
      dutyPct: opportunityMs > 0 ? activeMs[cellIndex] / opportunityMs * 100 : 0,
      relativeBurdenPct: median > 0 ? (activeMs[cellIndex] / median - 1) * 100 : 0,
      monthlyBurdenPct: monthStarts.map((_, monthIndex) => opportunityMsByMonth[monthIndex] > 0 ? activeMsByMonth[cellIndex][monthIndex] / opportunityMsByMonth[monthIndex] * 100 : null),
    })),
  };
}

function startOfMonth(timestamp: number): number {
  const date = new Date(timestamp);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addMonths(timestamp: number, offset: number): number {
  const date = new Date(timestamp);
  date.setMonth(date.getMonth() + offset);
  return date.getTime();
}

function monthDistance(from: number, to: number): number {
  const start = new Date(from);
  const end = new Date(to);
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}
