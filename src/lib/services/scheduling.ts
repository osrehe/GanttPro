import type { Dependency, Prisma, Project, Task, TaskStatus } from "@prisma/client";
import {
  applyCriticalPath,
  renumber as renumberTasks,
  scheduleProject,
  type EngineDependency,
  type EngineTask,
  type WorkingCalendar,
} from "@ganttpro/engine";
import { fromDbDate, fromDbDateOrNull, toDbDate } from "@/lib/dates";
import { toTaskDto, type TaskDto } from "@/lib/dto";
import { loadProjectCalendar } from "./calendar";

export interface ProjectGraph {
  readonly project: Project;
  readonly calendar: WorkingCalendar;
  readonly tasks: Task[];
  readonly dependencies: Dependency[];
}

/** Carga el proyecto, su calendario base, tareas y dependencias. */
export async function loadGraph(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<ProjectGraph> {
  const [project, calendar, tasks, dependencies] = await Promise.all([
    tx.project.findUniqueOrThrow({ where: { id: projectId } }),
    loadProjectCalendar(tx, projectId),
    tx.task.findMany({
      where: { projectId },
      orderBy: [{ parentId: "asc" }, { orderIndex: "asc" }],
    }),
    tx.dependency.findMany({ where: { projectId } }),
  ]);
  return { project, calendar, tasks, dependencies };
}

/** Fila de tarea de Prisma → tarea del engine (fechas ISO). */
export function toEngineTask(t: Task): EngineTask & { id: string } {
  return {
    id: t.id,
    parentId: t.parentId,
    orderIndex: t.orderIndex,
    wbsCode: t.wbsCode,
    anchorDate: fromDbDateOrNull(t.anchorDate),
    startDate: fromDbDate(t.startDate),
    endDate: fromDbDate(t.endDate),
    durationDays: t.durationDays,
    effortHours: t.effortHours === null ? null : Number(t.effortHours),
    progressPct: t.progressPct,
    isMilestone: t.isMilestone,
    isSummary: t.isSummary,
  };
}

export function toEngineDependency(d: Dependency): EngineDependency {
  return {
    id: d.id,
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type,
    lagDays: d.lagDays,
  };
}

/** Estado automático según avance, salvo que el usuario lo haya puesto en pausa o cancelado. */
export function deriveStatus(current: TaskStatus, progressPct: number): TaskStatus {
  if (current === "ON_HOLD" || current === "CANCELLED") return current;
  if (progressPct >= 100) return "DONE";
  if (progressPct > 0) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export interface RescheduleOptions {
  /** Renumerar el WBS antes de programar (tras crear, eliminar o mover tareas). */
  readonly renumber?: boolean;
}

export interface RescheduleResult {
  /** Tareas cuyos campos persistidos cambiaron, ya actualizadas en la base de datos. */
  readonly affected: TaskDto[];
  /** Todas las tareas del proyecto tras la reprogramación, en orden WBS. */
  readonly all: TaskDto[];
}

/**
 * Reprograma el proyecto completo en el servidor (fuente de verdad): ejecuta el engine sobre el
 * estado actual, compara con las filas persistidas y actualiza solo las que cambiaron.
 */
export async function rescheduleProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  options: RescheduleOptions = {},
): Promise<RescheduleResult> {
  const graph = await loadGraph(tx, projectId);
  const rowsById = new Map(graph.tasks.map((t) => [t.id, t]));
  let engineTasks = graph.tasks.map(toEngineTask);
  if (options.renumber) engineTasks = renumberTasks(engineTasks);
  const deps = graph.dependencies.map(toEngineDependency);
  const scheduled = scheduleProject(engineTasks, deps, graph.calendar, {
    progressWeighting: graph.project.progressWeighting,
    projectStartDate: fromDbDate(graph.project.startDate),
  }).tasks;
  const finalTasks = applyCriticalPath(scheduled, deps, graph.calendar);

  const updates: Array<{ id: string; data: Prisma.TaskUncheckedUpdateInput }> = [];
  for (const t of finalTasks) {
    const row = rowsById.get(t.id);
    if (!row) continue;
    const status = deriveStatus(row.status, t.progressPct);
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (row.parentId !== t.parentId) data.parentId = t.parentId;
    if (row.orderIndex !== t.orderIndex) data.orderIndex = t.orderIndex;
    if (row.wbsCode !== t.wbsCode) data.wbsCode = t.wbsCode;
    if (row.isSummary !== t.isSummary) data.isSummary = t.isSummary;
    if (row.isMilestone !== t.isMilestone) data.isMilestone = t.isMilestone;
    if (fromDbDateOrNull(row.anchorDate) !== t.anchorDate) {
      data.anchorDate = t.anchorDate ? toDbDate(t.anchorDate) : null;
    }
    if (fromDbDate(row.startDate) !== t.startDate) data.startDate = toDbDate(t.startDate);
    if (fromDbDate(row.endDate) !== t.endDate) data.endDate = toDbDate(t.endDate);
    if (row.durationDays !== t.durationDays) data.durationDays = t.durationDays;
    if (row.progressPct !== t.progressPct) data.progressPct = t.progressPct;
    if (row.status !== status) data.status = status;
    if (row.isCritical !== t.isCritical) data.isCritical = t.isCritical;
    if (row.totalFloatDays !== t.totalFloatDays) data.totalFloatDays = t.totalFloatDays;
    if (row.freeFloatDays !== t.freeFloatDays) data.freeFloatDays = t.freeFloatDays;
    if (Object.keys(data).length > 0) updates.push({ id: t.id, data });
  }

  const updatedRows: Task[] = [];
  const CHUNK = 50;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const rows = await Promise.all(
      chunk.map((u) => tx.task.update({ where: { id: u.id }, data: u.data })),
    );
    updatedRows.push(...rows);
  }
  const updatedById = new Map(updatedRows.map((r) => [r.id, r]));
  const all = finalTasks.map((t) =>
    toTaskDto(updatedById.get(t.id) ?? (rowsById.get(t.id) as Task)),
  );
  const affected = updatedRows.map(toTaskDto);
  return { affected, all };
}
