import type { WorkingCalendar } from "./calendar";
import { addDays, compareIsoDates, dayOfWeek, type IsoDate } from "./dates";
import type { EngineTask } from "./types";
import { buildChildrenMap, getDescendantIds } from "./wbs";

export type Currency = "UF" | "CLP";

/** Vista de `Resource` que necesita el engine. */
export interface EngineResource {
  readonly id: string;
  readonly capacityHoursPerDay: number;
  /** Tarifa por hora en `rateCurrency`. */
  readonly rate: number;
  readonly rateCurrency: Currency;
  /** Calendario propio; nulo = usa el calendario base del proyecto. */
  readonly calendar?: WorkingCalendar | null;
}

/** Vista de `Assignment` que necesita el engine. */
export interface EngineAssignment {
  readonly id: string;
  readonly taskId: string;
  readonly resourceId: string;
  /** Porcentaje de dedicación; puede superar 100. */
  readonly allocationPct: number;
}

/** Moneda de visualización y valor UF configurado (`Setting.displayCurrency`, `Setting.ufValue`). */
export interface CurrencyDisplay {
  readonly currency: Currency;
  /** Pesos por UF; nulo si no está configurado. */
  readonly ufValue: number | null;
}

export interface DailyLoadItem {
  readonly taskId: string;
  readonly assignmentId: string;
  readonly hours: number;
}

export interface DailyLoad {
  readonly date: IsoDate;
  readonly hours: number;
  readonly capacityHours: number;
  readonly isOverallocated: boolean;
  readonly items: readonly DailyLoadItem[];
}

export interface ResourceLoad {
  readonly resourceId: string;
  readonly days: readonly DailyLoad[];
  readonly totalHours: number;
  readonly overallocatedDates: readonly IsoDate[];
}

export interface ResourceLoadResult {
  readonly byResource: ReadonlyMap<string, ResourceLoad>;
  /** Tareas con algún recurso sobreasignado en algún día de su ejecución. */
  readonly overallocatedTaskIds: ReadonlySet<string>;
}

export interface WeeklyLoad {
  /** Lunes de la semana. */
  readonly weekStart: IsoDate;
  readonly hours: number;
  readonly capacityHours: number;
  readonly isOverallocated: boolean;
}

/** Horas asignadas = `durationDays` × horas/día del calendario × `allocationPct` / 100 (UC-16). */
export function assignmentHours(
  task: Pick<EngineTask, "durationDays" | "isMilestone">,
  allocationPct: number,
  calendar: WorkingCalendar,
): number {
  const days = task.isMilestone ? 0 : task.durationDays;
  return (days * calendar.hoursPerDay * allocationPct) / 100;
}

/**
 * Carga diaria por recurso (UC-17). Para cada día hábil del proyecto dentro de cada tarea asignada,
 * el recurso carga `hoursPerDay × allocationPct / 100`; si ese día no es hábil en el calendario
 * propio del recurso, la carga es 0. Sobreasignado si la carga supera `capacityHoursPerDay`.
 */
export function resourceLoad<T extends EngineTask>(
  tasks: readonly T[],
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  projectCalendar: WorkingCalendar,
): ResourceLoadResult {
  const taskById = new Map<string, T>(tasks.map((t) => [t.id, t]));
  const children = buildChildrenMap(tasks);
  const byResource = new Map<string, ResourceLoad>();
  const overallocatedTaskIds = new Set<string>();

  for (const resource of resources) {
    const own = resource.calendar ?? projectCalendar;
    const perDay = new Map<string, DailyLoadItem[]>();
    for (const assignment of assignments) {
      if (assignment.resourceId !== resource.id) continue;
      const task = taskById.get(assignment.taskId);
      if (!task || (children.get(task.id)?.length ?? 0) > 0 || task.isMilestone) continue;
      const hoursPerDay = (projectCalendar.hoursPerDay * assignment.allocationPct) / 100;
      for (
        let date = task.startDate;
        compareIsoDates(date, task.endDate) <= 0;
        date = addDays(date, 1)
      ) {
        if (!projectCalendar.isWorkingDay(date) || !own.isWorkingDay(date)) continue;
        if (!perDay.has(date)) perDay.set(date, []);
        (perDay.get(date) as DailyLoadItem[]).push({
          taskId: task.id,
          assignmentId: assignment.id,
          hours: hoursPerDay,
        });
      }
    }
    const days: DailyLoad[] = [...perDay.entries()]
      .sort(([a], [b]) => compareIsoDates(a, b))
      .map(([date, items]) => {
        const hours = round2(items.reduce((sum, i) => sum + i.hours, 0));
        const isOverallocated = hours > resource.capacityHoursPerDay + 1e-9;
        if (isOverallocated) for (const item of items) overallocatedTaskIds.add(item.taskId);
        return { date, hours, capacityHours: resource.capacityHoursPerDay, isOverallocated, items };
      });
    byResource.set(resource.id, {
      resourceId: resource.id,
      days,
      totalHours: round2(days.reduce((sum, d) => sum + d.hours, 0)),
      overallocatedDates: days.filter((d) => d.isOverallocated).map((d) => d.date),
    });
  }
  return { byResource, overallocatedTaskIds };
}

/** Lunes de la semana a la que pertenece la fecha. */
export function weekStartOf(date: IsoDate): IsoDate {
  const offset = (dayOfWeek(date) + 6) % 7; // lunes = 0 … domingo = 6
  return addDays(date, -offset);
}

/**
 * Agrega la carga diaria por semana (lunes a domingo). La capacidad semanal es
 * `capacityHoursPerDay × días hábiles de la semana` según el calendario del recurso.
 */
export function aggregateWeekly(
  load: ResourceLoad,
  resource: EngineResource,
  projectCalendar: WorkingCalendar,
): WeeklyLoad[] {
  const calendar = resource.calendar ?? projectCalendar;
  const weeks = new Map<string, number>();
  for (const day of load.days) {
    const key = weekStartOf(day.date);
    weeks.set(key, (weeks.get(key) ?? 0) + day.hours);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => compareIsoDates(a, b))
    .map(([weekStart, hours]) => {
      const workingDays = calendar.countWorkingDays(weekStart, addDays(weekStart, 6));
      const capacityHours = workingDays * resource.capacityHoursPerDay;
      return {
        weekStart,
        hours: round2(hours),
        capacityHours,
        isOverallocated: hours > capacityHours + 1e-9,
      };
    });
}

/** Convierte un monto entre UF y CLP según la configuración; nulo si falta el valor UF (UC-38). */
export function convertAmount(
  amount: number,
  from: Currency,
  display: CurrencyDisplay,
): number | null {
  if (from === display.currency) return amount;
  if (display.ufValue === null || !(display.ufValue > 0)) return null;
  return from === "UF" ? amount * display.ufValue : amount / display.ufValue;
}

export interface TaskCost {
  readonly taskId: string;
  /** Horas asignadas (suma de asignaciones o de descendientes). */
  readonly hours: number;
  /** Costo planificado en la moneda de visualización; nulo si alguna conversión no fue posible. */
  readonly plannedCost: number | null;
  /** Costo consumido = planificado × `progressPct` / 100 (en resúmenes, suma de descendientes). */
  readonly consumedCost: number | null;
}

export interface ProjectCosts {
  readonly byTask: ReadonlyMap<string, TaskCost>;
  readonly totalHours: number;
  readonly plannedCost: number | null;
  readonly consumedCost: number | null;
}

/** Costos por tarea y del proyecto (UC-38). Los resúmenes suman a sus descendientes hoja. */
export function projectCosts<T extends EngineTask>(
  tasks: readonly T[],
  assignments: readonly EngineAssignment[],
  resources: readonly EngineResource[],
  calendar: WorkingCalendar,
  display: CurrencyDisplay,
): ProjectCosts {
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const children = buildChildrenMap(tasks);
  const byTask = new Map<string, TaskCost>();

  // Hojas primero.
  for (const task of tasks) {
    if ((children.get(task.id)?.length ?? 0) > 0) continue;
    let hours = 0;
    let planned: number | null = 0;
    for (const a of assignments) {
      if (a.taskId !== task.id) continue;
      const resource = resourceById.get(a.resourceId);
      if (!resource) continue;
      const h = assignmentHours(task, a.allocationPct, calendar);
      hours += h;
      const cost = convertAmount(h * resource.rate, resource.rateCurrency, display);
      planned = planned === null || cost === null ? null : planned + cost;
    }
    byTask.set(task.id, {
      taskId: task.id,
      hours: round2(hours),
      plannedCost: planned === null ? null : round2(planned),
      consumedCost: planned === null ? null : round2((planned * task.progressPct) / 100),
    });
  }
  // Resúmenes: suma de hojas descendientes.
  for (const task of tasks) {
    if ((children.get(task.id)?.length ?? 0) === 0) continue;
    const leaves = getDescendantIds(tasks, task.id).filter((id) => byTask.has(id));
    byTask.set(
      task.id,
      sumCosts(
        task.id,
        leaves.map((id) => byTask.get(id) as TaskCost),
      ),
    );
  }
  const roots = tasks.filter((t) => t.parentId === null || !tasks.some((p) => p.id === t.parentId));
  const total = sumCosts(
    "__project__",
    roots.map((t) => byTask.get(t.id) as TaskCost),
  );
  return {
    byTask,
    totalHours: total.hours,
    plannedCost: total.plannedCost,
    consumedCost: total.consumedCost,
  };
}

function sumCosts(taskId: string, costs: readonly TaskCost[]): TaskCost {
  let hours = 0;
  let planned: number | null = 0;
  let consumed: number | null = 0;
  for (const c of costs) {
    hours += c.hours;
    planned = planned === null || c.plannedCost === null ? null : planned + c.plannedCost;
    consumed = consumed === null || c.consumedCost === null ? null : consumed + c.consumedCost;
  }
  return {
    taskId,
    hours: round2(hours),
    plannedCost: planned === null ? null : round2(planned),
    consumedCost: consumed === null ? null : round2(consumed),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
