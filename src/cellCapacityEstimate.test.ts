import { describe, expect, it } from "vitest";
import { analyzeCellCapacity } from "./cellCapacityEstimate";
import type { HistoryPoint } from "./types";

const point = (timestamp: number, socPercent: number, currentA: number, cellsV: number[]): HistoryPoint => ({
  timestamp, socPercent, currentA, cellsV, packVoltageV: cellsV.reduce((sum, value) => sum + value, 0),
  powerW: 0, temperatureC: 25, deltaMv: (Math.max(...cellsV) - Math.min(...cellsV)) * 1000,
  balancing: false, alarmMask: 0,
});

describe("cell capacity estimator", () => {
  it("does not publish capacity before three samples", () => {
    const points = [point(0, 100, -10, [3.55, 3.55]), point(3_600_000, 0, -10, [2.6, 2.7])];
    const result = analyzeCellCapacity(points, 10, 2.6, 3.55);
    expect(result.cells[0].estimatedCapacityAh).toBeNull();
    expect(result.cells[0].confidence).toBe("learning");
  });

  it("calculates a median capacity after repeated complete cycles", () => {
    const points: HistoryPoint[] = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const base = cycle * 8_000_000;
      for (let step = 0; step <= 12; step += 1) {
        const fraction = step / 12;
        points.push(point(base + step * 300_000, 100 * (1 - fraction), -10, [3.55 - .95 * fraction, 3.55 - .95 * fraction]));
      }
      const chargeBase = base + 3_660_000;
      for (let step = 0; step <= 12; step += 1) {
        const fraction = step / 12;
        points.push(point(chargeBase + step * 300_000, 100 * fraction, 10, [2.6 + .95 * fraction, 2.6 + .95 * fraction]));
      }
    }
    const result = analyzeCellCapacity(points, 10, 2.6, 3.55);
    expect(result.completedCycles).toBe(3);
    expect(result.cells[0].estimatedCapacityAh).toBeCloseTo(10, 1);
    expect(result.cells[0].sampleCount).toBeGreaterThanOrEqual(3);
  });

  it("does not integrate across a long history gap", () => {
    const points = [point(0, 100, -10, [3.55]), point(12 * 3_600_000, 0, -10, [2.6])];
    const result = analyzeCellCapacity(points, 10, 2.6, 3.55);
    expect(result.completedCycles).toBe(0);
  });
});
