import type { CellStats, GatewaySnapshot, HistoryPoint, HistoryResponse, PulseResistanceHistoryResponse, PulseResistanceTestStatus } from "./types";
import { fetchSynchronizedGatewayHistory } from "./historySync";
import { addClientCompatibility, GATEWAY_COMPATIBILITY_ID, gatewayCompatibilityIssue, type GatewayCompatibilityIssue } from "./apiCompatibility";

export function normalizeGatewayUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function calculateCellStats(cells: number[] = []): CellStats {
  if (!cells.length) {
    return { min: null, max: null, average: null, deltaMv: null, minIndex: -1, maxIndex: -1 };
  }
  let min = cells[0];
  let max = cells[0];
  let minIndex = 0;
  let maxIndex = 0;
  cells.forEach((value, index) => {
    if (value < min) { min = value; minIndex = index; }
    if (value > max) { max = value; maxIndex = index; }
  });
  return {
    min,
    max,
    average: cells.reduce((sum, value) => sum + value, 0) / cells.length,
    deltaMv: Math.round((max - min) * 1000),
    minIndex,
    maxIndex,
  };
}

export function buildHistoryUrl(baseUrl: string, from: number, to: number, maxPoints = 1200): string {
  const query = new URLSearchParams({
    from: Math.round(from).toString(),
    to: Math.round(to).toString(),
    maxPoints: Math.max(50, Math.min(5000, Math.round(maxPoints))).toString(),
  });
  return addClientCompatibility(`${normalizeGatewayUrl(baseUrl)}/api/v1/history?${query}`);
}

export type BatteryFlowMode = "charging" | "discharging";

export function isHistoryPointInMode(
  point: HistoryPoint,
  mode: BatteryFlowMode,
  deadbandA = 0.1,
): boolean {
  return mode === "charging" ? point.currentA > deadbandA : point.currentA < -deadbandA;
}

export function currentPowerCorrelation(points: HistoryPoint[]): number | null {
  if (points.length < 2) return null;
  const currentAverage = points.reduce((sum, point) => sum + point.currentA, 0) / points.length;
  const powerAverage = points.reduce((sum, point) => sum + point.powerW, 0) / points.length;
  let covariance = 0;
  let currentVariance = 0;
  let powerVariance = 0;
  points.forEach((point) => {
    const currentOffset = point.currentA - currentAverage;
    const powerOffset = point.powerW - powerAverage;
    covariance += currentOffset * powerOffset;
    currentVariance += currentOffset ** 2;
    powerVariance += powerOffset ** 2;
  });
  const denominator = Math.sqrt(currentVariance * powerVariance);
  return denominator === 0 ? null : covariance / denominator;
}

export async function fetchGatewayHistory(
  baseUrl: string,
  from: number,
  to: number,
  maxPoints = 1200,
): Promise<HistoryResponse> {
  return fetchSynchronizedGatewayHistory(baseUrl, from, to, maxPoints);
}

export async function fetchPulseResistanceStatus(
  baseUrl: string,
  options: { targetSoc: number; socTolerance: number; minimumCurrent: number } = { targetSoc: 50, socTolerance: 3, minimumCurrent: 3 },
): Promise<PulseResistanceTestStatus> {
  const query = new URLSearchParams({ targetSoc: String(Math.round(options.targetSoc)), socTolerance: String(Math.round(options.socTolerance)), minimumCurrent: String(options.minimumCurrent) });
  const response = await fetch(addClientCompatibility(`${normalizeGatewayUrl(baseUrl)}/api/v1/diagnostics/pulse-resistance?${query}`), { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<PulseResistanceTestStatus>;
}

export async function fetchPulseResistanceHistory(baseUrl: string, limit = 200): Promise<PulseResistanceHistoryResponse> {
  const query = new URLSearchParams({ limit: String(Math.max(1, Math.min(500, Math.round(limit)))) });
  const response = await fetch(addClientCompatibility(`${normalizeGatewayUrl(baseUrl)}/api/v1/diagnostics/pulse-resistance/history?${query}`), { cache: "no-store" });
  if (!response.ok) throw new Error(`Pulse resistance history HTTP ${response.status}`);
  return response.json() as Promise<PulseResistanceHistoryResponse>;
}

export async function startPulseResistanceTest(
  baseUrl: string,
  options: { targetSoc: number; socTolerance: number; minimumCurrent: number },
): Promise<PulseResistanceTestStatus> {
  const query = new URLSearchParams({
    targetSoc: String(Math.round(options.targetSoc)),
    socTolerance: String(Math.round(options.socTolerance)),
    minimumCurrent: String(options.minimumCurrent),
  });
  const response = await fetch(addClientCompatibility(`${normalizeGatewayUrl(baseUrl)}/api/v1/diagnostics/pulse-resistance/start?${query}`), { method: "POST", cache: "no-store" });
  const body = await response.json() as PulseResistanceTestStatus;
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: body });
  return body;
}

export async function cancelPulseResistanceTest(baseUrl: string): Promise<PulseResistanceTestStatus> {
  const response = await fetch(addClientCompatibility(`${normalizeGatewayUrl(baseUrl)}/api/v1/diagnostics/pulse-resistance/cancel`), { method: "POST", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<PulseResistanceTestStatus>;
}

export class GatewayClient {
  private source: EventSource | null = null;
  private pollTimer: number | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly onSnapshot: (snapshot: GatewaySnapshot) => void,
    private readonly onConnectionChange: (online: boolean) => void,
    private readonly onCompatibilityChange: (issue: GatewayCompatibilityIssue | null) => void = () => undefined,
  ) {}

  start(): void {
    this.stop();
    this.fetchSnapshot();
    this.pollTimer = window.setInterval(() => this.fetchSnapshot(), 3000);
    this.source = new EventSource(addClientCompatibility(`${this.baseUrl}/api/v1/events`));
    this.source.addEventListener("snapshot", (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as GatewaySnapshot;
        if (!this.acceptSnapshot(snapshot)) return;
        this.onSnapshot(snapshot);
        this.onConnectionChange(true);
      } catch {
        this.onConnectionChange(false);
      }
    });
    this.source.onerror = () => this.onConnectionChange(false);
    this.source.onopen = () => undefined;
  }

  stop(): void {
    this.source?.close();
    this.source = null;
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async fetchSnapshot(): Promise<void> {
    try {
      const response = await fetch(addClientCompatibility(`${this.baseUrl}/api/v1/snapshot`), { cache: "no-store" });
      if (response.status === 426) {
        const body = await response.json().catch(() => ({})) as { requiredCompatibilityId?: number; gatewayVersion?: string };
        this.onCompatibilityChange({
          kind: "rejected",
          expected: GATEWAY_COMPATIBILITY_ID,
          received: typeof body.requiredCompatibilityId === "number" ? body.requiredCompatibilityId : null,
          gatewayVersion: body.gatewayVersion,
        });
        this.onConnectionChange(false);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const snapshot = await response.json() as GatewaySnapshot;
      if (!this.acceptSnapshot(snapshot)) return;
      this.onSnapshot(snapshot);
      this.onConnectionChange(true);
    } catch {
      this.onConnectionChange(false);
    }
  }

  private acceptSnapshot(snapshot: GatewaySnapshot): boolean {
    const issue = gatewayCompatibilityIssue(snapshot);
    this.onCompatibilityChange(issue);
    if (issue) {
      this.onConnectionChange(false);
      return false;
    }
    return true;
  }
}
