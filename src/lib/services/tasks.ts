import type { Prisma, Task } from "@prisma/client";
import {
  getDescendantIds,
  indentTask,
  moveTask as engineMoveTask,
  moveTaskDown,
  moveTaskUp,
  outdentTask,
} from "@ganttpro/engine";
import { ApiError } from "@/lib/api/response";
import { newOperationId, withAudit, type AuditEntry } from "@/lib/audit";
import { formatDateCl, fromDbDate, toDbDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toTaskDto, type TaskDto, type TaskMutationResult } from "@/lib/dto";
import type {
  BulkTaskUpdateInput,
  CreateTaskInput,
  MoveTaskInput,
  PatchTaskInput,
} from "@/lib/schemas";
import { loadProjectCalendar } from "./calendar";
import { loadGraph, rescheduleProject, toEngineDependency, toEngineTask } from "./scheduling";

/** Campos que la API no acepta editar directamente porque los calcula el engine. */
const DERIVED_FIELDS = new Set([
  "startDate",
  "wbsCode",
  "isSummary",
  "isCritical",
  "totalFloatDays",
  "freeFloatDays",
]);

/** Tareas del proyecto en orden WBS. */
export async function listTasks(projectId: string): Promise<TaskDto[]> {
  const rows = await prisma.task.findMany({ where: { projectId } });
  return sortByWbs(rows.map(toTaskDto));
}

export async function getTask(taskId: string): Promise<TaskDto> {
  const row = await prisma.task.findUnique({ where: { id: taskId } });
  if (!row) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
  return toTaskDto(row);
}

/**
 * Crea una tarea hoja (o hito) bajo `parentId` en la posición `index` (por defecto al final).
 * Convertir en resumen a una hoja con dependencias o asignaciones se rechaza (UC-05).
 */
export async function createTask(
  projectId: string,
  userId: string,
  input: CreateTaskInput,
): Promise<TaskMutationResult> {
  return withAudit(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    let parent: Task | null = null;
    if (input.parentId) {
      parent = await tx.task.findFirst({ where: { id: input.parentId, projectId } });
      if (!parent)
        throw new ApiError("NOT_FOUND", "La tarea padre no existe", { parentId: input.parentId });
      await assertCanBecomeSummary(tx, parent);
    }
    const siblings = await tx.task.count({
      where: { projectId, parentId: input.parentId ?? null },
    });
    const index = Math.min(input.index ?? siblings, siblings);
    await tx.task.updateMany({
      where: { projectId, parentId: input.parentId ?? null, orderIndex: { gte: index } },
      data: { orderIndex: { increment: 1 } },
    });
    const isMilestone = input.isMilestone ?? false;
    const anchor =
      input.anchorDate ?? (parent ? fromDbDate(parent.startDate) : fromDbDate(project.startDate));
    const created = await tx.task.create({
      data: {
        projectId,
        parentId: input.parentId ?? null,
        orderIndex: index,
        wbsCode: "",
        name: input.name,
        description: input.description ?? null,
        anchorDate: toDbDate(anchor),
        startDate: toDbDate(anchor),
        endDate: toDbDate(anchor),
        durationDays: isMilestone ? 0 : (input.durationDays ?? 1),
        effortHours: input.effortHours ?? null,
        isMilestone,
        priority: input.priority ?? "MEDIUM",
        notes: input.notes ?? null,
        color: input.color ?? null,
        updatedById: userId,
      },
    });
    const { affected, all } = await rescheduleProject(tx, projectId, { renumber: true });
    const task = all.find((t) => t.id === created.id) as TaskDto;
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "Task",
        entityId: created.id,
        action: "CREATE",
        after: task,
        summary: `creó la tarea ${task.wbsCode} "${task.name}"`,
      },
    ];
    return { result: { task, affected: affected.filter((t) => t.id !== created.id) }, audit };
  });
}

/** Edita campos de una tarea y reprograma. Rechaza campos derivados y ediciones inválidas en resúmenes. */
export async function patchTask(
  taskId: string,
  userId: string,
  input: PatchTaskInput,
): Promise<TaskMutationResult> {
  for (const key of Object.keys(input)) {
    if (DERIVED_FIELDS.has(key)) {
      throw new ApiError("VALIDATION", `El campo ${key} es derivado y no se puede editar`, {
        field: key,
      });
    }
  }
  return withAudit(async (tx) => {
    const row = await tx.task.findUnique({ where: { id: taskId } });
    if (!row) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
    const before = toTaskDto(row);
    if (row.isSummary) {
      for (const key of [
        "anchorDate",
        "endDate",
        "durationDays",
        "progressPct",
        "isMilestone",
      ] as const) {
        if (input[key] !== undefined) {
          throw new ApiError(
            "VALIDATION",
            "Las tareas resumen derivan fechas, duración y avance de sus subtareas",
            {
              field: key,
            },
          );
        }
      }
    }
    const data: Prisma.TaskUncheckedUpdateInput = { updatedById: userId };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.color !== undefined) data.color = input.color;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.effortHours !== undefined) data.effortHours = input.effortHours;
    if (input.status !== undefined) data.status = input.status;
    if (input.progressPct !== undefined) data.progressPct = input.progressPct;
    if (input.anchorDate !== undefined) data.anchorDate = toDbDate(input.anchorDate);
    if (input.isMilestone !== undefined) {
      data.isMilestone = input.isMilestone;
      if (input.isMilestone) data.durationDays = 0;
      else if (row.durationDays === 0 && input.durationDays === undefined) data.durationDays = 1;
    }
    if (input.durationDays !== undefined) {
      if ((input.isMilestone ?? row.isMilestone) && input.durationDays > 0) {
        throw new ApiError("VALIDATION", "Un hito tiene duración 0", { field: "durationDays" });
      }
      data.durationDays = input.durationDays;
    }
    if (input.endDate !== undefined) {
      const calendar = await loadProjectCalendar(tx, row.projectId);
      const start = input.anchorDate
        ? calendar.snapForward(input.anchorDate)
        : fromDbDate(row.startDate);
      const days = calendar.countWorkingDays(start, input.endDate);
      if (days < 1) {
        throw new ApiError(
          "VALIDATION",
          `La fecha de fin debe ser igual o posterior al inicio (${formatDateCl(start)})`,
          {
            field: "endDate",
          },
        );
      }
      data.durationDays = row.isMilestone ? 0 : days;
    }
    await tx.task.update({ where: { id: taskId }, data });
    const { affected, all } = await rescheduleProject(tx, row.projectId);
    const task = all.find((t) => t.id === taskId) as TaskDto;
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Task",
        entityId: taskId,
        action: "UPDATE",
        before,
        after: task,
        summary: describePatch(task, input),
      },
    ];
    return { result: { task, affected: affected.filter((t) => t.id !== taskId) }, audit };
  });
}

/** Elimina una tarea con su subárbol (cascada en la base de datos) y reprograma. */
export async function deleteTask(taskId: string, userId: string): Promise<TaskMutationResult> {
  return withAudit(async (tx) => {
    const row = await tx.task.findUnique({ where: { id: taskId } });
    if (!row) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
    const graph = await loadGraph(tx, row.projectId);
    const deletedIds = [taskId, ...getDescendantIds(graph.tasks.map(toEngineTask), taskId)];
    await tx.task.delete({ where: { id: taskId } });
    const { affected } = await rescheduleProject(tx, row.projectId, { renumber: true });
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Task",
        entityId: taskId,
        action: "DELETE",
        before: toTaskDto(row),
        summary: `eliminó la tarea ${row.wbsCode} "${row.name}"${deletedIds.length > 1 ? ` y ${deletedIds.length - 1} subtareas` : ""}`,
      },
    ];
    return { result: { task: null, affected, deletedIds }, audit };
  });
}

/** Indenta, desindenta, sube, baja o mueve una tarea. Devuelve todas las tareas con su WBS nuevo. */
export async function moveTask(
  taskId: string,
  userId: string,
  input: MoveTaskInput,
): Promise<{ task: TaskDto; tasks: TaskDto[]; affected: TaskDto[] }> {
  return withAudit(async (tx) => {
    const row = await tx.task.findUnique({ where: { id: taskId } });
    if (!row) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
    const graph = await loadGraph(tx, row.projectId);
    const engineTasks = graph.tasks.map(toEngineTask);
    const dependencies = graph.dependencies.map(toEngineDependency);
    const assignedLeafIds = new Set(
      (
        await tx.assignment.findMany({
          where: { task: { projectId: row.projectId } },
          select: { taskId: true },
        })
      ).map((a) => a.taskId),
    );
    // Las asignaciones también impiden convertir una hoja en resumen (UC-05): se modelan como
    // dependencias ficticias hacia sí mismas para reutilizar la validación del engine.
    const guards = [...assignedLeafIds].map((id) => ({
      predecessorId: id,
      successorId: `__assignment__${id}`,
    }));
    const options = { dependencies: [...dependencies, ...guards] };

    let moved;
    switch (input.action) {
      case "indent":
        moved = indentTask(engineTasks, taskId, options);
        break;
      case "outdent":
        moved = outdentTask(engineTasks, taskId);
        break;
      case "up":
        moved = moveTaskUp(engineTasks, taskId);
        break;
      case "down":
        moved = moveTaskDown(engineTasks, taskId);
        break;
      case "move":
        moved = engineMoveTask(
          engineTasks,
          taskId,
          { parentId: input.parentId, index: input.index },
          options,
        );
        break;
    }

    const rowsById = new Map(graph.tasks.map((t) => [t.id, t]));
    for (const t of moved) {
      const prev = rowsById.get(t.id) as Task;
      const prevAnchor = prev.anchorDate ? fromDbDate(prev.anchorDate) : null;
      if (
        prev.parentId !== t.parentId ||
        prev.orderIndex !== t.orderIndex ||
        prev.wbsCode !== t.wbsCode ||
        prev.isSummary !== t.isSummary ||
        prevAnchor !== t.anchorDate
      ) {
        await tx.task.update({
          where: { id: t.id },
          data: {
            parentId: t.parentId,
            orderIndex: t.orderIndex,
            wbsCode: t.wbsCode,
            isSummary: t.isSummary,
            anchorDate: t.anchorDate ? toDbDate(t.anchorDate) : null,
            updatedById: userId,
          },
        });
      }
    }
    const { affected, all } = await rescheduleProject(tx, row.projectId);
    const task = all.find((t) => t.id === taskId) as TaskDto;
    const labels: Record<MoveTaskInput["action"], string> = {
      indent: "indentó",
      outdent: "desindentó",
      up: "subió",
      down: "bajó",
      move: "movió",
    };
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Task",
        entityId: taskId,
        action: "MOVE",
        before: { wbsCode: row.wbsCode, parentId: row.parentId, orderIndex: row.orderIndex },
        after: { wbsCode: task.wbsCode, parentId: task.parentId, orderIndex: task.orderIndex },
        summary: `${labels[input.action]} la tarea ${row.wbsCode} "${row.name}" (ahora ${task.wbsCode})`,
      },
    ];
    return { result: { task, tasks: all, affected }, audit };
  });
}

/**
 * Aplica varias actualizaciones en una sola transacción y reprograma una vez (undo/redo, UC-25;
 * actualización masiva de avance, UC-21). Todas las entradas de auditoría comparten `operationId`.
 */
export async function bulkUpdateTasks(
  projectId: string,
  userId: string,
  input: BulkTaskUpdateInput,
): Promise<{ affected: TaskDto[]; operationId: string }> {
  const operationId = input.operationId ?? newOperationId();
  return withAudit(async (tx) => {
    const ids = input.updates.map((u) => u.id);
    const rows = await tx.task.findMany({ where: { id: { in: ids }, projectId } });
    if (rows.length !== new Set(ids).size) {
      throw new ApiError("NOT_FOUND", "Alguna de las tareas no existe en este proyecto", { ids });
    }
    const rowsById = new Map(rows.map((r) => [r.id, r]));
    let structural = false;
    const audit: AuditEntry[] = [];
    for (const u of input.updates) {
      const row = rowsById.get(u.id) as Task;
      const data: Prisma.TaskUncheckedUpdateInput = { updatedById: userId };
      if (u.name !== undefined) data.name = u.name;
      if (u.description !== undefined) data.description = u.description;
      if (u.notes !== undefined) data.notes = u.notes;
      if (u.color !== undefined) data.color = u.color;
      if (u.priority !== undefined) data.priority = u.priority;
      if (u.effortHours !== undefined) data.effortHours = u.effortHours;
      if (u.status !== undefined) data.status = u.status;
      if (u.progressPct !== undefined) data.progressPct = u.progressPct;
      if (u.anchorDate !== undefined) data.anchorDate = toDbDate(u.anchorDate);
      if (u.durationDays !== undefined) data.durationDays = u.durationDays;
      if (u.isMilestone !== undefined) data.isMilestone = u.isMilestone;
      if (u.parentId !== undefined) {
        data.parentId = u.parentId;
        structural = true;
      }
      if (u.orderIndex !== undefined) {
        data.orderIndex = u.orderIndex;
        structural = true;
      }
      await tx.task.update({ where: { id: u.id }, data });
      audit.push({
        projectId,
        userId,
        entityType: "Task",
        entityId: u.id,
        action: "UPDATE",
        before: toTaskDto(row),
        after: { ...u },
        summary: input.summary ?? `actualizó la tarea ${row.wbsCode} "${row.name}"`,
        operationId,
      });
    }
    const { affected } = await rescheduleProject(tx, projectId, { renumber: structural });
    return { result: { affected, operationId }, audit };
  });
}

// ---------------------------------------------------------------------------------------------

async function assertCanBecomeSummary(tx: Prisma.TransactionClient, parent: Task): Promise<void> {
  if (parent.isSummary) return;
  const [deps, assignments] = await Promise.all([
    tx.dependency.count({
      where: { OR: [{ predecessorId: parent.id }, { successorId: parent.id }] },
    }),
    tx.assignment.count({ where: { taskId: parent.id } }),
  ]);
  if (deps > 0 || assignments > 0) {
    throw new ApiError(
      "VALIDATION",
      `La tarea ${parent.wbsCode} tiene dependencias o asignaciones y no puede convertirse en resumen`,
      { taskId: parent.id, reason: "SUMMARY_WITH_DEPENDENCIES" },
    );
  }
}

function describePatch(task: TaskDto, input: PatchTaskInput): string {
  const parts: string[] = [];
  if (input.anchorDate !== undefined) parts.push(`inicio ${formatDateCl(task.startDate)}`);
  if (input.endDate !== undefined) parts.push(`fin ${formatDateCl(task.endDate)}`);
  if (input.durationDays !== undefined) parts.push(`duración ${task.durationDays} d`);
  if (input.progressPct !== undefined) parts.push(`avance ${task.progressPct} %`);
  if (input.name !== undefined) parts.push(`nombre "${task.name}"`);
  if (input.status !== undefined) parts.push(`estado ${task.status}`);
  const detail = parts.length > 0 ? `: ${parts.join(", ")}` : "";
  return `editó la tarea ${task.wbsCode}${detail}`;
}

function sortByWbs(tasks: TaskDto[]): TaskDto[] {
  const key = (code: string): number[] => code.split(".").map(Number);
  return [...tasks].sort((a, b) => {
    const ka = key(a.wbsCode);
    const kb = key(b.wbsCode);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}
