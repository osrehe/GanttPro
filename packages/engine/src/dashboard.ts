import { trackingStatus, type BaselineSnapshot } from "./baseline";
import type { WorkingCalendar } from "./calendar";
import { addDays, compareIsoDates, maxIsoDate, minIsoDate, type IsoDate } from "./dates";
import {
  projectCosts,
  type CurrencyDisplay,
  type EngineAssignment,
  type EngineResource,
} from "./resources";
import type { EngineTask } from "./types";

/** Indicadores del dashboard del proyecto (UC-22). */
export interface ProjectKpis {
  /** Avance global ponderado por duración de las hojas. */
  readonly progressPct: number;
  /** Avance esperado a la fecha de estado con la misma ponderación. */
  readonly expectedProgressPct: number;
  readonly lateTaskCount: number;
  readonly lateTaskIds: string[];
  /** Hitos entre la fecha de estado y 15 días después, ordenados por fecha. */
  readonly upcomingMilestones: Array<{ taskId: string; wbsCode: string; date: IsoDate }>;
  readonly plannedCost: number | null;
  readonly consumedCost: number | null;
  readonly totalHours: number;
  readonly projectStart: IsoDate | null;
  readonly estimatedEnd: IsoDate | null;
  readonly baselineEnd: IsoDate | null;
  /** Días hábiles de atraso del fin estimado respecto a la línea base (positivo = atraso). */
  readonly endVarianceDays: number | null;
  readonly leafCount: number;
  readonly milestoneCount: number;
}

export interface KpiInput<T extends EngineTask> {
  readonly tasks: readonly T[];
  readonly assignments: readonly EngineAssignment[];
  readonly resources: readonly EngineResource[];
  readonly calendar: WorkingCalendar;
  readonly statusDate: IsoDate;
  readonly display: CurrencyDisplay;
  readonly baseline?: readonly BaselineSnapshot[] | null;
}

/** Calcula los indicadores del proyecto. */
export function projectKpis<T extends EngineTask>(input: KpiInput<T>): ProjectKpis {
  const { tasks, calendar, statusDate } = input;
  const leaves = tasks.filter((t) => !t.isSummary);
  let weight = 0;
  let weighted = 0;
  let expectedWeighted = 0;
  const lateTaskIds: string[] = [];
  for (const leaf of leaves) {
    const status = trackingStatus(leaf, statusDate, calendar);
    if (status.isLate) lateTaskIds.push(leaf.id);
    const w = leaf.durationDays;
    weight += w;
    weighted += w * leaf.progressPct;
    expectedWeighted += w * status.expectedPct;
  }
  const progressPct = weight > 0 ? Math.round(weighted / weight) : 0;
  const expectedProgressPct = weight > 0 ? Math.round(expectedWeighted / weight) : 0;

  const horizon = addDays(statusDate, 15);
  const upcomingMilestones = leaves
    .filter(
      (t) =>
        t.isMilestone &&
        compareIsoDates(t.startDate, statusDate) >= 0 &&
        compareIsoDates(t.startDate, horizon) <= 0,
    )
    .sort((a, b) => compareIsoDates(a.startDate, b.startDate))
    .map((t) => ({ taskId: t.id, wbsCode: t.wbsCode, date: t.startDate }));

  const costs = projectCosts(tasks, input.assignments, input.resources, calendar, input.display);

  let projectStart: IsoDate | null = null;
  let estimatedEnd: IsoDate | null = null;
  for (const leaf of leaves) {
    projectStart = projectStart ? minIsoDate(projectStart, leaf.startDate) : leaf.startDate;
    estimatedEnd = estimatedEnd ? maxIsoDate(estimatedEnd, leaf.endDate) : leaf.endDate;
  }
  let baselineEnd: IsoDate | null = null;
  if (input.baseline && input.baseline.length > 0) {
    for (const s of input.baseline)
      baselineEnd = baselineEnd ? maxIsoDate(baselineEnd, s.endDate) : s.endDate;
  }
  const endVarianceDays =
    estimatedEnd && baselineEnd ? calendar.workingDaysBetween(baselineEnd, estimatedEnd) : null;

  return {
    progressPct,
    expectedProgressPct,
    lateTaskCount: lateTaskIds.length,
    lateTaskIds,
    upcomingMilestones,
    plannedCost: costs.plannedCost,
    consumedCost: costs.consumedCost,
    totalHours: costs.totalHours,
    projectStart,
    estimatedEnd,
    baselineEnd,
    endVarianceDays,
    leafCount: leaves.length,
    milestoneCount: leaves.filter((t) => t.isMilestone).length,
  };
}

export interface SCurvePoint {
  readonly date: IsoDate;
  /** Avance planificado acumulado (0–100). */
  readonly planned: number;
  /** Avance real acumulado (0–100); nulo después de la fecha de estado. */
  readonly actual: number | null;
}

/**
 * Curva S (UC-22): avance planificado acumulado por semana (ponderado por duración de las hojas) y
 * avance real hasta la fecha de estado. El real se aproxima escalando la curva planificada por la
 * razón real/planificado en la fecha de estado, de modo que termine exactamente en el avance actual.
 */
export function sCurve<T extends EngineTask>(
  tasks: readonly T[],
  calendar: WorkingCalendar,
  statusDate: IsoDate,
  stepDays = 7,
): SCurvePoint[] {
  const leaves = tasks.filter((t) => !t.isSummary && t.durationDays > 0);
  if (leaves.length === 0) return [];
  let start = leaves[0]!.startDate;
  let end = leaves[0]!.endDate;
  for (const t of leaves) {
    start = minIsoDate(start, t.startDate);
    end = maxIsoDate(end, t.endDate);
  }
  const totalWeight = leaves.reduce((sum, t) => sum + t.durationDays, 0);
  const plannedAt = (date: IsoDate): number => {
    let done = 0;
    for (const t of leaves) {
      if (compareIsoDates(date, t.startDate) < 0) continue;
      const elapsed = Math.min(t.durationDays, calendar.countWorkingDays(t.startDate, date));
      done += elapsed;
    }
    return totalWeight > 0 ? (done / totalWeight) * 100 : 0;
  };
  const actualNow =
    totalWeight > 0
      ? leaves.reduce((sum, t) => sum + t.durationDays * t.progressPct, 0) / totalWeight
      : 0;
  const plannedNow = plannedAt(statusDate);
  const ratio = plannedNow > 0 ? actualNow / plannedNow : 0;

  const points: SCurvePoint[] = [];
  for (let d = addDays(start, -1); compareIsoDates(d, end) < 0; d = addDays(d, stepDays)) {
    points.push(point(d));
  }
  points.push(point(end));
  return points;

  function point(date: IsoDate): SCurvePoint {
    const planned = Math.round(plannedAt(date) * 10) / 10;
    const beforeStatus = compareIsoDates(date, statusDate) <= 0;
    const actual = beforeStatus ? Math.round(Math.min(100, planned * ratio) * 10) / 10 : null;
    return { date, planned, actual };
  }
}
