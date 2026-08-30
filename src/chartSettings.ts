export type ThresholdMetric =
  | "cellVoltageV"
  | "packVoltageV"
  | "currentA"
  | "powerW"
  | "socPercent"
  | "temperatureC"
  | "deltaMv"
  | "cellResistanceMOhm";

export type ThresholdLimits = { low: number | null; high: number | null };
export type ThresholdColors = { low: string; high: string };

export const THRESHOLD_BOUNDS: Record<ThresholdMetric, readonly [number, number]> = {
  cellVoltageV: [0.5, 6], packVoltageV: [1, 1000], currentA: [-2000, 2000], powerW: [-100000, 100000],
  socPercent: [0, 100], temperatureC: [-80, 150], deltaMv: [0, 1000], cellResistanceMOhm: [0, 1000],
};

export type ThresholdValidationIssue = "number" | "range" | "order" | null;

export function thresholdValidationIssue(metric: ThresholdMetric, limits: ThresholdLimits): ThresholdValidationIssue {
  const [minimum, maximum] = THRESHOLD_BOUNDS[metric];
  const values = [limits.low, limits.high].filter((value): value is number => value != null);
  if (values.some((value) => !Number.isFinite(value))) return "number";
  if (values.some((value) => value < minimum || value > maximum)) return "range";
  if (limits.low != null && limits.high != null && limits.low >= limits.high) return "order";
  return null;
}

export function validThresholdLimits(metric: ThresholdMetric, limits: ThresholdLimits): boolean {
  return thresholdValidationIssue(metric, limits) == null;
}

export type BmsThresholdId =
  | "cell-uvp" | "cell-uvp-recovery" | "cell-ovp" | "cell-ovp-recovery"
  | "soc-0" | "soc-100" | "balance-start" | "system-power-off"
  | "balance-trigger" | "charge-temp" | "charge-temp-recovery"
  | "discharge-temp" | "discharge-temp-recovery"
  | "charge-current" | "discharge-current";

export type BmsThresholdDisplay = { visible: boolean; color: string };

export type IndividualChartMetric = "packVoltageV" | "currentA" | "chargeCurrentA" | "dischargeCurrentA" | "powerW" | "socPercent" | "temperatureC" | "deltaMv";

export type HistorySectionVisibility = {
  liveCells: boolean;
  compositeChart: boolean;
  cellVoltageChart: boolean;
  cellEnergyEstimate: boolean;
  cellResistanceChart: boolean;
  correlationChart: boolean;
  balanceDiagnostics: boolean;
};

export type ChartDisplaySettings = {
  showBmsThresholds: boolean;
  bmsThresholdDisplay: Record<BmsThresholdId, BmsThresholdDisplay>;
  showCustomThresholds: boolean;
  customThresholdVisibility: Record<ThresholdMetric, boolean>;
  showThresholdLabels: boolean;
  showSocEvents: boolean;
  showCurveShadows: boolean;
  symmetricBidirectionalScale: boolean;
  historySections: HistorySectionVisibility;
  individualChartVisibility: Record<IndividualChartMetric, boolean>;
  customThresholds: Record<ThresholdMetric, ThresholdLimits>;
  customThresholdColors: Record<ThresholdMetric, ThresholdColors>;
};

export const CHART_SETTINGS_STORAGE_KEY = "bms-chart-display-settings-v1";

export const DEFAULT_CHART_SETTINGS: ChartDisplaySettings = {
  showBmsThresholds: true,
  bmsThresholdDisplay: {
    "cell-uvp": { visible: true, color: "#d80712" }, "cell-uvp-recovery": { visible: false, color: "#d47d00" },
    "cell-ovp": { visible: true, color: "#d80712" }, "cell-ovp-recovery": { visible: true, color: "#d47d00" },
    "soc-0": { visible: true, color: "#2267c7" }, "soc-100": { visible: true, color: "#2267c7" },
    "balance-start": { visible: true, color: "#0e8e55" }, "system-power-off": { visible: true, color: "#721ca8" },
    "balance-trigger": { visible: true, color: "#0e8e55" },
    "charge-temp": { visible: true, color: "#d80712" }, "charge-temp-recovery": { visible: true, color: "#d47d00" },
    "discharge-temp": { visible: true, color: "#d80712" }, "discharge-temp-recovery": { visible: true, color: "#d47d00" },
    "charge-current": { visible: true, color: "#0e8e55" }, "discharge-current": { visible: true, color: "#d80712" },
  },
  showCustomThresholds: false,
  customThresholdVisibility: {
    cellVoltageV: false,
    packVoltageV: false,
    currentA: false,
    powerW: false,
    socPercent: false,
    temperatureC: false,
    deltaMv: false,
    cellResistanceMOhm: false,
  },
  showThresholdLabels: true,
  showSocEvents: true,
  showCurveShadows: true,
  symmetricBidirectionalScale: true,
  historySections: {
    liveCells: true,
    compositeChart: true,
    cellVoltageChart: true,
    cellEnergyEstimate: true,
    cellResistanceChart: true,
    correlationChart: true,
    balanceDiagnostics: true,
  },
  individualChartVisibility: {
    packVoltageV: true,
    currentA: true,
    chargeCurrentA: true,
    dischargeCurrentA: true,
    powerW: true,
    socPercent: true,
    temperatureC: true,
    deltaMv: true,
  },
  customThresholds: {
    cellVoltageV: { low: null, high: null },
    packVoltageV: { low: null, high: null },
    currentA: { low: null, high: null },
    powerW: { low: null, high: null },
    socPercent: { low: null, high: null },
    temperatureC: { low: null, high: null },
    deltaMv: { low: null, high: null },
    cellResistanceMOhm: { low: null, high: null },
  },
  customThresholdColors: {
    cellVoltageV: { low: "#2267c7", high: "#7a42c8" }, packVoltageV: { low: "#2267c7", high: "#7a42c8" },
    currentA: { low: "#2267c7", high: "#7a42c8" }, powerW: { low: "#2267c7", high: "#7a42c8" },
    socPercent: { low: "#2267c7", high: "#7a42c8" }, temperatureC: { low: "#2267c7", high: "#7a42c8" },
    deltaMv: { low: "#2267c7", high: "#7a42c8" }, cellResistanceMOhm: { low: "#2267c7", high: "#7a42c8" },
  },
};

const metrics = Object.keys(DEFAULT_CHART_SETTINGS.customThresholds) as ThresholdMetric[];
const individualMetrics = Object.keys(DEFAULT_CHART_SETTINGS.individualChartVisibility) as IndividualChartMetric[];
const bmsThresholdIds = Object.keys(DEFAULT_CHART_SETTINGS.bmsThresholdDisplay) as BmsThresholdId[];

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeChartSettings(value: unknown): ChartDisplaySettings {
  const candidate = value && typeof value === "object" ? value as Partial<ChartDisplaySettings> : {};
  const storedThresholds = candidate.customThresholds && typeof candidate.customThresholds === "object"
    ? candidate.customThresholds as Partial<Record<ThresholdMetric, Partial<ThresholdLimits>>>
    : {};
  const customThresholds = Object.fromEntries(metrics.map((metric) => {
    const limits = storedThresholds[metric];
    const candidateLimits = { low: finiteOrNull(limits?.low), high: finiteOrNull(limits?.high) };
    return [metric, validThresholdLimits(metric, candidateLimits) ? candidateLimits : { low: null, high: null }];
  })) as Record<ThresholdMetric, ThresholdLimits>;
  const storedColors = candidate.customThresholdColors && typeof candidate.customThresholdColors === "object"
    ? candidate.customThresholdColors as Partial<Record<ThresholdMetric, Partial<ThresholdColors>>> : {};
  const customThresholdColors = Object.fromEntries(metrics.map((metric) => {
    const fallback = DEFAULT_CHART_SETTINGS.customThresholdColors[metric];
    const stored = storedColors[metric];
    return [metric, { low: typeof stored?.low === "string" ? stored.low : fallback.low, high: typeof stored?.high === "string" ? stored.high : fallback.high }];
  })) as Record<ThresholdMetric, ThresholdColors>;
  const storedVisibility = candidate.customThresholdVisibility && typeof candidate.customThresholdVisibility === "object"
    ? candidate.customThresholdVisibility as Partial<Record<ThresholdMetric, boolean>>
    : {};
  const customThresholdVisibility = Object.fromEntries(metrics.map((metric) => [metric, storedVisibility[metric] === true])) as Record<ThresholdMetric, boolean>;
  const storedBmsDisplay = candidate.bmsThresholdDisplay && typeof candidate.bmsThresholdDisplay === "object"
    ? candidate.bmsThresholdDisplay as Partial<Record<BmsThresholdId, Partial<BmsThresholdDisplay>>>
    : {};
  const bmsThresholdDisplay = Object.fromEntries(bmsThresholdIds.map((id) => {
    const fallback = DEFAULT_CHART_SETTINGS.bmsThresholdDisplay[id];
    const stored = storedBmsDisplay[id];
    return [id, { visible: stored?.visible ?? fallback.visible, color: typeof stored?.color === "string" ? stored.color : fallback.color }];
  })) as Record<BmsThresholdId, BmsThresholdDisplay>;
  const storedSections = candidate.historySections && typeof candidate.historySections === "object"
    ? candidate.historySections as Partial<HistorySectionVisibility> & { individualCharts?: boolean }
    : {};
  const historySections = Object.fromEntries(
    (Object.keys(DEFAULT_CHART_SETTINGS.historySections) as Array<keyof HistorySectionVisibility>)
      .map((section) => [section, storedSections[section] !== false]),
  ) as HistorySectionVisibility;
  const storedIndividualVisibility = candidate.individualChartVisibility && typeof candidate.individualChartVisibility === "object"
    ? candidate.individualChartVisibility as Partial<Record<IndividualChartMetric, boolean>>
    : {};
  const oldIndividualChartsEnabled = storedSections.individualCharts !== false;
  const individualChartVisibility = Object.fromEntries(
    individualMetrics.map((metric) => [metric, storedIndividualVisibility[metric] ?? oldIndividualChartsEnabled]),
  ) as Record<IndividualChartMetric, boolean>;
  return {
    showBmsThresholds: candidate.showBmsThresholds !== false,
    bmsThresholdDisplay,
    showCustomThresholds: candidate.showCustomThresholds === true,
    customThresholdVisibility,
    showThresholdLabels: candidate.showThresholdLabels !== false,
    showSocEvents: candidate.showSocEvents !== false,
    showCurveShadows: candidate.showCurveShadows !== false,
    symmetricBidirectionalScale: candidate.symmetricBidirectionalScale !== false,
    historySections,
    individualChartVisibility,
    customThresholds,
    customThresholdColors,
  };
}

export function loadChartSettings(storage: Pick<Storage, "getItem"> = localStorage): ChartDisplaySettings {
  try {
    const raw = storage.getItem(CHART_SETTINGS_STORAGE_KEY);
    return normalizeChartSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeChartSettings(null);
  }
}

export function saveChartSettings(settings: ChartDisplaySettings, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(CHART_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
