import type { WorkingCalendar } from "./calendar";
import { topologicalOrder } from "./cycles";
import { compareIsoDates, type IsoDate } from "./dates";
import type { EngineDependency, EngineTask } from "./types";
import { buildChildrenMap, getDescendantIds } from "./wbs";

/** Campos que el CPM aporta a cada tarea (coinciden con `Task` del modelo de datos). */
export interface CpmFields {
  readonly isCritical: boolean;
  /** Holgura total en días hábiles; nulo en tareas resumen. */
  readonly totalFloatDays: number | null;
  /** Holgura libre en días hábiles; nulo en tareas resumen. */
  readonly freeFloatDays: number | null;
}

/** Resultado del CPM para una tarea hoja. */
export interface CpmLeaf {
  readonly taskId: string;
  readonly earlyStart: IsoDate;
  readonly earlyFinish: IsoDate;
  readonly lateStart: IsoDate;
  readonly lateFinish: IsoDate;
  readonly totalFloatDays: number;
  readonly freeFloatDays: number;
  readonly isCritical: boolean;
}

export interface CpmResult {
  /** Inicio más temprano entre las hojas; nulo si no hay hojas. */
  readonly projectStart: IsoDate | null;
  /** Fin del proyecto (máximo `endDate` de las hojas); nulo si no hay hojas. */
  readonly projectEnd: IsoDate | null;
  readonly leaves: ReadonlyMap<string, CpmLeaf>;
  /** Ids críticos, incluidas las tareas resumen con alguna hoja crítica. */
  readonly criticalTaskIds: ReadonlySet<string>;
}

/**
 * Método de la ruta crítica sobre un proyecto ya programado (UC-20, ADR-003).
 *
 * El paso adelante ya lo hizo `scheduleProject`: `earlyStart`/`earlyFinish` son las fechas
 * efectivas, incluidas las impuestas por `anchorDate`. El paso atrás parte del fin del proyecto
 * para las tareas sin sucesoras y aplica las cotas inversas de FS/SS/FF/SF con lag. Las tareas
 * resumen no participan de la red: son críticas si alguna hoja descendiente lo es.
 */
export function criticalPath<T extends EngineTask>(
  tasks: readonly T[],
  dependencies: readonly EngineDependency[],
  calendar: WorkingCalendar,
): CpmResult {
  const byId = new Map<string, T>(tasks.map((t) => [t.id, t]));
  const children = buildChildrenMap(tasks);
  const isSummary = (id: string): boolean => (children.get(id)?.length ?? 0) > 0;
  const leafIds = tasks.filter((t) => !isSummary(t.id)).map((t) => t.id);
  const leafSet = new Set(leafIds);

  if (leafIds.length === 0) {
    return { projectStart: null, projectEnd: null, leaves: new Map(), criticalTaskIds: new Set() };
  }

  const deps = dependencies.filter(
    (d) =>
      leafSet.has(d.predecessorId) &&
      leafSet.has(d.successorId) &&
      d.predecessorId !== d.successorId,
  );
  const order = topologicalOrder(leafIds, deps);
  const successorsOf = new Map<string, EngineDependency[]>();
  for (const dep of deps) {
    if (!successorsOf.has(dep.predecessorId)) successorsOf.set(dep.predecessorId, []);
    (successorsOf.get(dep.predecessorId) as EngineDependency[]).push(dep);
  }

  let projectStart = (byId.get(leafIds[0] as string) as T).startDate;
  let projectEnd = (byId.get(leafIds[0] as string) as T).endDate;
  for (const id of leafIds) {
    const t = byId.get(id) as T;
    if (compareIsoDates(t.startDate, projectStart) < 0) projectStart = t.startDate;
    if (compareIsoDates(t.endDate, projectEnd) > 0) projectEnd = t.endDate;
  }

  const spanOf = (t: T): number => Math.max(t.isMilestone ? 0 : t.durationDays, 1) - 1;
  const lateStart = new Map<string, IsoDate>();
  const lateFinish = new Map<string, IsoDate>();

  // Paso atrás en orden topológico inverso.
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i] as string;
    const task = byId.get(id) as T;
    const span = spanOf(task);
    let lf = projectEnd;
    for (const dep of successorsOf.get(id) ?? []) {
      const sLS = lateStart.get(dep.successorId) as IsoDate;
      const sLF = lateFinish.get(dep.successorId) as IsoDate;
      let bound: IsoDate;
      switch (dep.type) {
        case "FS":
          bound = calendar.addWorkingDays(sLS, -(1 + dep.lagDays));
          break;
        case "SS":
          bound = calendar.addWorkingDays(calendar.addWorkingDays(sLS, -dep.lagDays), span);
          break;
        case "FF":
          bound = calendar.addWorkingDays(sLF, -dep.lagDays);
          break;
        case "SF":
          bound = calendar.addWorkingDays(calendar.addWorkingDays(sLF, 1 - dep.lagDays), span);
          break;
      }
      if (compareIsoDates(bound, lf) < 0) lf = bound;
    }
    lateFinish.set(id, lf);
    lateStart.set(id, calendar.addWorkingDays(lf, -span));
  }

  const leaves = new Map<string, CpmLeaf>();
  const critical = new Set<string>();
  for (const id of leafIds) {
    const task = byId.get(id) as T;
    const ls = lateStart.get(id) as IsoDate;
    const lf = lateFinish.get(id) as IsoDate;
    const total = Math.max(0, calendar.workingDaysBetween(task.startDate, ls));
    const succs = successorsOf.get(id) ?? [];
    let free = total;
    if (succs.length > 0) {
      let minSlack = Number.POSITIVE_INFINITY;
      for (const dep of succs) {
        const s = byId.get(dep.successorId) as T;
        let slack: number;
        switch (dep.type) {
          case "FS":
            slack = calendar.workingDaysBetween(
              task.endDate,
              calendar.addWorkingDays(s.startDate, -(1 + dep.lagDays)),
            );
            break;
          case "SS":
            slack = calendar.workingDaysBetween(
              task.startDate,
              calendar.addWorkingDays(s.startDate, -dep.lagDays),
            );
            break;
          case "FF":
            slack = calendar.workingDaysBetween(
              task.endDate,
              calendar.addWorkingDays(s.endDate, -dep.lagDays),
            );
            break;
          case "SF":
            slack = calendar.workingDaysBetween(
              task.startDate,
              calendar.addWorkingDays(s.endDate, 1 - dep.lagDays),
            );
            break;
        }
        if (slack < minSlack) minSlack = slack;
      }
      free = Math.max(0, Math.min(total, minSlack));
    }
    const isCritical = total === 0;
    if (isCritical) critical.add(id);
    leaves.set(id, {
      taskId: id,
      earlyStart: task.startDate,
      earlyFinish: task.endDate,
      lateStart: ls,
      lateFinish: lf,
      totalFloatDays: total,
      freeFloatDays: free,
      isCritical,
    });
  }

  for (const task of tasks) {
    if (!isSummary(task.id)) continue;
    if (getDescendantIds(tasks, task.id).some((id) => critical.has(id))) critical.add(task.id);
  }

  return { projectStart, projectEnd, leaves, criticalTaskIds: critical };
}

/** Devuelve las tareas con los campos del CPM incorporados, en el mismo orden de entrada. */
export function applyCriticalPath<T extends EngineTask>(
  tasks: readonly T[],
  dependencies: readonly EngineDependency[],
  calendar: WorkingCalendar,
): Array<T & CpmFields> {
  const result = criticalPath(tasks, dependencies, calendar);
  return tasks.map((task) => {
    const leaf = result.leaves.get(task.id);
    return {
      ...task,
      isCritical: result.criticalTaskIds.has(task.id),
      totalFloatDays: leaf ? leaf.totalFloatDays : null,
      freeFloatDays: leaf ? leaf.freeFloatDays : null,
    };
  });
}
