export const GATEWAY_COMPATIBILITY_ID = 2;

export type GatewayCompatibilityIssue = {
  kind: "phone-too-old" | "phone-too-new" | "rejected";
  expected: number;
  received: number | null;
  gatewayVersion?: string;
};

export function addClientCompatibility(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}clientApi=${GATEWAY_COMPATIBILITY_ID}`;
}

export function gatewayCompatibilityIssue(payload: unknown): GatewayCompatibilityIssue | null {
  if (!payload || typeof payload !== "object") {
    return { kind: "phone-too-old", expected: GATEWAY_COMPATIBILITY_ID, received: null };
  }
  const value = payload as { compatibilityId?: unknown; apiVersion?: unknown; gatewayVersion?: unknown };
  const raw = value.compatibilityId ?? value.apiVersion;
  const received = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  if (received === GATEWAY_COMPATIBILITY_ID) return null;
  return {
    kind: received != null && received > GATEWAY_COMPATIBILITY_ID ? "phone-too-new" : "phone-too-old",
    expected: GATEWAY_COMPATIBILITY_ID,
    received,
    gatewayVersion: typeof value.gatewayVersion === "string" ? value.gatewayVersion : undefined,
  };
}
