import { describe, expect, it } from "vitest";
import { calculateBalanceDiagnostics } from "./balanceDiagnostics";
import type { HistoryPoint } from "./types";

function point(timestamp: number): HistoryPoint {
  return {
    timestamp,
    packVoltageV: 53,
    currentA: 5,
    powerW: 265,
    socPercent: 95,
    temperatureC: 25,
    deltaMv: 12,
    balancing: true,
    alarmMask: 0,
    cellsV: [3.31, 3.32, 3.33, 3.34],
  };
}

describe("calculateBalanceDiagnostics calendar window", () => {
  it("starts the first year at the month of the first real sample", () => {
    const first = new Date(2026, 7, 18, 12).getTime();
    const result = calculateBalanceDiagnostics([point(first)]);

    expect(new Date(result.monthStarts[0]).getFullYear()).toBe(2026);
    expect(new Date(result.monthStarts[0]).getMonth()).toBe(7);
    expect(new Date(result.monthStarts[11]).getFullYear()).toBe(2027);
    expect(new Date(result.monthStarts[11]).getMonth()).toBe(6);
  });

  it("uses a rolling twelve-month window after more than a year of history", () => {
    const first = new Date(2025, 0, 2).getTime();
    const latest = new Date(2026, 7, 18).getTime();
    const result = calculateBalanceDiagnostics([point(first), point(latest)]);

    expect(new Date(result.monthStarts[0]).getFullYear()).toBe(2025);
    expect(new Date(result.monthStarts[0]).getMonth()).toBe(8);
    expect(new Date(result.monthStarts[11]).getFullYear()).toBe(2026);
    expect(new Date(result.monthStarts[11]).getMonth()).toBe(7);
  });
});
