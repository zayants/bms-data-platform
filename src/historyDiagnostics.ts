import type { HistoryPoint, SocBoundaryEvent } from "./types";

export function inferSocBoundaryEvents(points: HistoryPoint[]): SocBoundaryEvent[] {
  const events: SocBoundaryEvent[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const reachedBoundary =
      (current.socPercent === 0 && previous.socPercent > 0) ||
      (current.socPercent === 100 && previous.socPercent < 100);
    if (!reachedBoundary) continue;
    events.push({
      timestamp: current.timestamp,
      previousSocPercent: previous.socPercent,
      socPercent: current.socPercent,
      packVoltageV: current.packVoltageV,
      currentA: current.currentA,
      powerW: current.powerW,
      temperatureC: current.temperatureC,
      deltaMv: current.deltaMv,
      alarmMask: current.alarmMask,
      cellsV: current.cellsV ?? [],
    });
  }
  return events;
}

export function calculateSocEventCellStats(event: SocBoundaryEvent) {
  const cells = event.cellsV ?? [];
  if (!cells.length) return { minimum: null, maximum: null, minimumIndex: -1, maximumIndex: -1 };
  const minimum = Math.min(...cells);
  const maximum = Math.max(...cells);
  return {
    minimum,
    maximum,
    minimumIndex: cells.indexOf(minimum),
    maximumIndex: cells.indexOf(maximum),
  };
}
