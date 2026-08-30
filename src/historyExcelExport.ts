import type { HistoryResponse } from "./types";

type CellValue = string | number | boolean | Date | null;
type StyledCell = {
  value: Exclude<CellValue, null>;
  type?: StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor;
  format?: string;
  fontWeight?: "bold";
  backgroundColor?: string;
  textColor?: string;
  align?: "left" | "center" | "right";
};
type ExcelCell = CellValue | StyledCell;
type ExcelRow = ExcelCell[];

export type HistoryExportLabels = {
  dataSheet: string;
  socSheet: string;
  connectionSheet: string;
  informationSheet: string;
  timestamp: string;
  timestampMs: string;
  voltage: string;
  current: string;
  power: string;
  soc: string;
  temperature: string;
  imbalance: string;
  balancing: string;
  alarmMask: string;
  cellVoltage: string;
  cellResistance: string;
  previousSoc: string;
  connectionEvent: string;
  durationSeconds: string;
  bmsName: string;
  gattStatus: string;
  exportCreated: string;
  periodFrom: string;
  periodTo: string;
  sourceRecords: string;
  exportedPoints: string;
  aggregationInterval: string;
  lost: string;
  restored: string;
};

export type WorkbookSheet = {
  data: ExcelRow[];
  sheet: string;
  columns: Array<{ width: number }>;
};

const header = (value: string): StyledCell => ({
  value,
  fontWeight: "bold",
  backgroundColor: "#181716",
  textColor: "#FFFFFF",
  align: "center",
});

const dateCell = (timestamp: number): StyledCell => ({
  value: new Date(timestamp),
  type: Date,
  format: "yyyy-mm-dd hh:mm:ss",
});

const numberCell = (value: number | null | undefined, format: string): StyledCell | null =>
  value == null || !Number.isFinite(value) ? null : { value, type: Number, format };

function maxCellCount(history: HistoryResponse): number {
  return Math.max(
    0,
    ...history.points.map((point) => Math.max(point.cellsV?.length ?? 0, point.cellResistanceMOhm?.length ?? 0)),
    ...(history.socEvents ?? []).map((event) => event.cellsV.length),
  );
}

export function buildHistoryWorkbook(history: HistoryResponse, labels: HistoryExportLabels, exportedAt = Date.now()): WorkbookSheet[] {
  const cellCount = maxCellCount(history);
  const commonHeaders = [labels.timestamp, labels.timestampMs, `${labels.voltage} (V)`, `${labels.current} (A)`, `${labels.power} (W)`, `${labels.soc} (%)`, `${labels.temperature} (°C)`, `${labels.imbalance} (mV)`, labels.balancing, labels.alarmMask];
  const cellVoltageHeaders = Array.from({ length: cellCount }, (_, index) => `${labels.cellVoltage} C${index + 1} (V)`);
  const resistanceHeaders = Array.from({ length: cellCount }, (_, index) => `${labels.cellResistance} C${index + 1} (mΩ)`);
  const data: ExcelRow[] = [
    [...commonHeaders, ...cellVoltageHeaders, ...resistanceHeaders].map(header),
    ...history.points.map((point): ExcelRow => [
      dateCell(point.timestamp), point.timestamp,
      numberCell(point.packVoltageV, "0.00"), numberCell(point.currentA, "0.00"), numberCell(point.powerW, "0"),
      numberCell(point.socPercent, "0.0"), numberCell(point.temperatureC, "0.0"), numberCell(point.deltaMv, "0"),
      point.balancing, point.alarmMask,
      ...Array.from({ length: cellCount }, (_, index) => numberCell(point.cellsV?.[index], "0.000")),
      ...Array.from({ length: cellCount }, (_, index) => numberCell(point.cellResistanceMOhm?.[index], "0.00")),
    ]),
  ];

  const socData: ExcelRow[] = [[
    labels.timestamp, labels.timestampMs, labels.previousSoc, labels.soc, `${labels.voltage} (V)`, `${labels.current} (A)`, `${labels.power} (W)`, `${labels.temperature} (°C)`, `${labels.imbalance} (mV)`, labels.alarmMask,
    ...cellVoltageHeaders,
  ].map(header), ...(history.socEvents ?? []).map((event): ExcelRow => [
    dateCell(event.timestamp), event.timestamp, event.previousSocPercent, event.socPercent,
    numberCell(event.packVoltageV, "0.00"), numberCell(event.currentA, "0.00"), numberCell(event.powerW, "0"),
    numberCell(event.temperatureC, "0.0"), numberCell(event.deltaMv, "0"), event.alarmMask,
    ...Array.from({ length: cellCount }, (_, index) => numberCell(event.cellsV[index], "0.000")),
  ])];

  const connectionData: ExcelRow[] = [[labels.timestamp, labels.timestampMs, labels.connectionEvent, labels.durationSeconds, labels.bmsName, labels.gattStatus].map(header),
    ...(history.connectionEvents ?? []).map((event): ExcelRow => [
      dateCell(event.timestamp), event.timestamp, event.type === "LOST" ? labels.lost : labels.restored,
      numberCell(event.durationMs == null ? null : event.durationMs / 1000, "0.0"), event.bmsName || "JK BMS", event.gattStatus ?? null,
    ])];

  const informationData: ExcelRow[] = [
    [header(labels.informationSheet), header("")],
    [labels.exportCreated, dateCell(exportedAt)],
    [labels.periodFrom, dateCell(history.from)],
    [labels.periodTo, dateCell(history.to)],
    [labels.sourceRecords, history.sourceCount],
    [labels.exportedPoints, history.pointCount],
    [labels.aggregationInterval, numberCell(history.bucketMs / 1000, "0.0")],
  ];

  const dataColumns = [{ width: 21 }, { width: 16 }, ...Array.from({ length: 8 }, () => ({ width: 16 })), ...Array.from({ length: cellCount * 2 }, () => ({ width: 18 }))];
  return [
    { data, sheet: labels.dataSheet, columns: dataColumns },
    { data: socData, sheet: labels.socSheet, columns: [{ width: 21 }, { width: 16 }, ...Array.from({ length: 8 + cellCount }, () => ({ width: 18 }))] },
    { data: connectionData, sheet: labels.connectionSheet, columns: [{ width: 21 }, { width: 16 }, { width: 24 }, { width: 20 }, { width: 24 }, { width: 14 }] },
    { data: informationData, sheet: labels.informationSheet, columns: [{ width: 28 }, { width: 24 }] },
  ];
}

export async function exportHistoryWorkbook(history: HistoryResponse, labels: HistoryExportLabels): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const sheets = buildHistoryWorkbook(history, labels);
  const date = new Date().toISOString().slice(0, 10);
  await writeExcelFile(sheets).toFile(`bms-history-${date}.xlsx`);
}
