import type { WorkingCalendar } from "./calendar";
import { criticalPath } from "./cpm";
import { compareIsoDates, maxIsoDate, type IsoDate } from "./dates";
import { resourceLoad, type EngineAssignment, type EngineResource } from "./resources";
import { scheduleProject, type ScheduleOptions } from "./schedule";
import type { EngineDependency, EngineTask } from "./types";

/** Propuesta de retraso de una tarea para eliminar una sobreasignación. */
export interface LevelingMove {
  readonly taskId: string;
  readonly wbsCode: string;
  readonly fromAnchorDate: IsoDate;
  readonly toAnchorDate: IsoDate;
  /** Días hábiles de retraso respecto al inicio original. */
  readonly delayDays: number;
  /** Recurso y día que motivaron el (último) retraso. */
  readonly resourceId: string;
  readonly conflictDate: IsoDate;
}

export interface LevelingResult<T extends EngineTask> {
  readonly moves: LevelingMove[];
  /** Tareas resultantes (programadas) si se aplican todas las propuestas. */
  readonly tasks: T[];
  /** Sobreasignaciones que no se pudieron resolver sin mover tareas críticas: `resourceId → fechas`. */
  readonly unresolved: ReadonlyMap<string, IsoDate[]>;
  readonly overallocatedDaysBefore: number;
  readonly overallocatedDaysAfter: number;
}

export interface LevelingOptions extends ScheduleOptions {
  /** Límite de iteraciones de seguridad. */
  readonly maxIterations?: number;
}

/**
 * Nivelación simple (UC-18). Recorre las sobreasignaciones en orden cronológico y, para cada una,
 * retrasa la tarea contribuyente **no crítica** (según la ruta crítica del plan original) con más
 * holgura hasta el día hábil siguiente al fin de las demás tareas del conflicto, reprogramando el
 * proyecto tras cada movimiento. Nunca mueve tareas críticas ni hitos y no crea dependencias, por
 * lo que no puede introducir ciclos. Devuelve una propuesta que la UI muestra antes de aplicar.
 */
export function proposeLeveling<T extends EngineTask>(
  tasks: readonly T[],
  dependencies: readonly EngineDependency[],
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  calendar: WorkingCalendar,
  options: LevelingOptions = {},
): LevelingResult<T> {
  const maxIterations = options.maxIterations ?? 500;
  const original = scheduleProject(tasks, dependencies, calendar, options).tasks;
  const cpm = criticalPath(original, dependencies, calendar);
  const originalById = new Map(original.map((t) => [t.id, t]));
  let current = original;
  const before = countOverallocatedDays(current, assignments, resources, calendar);
  const moves = new Map<string, LevelingMove>();
  const unresolved = new Map<string, IsoDate[]>();
  const skipped = new Set<string>(); // "resourceId|date" sin solución

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const load = resourceLoad(current, assignments, resources, calendar);
    const conflict = firstConflict(load, skipped);
    if (!conflict) break;

    const byId = new Map(current.map((t) => [t.id, t]));
    const candidates = conflict.taskIds
      .map((id) => ({ task: byId.get(id) as T, cpm: cpm.leaves.get(id) }))
      .filter((c) => c.task && c.cpm && !c.cpm.isCritical && !c.task.isMilestone)
      .sort((a, b) => (b.cpm?.totalFloatDays ?? 0) - (a.cpm?.totalFloatDays ?? 0));
    const pick = candidates[0];
    if (!pick) {
      // Solo tareas críticas: se marca toda la racha como no resuelta y se sigue con la siguiente.
      for (const date of conflictStreak(load, conflict.resourceId, conflict.date)) {
        skipped.add(`${conflict.resourceId}|${date}`);
      }
      const list = unresolved.get(conflict.resourceId) ?? [];
      list.push(conflict.date);
      unresolved.set(conflict.resourceId, list);
      continue;
    }

    // Retrasa el ancla hasta el día hábil siguiente al fin de las otras tareas del conflicto.
    const others = conflict.taskIds
      .filter((id) => id !== pick.task.id)
      .map((id) => byId.get(id) as T);
    let latestEnd = others[0]!.endDate;
    for (const o of others) latestEnd = maxIsoDate(latestEnd, o.endDate);
    const newAnchor = calendar.addWorkingDays(latestEnd, 1);
    if (compareIsoDates(newAnchor, pick.task.startDate) <= 0) {
      skipped.add(`${conflict.resourceId}|${conflict.date}`);
      continue;
    }
    const originalTask = originalById.get(pick.task.id) as T;
    moves.set(pick.task.id, {
      taskId: pick.task.id,
      wbsCode: pick.task.wbsCode,
      fromAnchorDate: originalTask.anchorDate ?? originalTask.startDate,
      toAnchorDate: newAnchor,
      delayDays: calendar.workingDaysBetween(originalTask.startDate, newAnchor),
      resourceId: conflict.resourceId,
      conflictDate: conflict.date,
    });
    const updated = current.map((t) =>
      t.id === pick.task.id ? { ...t, anchorDate: newAnchor } : t,
    );
    current = scheduleProject(updated, dependencies, calendar, options).tasks;
  }

  const after = countOverallocatedDays(current, assignments, resources, calendar);
  return {
    moves: [...moves.values()],
    tasks: current,
    unresolved,
    overallocatedDaysBefore: before,
    overallocatedDaysAfter: after,
  };
}

interface Conflict {
  resourceId: string;
  date: IsoDate;
  taskIds: string[];
}

function firstConflict(
  load: ReturnType<typeof resourceLoad>,
  skipped: ReadonlySet<string>,
): Conflict | null {
  let best: Conflict | null = null;
  for (const [resourceId, rl] of load.byResource) {
    for (const day of rl.days) {
      if (!day.isOverallocated || skipped.has(`${resourceId}|${day.date}`)) continue;
      if (!best || compareIsoDates(day.date, best.date) < 0) {
        best = {
          resourceId,
          date: day.date,
          taskIds: [...new Set(day.items.map((i) => i.taskId))],
        };
      }
      break; // los días están ordenados: basta el primero no descartado de cada recurso
    }
  }
  return best;
}

/** Días consecutivos (con carga) sobreasignados a partir de `date` para el recurso. */
function conflictStreak(
  load: ReturnType<typeof resourceLoad>,
  resourceId: string,
  date: IsoDate,
): IsoDate[] {
  const days = load.byResource.get(resourceId)?.days ?? [];
  const streak: IsoDate[] = [];
  for (const day of days) {
    if (compareIsoDates(day.date, date) < 0) continue;
    if (!day.isOverallocated) break;
    streak.push(day.date);
  }
  return streak;
}

function countOverallocatedDays<T extends EngineTask>(
  tasks: readonly T[],
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  calendar: WorkingCalendar,
): number {
  const load = resourceLoad(tasks, assignments, resources, calendar);
  let count = 0;
  for (const rl of load.byResource.values()) count += rl.overallocatedDates.length;
  return count;
}
