import type { HistoryPoint } from "./types";

export type OperatingPointSettings = {
  targetCurrentA: number;
  currentToleranceA: number;
  targetSocPercent: number;
  socTolerancePercent: number;
  temperatureFilterEnabled: boolean;
  targetTemperatureC: number;
  temperatureToleranceC: number;
};

export type ComparableCellSnapshot = {
  timestamp: number;
  currentA: number;
  socPercent: number;
  temperatureC: number;
  deltaMv: number;
  cellsV: number[];
  deviationsMv: number[];
  minimumCellIndex: number;
  maximumCellIndex: number;
  score: number;
};

export type OperatingPointDiagnostics = {
  snapshots: ComparableCellSnapshot[];
  matchingPointCount: number;
  cellCount: number;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const finiteCells = (point: HistoryPoint): number[] | null => {
  if (!Array.isArray(point.cellsV) || point.cellsV.length < 4 || point.cellsV.length > 32) return null;
  return point.cellsV.every((value) => Number.isFinite(value) && value > 0) ? point.cellsV : null;
};

export function selectComparableCellSnapshots(
  source: HistoryPoint[],
  settings: OperatingPointSettings,
): OperatingPointDiagnostics {
  const currentTolerance = Math.max(0.05, settings.currentToleranceA);
  const socTolerance = Math.max(0.1, settings.socTolerancePercent);
  const temperatureTolerance = Math.max(0.1, settings.temperatureToleranceC);
  const targetMagnitude = Math.max(0.2, Math.abs(settings.targetCurrentA));

  const candidates = source.flatMap((point) => {
    const cells = finiteCells(point);
    if (!cells || !Number.isFinite(point.timestamp) || point.currentA >= -0.2) return [];
    const currentError = Math.abs(Math.abs(point.currentA) - targetMagnitude);
    const socError = Math.abs(point.socPercent - settings.targetSocPercent);
    const temperatureError = Math.abs(point.temperatureC - settings.targetTemperatureC);
    if (currentError > currentTolerance || socError > socTolerance) return [];
    if (settings.temperatureFilterEnabled && temperatureError > temperatureTolerance) return [];

    const center = median(cells);
    const minimum = Math.min(...cells), maximum = Math.max(...cells);
    const snapshot: ComparableCellSnapshot = {
      timestamp: point.timestamp,
      currentA: point.currentA,
      socPercent: point.socPercent,
      temperatureC: point.temperatureC,
      deltaMv: (maximum - minimum) * 1_000,
      cellsV: [...cells],
      deviationsMv: cells.map((value) => Math.round((value - center) * 1_000_000) / 1_000),
      minimumCellIndex: cells.indexOf(minimum),
      maximumCellIndex: cells.indexOf(maximum),
      score: currentError / currentTolerance + socError / socTolerance
        + (settings.temperatureFilterEnabled ? temperatureError / temperatureTolerance : 0),
    };
    return [snapshot];
  });

  if (candidates.length === 0) return { snapshots: [], matchingPointCount: 0, cellCount: 0 };
  const cellCountFrequency = new Map<number, number>();
  for (const candidate of candidates) cellCountFrequency.set(candidate.cellsV.length, (cellCountFrequency.get(candidate.cellsV.length) ?? 0) + 1);
  const cellCount = [...cellCountFrequency].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const compatible = candidates.filter((candidate) => candidate.cellsV.length === cellCount);

  // One closest point per UTC day prevents a long steady operating interval from
  // visually outweighing the rest of the observation period.
  const bestPerDay = new Map<number, ComparableCellSnapshot>();
  for (const candidate of compatible) {
    const day = Math.floor(candidate.timestamp / 86_400_000);
    const current = bestPerDay.get(day);
    if (!current || candidate.score < current.score || (candidate.score === current.score && candidate.timestamp > current.timestamp)) {
      bestPerDay.set(day, candidate);
    }
  }

  return {
    snapshots: [...bestPerDay.values()].sort((a, b) => a.timestamp - b.timestamp),
    matchingPointCount: compatible.length,
    cellCount,
  };
}
