import type { HistoryPoint } from "./types";

export type EstimateConfidence = "learning" | "low" | "medium" | "high";

export type CellCapacityEstimate = {
  cellIndex: number;
  fillPercent: number | null;
  estimatedCapacityAh: number | null;
  sampleCount: number;
  confidence: EstimateConfidence;
  limitingAtEmptyCount: number;
  limitingAtFullCount: number;
};

export type CellCapacityAnalysis = {
  completedCycles: number;
  requiredCycles: number;
  cells: CellCapacityEstimate[];
};

type Direction = "charge" | "discharge";

const CURRENT_DEADBAND_A = 0.3;
const MAX_SAMPLE_GAP_MS = 5 * 60_000;
const REQUIRED_CYCLES = 3;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function integrateAh(points: HistoryPoint[], direction: Direction): number {
  let result = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const elapsedMs = current.timestamp - previous.timestamp;
    if (elapsedMs <= 0 || elapsedMs > MAX_SAMPLE_GAP_MS) continue;
    const averageCurrent = (previous.currentA + current.currentA) / 2;
    const directionalCurrent = direction === "charge" ? Math.max(0, averageCurrent) : Math.max(0, -averageCurrent);
    if (directionalCurrent < CURRENT_DEADBAND_A) continue;
    result += directionalCurrent * elapsedMs / 3_600_000;
  }
  return result;
}

function findBoundarySegments(points: HistoryPoint[], direction: Direction): HistoryPoint[][] {
  const segments: HistoryPoint[][] = [];
  let start = -1;
  for (let index = 0; index < points.length; index += 1) {
    const soc = points[index].socPercent;
    if (start < 0) {
      if ((direction === "charge" && soc <= 1) || (direction === "discharge" && soc >= 99)) start = index;
      continue;
    }
    const reachedEnd = direction === "charge" ? soc >= 99 : soc <= 1;
    if (reachedEnd) {
      const segment = points.slice(start, index + 1);
      if (segment.length > 1 && integrateAh(segment, direction) > 0.1) segments.push(segment);
      start = -1;
    }
  }
  return segments;
}

function crossingCapacity(segment: HistoryPoint[], cellIndex: number, direction: Direction, lowV: number, highV: number): number | null {
  const startVoltage = segment[0].cellsV?.[cellIndex];
  if (!Number.isFinite(startVoltage)) return null;
  for (let index = 1; index < segment.length; index += 1) {
    const voltage = segment[index].cellsV?.[cellIndex];
    if (!Number.isFinite(voltage)) continue;
    if ((direction === "charge" && voltage! >= highV) || (direction === "discharge" && voltage! <= lowV)) {
      return integrateAh(segment.slice(0, index + 1), direction);
    }
  }
  return null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function analyzeCellCapacity(
  inputPoints: HistoryPoint[],
  nominalCapacityAh: number | null | undefined,
  lowVoltageV = 2.6,
  highVoltageV = 3.55,
): CellCapacityAnalysis {
  const points = [...inputPoints].filter((point) => Number.isFinite(point.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  const cellCount = points.reduce((maximum, point) => Math.max(maximum, point.cellsV?.length ?? 0), 0);
  const chargeSegments = findBoundarySegments(points, "charge");
  const dischargeSegments = findBoundarySegments(points, "discharge");
  const completedCycles = Math.min(chargeSegments.length, dischargeSegments.length);
  const latest = points.at(-1);
  const latestCells = latest?.cellsV ?? [];
  const latestAverage = latestCells.length ? latestCells.reduce((sum, value) => sum + value, 0) / latestCells.length : 0;
  const voltageSpan = Math.max(0.01, highVoltageV - lowVoltageV);

  const cells = Array.from({ length: cellCount }, (_, cellIndex): CellCapacityEstimate => {
    const samples = [
      ...chargeSegments.map((segment) => crossingCapacity(segment, cellIndex, "charge", lowVoltageV, highVoltageV)),
      ...dischargeSegments.map((segment) => crossingCapacity(segment, cellIndex, "discharge", lowVoltageV, highVoltageV)),
    ].filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
    const rawCapacity = median(samples);
    const plausibleMaximum = nominalCapacityAh && nominalCapacityAh > 0 ? nominalCapacityAh * 1.35 : Number.POSITIVE_INFINITY;
    const estimatedCapacityAh = samples.length >= REQUIRED_CYCLES && rawCapacity != null && rawCapacity <= plausibleMaximum ? rawCapacity : null;
    const confidence: EstimateConfidence = samples.length < REQUIRED_CYCLES ? "learning" : samples.length < 5 ? "low" : samples.length < 8 ? "medium" : "high";
    const voltage = latestCells[cellIndex];
    const voltageFill = Number.isFinite(voltage) ? clamp((voltage - lowVoltageV) / voltageSpan * 100, 0, 100) : null;
    // SOC is the stable coulomb-counting base. A limited voltage correction only reveals relative cell divergence.
    const fillPercent = latest && voltageFill != null
      ? clamp(latest.socPercent * 0.82 + voltageFill * 0.18 + clamp((voltage - latestAverage) / voltageSpan * 100, -4, 4), 0, 100)
      : null;
    const limitingAtEmptyCount = dischargeSegments.filter((segment) => {
      const cellsAtEnd = segment.at(-1)?.cellsV ?? [];
      return cellsAtEnd.length > cellIndex && cellsAtEnd[cellIndex] === Math.min(...cellsAtEnd);
    }).length;
    const limitingAtFullCount = chargeSegments.filter((segment) => {
      const cellsAtEnd = segment.at(-1)?.cellsV ?? [];
      return cellsAtEnd.length > cellIndex && cellsAtEnd[cellIndex] === Math.max(...cellsAtEnd);
    }).length;
    return { cellIndex, fillPercent, estimatedCapacityAh, sampleCount: samples.length, confidence, limitingAtEmptyCount, limitingAtFullCount };
  });

  return { completedCycles, requiredCycles: REQUIRED_CYCLES, cells };
}
