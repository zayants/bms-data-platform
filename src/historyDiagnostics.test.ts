import { describe, expect, it } from "vitest";
import { calculateSocEventCellStats, inferSocBoundaryEvents } from "./historyDiagnostics";
import type { HistoryPoint } from "./types";

function point(timestamp: number, socPercent: number, cellsV = [3.3, 3.3]): HistoryPoint {
  return { timestamp, socPercent, cellsV, packVoltageV: cellsV.reduce((sum, value) => sum + value, 0), currentA: -10, powerW: -66, temperatureC: 25, deltaMv: 0, balancing: false, alarmMask: 0 };
}

describe("SOC boundary diagnostics", () => {
  it("keeps an exact sudden 15% to 0% transition", () => {
    const events = inferSocBoundaryEvents([point(1, 15), point(2, 0, [2.9, 3.3])]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ timestamp: 2, previousSocPercent: 15, socPercent: 0, cellsV: [2.9, 3.3] });
  });

  it("detects reaching 100% but ignores ordinary SOC movement", () => {
    const events = inferSocBoundaryEvents([point(1, 97), point(2, 98), point(3, 100)]);
    expect(events.map((event) => [event.previousSocPercent, event.socPercent])).toEqual([[98, 100]]);
  });

  it("finds the weak and strongest cells at the event", () => {
    const [event] = inferSocBoundaryEvents([point(1, 15), point(2, 0, [3.21, 3.08, 3.25])]);
    expect(calculateSocEventCellStats(event)).toEqual({ minimum: 3.08, maximum: 3.25, minimumIndex: 1, maximumIndex: 2 });
  });
});
