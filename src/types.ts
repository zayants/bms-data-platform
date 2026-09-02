export type GatewaySnapshot = {
  apiVersion: number;
  serverTime: number;
  available: boolean;
  connected: boolean;
  stale: boolean;
  ageMs: number | null;
  deviceName: string;
  deviceAddress: string;
  connectionStatus: string;
  timestamp?: number;
  packVoltageV?: number;
  currentA?: number;
  powerW?: number;
  socPercent?: number;
  temperatureC?: number;
  deltaMv?: number;
  balancing?: boolean;
  chargeMosEnabled?: boolean | null;
  dischargeMosEnabled?: boolean | null;
  balancingCellIndices?: number[];
  remainingCapacityAh?: number | null;
  fullCapacityAh?: number | null;
  nominalCapacityAh?: number | null;
  chemistry?: string | null;
  estimatedRemainingMinutes?: number | null;
  chargeSessionAh?: number | null;
  chargeSessionActive?: boolean;
  alarmMask?: number;
  unknownAlarmMask?: number;
  alarms?: string[];
  cellsV?: number[];
  cellResistanceMOhm?: Array<number | null>;
  protectionSettings?: BmsProtectionSettings | null;
};

export type MonitorEvent = {
  id: string;
  timestamp: number;
  severity: "info" | "warning" | "critical";
  title: string;
  details: string;
  kind?: "restored" | "lost" | "alarmRaised" | "alarmCleared";
};

export type ConnectionState = "idle" | "connecting" | "live" | "stale" | "offline";

export type CellStats = {
  min: number | null;
  max: number | null;
  average: number | null;
  deltaMv: number | null;
  minIndex: number;
  maxIndex: number;
};

export type HistoryPoint = {
  timestamp: number;
  packVoltageV: number;
  currentA: number;
  powerW: number;
  socPercent: number;
  temperatureC: number;
  deltaMv: number;
  balancing: boolean;
  alarmMask: number;
  chargeMosEnabled?: boolean | null;
  dischargeMosEnabled?: boolean | null;
  cellsV?: number[];
  cellResistanceMOhm?: Array<number | null>;
};

export type BmsProtectionSettings = {
  cellUnderVoltageProtectionV: number;
  cellUnderVoltageRecoveryV: number;
  cellOverVoltageProtectionV: number;
  cellOverVoltageRecoveryV: number;
  soc100VoltageV: number;
  soc0VoltageV: number;
  balanceStartVoltageV: number;
  balanceTriggerDeltaV: number;
  systemPowerOffVoltageV: number;
  balancingEnabled: boolean;
  chargeOverTemperatureC: number;
  chargeOverTemperatureRecoveryC: number;
  dischargeOverTemperatureC: number;
  dischargeOverTemperatureRecoveryC: number;
  /** Positive limit used by the BMS to protect the charge path. */
  chargeOverCurrentProtectionA?: number;
  /** Positive magnitude used by the BMS to protect the discharge path. */
  dischargeOverCurrentProtectionA?: number;
};

export type SocBoundaryEvent = {
  timestamp: number;
  previousSocPercent: number;
  socPercent: number;
  packVoltageV: number;
  currentA: number;
  powerW: number;
  temperatureC: number;
  deltaMv: number;
  alarmMask: number;
  cellsV: number[];
};

export type ConnectionHistoryEvent = {
  timestamp: number;
  type: "LOST" | "RESTORED";
  durationMs: number | null;
  bmsName: string;
  gattStatus?: number | null;
};

export type HistoryResponse = {
  apiVersion: number;
  from: number;
  to: number;
  bucketMs: number;
  sourceCount: number;
  pointCount: number;
  points: HistoryPoint[];
  socEvents?: SocBoundaryEvent[];
  connectionEvents?: ConnectionHistoryEvent[];
  chargeSessions?: ChargeSessionRecord[];
};

export type HistorySyncMetaResponse = {
  apiVersion: number;
  serverTime: number;
  deviceName: string;
  deviceAddress: string;
  recordCount: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  detailOldestTimestamp: number | null;
};

export type HistorySyncPageResponse = {
  apiVersion: number;
  from: number;
  to: number;
  cursor: number;
  nextCursor: number;
  hasMore: boolean;
  points: HistoryPoint[];
};

export type ChargeSessionRecord = {
  id: number | string;
  startedAt: number;
  endedAt: number;
  deliveredAh: number;
  maxCurrentA: number;
  bmsName?: string;
};
