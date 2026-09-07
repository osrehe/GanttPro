import { api } from "@/lib/api-client";
import type { AssignmentDto, DependencyDto, TaskDto } from "@/lib/dto";
import type { PredecessorDiff } from "@/lib/predecessors";
import type {
  CreateAssignmentInput,
  CreateDependencyInput,
  CreateTaskInput,
  MoveTaskInput,
  PatchTaskInput,
  UpdateDependencyInput,
} from "@/lib/schemas";
import { CompositeCommand, type Command, type CommandContext } from "./history";
import { useProjectStore } from "./project-store";

/**
 * Comandos deshacibles del proyecto (ADR-008). Cada uno llama a la API, aplica la respuesta al store
 * y sabe revertirse. Los ids se resuelven por el contexto para sobrevivir a los "rehacer crear".
 */

const store = () => useProjectStore.getState();

const EDITABLE_KEYS = [
  "name",
  "description",
  "anchorDate",
  "durationDays",
  "effortHours",
  "progressPct",
  "status",
  "priority",
  "color",
  "isMilestone",
  "notes",
] as const;

/** Snapshot de los campos editables de una tarea, para poder restaurarlos. */
export function editableSnapshot(task: TaskDto): PatchTaskInput {
  const snap: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    if (
      task.isSummary &&
      ["anchorDate", "durationDays", "progressPct", "isMilestone"].includes(key)
    )
      continue;
    if (key === "anchorDate" && task.anchorDate === null) continue;
    snap[key] = task[key];
  }
  return snap as PatchTaskInput;
}

// ---------------------------------------------------------------- Tareas

export function createTaskCommand(projectId: string, input: CreateTaskInput): Command {
  const tmpId = `tmp-${crypto.randomUUID()}`;
  let lastId: string | null = null;
  return {
    label: input.isMilestone ? "crear hito" : input.parentId ? "crear subtarea" : "crear tarea",
    async execute(ctx) {
      const parentId = input.parentId ? ctx.resolve(input.parentId) : input.parentId;
      const result = await api.tasks.create(projectId, { ...input, parentId });
      const newId = (result.task as TaskDto).id;
      if (lastId) ctx.alias(lastId, newId);
      ctx.alias(tmpId, newId);
      lastId = newId;
      store().applyTaskResult(result);
      store().select(newId);
    },
    async undo(ctx) {
      const result = await api.tasks.remove(ctx.resolve(lastId ?? tmpId));
      store().applyTaskResult(result);
    },
  };
}

export function patchTaskCommand(
  taskId: string,
  input: PatchTaskInput,
  before: PatchTaskInput,
  label = "editar tarea",
): Command {
  return {
    label,
    async execute(ctx) {
      store().applyTaskResult(await api.tasks.patch(ctx.resolve(taskId), input));
    },
    async undo(ctx) {
      store().applyTaskResult(await api.tasks.patch(ctx.resolve(taskId), before));
    },
  };
}

interface DeletedSubtree {
  tasks: TaskDto[]; // orden WBS: padres antes que hijos
  dependencies: DependencyDto[];
  assignments: AssignmentDto[];
}

function captureSubtree(taskId: string): DeletedSubtree {
  const s = store();
  const ids = new Set<string>([taskId]);
  for (const t of s.tasks) if (t.parentId && ids.has(t.parentId)) ids.add(t.id);
  return {
    tasks: s.tasks.filter((t) => ids.has(t.id)),
    dependencies: s.dependencies.filter((d) => ids.has(d.predecessorId) || ids.has(d.successorId)),
    assignments: s.assignments.filter((a) => ids.has(a.taskId)),
  };
}

export function deleteTaskCommand(taskId: string): Command {
  const snapshot = captureSubtree(taskId);
  const root = snapshot.tasks[0] as TaskDto;
  return {
    label: `eliminar tarea ${root.wbsCode}`,
    async execute(ctx) {
      store().applyTaskResult(await api.tasks.remove(ctx.resolve(taskId)));
    },
    async undo(ctx) {
      const projectId = root.projectId;
      // 1. Recrear las tareas de arriba hacia abajo, registrando alias de ids.
      for (const t of snapshot.tasks) {
        const parentId = t.parentId ? ctx.resolve(t.parentId) : null;
        const result = await api.tasks.create(projectId, {
          name: t.name,
          parentId,
          index: t.orderIndex,
          anchorDate: t.anchorDate ?? t.startDate,
          durationDays: t.isSummary ? 1 : t.durationDays,
          effortHours: t.effortHours,
          isMilestone: t.isMilestone,
          priority: t.priority,
          description: t.description,
          notes: t.notes,
          color: t.color,
        });
        ctx.alias(t.id, (result.task as TaskDto).id);
        store().applyTaskResult(result);
      }
      // 2. Restaurar avance y estado de las hojas.
      const updates = snapshot.tasks
        .filter((t) => !t.isSummary && (t.progressPct > 0 || t.status !== "NOT_STARTED"))
        .map((t) => ({ id: ctx.resolve(t.id), progressPct: t.progressPct, status: t.status }));
      if (updates.length > 0) {
        const bulk = await api.tasks.bulk(projectId, {
          updates,
          summary: "restauró tareas eliminadas",
        });
        store().applyTasks(bulk.affected);
      }
      // 3. Dependencias y asignaciones.
      for (const d of snapshot.dependencies) {
        const res = await api.dependencies.create(projectId, {
          predecessorId: ctx.resolve(d.predecessorId),
          successorId: ctx.resolve(d.successorId),
          type: d.type,
          lagDays: d.lagDays,
        });
        ctx.alias(d.id, res.dependency.id);
        store().applyDependency(res.dependency);
        store().applyTasks(res.affected);
      }
      for (const a of snapshot.assignments) {
        const created = await api.assignments.create(ctx.resolve(a.taskId), {
          resourceId: a.resourceId,
          allocationPct: a.allocationPct,
        });
        ctx.alias(a.id, created.id);
        store().applyAssignment(created);
      }
      store().select(ctx.resolve(taskId));
    },
  };
}

interface Position {
  parentId: string | null;
  orderIndex: number;
  anchorDate: string | null;
}

function capturePositions(): Map<string, Position> {
  return new Map(
    store().tasks.map((t) => [
      t.id,
      { parentId: t.parentId, orderIndex: t.orderIndex, anchorDate: t.anchorDate },
    ]),
  );
}

const MOVE_LABELS: Record<MoveTaskInput["action"], string> = {
  indent: "indentar",
  outdent: "desindentar",
  up: "subir",
  down: "bajar",
  move: "mover",
};

export function moveTaskCommand(taskId: string, input: MoveTaskInput): Command {
  const before = capturePositions();
  return {
    label: `${MOVE_LABELS[input.action]} tarea`,
    async execute(ctx) {
      const resolved: MoveTaskInput =
        input.action === "move"
          ? { ...input, parentId: input.parentId ? ctx.resolve(input.parentId) : null }
          : input;
      const result = await api.tasks.move(ctx.resolve(taskId), resolved);
      store().replaceTasks(result.tasks);
      store().highlight(result.affected.map((t) => t.id));
      store().select(result.task.id);
    },
    async undo(ctx) {
      const projectId = store().projectId as string;
      const updates: Array<{
        id: string;
        parentId?: string | null;
        orderIndex?: number;
        anchorDate?: string;
      }> = [];
      for (const [id, pos] of before) {
        const current = store().tasksById.get(ctx.resolve(id));
        if (!current) continue;
        const changed =
          current.parentId !== (pos.parentId ? ctx.resolve(pos.parentId) : null) ||
          current.orderIndex !== pos.orderIndex ||
          current.anchorDate !== pos.anchorDate;
        if (!changed) continue;
        updates.push({
          id: ctx.resolve(id),
          parentId: pos.parentId ? ctx.resolve(pos.parentId) : null,
          orderIndex: pos.orderIndex,
          ...(pos.anchorDate ? { anchorDate: pos.anchorDate } : {}),
        });
      }
      if (updates.length === 0) return;
      const result = await api.tasks.bulk(projectId, {
        updates,
        summary: `deshizo ${MOVE_LABELS[input.action]} tarea`,
      });
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
      store().select(ctx.resolve(taskId));
    },
  };
}

/**
 * Actualización masiva de campos editables en una sola transacción (nivelación, avance a fecha de
 * estado). Captura los valores previos de cada tarea para poder deshacer con otro `bulk`.
 */
export function bulkPatchCommand(
  projectId: string,
  updates: ReadonlyArray<{ id: string } & PatchTaskInput>,
  label: string,
  summary?: string,
): Command {
  const s = store();
  const before = updates.map((u) => {
    const task = s.tasksById.get(u.id);
    const snapshot: Record<string, unknown> = { id: u.id };
    if (task) {
      const full = editableSnapshot(task) as Record<string, unknown>;
      for (const key of Object.keys(u)) if (key !== "id" && key in full) snapshot[key] = full[key];
    }
    return snapshot as { id: string } & PatchTaskInput;
  });
  return {
    label,
    async execute(ctx) {
      const result = await api.tasks.bulk(projectId, {
        updates: updates.map((u) => ({ ...u, id: ctx.resolve(u.id) })),
        summary,
      });
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
    async undo(ctx) {
      const result = await api.tasks.bulk(projectId, {
        updates: before.map((u) => ({ ...u, id: ctx.resolve(u.id) })),
        summary: summary ? `deshizo: ${summary}` : undefined,
      });
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
  };
}

// ---------------------------------------------------------------- Dependencias

export function createDependencyCommand(projectId: string, input: CreateDependencyInput): Command {
  const tmpId = `tmp-${crypto.randomUUID()}`;
  let lastId: string | null = null;
  return {
    label: "crear dependencia",
    async execute(ctx) {
      const result = await api.dependencies.create(projectId, {
        ...input,
        predecessorId: ctx.resolve(input.predecessorId),
        successorId: ctx.resolve(input.successorId),
      });
      if (lastId) ctx.alias(lastId, result.dependency.id);
      ctx.alias(tmpId, result.dependency.id);
      lastId = result.dependency.id;
      store().applyDependency(result.dependency);
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
    async undo(ctx) {
      const id = ctx.resolve(lastId ?? tmpId);
      const result = await api.dependencies.remove(id);
      store().removeDependency(id);
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
  };
}

export function updateDependencyCommand(
  dependency: DependencyDto,
  input: UpdateDependencyInput,
): Command {
  const before: UpdateDependencyInput = { type: dependency.type, lagDays: dependency.lagDays };
  return {
    label: "editar dependencia",
    async execute(ctx) {
      const result = await api.dependencies.update(ctx.resolve(dependency.id), input);
      store().applyDependency(result.dependency);
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
    async undo(ctx) {
      const result = await api.dependencies.update(ctx.resolve(dependency.id), before);
      store().applyDependency(result.dependency);
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
  };
}

export function removeDependencyCommand(dependency: DependencyDto): Command {
  return {
    label: "quitar dependencia",
    async execute(ctx) {
      const id = ctx.resolve(dependency.id);
      const result = await api.dependencies.remove(id);
      store().removeDependency(id);
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
    async undo(ctx) {
      const result = await api.dependencies.create(dependency.projectId, {
        predecessorId: ctx.resolve(dependency.predecessorId),
        successorId: ctx.resolve(dependency.successorId),
        type: dependency.type,
        lagDays: dependency.lagDays,
      });
      ctx.alias(dependency.id, result.dependency.id);
      store().applyDependency(result.dependency);
      store().applyTasks(result.affected);
      store().highlight(result.affected.map((t) => t.id));
    },
  };
}

/** Aplica el diff de la columna Predecesoras como un único comando deshacible. */
export function setPredecessorsCommand(
  projectId: string,
  taskId: string,
  diff: PredecessorDiff,
): Command {
  const deps = store().dependencies;
  const parts: Command[] = [
    ...diff.remove.map((id) =>
      removeDependencyCommand(deps.find((d) => d.id === id) as DependencyDto),
    ),
    ...diff.update.map((u) =>
      updateDependencyCommand(deps.find((d) => d.id === u.dependencyId) as DependencyDto, {
        type: u.type,
        lagDays: u.lagDays,
      }),
    ),
    ...diff.create.map((c) =>
      createDependencyCommand(projectId, {
        predecessorId: c.predecessorId,
        successorId: taskId,
        type: c.type,
        lagDays: c.lagDays,
      }),
    ),
  ];
  return new CompositeCommand("editar predecesoras", parts);
}

// ---------------------------------------------------------------- Asignaciones

export function createAssignmentCommand(taskId: string, input: CreateAssignmentInput): Command {
  const tmpId = `tmp-${crypto.randomUUID()}`;
  let lastId: string | null = null;
  return {
    label: "asignar recurso",
    async execute(ctx) {
      const created = await api.assignments.create(ctx.resolve(taskId), input);
      if (lastId) ctx.alias(lastId, created.id);
      ctx.alias(tmpId, created.id);
      lastId = created.id;
      store().applyAssignment(created);
    },
    async undo(ctx) {
      const id = ctx.resolve(lastId ?? tmpId);
      await api.assignments.remove(id);
      store().removeAssignment(id);
    },
  };
}

export function updateAssignmentCommand(assignment: AssignmentDto, allocationPct: number): Command {
  return {
    label: "cambiar dedicación",
    async execute(ctx) {
      store().applyAssignment(
        await api.assignments.update(ctx.resolve(assignment.id), { allocationPct }),
      );
    },
    async undo(ctx) {
      store().applyAssignment(
        await api.assignments.update(ctx.resolve(assignment.id), {
          allocationPct: assignment.allocationPct,
        }),
      );
    },
  };
}

export function removeAssignmentCommand(assignment: AssignmentDto): Command {
  return {
    label: "quitar recurso",
    async execute(ctx) {
      const id = ctx.resolve(assignment.id);
      await api.assignments.remove(id);
      store().removeAssignment(id);
    },
    async undo(ctx) {
      const created = await api.assignments.create(ctx.resolve(assignment.taskId), {
        resourceId: assignment.resourceId,
        allocationPct: assignment.allocationPct,
      });
      ctx.alias(assignment.id, created.id);
      store().applyAssignment(created);
    },
  };
}

export type { CommandContext };
