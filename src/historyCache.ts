import type { ChargeSessionRecord, ConnectionHistoryEvent, HistoryPoint, HistoryResponse, SocBoundaryEvent } from "./types";

const DATABASE_NAME = "bms-data-platform-history";
const DATABASE_VERSION = 1;

type Coverage = { from: number; to: number };
export type HistoryCacheMeta = {
  deviceKey: string;
  deviceName: string;
  gatewayUrl: string;
  coverage: Coverage[];
  phoneOldestTimestamp: number | null;
  phoneNewestTimestamp: number | null;
  lastSyncAt: number;
};

type PointRow = HistoryPoint & { id: string; deviceKey: string };
type SocRow = SocBoundaryEvent & { id: string; deviceKey: string };
type ConnectionRow = ConnectionHistoryEvent & { id: string; deviceKey: string };
type ChargeRow = ChargeSessionRecord & { id: string; sourceId: number | string; deviceKey: string };

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
});

let databasePromise: Promise<IDBDatabase> | null = null;
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const points = database.createObjectStore("points", { keyPath: "id" });
      points.createIndex("deviceTimestamp", ["deviceKey", "timestamp"], { unique: true });
      const soc = database.createObjectStore("socEvents", { keyPath: "id" });
      soc.createIndex("deviceTimestamp", ["deviceKey", "timestamp"], { unique: false });
      const connections = database.createObjectStore("connectionEvents", { keyPath: "id" });
      connections.createIndex("deviceTimestamp", ["deviceKey", "timestamp"], { unique: false });
      const sessions = database.createObjectStore("chargeSessions", { keyPath: "id" });
      sessions.createIndex("deviceTimestamp", ["deviceKey", "startedAt"], { unique: false });
      database.createObjectStore("meta", { keyPath: "deviceKey" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { databasePromise = null; reject(request.error ?? new Error("Unable to open history database")); };
  });
  return databasePromise;
}

export function mergeCoverage(input: Coverage[]): Coverage[] {
  const sorted = input.filter((item) => Number.isFinite(item.from) && Number.isFinite(item.to) && item.to >= item.from)
    .sort((a, b) => a.from - b.from);
  const merged: Coverage[] = [];
  for (const item of sorted) {
    const previous = merged.at(-1);
    if (previous && item.from <= previous.to + 1) previous.to = Math.max(previous.to, item.to);
    else merged.push({ ...item });
  }
  return merged;
}

export function missingCoverage(from: number, to: number, coverage: Coverage[]): Coverage[] {
  if (to < from) return [];
  const result: Coverage[] = [];
  let cursor = from;
  for (const interval of mergeCoverage(coverage)) {
    if (interval.to < cursor) continue;
    if (interval.from > to) break;
    if (interval.from > cursor) result.push({ from: cursor, to: Math.min(to, interval.from - 1) });
    cursor = Math.max(cursor, interval.to + 1);
    if (cursor > to) break;
  }
  if (cursor <= to) result.push({ from: cursor, to });
  return result;
}

export async function loadCacheMeta(deviceKey: string): Promise<HistoryCacheMeta | null> {
  const database = await openDatabase();
  const transaction = database.transaction("meta", "readonly");
  return (await requestResult(transaction.objectStore("meta").get(deviceKey)) as HistoryCacheMeta | undefined) ?? null;
}

export async function saveCacheMeta(meta: HistoryCacheMeta): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("meta", "readwrite");
  transaction.objectStore("meta").put({ ...meta, coverage: mergeCoverage(meta.coverage) });
  await transactionDone(transaction);
}

export async function storeHistoryPoints(deviceKey: string, points: HistoryPoint[]): Promise<void> {
  if (points.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction("points", "readwrite");
  const store = transaction.objectStore("points");
  for (const point of points) store.put({ ...point, id: `${deviceKey}|${point.timestamp}`, deviceKey } satisfies PointRow);
  await transactionDone(transaction);
}

export async function storeHistorySideData(deviceKey: string, history: HistoryResponse): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(["socEvents", "connectionEvents", "chargeSessions"], "readwrite");
  const socStore = transaction.objectStore("socEvents");
  for (const event of history.socEvents ?? []) socStore.put({ ...event, id: `${deviceKey}|${event.timestamp}|${event.socPercent}`, deviceKey } satisfies SocRow);
  const connectionStore = transaction.objectStore("connectionEvents");
  for (const event of history.connectionEvents ?? []) connectionStore.put({ ...event, id: `${deviceKey}|${event.timestamp}|${event.type}`, deviceKey } satisfies ConnectionRow);
  const sessionStore = transaction.objectStore("chargeSessions");
  for (const session of history.chargeSessions ?? []) sessionStore.put({ ...session, sourceId: session.id, id: `${deviceKey}|${session.id}`, deviceKey } satisfies ChargeRow);
  await transactionDone(transaction);
}

async function readRange<T>(storeName: string, indexName: string, deviceKey: string, from: number, to: number): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const index = transaction.objectStore(storeName).index(indexName);
  return await requestResult(index.getAll(IDBKeyRange.bound([deviceKey, from], [deviceKey, to]))) as T[];
}

export async function readCachedHistory(deviceKey: string, from: number, to: number, maxPoints: number): Promise<HistoryResponse> {
  const database = await openDatabase();
  const transaction = database.transaction("points", "readonly");
  const index = transaction.objectStore("points").index("deviceTimestamp");
  const range = IDBKeyRange.bound([deviceKey, from], [deviceKey, to]);
  const sourceCount = await requestResult(index.count(range));
  const safeMax = Math.max(50, Math.min(5_000, Math.round(maxPoints)));
  const bucketMs = Math.max(1, Math.ceil(Math.max(1, to - from) / safeMax));
  const buckets = new Map<number, HistoryPoint>();
  await new Promise<void>((resolve, reject) => {
    const cursorRequest = index.openCursor(range);
    cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Unable to read cached history"));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) { resolve(); return; }
      const row = cursor.value as PointRow;
      const { id: _id, deviceKey: _deviceKey, ...point } = row;
      buckets.set(Math.floor((point.timestamp - from) / bucketMs), point);
      cursor.continue();
    };
  });
  const points = [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-safeMax);
  const [socRows, connectionRows, chargeRows] = await Promise.all([
    readRange<SocRow>("socEvents", "deviceTimestamp", deviceKey, from, to),
    readRange<ConnectionRow>("connectionEvents", "deviceTimestamp", deviceKey, from, to),
    readRange<ChargeRow>("chargeSessions", "deviceTimestamp", deviceKey, from, to),
  ]);
  return {
    apiVersion: 1, from, to, bucketMs, sourceCount, pointCount: points.length, points,
    socEvents: socRows.map(({ id: _id, deviceKey: _deviceKey, ...event }) => event),
    connectionEvents: connectionRows.map(({ id: _id, deviceKey: _deviceKey, ...event }) => event),
    chargeSessions: chargeRows.map(({ id: _id, sourceId, deviceKey: _deviceKey, ...session }) => ({ ...session, id: sourceId })),
  };
}

/** Create a portable SQLite-compatible SQL dump of every record in the local cache. */
export async function exportHistoryDatabaseSql(): Promise<{ sql: string; recordCount: number }> {
  const database = await openDatabase();
  const stores = ["points", "socEvents", "connectionEvents", "chargeSessions", "meta"] as const;
  const rows = await Promise.all(stores.map(async (name) => {
    const transaction = database.transaction(name, "readonly");
    return [name, await requestResult(transaction.objectStore(name).getAll())] as const;
  }));
  const quote = (value: unknown): string => {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    return `'${String(typeof value === "object" ? JSON.stringify(value) : value).replaceAll("'", "''")}'`;
  };
  const columns: Record<typeof stores[number], string[]> = {
    points: ["id", "device_key", "timestamp", "pack_voltage_v", "current_a", "soc_percent", "power_w", "temperature_c", "mos_temperature_c", "delta_mv", "alarm_mask", "cells_v"],
    socEvents: ["id", "device_key", "timestamp", "soc_percent", "previous_soc_percent", "direction", "pack_voltage_v", "current_a", "delta_mv", "cells_v"],
    connectionEvents: ["id", "device_key", "timestamp", "type", "duration_ms", "bms_name", "gatt_status"],
    chargeSessions: ["id", "device_key", "source_id", "started_at", "ended_at", "delivered_ah", "max_current_a", "bms_name"],
    meta: ["device_key", "device_name", "gateway_url", "coverage", "phone_oldest_timestamp", "phone_newest_timestamp", "last_sync_at"],
  };
  const valueFor = (store: typeof stores[number], row: Record<string, unknown>, column: string): unknown => {
    const map: Record<string, string> = { device_key: "deviceKey", source_id: "sourceId", pack_voltage_v: "packVoltageV", current_a: "currentA", soc_percent: "socPercent", power_w: "powerW", temperature_c: "temperatureC", mos_temperature_c: "mosTemperatureC", delta_mv: "deltaMv", alarm_mask: "alarmMask", cells_v: "cellsV", previous_soc_percent: "previousSocPercent", duration_ms: "durationMs", bms_name: "bmsName", gatt_status: "gattStatus", started_at: "startedAt", ended_at: "endedAt", delivered_ah: "deliveredAh", max_current_a: "maxCurrentA", device_name: "deviceName", gateway_url: "gatewayUrl", phone_oldest_timestamp: "phoneOldestTimestamp", phone_newest_timestamp: "phoneNewestTimestamp", last_sync_at: "lastSyncAt" };
    return row[column] ?? row[map[column] ?? column];
  };
  const tableNames: Record<typeof stores[number], string> = { points: "history_points", socEvents: "soc_events", connectionEvents: "connection_events", chargeSessions: "charge_sessions", meta: "cache_meta" };
  const schema = [
    "CREATE TABLE IF NOT EXISTS history_points (id TEXT PRIMARY KEY, device_key TEXT NOT NULL, timestamp INTEGER NOT NULL, pack_voltage_v REAL, current_a REAL, soc_percent REAL, power_w REAL, temperature_c REAL, mos_temperature_c REAL, delta_mv REAL, alarm_mask INTEGER, cells_v TEXT);",
    "CREATE TABLE IF NOT EXISTS soc_events (id TEXT PRIMARY KEY, device_key TEXT NOT NULL, timestamp INTEGER NOT NULL, soc_percent REAL, previous_soc_percent REAL, direction TEXT, pack_voltage_v REAL, current_a REAL, delta_mv REAL, cells_v TEXT);",
    "CREATE TABLE IF NOT EXISTS connection_events (id TEXT PRIMARY KEY, device_key TEXT NOT NULL, timestamp INTEGER NOT NULL, type TEXT, duration_ms INTEGER, bms_name TEXT, gatt_status INTEGER);",
    "CREATE TABLE IF NOT EXISTS charge_sessions (id TEXT PRIMARY KEY, device_key TEXT NOT NULL, source_id TEXT, started_at INTEGER, ended_at INTEGER, delivered_ah REAL, max_current_a REAL, bms_name TEXT);",
    "CREATE TABLE IF NOT EXISTS cache_meta (device_key TEXT PRIMARY KEY, device_name TEXT, gateway_url TEXT, coverage TEXT, phone_oldest_timestamp INTEGER, phone_newest_timestamp INTEGER, last_sync_at INTEGER);",
  ];
  const statements = [...schema, "BEGIN TRANSACTION;"];
  let recordCount = 0;
  for (const [store, values] of rows) {
    const table = tableNames[store];
    const cols = columns[store];
    for (const value of values as Record<string, unknown>[]) {
      statements.push(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((column) => quote(valueFor(store, value, column))).join(", ")});`);
      recordCount += 1;
    }
  }
  statements.push("COMMIT;");
  return { sql: `-- BMS Data Platform local history export\n-- Exported: ${new Date().toISOString()}\n\n${statements.join("\n")}\n`, recordCount };
}
