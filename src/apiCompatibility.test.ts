import { describe, expect, it } from "vitest";
import { addClientCompatibility, gatewayCompatibilityIssue } from "./apiCompatibility";

describe("gateway compatibility", () => {
  it("adds the required protocol to API requests", () => {
    expect(addClientCompatibility("http://phone/api/v1/snapshot")).toBe("http://phone/api/v1/snapshot?clientApi=2");
    expect(addClientCompatibility("http://phone/api/v1/history?from=1")).toBe("http://phone/api/v1/history?from=1&clientApi=2");
  });

  it("accepts only the matching protocol", () => {
    expect(gatewayCompatibilityIssue({ compatibilityId: 2, apiVersion: 2 })).toBeNull();
    expect(gatewayCompatibilityIssue({ apiVersion: 1 })?.kind).toBe("phone-too-old");
    expect(gatewayCompatibilityIssue({ compatibilityId: 3 })?.kind).toBe("phone-too-new");
    expect(gatewayCompatibilityIssue({})?.received).toBeNull();
  });
});
