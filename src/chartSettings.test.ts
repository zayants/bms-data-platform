import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_SETTINGS, loadChartSettings, normalizeChartSettings, saveChartSettings, thresholdValidationIssue, validThresholdLimits } from "./chartSettings";

describe("chart settings", () => {
  it("uses safe defaults for missing or malformed settings", () => {
    const normalized = normalizeChartSettings({ showBmsThresholds: false, customThresholds: { temperatureC: { low: "bad", high: 55 } } });
    expect(normalized.showBmsThresholds).toBe(false);
    expect(normalized.showCustomThresholds).toBe(false);
    expect(normalized.customThresholdVisibility.temperatureC).toBe(false);
    expect(normalized.customThresholds.temperatureC).toEqual({ low: null, high: 55 });
    expect(normalized.customThresholds.cellVoltageV).toEqual({ low: null, high: null });
    expect(Object.values(normalized.historySections).every(Boolean)).toBe(true);
  });

  it("keeps history page sections independently configurable", () => {
    const normalized = normalizeChartSettings({ historySections: { liveCells: false, cellResistanceChart: false } as never });
    expect(normalized.historySections.liveCells).toBe(false);
    expect(normalized.historySections.cellResistanceChart).toBe(false);
    expect(normalized.historySections.compositeChart).toBe(true);
    expect(normalized.historySections.cellVoltageChart).toBe(true);
    expect(normalized.historySections.balanceDiagnostics).toBe(true);
    expect(Object.values(normalized.individualChartVisibility).every(Boolean)).toBe(true);
  });

  it("migrates the old package switch and keeps individual charts independent", () => {
    const migrated = normalizeChartSettings({ historySections: { individualCharts: false } });
    expect(Object.values(migrated.individualChartVisibility).every((value) => !value)).toBe(true);
    const normalized = normalizeChartSettings({ individualChartVisibility: { currentA: false, powerW: true } });
    expect(normalized.individualChartVisibility.currentA).toBe(false);
    expect(normalized.individualChartVisibility.powerW).toBe(true);
    expect(normalized.individualChartVisibility.socPercent).toBe(true);
  });

  it("keeps threshold visibility independent for every metric", () => {
    const normalized = normalizeChartSettings({
      showCustomThresholds: true,
      customThresholdVisibility: { cellVoltageV: true, temperatureC: false },
    });
    expect(normalized.customThresholdVisibility.cellVoltageV).toBe(true);
    expect(normalized.customThresholdVisibility.temperatureC).toBe(false);
    expect(normalized.customThresholdVisibility.currentA).toBe(false);
  });

  it("rejects invalid threshold order and unsafe values", () => {
    expect(validThresholdLimits("packVoltageV", { low: 10, high: 10 })).toBe(false);
    expect(validThresholdLimits("socPercent", { low: -1, high: 80 })).toBe(false);
    expect(thresholdValidationIssue("packVoltageV", { low: 10, high: 10 })).toBe("order");
    expect(thresholdValidationIssue("socPercent", { low: -1, high: 80 })).toBe("range");
    expect(thresholdValidationIssue("packVoltageV", { low: 25, high: null })).toBeNull();
    expect(normalizeChartSettings({ customThresholds: { packVoltageV: { low: 0.01, high: 0.01 } } }).customThresholds.packVoltageV).toEqual({ low: null, high: null });
  });

  it("round-trips settings through storage", () => {
    let value: string | null = null;
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    const settings = { ...DEFAULT_CHART_SETTINGS, showCustomThresholds: true };
    saveChartSettings(settings, storage);
    expect(loadChartSettings(storage)).toEqual(settings);
  });
});
