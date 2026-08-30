import { describe, expect, it } from "vitest";
import { cellVoltageAxisRange, packVoltageAxisRange } from "./voltageAxis";

describe("chemistry-aware voltage axes", () => {
  it("keeps normal LFP cell differences readable instead of showing the full chemistry envelope", () => {
    const range = cellVoltageAxisRange("LiFePO4", null, [3.28, 3.34]);
    expect(range.minimum).toBeLessThan(3.28);
    expect(range.maximum).toBeGreaterThan(3.34);
    expect(range.maximum - range.minimum).toBeLessThan(0.15);
  });

  it("keeps a useful minimum span for nearly identical cell voltages", () => {
    const range = cellVoltageAxisRange("LFP", null, [3.331, 3.332]);
    expect(range.minimum).toBeLessThan(3.331);
    expect(range.maximum).toBeGreaterThan(3.332);
    expect(range.maximum - range.minimum).toBeGreaterThan(0.02);
  });

  it("expands when an actual cell voltage leaves the expected range", () => {
    const range = cellVoltageAxisRange("LFP", null, [2.40, 3.82]);
    expect(range.minimum).toBeLessThan(2.40);
    expect(range.maximum).toBeGreaterThan(3.82);
  });

  it("scales the chemistry limits by the real series cell count", () => {
    const range = packVoltageAxisRange("NMC", null, 10, [36.8, 37.2]);
    expect(range.minimum).toBeCloseTo(24.49, 2);
    expect(range.maximum).toBeCloseTo(42.51, 2);
  });
});
