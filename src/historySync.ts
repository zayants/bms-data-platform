import { loadCacheMeta, mergeCoverage, missingCoverage, readCachedHistory, saveCacheMeta, storeHistoryPoints, storeHistorySideData, type HistoryCacheMeta } from "./historyCache";
import type { HistoryResponse, HistorySyncMetaResponse, HistorySyncPageResponse } from "./types";

export type HistorySyncState = {
  status: "idle" | "checking" | "initial" | "incremental" | "complete" | "error" | "unsupported";
  deviceKey: string;
  deviceName: string;
  downloadedRecords: number;
  phoneRecordCount: number;
  cachedFrom: number | null;
  cachedTo: number | null;
  error?: string;
};

const listeners = new Set<(state: HistorySyncState) => void>();
const activeSync = new Map<string, Promise<{ deviceKey: string; supported: boolean }>>();
let latestState: HistorySyncState = { status: "idle", deviceKey: "", deviceName: "", downloadedRecords: 0, phoneRecordCount: 0, cachedFrom: null, cachedTo: null };
const GATEWAY_DEVICE_MAP_KEY = "bms-history-gateway-device-map-v1";

function rememberedDevice(baseUrl: string): string {
  try { return JSON.parse(localStorage.getItem(GATEWAY_DEVICE_MAP_KEY) ?? "{}")[normalize(baseUrl)] ?? ""; } catch { return ""; }
}

function rememberDevice(baseUrl: string, deviceKey: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(GATEWAY_DEVICE_MAP_KEY) ?? "{}");
    map[normalize(baseUrl)] = deviceKey;
    localStorage.setItem(GATEWAY_DEVICE_MAP_KEY, JSON.stringify(map));
  } catch { /* Cache synchronization remains usable without the convenience mapping. */ }
}

export function subscribeHistorySync(listener: (state: HistorySyncState) => void): () => void {
  listeners.add(listener); listener(latestState); return () => listeners.delete(listener);
}

const publish = (patch: Partial<HistorySyncState>) => {
  latestState = { ...latestState, ...patch };
  listeners.forEach((listener) => listener(latestState));
};

const normalize = (input: string) => input.trim().replace(/\/+$/, "");
const remoteHistoryUrl = (baseUrl: string, from: number, to: number, maxPoints: number) => {
  const query = new URLSearchParams({ from: String(Math.round(from)), to: String(Math.round(to)), maxPoints: String(Math.max(50, Math.min(5_000, Math.round(maxPoints)))) });
  return `${normalize(baseUrl)}/api/v1/history?${query}`;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
  return await response.json() as T;
}

export async function fetchRemoteGatewayHistory(baseUrl: string, from: number, to: number, maxPoints: number): Promise<HistoryResponse> {
  return fetchJson<HistoryResponse>(remoteHistoryUrl(baseUrl, from, to, maxPoints));
}

const identity = (meta: HistorySyncMetaResponse, baseUrl: string) =>
  meta.deviceAddress.trim().toUpperCase() || `${normalize(baseUrl)}|${meta.deviceName.trim() || "JK-BMS"}`;

async function syncInterval(baseUrl: string, deviceKey: string, from: number, to: number, onPage: (count: number) => void): Promise<void> {
  let cursor = from - 1;
  while (cursor < to) {
    const query = new URLSearchParams({ from: String(from), to: String(to), cursor: String(cursor), limit: "5000" });
    const page = await fetchJson<HistorySyncPageResponse>(`${normalize(baseUrl)}/api/v1/history/sync?${query}`);
    await storeHistoryPoints(deviceKey, page.points);
    onPage(page.points.length);
    if (!page.hasMore) break;
    if (page.nextCursor <= cursor) throw new Error("History synchronization cursor did not advance");
    cursor = page.nextCursor;
  }
  // Events and completed charge sessions are small. The regular endpoint returns
  // them without telemetry loss, so they are cached once per completed interval.
  const sideData = await fetchRemoteGatewayHistory(baseUrl, from, to, 50);
  await storeHistorySideData(deviceKey, sideData);
}

async function performSync(baseUrl: string): Promise<{ deviceKey: string; supported: boolean }> {
  publish({ status: "checking", downloadedRecords: 0, error: undefined });
  let phone: HistorySyncMetaResponse;
  try {
    phone = await fetchJson<HistorySyncMetaResponse>(`${normalize(baseUrl)}/api/v1/history/sync-meta`);
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      publish({ status: "unsupported" });
      return { deviceKey: "", supported: false };
    }
    throw error;
  }
  const deviceKey = identity(phone, baseUrl);
  rememberDevice(baseUrl, deviceKey);
  let cache = await loadCacheMeta(deviceKey);
  const empty: HistoryCacheMeta = {
    deviceKey, deviceName: phone.deviceName, gatewayUrl: normalize(baseUrl), coverage: [],
    phoneOldestTimestamp: phone.oldestTimestamp, phoneNewestTimestamp: phone.newestTimestamp, lastSyncAt: 0,
  };
  cache ??= empty;
  latestState = { ...latestState, deviceKey, deviceName: phone.deviceName, phoneRecordCount: phone.recordCount,
    cachedFrom: cache.coverage[0]?.from ?? null, cachedTo: cache.coverage.at(-1)?.to ?? null };
  if (phone.oldestTimestamp == null || phone.newestTimestamp == null) {
    await saveCacheMeta({ ...cache, phoneOldestTimestamp: null, phoneNewestTimestamp: null, lastSyncAt: Date.now() });
    publish({ status: "complete" });
    return { deviceKey, supported: true };
  }
  const recentAndCurrent = cache.phoneNewestTimestamp === phone.newestTimestamp && Date.now() - cache.lastSyncAt < 10_000;
  if (recentAndCurrent) { publish({ status: "complete" }); return { deviceKey, supported: true }; }

  let gaps = missingCoverage(phone.oldestTimestamp, phone.newestTimestamp, cache.coverage);
  const initial = cache.coverage.length === 0;
  if (!initial && gaps.length === 0) {
    gaps = [{ from: Math.max(phone.oldestTimestamp, phone.newestTimestamp - 120_000), to: phone.newestTimestamp }];
  } else if (!initial && gaps.length > 0) {
    const last = gaps.at(-1)!;
    if (last.to === phone.newestTimestamp) last.from = Math.max(phone.oldestTimestamp, last.from - 120_000);
  }
  publish({ status: initial ? "initial" : "incremental", downloadedRecords: 0 });
  let downloaded = 0;
  for (const gap of gaps) {
    await syncInterval(baseUrl, deviceKey, gap.from, gap.to, (count) => {
      downloaded += count; publish({ downloadedRecords: downloaded });
    });
    cache = { ...cache, coverage: mergeCoverage([...cache.coverage, gap]), phoneOldestTimestamp: phone.oldestTimestamp,
      phoneNewestTimestamp: phone.newestTimestamp, lastSyncAt: Date.now(), deviceName: phone.deviceName, gatewayUrl: normalize(baseUrl) };
    await saveCacheMeta(cache);
    publish({ cachedFrom: cache.coverage[0]?.from ?? null, cachedTo: cache.coverage.at(-1)?.to ?? null });
  }
  publish({ status: "complete", downloadedRecords: downloaded });
  window.dispatchEvent(new CustomEvent("bms-history-cache-updated", { detail: { deviceKey } }));
  return { deviceKey, supported: true };
}

export function synchronizeGatewayHistory(baseUrl: string): Promise<{ deviceKey: string; supported: boolean }> {
  const key = normalize(baseUrl);
  const existing = activeSync.get(key);
  if (existing) return existing;
  const promise = performSync(key).catch((error) => {
    publish({ status: "error", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }).finally(() => activeSync.delete(key));
  activeSync.set(key, promise);
  return promise;
}

export async function fetchSynchronizedGatewayHistory(baseUrl: string, from: number, to: number, maxPoints: number): Promise<HistoryResponse> {
  try {
    const sync = await synchronizeGatewayHistory(baseUrl);
    if (sync.supported && sync.deviceKey) return await readCachedHistory(sync.deviceKey, from, to, maxPoints);
  } catch {
    const deviceKey = rememberedDevice(baseUrl);
    if (deviceKey) {
      const cached = await readCachedHistory(deviceKey, from, to, maxPoints);
      if (cached.pointCount > 0) return cached;
    }
  }
  return fetchRemoteGatewayHistory(baseUrl, from, to, maxPoints);
}
