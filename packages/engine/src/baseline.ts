import type { WorkingCalendar } from "./calendar";
import { compareIsoDates, type IsoDate } from "./dates";
import type { EngineTask } from "./types";

/** Fotografía de una tarea (coincide con `BaselineTask`). */
export interface BaselineSnapshot {
  readonly taskId: string;
  readonly wbsCode: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly durationDays: number;
  readonly progressPct: number;
}

export type VarianceStatus = "OK" | "NEW" | "DELETED";

/** Fila de la tabla comparativa (UC-19). Positivo = atraso. */
export interface VarianceRow {
  readonly taskId: string;
  readonly status: VarianceStatus;
  readonly wbsCode: string;
  readonly baseline: BaselineSnapshot | null;
  readonly current: Pick<
    EngineTask,
    "startDate" | "endDate" | "durationDays" | "progressPct"
  > | null;
  readonly startVarianceDays: number | null;
  readonly endVarianceDays: number | null;
  readonly progressVariancePct: number | null;
}

/** Toma la fotografía de todas las tareas para guardar una `Baseline`. */
export function takeBaseline<T extends EngineTask>(tasks: readonly T[]): BaselineSnapshot[] {
  return tasks.map((t) => ({
    taskId: t.id,
    wbsCode: t.wbsCode,
    startDate: t.startDate,
    endDate: t.endDate,
    durationDays: t.durationDays,
    progressPct: t.progressPct,
  }));
}

/**
 * Compara el plan actual con una baseline. Las variaciones de fecha se expresan en días hábiles
 * (`workingDaysBetween(baseline, actual)`, positivo si la tarea se atrasó). Las tareas nuevas y las
 * eliminadas se reportan con estado `NEW` y `DELETED`, sin variaciones.
 */
export function compareWithBaseline<T extends EngineTask>(
  tasks: readonly T[],
  snapshots: readonly BaselineSnapshot[],
  calendar: WorkingCalendar,
): VarianceRow[] {
  const snapshotById = new Map(snapshots.map((s) => [s.taskId, s]));
  const rows: VarianceRow[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    const base = snapshotById.get(task.id) ?? null;
    seen.add(task.id);
    const current = {
      startDate: task.startDate,
      endDate: task.endDate,
      durationDays: task.durationDays,
      progressPct: task.progressPct,
    };
    if (!base) {
      rows.push({
        taskId: task.id,
        status: "NEW",
        wbsCode: task.wbsCode,
        baseline: null,
        current,
        startVarianceDays: null,
        endVarianceDays: null,
        progressVariancePct: null,
      });
      continue;
    }
    rows.push({
      taskId: task.id,
      status: "OK",
      wbsCode: task.wbsCode,
      baseline: base,
      current,
      startVarianceDays: calendar.workingDaysBetween(base.startDate, task.startDate),
      endVarianceDays: calendar.workingDaysBetween(base.endDate, task.endDate),
      progressVariancePct: task.progressPct - base.progressPct,
    });
  }
  for (const snap of snapshots) {
    if (seen.has(snap.taskId)) continue;
    rows.push({
      taskId: snap.taskId,
      status: "DELETED",
      wbsCode: snap.wbsCode,
      baseline: snap,
      current: null,
      startVarianceDays: null,
      endVarianceDays: null,
      progressVariancePct: null,
    });
  }
  return rows;
}

/**
 * Avance esperado (0–100) de una tarea a la fecha de estado (UC-21): días hábiles transcurridos
 * desde `startDate` hasta la fecha de estado inclusive, acotados a la duración, sobre la duración.
 * Hitos: 100 si su fecha es anterior o igual a la fecha de estado, si no 0.
 */
export function expectedProgressAt(
  task: Pick<EngineTask, "startDate" | "endDate" | "durationDays" | "isMilestone">,
  statusDate: IsoDate,
  calendar: WorkingCalendar,
): number {
  if (task.isMilestone || task.durationDays <= 0) {
    return compareIsoDates(task.startDate, statusDate) <= 0 ? 100 : 0;
  }
  if (compareIsoDates(statusDate, task.startDate) < 0) return 0;
  const elapsed = Math.min(
    task.durationDays,
    calendar.countWorkingDays(task.startDate, statusDate),
  );
  return Math.round((elapsed / task.durationDays) * 100);
}

export interface TrackingStatus {
  readonly taskId: string;
  readonly expectedPct: number;
  readonly isLate: boolean;
  /** Días de desviación = (esperado − real) × duración / 100, con un decimal. Negativo = adelanto. */
  readonly deviationDays: number;
}

/** Estado de seguimiento de una tarea a la fecha de estado. */
export function trackingStatus(
  task: Pick<
    EngineTask,
    "id" | "startDate" | "endDate" | "durationDays" | "isMilestone" | "progressPct"
  >,
  statusDate: IsoDate,
  calendar: WorkingCalendar,
): TrackingStatus {
  const expectedPct = expectedProgressAt(task, statusDate, calendar);
  const deviation = ((expectedPct - task.progressPct) * task.durationDays) / 100;
  return {
    taskId: task.id,
    expectedPct,
    isLate: task.progressPct < expectedPct,
    deviationDays: Math.round(deviation * 10) / 10,
  };
}

export interface ProgressUpdate {
  readonly taskId: string;
  readonly progressPct: number;
}

/**
 * Actualización masiva "marcar avance según fecha de estado" (UC-21): devuelve, para las hojas
 * seleccionadas (o todas si `selectedIds` es nulo), el nuevo `progressPct` cuando el esperado supera
 * al real. Nunca reduce un avance.
 */
export function bulkProgressUpdates<T extends EngineTask>(
  tasks: readonly T[],
  statusDate: IsoDate,
  calendar: WorkingCalendar,
  selectedIds: ReadonlySet<string> | null = null,
): ProgressUpdate[] {
  const updates: ProgressUpdate[] = [];
  for (const task of tasks) {
    if (task.isSummary) continue;
    if (selectedIds && !selectedIds.has(task.id)) continue;
    const expected = expectedProgressAt(task, statusDate, calendar);
    if (expected > task.progressPct) updates.push({ taskId: task.id, progressPct: expected });
  }
  return updates;
}
