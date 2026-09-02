import { describe, expect, it } from "vitest";
import { selectComparableCellSnapshots, type OperatingPointSettings } from "./operatingPointDiagnostics";
import type { HistoryPoint } from "./types";

const settings: OperatingPointSettings = {
  targetCurrentA: 5,
  currentToleranceA: 0.5,
  targetSocPercent: 75,
  socTolerancePercent: 2,
  temperatureFilterEnabled: true,
  targetTemperatureC: 25,
  temperatureToleranceC: 3,
};

const point = (timestamp: number, currentA = -5, socPercent = 75, temperatureC = 25, cellsV = [3.4, 3.41, 3.39, 3.4]): HistoryPoint => ({
  timestamp, currentA, socPercent, temperatureC, cellsV,
  packVoltageV: cellsV.reduce((sum, value) => sum + value, 0), powerW: currentA * 13.6,
  deltaMv: 20, balancing: false, alarmMask: 0,
});

describe("selectComparableCellSnapshots", () => {
  it("uses user-selected current and SOC instead of a fixed 50% SOC", () => {
    const result = selectComparableCellSnapshots([point(1, -5.2, 76), point(2, -5, 50)], settings);
    expect(result.matchingPointCount).toBe(1);
    expect(result.snapshots[0].socPercent).toBe(76);
  });

  it("keeps only the closest point per day", () => {
    const day = 86_400_000;
    const result = selectComparableCellSnapshots([
      point(day + 1_000, -5.4, 76), point(day + 2_000, -5.05, 75.1), point(day * 2 + 1_000, -5.1, 74.9),
    ], settings);
    expect(result.matchingPointCount).toBe(3);
    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0].timestamp).toBe(day + 2_000);
  });

  it("can disable the temperature filter", () => {
    expect(selectComparableCellSnapshots([point(1, -5, 75, 40)], settings).snapshots).toHaveLength(0);
    expect(selectComparableCellSnapshots([point(1, -5, 75, 40)], { ...settings, temperatureFilterEnabled: false }).snapshots).toHaveLength(1);
  });

  it("calculates cell deviation from the pack median", () => {
    const result = selectComparableCellSnapshots([point(1)], settings);
    expect(result.snapshots[0].deviationsMv).toEqual([0, 10, -10, 0]);
    expect(result.snapshots[0].minimumCellIndex).toBe(2);
    expect(result.snapshots[0].maximumCellIndex).toBe(1);
  });
});
