import { describe, expect, it } from "vitest";
import {
  buildHistoryUrl,
  calculateCellStats,
  currentPowerCorrelation,
  isHistoryPointInMode,
  normalizeGatewayUrl,
} from "./gateway";
import type { HistoryPoint } from "./types";

function historyPoint(currentA: number, powerW: number): HistoryPoint {
  return {
    timestamp: 1,
    packVoltageV: 26.4,
    currentA,
    powerW,
    socPercent: 50,
    temperatureC: 25,
    deltaMv: 5,
    balancing: false,
    alarmMask: 0,
  };
}

describe("normalizeGatewayUrl", () => {
  it("adds the HTTP scheme and removes trailing slashes", () => {
    expect(normalizeGatewayUrl(" 192.168.0.188:8765/ ")).toBe("http://192.168.0.188:8765");
  });
});

describe("buildHistoryUrl", () => {
  it("creates a bounded read-only history request", () => {
    expect(buildHistoryUrl("192.168.0.188:8765/", 1000, 2000, 9000)).toBe(
      "http://192.168.0.188:8765/api/v1/history?from=1000&to=2000&maxPoints=5000",
    );
  });
});

describe("calculateCellStats", () => {
  it("calculates cell extremes, average and delta", () => {
    const stats = calculateCellStats([3.284, 3.281, 3.289, 3.286]);
    expect(stats.min).toBe(3.281);
    expect(stats.max).toBe(3.289);
    expect(stats.minIndex).toBe(1);
    expect(stats.maxIndex).toBe(2);
    expect(stats.average).toBeCloseTo(3.285, 6);
    expect(stats.deltaMv).toBe(8);
  });

  it("handles an empty pack", () => {
    expect(calculateCellStats([]).deltaMv).toBeNull();
  });
});

describe("history flow modes", () => {
  it("separates charging, discharging and idle samples", () => {
    expect(isHistoryPointInMode(historyPoint(2, 52), "charging")).toBe(true);
    expect(isHistoryPointInMode(historyPoint(-2, -52), "discharging")).toBe(true);
    expect(isHistoryPointInMode(historyPoint(0.05, 1), "charging")).toBe(false);
    expect(isHistoryPointInMode(historyPoint(0.05, 1), "discharging")).toBe(false);
  });
});

describe("currentPowerCorrelation", () => {
  it("returns a strong positive correlation for proportional measurements", () => {
    const result = currentPowerCorrelation([
      historyPoint(-3, -78),
      historyPoint(-1, -26),
      historyPoint(1, 26),
      historyPoint(3, 78),
    ]);
    expect(result).toBeCloseTo(1, 8);
  });

  it("returns null when a correlation cannot be calculated", () => {
    expect(currentPowerCorrelation([historyPoint(0, 0)])).toBeNull();
  });
});
