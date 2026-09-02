import { describe, expect, it } from "vitest";
import { calculateDischargeCurrentDistribution } from "./dischargeCurrentDistribution";
import type { HistoryPoint } from "./types";

const point = (timestamp: number, currentA: number): HistoryPoint => ({
  timestamp, currentA, packVoltageV: 26, powerW: currentA * 26, socPercent: 50,
  temperatureC: 25, deltaMv: 4, balancing: false, alarmMask: 0,
});

describe("calculateDischargeCurrentDistribution", () => {
  it("weights current bins by valid discharge time", () => {
    const points = [point(0, -2.2), point(60_000, -2.4), point(120_000, -4.2), point(180_000, -4.4)];
    const result = calculateDischargeCurrentDistribution(points, 10);
    expect(result.totalDischargeMs).toBe(180_000);
    expect(result.bins[2].durationMs).toBe(60_000);
    expect(result.bins[3].durationMs).toBe(60_000);
    expect(result.bins[4].durationMs).toBe(60_000);
  });

  it("ignores charging, idle and long communication gaps", () => {
    const points = [point(0, -5), point(30_000, -5), point(60_000, 2), point(600_000, -6), point(630_000, -6)];
    const result = calculateDischargeCurrentDistribution(points, 10);
    expect(result.totalDischargeMs).toBe(60_000);
    expect(result.bins[5].durationMs).toBe(30_000);
    expect(result.bins[6].durationMs).toBe(30_000);
    expect(result.excludedGapMs).toBe(540_000);
  });

  it("reports discharge above the user display range separately", () => {
    const result = calculateDischargeCurrentDistribution([point(0, -12), point(60_000, -12)], 10);
    expect(result.outsideRangeMs).toBe(60_000);
    expect(result.bins.every((bin) => bin.durationMs === 0)).toBe(true);
  });
});

