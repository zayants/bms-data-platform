import type { BmsProtectionSettings } from "./types";

export type VoltageAxisRange = { minimum: number; maximum: number };

type CellVoltageLimits = { minimum: number; maximum: number };

const CHEMISTRY_LIMITS: Record<"lfp" | "li-ion" | "lto", CellVoltageLimits> = {
  lfp: { minimum: 2.50, maximum: 3.65 },
  "li-ion": { minimum: 2.50, maximum: 4.20 },
  lto: { minimum: 1.50, maximum: 2.80 },
};

function chemistryLimits(chemistry?: string | null): CellVoltageLimits | null {
  const normalized = (chemistry ?? "").toLowerCase().replaceAll("_", "-");
  if (normalized.includes("lifepo") || normalized.includes("lfp")) return CHEMISTRY_LIMITS.lfp;
  if (normalized.includes("nmc") || normalized.includes("li-ion") || normalized.includes("liion")) return CHEMISTRY_LIMITS["li-ion"];
  if (normalized.includes("lto")) return CHEMISTRY_LIMITS.lto;
  return null;
}

function protectionLimits(protection?: BmsProtectionSettings | null): CellVoltageLimits | null {
  const minimum = protection?.cellUnderVoltageProtectionV;
  const maximum = protection?.cellOverVoltageProtectionV;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum! - minimum! < 0.2) return null;
  return { minimum: minimum!, maximum: maximum! };
}

function dataRange(values: number[]): CellVoltageLimits | null {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return { minimum: Math.min(...finite), maximum: Math.max(...finite) };
}

function expandRange(base: CellVoltageLimits | null, values: number[], relativeMargin = 0.03): VoltageAxisRange {
  const actual = dataRange(values);
  if (!base && !actual) return { minimum: 0, maximum: 1 };
  const source = base ?? actual!;
  const sourceSpan = Math.max(0.01, source.maximum - source.minimum);
  const margin = sourceSpan * relativeMargin;
  let minimum = source.minimum - margin;
  let maximum = source.maximum + margin;
  if (actual) {
    if (actual.minimum < minimum) minimum = actual.minimum - margin;
    if (actual.maximum > maximum) maximum = actual.maximum + margin;
  }
  return { minimum, maximum };
}

export function cellVoltageAxisRange(
  chemistry: string | null | undefined,
  protection: BmsProtectionSettings | null | undefined,
  values: number[],
): VoltageAxisRange {
  const actual = dataRange(values);
  const chemistryRange = chemistryLimits(chemistry) ?? protectionLimits(protection);

  // Cell traces normally differ by only a few millivolts. Using the complete
  // chemistry envelope (for example 2.5–3.65 V for LFP) hides that useful
  // detail. Prefer the visible data, while keeping a chemistry-relative
  // minimum span so that a nearly flat trace still has a readable axis.
  if (actual) {
    const chemistrySpan = chemistryRange ? chemistryRange.maximum - chemistryRange.minimum : 1;
    const actualSpan = actual.maximum - actual.minimum;
    const minimumSpan = Math.max(0.02, chemistrySpan * 0.025);
    const span = Math.max(actualSpan, minimumSpan);
    const margin = Math.max(0.008, span * 0.16);
    const center = (actual.minimum + actual.maximum) / 2;
    return {
      minimum: center - span / 2 - margin,
      maximum: center + span / 2 + margin,
    };
  }

  return expandRange(chemistryRange, []);
}

export function packVoltageAxisRange(
  chemistry: string | null | undefined,
  protection: BmsProtectionSettings | null | undefined,
  cellCount: number,
  values: number[],
): VoltageAxisRange {
  const cellLimits = chemistryLimits(chemistry) ?? protectionLimits(protection);
  const packLimits = cellLimits && cellCount > 0
    ? { minimum: cellLimits.minimum * cellCount, maximum: cellLimits.maximum * cellCount }
    : null;
  return expandRange(packLimits, values);
}
