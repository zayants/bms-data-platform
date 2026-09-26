import { describe, expect, it } from "vitest";
import { actionableAlarmMask, alarmCount, unknownAlarmMask } from "./alarmState";
import type { GatewaySnapshot } from "./types";

const snapshot = (values: Partial<GatewaySnapshot>): GatewaySnapshot => ({
  apiVersion: 1, serverTime: 1, available: true, connected: true, stale: false,
  ageMs: 0, deviceName: "JK", deviceAddress: "00", connectionStatus: "LIVE",
  ...values,
});

describe("alarm state", () => {
  it("excludes the password reminder from a cached battery alarm mask", () => {
    expect(actionableAlarmMask(0x80000)).toBe(0);
    expect(actionableAlarmMask(0x80004)).toBe(0x4);
  });

  it("does not hide an unknown raw alarm bit from an older gateway", () => {
    const value = snapshot({ alarmMask: 0x20000000, alarms: [] });
    expect(unknownAlarmMask(value)).toBe(0x20000000);
    expect(alarmCount(value)).toBe(1);
  });

  it("counts known and unknown alarm groups", () => {
    const value = snapshot({ alarmMask: 0x80004, unknownAlarmMask: 0x80000, alarms: ["CELL_OVER_VOLTAGE"] });
    expect(alarmCount(value)).toBe(2);
  });
});
