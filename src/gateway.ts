import type { CellStats, GatewaySnapshot, HistoryPoint, HistoryResponse } from "./types";

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
  return `${normalizeGatewayUrl(baseUrl)}/api/v1/history?${query}`;
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
  const response = await fetch(buildHistoryUrl(baseUrl, from, to, maxPoints), { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json() as HistoryResponse;
}

export class GatewayClient {
  private source: EventSource | null = null;
  private pollTimer: number | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly onSnapshot: (snapshot: GatewaySnapshot) => void,
    private readonly onConnectionChange: (online: boolean) => void,
  ) {}

  start(): void {
    this.stop();
    this.fetchSnapshot();
    this.pollTimer = window.setInterval(() => this.fetchSnapshot(), 3000);
    this.source = new EventSource(`${this.baseUrl}/api/v1/events`);
    this.source.addEventListener("snapshot", (event) => {
      try {
        this.onSnapshot(JSON.parse((event as MessageEvent).data) as GatewaySnapshot);
        this.onConnectionChange(true);
      } catch {
        this.onConnectionChange(false);
      }
    });
    this.source.onerror = () => this.onConnectionChange(false);
    this.source.onopen = () => this.onConnectionChange(true);
  }

  stop(): void {
    this.source?.close();
    this.source = null;
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async fetchSnapshot(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/snapshot`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.onSnapshot(await response.json() as GatewaySnapshot);
      this.onConnectionChange(true);
    } catch {
      this.onConnectionChange(false);
    }
  }
}
