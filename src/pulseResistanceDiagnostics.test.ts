import { describe, expect, it } from "vitest";
import { comparePulseResistanceTests, pulseTestsComparable } from "./pulseResistanceDiagnostics";
import type { PulseResistanceTestResult } from "./types";

const record = (completedAt: number, values: number[], overrides: Partial<PulseResistanceTestResult> = {}): PulseResistanceTestResult => ({
  completedAt, baselineCurrentA: 10, interruptedCurrentA: 0, restoredCurrentA: 10,
  socPercent: 50, temperatureC: 25, interruptionMs: 1_000,
  cells: values.map((estimateMOhm, index) => ({ index: index + 1, fallingEdgeMOhm: estimateMOhm,
    returnEdgeMOhm: estimateMOhm, estimateMOhm, edgeDifferencePercent: 0, quality: "HIGH" })),
  ...overrides,
});

describe("pulse resistance comparison", () => {
  it("compares only tests made under similar conditions", () => {
    expect(pulseTestsComparable(record(1, [1, 1]), record(2, [1, 1], { socPercent: 54, temperatureC: 29, baselineCurrentA: 11 }))).toBe(true);
    expect(pulseTestsComparable(record(1, [1, 1]), record(2, [1, 1], { socPercent: 60 }))).toBe(false);
  });

  it("flags a cell growing faster than the pack", () => {
    const comparison = comparePulseResistanceTests([record(1, [1, 1, 1]), record(2, [1.05, 1.5, 1.04])]);
    expect(comparison.cells[0].severity).toBe("normal");
    expect(comparison.cells[1].severity).toBe("critical");
    expect(comparison.cells[1].changeFromBaselinePercent).toBeCloseTo(50);
  });

  it("does not compare a lone test", () => {
    const comparison = comparePulseResistanceTests([record(1, [1, 1])]);
    expect(comparison.baseline).toBeNull();
    expect(comparison.cells.every((cell) => cell.severity === "unknown")).toBe(true);
  });
});
