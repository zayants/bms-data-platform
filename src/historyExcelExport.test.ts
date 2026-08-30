import { describe, expect, it } from "vitest";
import { buildHistoryWorkbook, type HistoryExportLabels } from "./historyExcelExport";
import type { HistoryResponse } from "./types";

const labels: HistoryExportLabels = new Proxy({}, { get: (_target, key) => String(key) }) as HistoryExportLabels;

describe("history Excel export", () => {
  it("creates separate sheets and dynamic columns for every cell", () => {
    const history: HistoryResponse = {
      apiVersion: 1, from: 1_000, to: 2_000, bucketMs: 1_000, sourceCount: 1, pointCount: 1,
      points: [{ timestamp: 1_500, packVoltageV: 13.2, currentA: -2, powerW: -26.4, socPercent: 72, temperatureC: 24, deltaMv: 8, balancing: false, alarmMask: 0, cellsV: [3.3, 3.301, 3.299, 3.3], cellResistanceMOhm: [1.1, 1.2, null, 1.3] }],
      socEvents: [{ timestamp: 1_600, previousSocPercent: 1, socPercent: 0, packVoltageV: 12.8, currentA: -4, powerW: -51, temperatureC: 25, deltaMv: 20, alarmMask: 0, cellsV: [3.2, 3.2, 3.19, 3.21] }],
      connectionEvents: [{ timestamp: 1_700, type: "LOST", durationMs: 2_500, bmsName: "JK_TEST", gattStatus: 133 }],
    };
    const sheets = buildHistoryWorkbook(history, labels, 3_000);
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(["dataSheet", "socSheet", "connectionSheet", "informationSheet"]);
    expect(sheets[0].data).toHaveLength(2);
    expect(sheets[0].data[0]).toHaveLength(18);
    expect(sheets[0].data[1]).toHaveLength(18);
    expect(sheets[1].data).toHaveLength(2);
    expect(sheets[2].data[1][2]).toBe("lost");
  });

  it("serializes the workbook as a valid xlsx zip", async () => {
    const history: HistoryResponse = {
      apiVersion: 1, from: 1_000, to: 2_000, bucketMs: 1_000, sourceCount: 1, pointCount: 1,
      points: [{ timestamp: 1_500, packVoltageV: 13.2, currentA: 1, powerW: 13.2, socPercent: 50, temperatureC: 25, deltaMv: 3, balancing: true, alarmMask: 0, cellsV: [3.3, 3.3, 3.3, 3.3] }],
    };
    const { default: writeExcelFile } = await import("write-excel-file/node");
    const buffer = await writeExcelFile(buildHistoryWorkbook(history, labels)).toBuffer();
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1_000);
  });
});
