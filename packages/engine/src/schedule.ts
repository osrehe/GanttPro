import type { WorkingCalendar } from "./calendar";
import { compareIsoDates, maxIsoDate, minIsoDate, type IsoDate } from "./dates";
import { formatCycle, topologicalOrder } from "./cycles";
import { EngineError, isEngineError } from "./errors";
import type { EngineDependency, EngineTask, ProgressWeighting } from "./types";
import { buildChildrenMap } from "./wbs";

export interface ScheduleOptions {
  /** Ponderación del avance en resúmenes. Default `DURATION`. */
  readonly progressWeighting?: ProgressWeighting;
  /** Ancla por defecto para hojas sin `anchorDate` (normalmente `Project.startDate`). */
  readonly projectStartDate?: IsoDate;
}

export interface ScheduleResult<T extends EngineTask> {
  /** Todas las tareas, en el mismo orden de entrada, con los campos derivados recalculados. */
  readonly tasks: T[];
  /** Solo las tareas cuyos campos derivados cambiaron respecto a la entrada. */
  readonly changed: T[];
}

/** Campos que compara `scheduleProject` para decidir si una tarea cambió. */
const DERIVED_FIELDS = [
  "startDate",
  "endDate",
  "durationDays",
  "progressPct",
  "isSummary",
  "anchorDate",
] as const;

/**
 * Cota mínima de inicio que impone una dependencia sobre su sucesora (ADR-003):
 * - FS: `S.start ≥ P.end + 1 + lag` · SS: `S.start ≥ P.start + lag`
 * - FF: `S.end ≥ P.end + lag` · SF: `S.end ≥ P.start + lag − 1`
 * Todo en días hábiles. Para FF y SF el inicio se obtiene restando el tramo de la sucesora
 * (`durationDays − 1`, o 0 para hitos).
 */
export function earliestStartFromPredecessor(
  dependency: Pick<EngineDependency, "type" | "lagDays">,
  predecessor: Pick<EngineTask, "startDate" | "endDate">,
  successorDurationDays: number,
  calendar: WorkingCalendar,
): IsoDate {
  const span = Math.max(successorDurationDays, 1) - 1;
  switch (dependency.type) {
    case "FS":
      return calendar.addWorkingDays(predecessor.endDate, 1 + dependency.lagDays);
    case "SS":
      return calendar.addWorkingDays(predecessor.startDate, dependency.lagDays);
    case "FF": {
      const end = calendar.addWorkingDays(predecessor.endDate, dependency.lagDays);
      return calendar.addWorkingDays(end, -span);
    }
    case "SF": {
      const end = calendar.addWorkingDays(predecessor.startDate, dependency.lagDays - 1);
      return calendar.addWorkingDays(end, -span);
    }
  }
}

/**
 * Reprograma el proyecto completo.
 *
 * 1. Valida las dependencias (tareas existentes, distintas y no resumen).
 * 2. Ordena las hojas topológicamente (lanza `CYCLE` si hay ciclo, con los `wbsCode` en `details.cycle`).
 * 3. Para cada hoja: inicio = max(ancla ajustada a día hábil, cotas de sus predecesoras); fin = inicio
 *    + (`durationDays` − 1) días hábiles; hitos tienen `durationDays` 0 y fin = inicio.
 * 4. Rollup de resúmenes de abajo hacia arriba: fechas extremas, `durationDays` inclusive y avance
 *    ponderado según `progressWeighting`.
 *
 * Es una función pura: no muta la entrada y devuelve el mismo resultado en servidor y cliente.
 */
export function scheduleProject<T extends EngineTask>(
  tasks: readonly T[],
  dependencies: readonly EngineDependency[],
  calendar: WorkingCalendar,
  options: ScheduleOptions = {},
): ScheduleResult<T> {
  const weighting = options.progressWeighting ?? "DURATION";
  const byId = new Map<string, T>(tasks.map((t) => [t.id, t]));
  const children = buildChildrenMap(tasks);
  const isSummary = (id: string): boolean => (children.get(id)?.length ?? 0) > 0;

  validateDependencies(dependencies, byId, isSummary);

  const leafIds = tasks.filter((t) => !isSummary(t.id)).map((t) => t.id);
  let order: string[];
  try {
    order = topologicalOrder(leafIds, dependencies);
  } catch (error) {
    if (isEngineError(error) && error.code === "CYCLE") {
      const ids = error.details.cycle as string[];
      const codes = ids.map((id) => byId.get(id)?.wbsCode || id);
      throw new EngineError("CYCLE", `La dependencia crearía un ciclo: ${formatCycle(codes)}`, {
        cycle: codes,
        cycleIds: ids,
      });
    }
    throw error;
  }

  const predecessorsOf = new Map<string, EngineDependency[]>();
  for (const dep of dependencies) {
    if (!predecessorsOf.has(dep.successorId)) predecessorsOf.set(dep.successorId, []);
    (predecessorsOf.get(dep.successorId) as EngineDependency[]).push(dep);
  }

  const computed = new Map<string, T>();

  // Paso 3: hojas en orden topológico.
  for (const id of order) {
    const task = byId.get(id) as T;
    const durationDays = task.isMilestone ? 0 : Math.max(0, Math.trunc(task.durationDays));
    const span = Math.max(durationDays, 1) - 1;
    const anchor = task.anchorDate ?? options.projectStartDate ?? task.startDate;
    let start = calendar.snapForward(anchor);
    for (const dep of predecessorsOf.get(id) ?? []) {
      const predecessor = computed.get(dep.predecessorId) as T;
      const bound = earliestStartFromPredecessor(dep, predecessor, durationDays, calendar);
      if (compareIsoDates(bound, start) > 0) start = bound;
    }
    const end = calendar.addWorkingDays(start, span);
    computed.set(id, {
      ...task,
      anchorDate: task.anchorDate ?? anchor,
      startDate: start,
      endDate: end,
      durationDays,
      progressPct: clampPct(task.progressPct),
      isSummary: false,
    });
  }

  // Paso 4: resúmenes de abajo hacia arriba (mayor profundidad primero).
  interface Aggregate {
    weight: number;
    weighted: number;
    leaves: number;
    progressSum: number;
  }
  const aggregates = new Map<string, Aggregate>();
  const summaries = tasks.filter((t) => isSummary(t.id));
  const depth = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const parentId = byId.get(id)?.parentId ?? null;
    const value = parentId !== null && byId.has(parentId) ? depthOf(parentId) + 1 : 0;
    depth.set(id, value);
    return value;
  };
  summaries.sort((a, b) => depthOf(b.id) - depthOf(a.id));

  const aggregateOf = (id: string): Aggregate => {
    const existing = aggregates.get(id);
    if (existing) return existing;
    const leaf = computed.get(id) as T;
    const weight =
      weighting === "DURATION" ? leaf.durationDays : Math.max(0, leaf.effortHours ?? 0);
    const agg: Aggregate = {
      weight,
      weighted: weight * leaf.progressPct,
      leaves: 1,
      progressSum: leaf.progressPct,
    };
    aggregates.set(id, agg);
    return agg;
  };

  for (const summary of summaries) {
    const kids = children.get(summary.id) as T[];
    const agg: Aggregate = { weight: 0, weighted: 0, leaves: 0, progressSum: 0 };
    let start: IsoDate | null = null;
    let end: IsoDate | null = null;
    for (const child of kids) {
      const done = computed.get(child.id) as T;
      start = start === null ? done.startDate : minIsoDate(start, done.startDate);
      end = end === null ? done.endDate : maxIsoDate(end, done.endDate);
      const childAgg = aggregateOf(child.id);
      agg.weight += childAgg.weight;
      agg.weighted += childAgg.weighted;
      agg.leaves += childAgg.leaves;
      agg.progressSum += childAgg.progressSum;
    }
    aggregates.set(summary.id, agg);
    const progress =
      agg.weight > 0
        ? Math.round(agg.weighted / agg.weight)
        : Math.round(agg.progressSum / Math.max(agg.leaves, 1));
    computed.set(summary.id, {
      ...summary,
      anchorDate: null,
      startDate: start as IsoDate,
      endDate: end as IsoDate,
      durationDays: calendar.countWorkingDays(start as IsoDate, end as IsoDate),
      progressPct: progress,
      isMilestone: false,
      isSummary: true,
    });
  }

  const result = tasks.map((t) => computed.get(t.id) as T);
  const changed = result.filter((after) => {
    const before = byId.get(after.id) as T;
    return DERIVED_FIELDS.some((field) => before[field] !== after[field]);
  });
  return { tasks: result, changed };
}

function validateDependencies<T extends EngineTask>(
  dependencies: readonly EngineDependency[],
  byId: ReadonlyMap<string, T>,
  isSummary: (id: string) => boolean,
): void {
  for (const dep of dependencies) {
    for (const id of [dep.predecessorId, dep.successorId]) {
      if (!byId.has(id)) {
        throw new EngineError(
          "INVALID_DEPENDENCY",
          `La dependencia ${dep.id} referencia una tarea inexistente (${id})`,
          { dependencyId: dep.id, taskId: id },
        );
      }
    }
    if (dep.predecessorId === dep.successorId) {
      throw new EngineError("INVALID_DEPENDENCY", "Una tarea no puede depender de sí misma", {
        dependencyId: dep.id,
        taskId: dep.successorId,
      });
    }
    for (const id of [dep.predecessorId, dep.successorId]) {
      if (isSummary(id)) {
        const task = byId.get(id) as T;
        throw new EngineError(
          "INVALID_DEPENDENCY",
          `Las tareas resumen no admiten dependencias (${task.wbsCode || task.id})`,
          { dependencyId: dep.id, taskId: id },
        );
      }
    }
    if (!Number.isInteger(dep.lagDays)) {
      throw new EngineError(
        "INVALID_DEPENDENCY",
        `El desfase de la dependencia ${dep.id} debe ser un entero de días hábiles`,
        { dependencyId: dep.id },
      );
    }
  }
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
