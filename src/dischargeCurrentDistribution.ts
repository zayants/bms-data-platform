import type { HistoryPoint } from "./types";

export type DischargeCurrentBin = {
  fromA: number;
  toA: number;
  durationMs: number;
  percent: number;
};

export type DischargeCurrentDistribution = {
  bins: DischargeCurrentBin[];
  totalDischargeMs: number;
  outsideRangeMs: number;
  excludedGapMs: number;
  typicalBin: DischargeCurrentBin | null;
  inferredSampleIntervalMs: number;
};

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Time-weighted distribution of natural discharge current. It never creates a
 * test load and deliberately excludes long telemetry gaps and sign changes.
 */
export function calculateDischargeCurrentDistribution(
  source: HistoryPoint[],
  maximumCurrentA: number,
  deadbandA = 0.2,
): DischargeCurrentDistribution {
  const maximum = Math.max(1, Math.min(2_000, Math.ceil(maximumCurrentA)));
  const bins = Array.from({ length: maximum }, (_, index): DischargeCurrentBin => ({
    fromA: index,
    toA: index + 1,
    durationMs: 0,
    percent: 0,
  }));
  const points = source
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.currentA))
    .sort((a, b) => a.timestamp - b.timestamp);
  const intervals = points.slice(1).map((point, index) => point.timestamp - points[index].timestamp).filter((value) => value > 0);
  const inferredSampleIntervalMs = median(intervals);
  const maximumGapMs = Math.max(60_000, inferredSampleIntervalMs * 3);
  let totalDischargeMs = 0;
  let outsideRangeMs = 0;
  let excludedGapMs = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const durationMs = next.timestamp - current.timestamp;
    if (durationMs <= 0) continue;
    if (durationMs > maximumGapMs) {
      excludedGapMs += durationMs;
      continue;
    }
    // A sign change means that the interval contains an unknown transition.
    if (current.currentA >= -deadbandA || next.currentA >= -deadbandA) continue;
    const magnitudeA = Math.abs((current.currentA + next.currentA) / 2);
    totalDischargeMs += durationMs;
    const binIndex = Math.floor(magnitudeA);
    if (binIndex >= bins.length) outsideRangeMs += durationMs;
    else bins[binIndex].durationMs += durationMs;
  }

  for (const bin of bins) bin.percent = totalDischargeMs > 0 ? bin.durationMs / totalDischargeMs * 100 : 0;
  const typicalBin = bins.reduce<DischargeCurrentBin | null>((best, bin) =>
    bin.durationMs > (best?.durationMs ?? 0) ? bin : best, null);
  return { bins, totalDischargeMs, outsideRangeMs, excludedGapMs, typicalBin, inferredSampleIntervalMs };
}

