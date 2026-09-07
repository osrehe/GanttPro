import { EngineError } from "./errors";
import type { DependencyEdge, EngineTask } from "./types";

/** Campos mínimos que necesitan las operaciones de WBS. */
export type WbsTask = Pick<
  EngineTask,
  "id" | "parentId" | "orderIndex" | "wbsCode" | "isSummary" | "anchorDate" | "startDate"
>;

export interface MoveTarget {
  /** Nuevo padre; `null` para nivel raíz. */
  readonly parentId: string | null;
  /** Posición entre los nuevos hermanos (se acota al rango válido). */
  readonly index: number;
}

export interface WbsOptions {
  /**
   * Dependencias vigentes. Si se entregan, se rechaza convertir en resumen a una tarea que participa
   * en alguna dependencia (las tareas resumen no admiten dependencias, ver ADR-003).
   */
  readonly dependencies?: readonly DependencyEdge[];
}

/** Mapa `parentId → hijos ordenados por orderIndex` (estable ante empates). `null` agrupa las raíces. */
export function buildChildrenMap<T extends WbsTask>(tasks: readonly T[]): Map<string | null, T[]> {
  const ids = new Set(tasks.map((t) => t.id));
  const position = new Map<string, number>();
  const children = new Map<string | null, T[]>();
  children.set(null, []);
  tasks.forEach((task, index) => {
    position.set(task.id, index);
    // Un padre inexistente se trata como raíz para no perder la tarea.
    const key = task.parentId !== null && ids.has(task.parentId) ? task.parentId : null;
    if (!children.has(key)) children.set(key, []);
    (children.get(key) as T[]).push(task);
  });
  for (const list of children.values()) {
    list.sort(
      (a, b) =>
        a.orderIndex - b.orderIndex ||
        (position.get(a.id) as number) - (position.get(b.id) as number),
    );
  }
  return children;
}

/** Tareas en orden de recorrido en profundidad (padres antes que hijos, hermanos por `orderIndex`). */
export function sortTasksDepthFirst<T extends WbsTask>(tasks: readonly T[]): T[] {
  const children = buildChildrenMap(tasks);
  const result: T[] = [];
  const visit = (parentId: string | null): void => {
    for (const task of children.get(parentId) ?? []) {
      result.push(task);
      visit(task.id);
    }
  };
  visit(null);
  return result;
}

/**
 * Recalcula `wbsCode`, `orderIndex` (contiguo desde 0) e `isSummary` para todas las tareas y las
 * devuelve en orden de profundidad.
 *
 * Reglas de transición (UC-07): una hoja que pasa a tener hijos pierde su ancla (`anchorDate = null`);
 * un resumen que se queda sin hijos vuelve a ser hoja con `anchorDate` igual a su `startDate` previo.
 */
export function renumber<T extends WbsTask>(tasks: readonly T[]): T[] {
  const children = buildChildrenMap(tasks);
  const result: T[] = [];
  const visit = (parentId: string | null, prefix: string): void => {
    const siblings = children.get(parentId) ?? [];
    siblings.forEach((task, index) => {
      const code = prefix === "" ? String(index + 1) : `${prefix}.${index + 1}`;
      const hasChildren = (children.get(task.id)?.length ?? 0) > 0;
      let anchorDate = task.anchorDate;
      if (hasChildren) anchorDate = null;
      else if (task.isSummary || anchorDate === null) anchorDate = task.startDate;
      result.push({
        ...task,
        parentId,
        orderIndex: index,
        wbsCode: code,
        isSummary: hasChildren,
        anchorDate,
      });
      visit(task.id, code);
    });
  };
  visit(null, "");
  return result;
}

/** Ids de todos los descendientes (hijos, nietos…) de una tarea. */
export function getDescendantIds<T extends WbsTask>(tasks: readonly T[], taskId: string): string[] {
  const children = buildChildrenMap(tasks);
  const result: string[] = [];
  const visit = (id: string): void => {
    for (const child of children.get(id) ?? []) {
      result.push(child.id);
      visit(child.id);
    }
  };
  visit(taskId);
  return result;
}

/** Ids de los ancestros de una tarea, del padre directo hacia la raíz. */
export function getAncestorIds<T extends WbsTask>(tasks: readonly T[], taskId: string): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const result: string[] = [];
  let current = byId.get(taskId)?.parentId ?? null;
  while (current !== null && byId.has(current)) {
    result.push(current);
    current = (byId.get(current) as T).parentId;
  }
  return result;
}

/** Profundidad de una tarea (0 = raíz). */
export function getDepth<T extends WbsTask>(tasks: readonly T[], taskId: string): number {
  return getAncestorIds(tasks, taskId).length;
}

/**
 * Indenta una tarea: pasa a ser el último hijo de su hermano anterior.
 * Lanza `INVALID_MOVE` si no tiene hermano anterior o si el nuevo padre participa en dependencias.
 */
export function indentTask<T extends WbsTask>(
  tasks: readonly T[],
  taskId: string,
  options: WbsOptions = {},
): T[] {
  const task = requireTask(tasks, taskId);
  const siblings = buildChildrenMap(tasks).get(task.parentId) ?? [];
  const position = siblings.findIndex((t) => t.id === taskId);
  if (position <= 0) {
    throw new EngineError(
      "INVALID_MOVE",
      `No se puede indentar la tarea ${task.wbsCode || task.id}: no tiene un hermano anterior`,
      { taskId },
    );
  }
  const newParent = siblings[position - 1] as T;
  assertCanBecomeSummary(tasks, newParent, options);
  return renumber(
    tasks.map((t) =>
      t.id === taskId ? { ...t, parentId: newParent.id, orderIndex: Number.MAX_SAFE_INTEGER } : t,
    ),
  );
}

/**
 * Desindenta una tarea: pasa a ser hermana de su padre, inmediatamente después de él. Los hermanos
 * que la seguían pasan a ser sus hijos (comportamiento de MS Project).
 * Lanza `INVALID_MOVE` si la tarea es de nivel raíz.
 */
export function outdentTask<T extends WbsTask>(tasks: readonly T[], taskId: string): T[] {
  const task = requireTask(tasks, taskId);
  if (task.parentId === null) {
    throw new EngineError(
      "INVALID_MOVE",
      `No se puede desindentar la tarea ${task.wbsCode || task.id}: ya está en el nivel raíz`,
      { taskId },
    );
  }
  const parent = requireTask(tasks, task.parentId);
  const children = buildChildrenMap(tasks);
  const siblings = children.get(parent.id) ?? [];
  const position = siblings.findIndex((t) => t.id === taskId);
  const following = new Set(siblings.slice(position + 1).map((t) => t.id));
  const ownChildrenCount = children.get(taskId)?.length ?? 0;

  return renumber(
    tasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, parentId: parent.parentId, orderIndex: parent.orderIndex + 0.5 };
      }
      if (following.has(t.id)) {
        return { ...t, parentId: taskId, orderIndex: ownChildrenCount + t.orderIndex + 1 };
      }
      return t;
    }),
  );
}

/**
 * Mueve una tarea (con todo su subárbol) bajo otro padre y a una posición dada.
 * Lanza `INVALID_MOVE` si el destino es la propia tarea o uno de sus descendientes, o si el nuevo
 * padre participa en dependencias.
 */
export function moveTask<T extends WbsTask>(
  tasks: readonly T[],
  taskId: string,
  target: MoveTarget,
  options: WbsOptions = {},
): T[] {
  const task = requireTask(tasks, taskId);
  if (target.parentId !== null) {
    if (target.parentId === taskId || getDescendantIds(tasks, taskId).includes(target.parentId)) {
      throw new EngineError(
        "INVALID_MOVE",
        "Una tarea no puede moverse dentro de sus propias subtareas",
        { taskId, targetParentId: target.parentId },
      );
    }
    const newParent = requireTask(tasks, target.parentId);
    if (newParent.id !== task.parentId) assertCanBecomeSummary(tasks, newParent, options);
  }

  const siblings = (buildChildrenMap(tasks).get(target.parentId) ?? []).filter(
    (t) => t.id !== taskId,
  );
  const index = Math.max(0, Math.min(target.index, siblings.length));
  const newOrder = new Map<string, number>();
  siblings.forEach((t, i) => newOrder.set(t.id, i < index ? i : i + 1));
  newOrder.set(taskId, index);

  return renumber(
    tasks.map((t) => {
      if (t.id === taskId) return { ...t, parentId: target.parentId, orderIndex: index };
      if (newOrder.has(t.id)) return { ...t, orderIndex: newOrder.get(t.id) as number };
      return t;
    }),
  );
}

/** Intercambia la tarea con su hermano anterior. Sin hermano anterior devuelve las tareas renumeradas sin cambios. */
export function moveTaskUp<T extends WbsTask>(tasks: readonly T[], taskId: string): T[] {
  return swapWithSibling(tasks, taskId, -1);
}

/** Intercambia la tarea con su hermano siguiente. Sin hermano siguiente devuelve las tareas renumeradas sin cambios. */
export function moveTaskDown<T extends WbsTask>(tasks: readonly T[], taskId: string): T[] {
  return swapWithSibling(tasks, taskId, 1);
}

function swapWithSibling<T extends WbsTask>(
  tasks: readonly T[],
  taskId: string,
  offset: -1 | 1,
): T[] {
  const task = requireTask(tasks, taskId);
  const siblings = buildChildrenMap(tasks).get(task.parentId) ?? [];
  const position = siblings.findIndex((t) => t.id === taskId);
  const other = siblings[position + offset];
  if (!other) return renumber(tasks);
  return moveTask(tasks, taskId, { parentId: task.parentId, index: position + offset });
}

function requireTask<T extends WbsTask>(tasks: readonly T[], taskId: string): T {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    throw new EngineError("NOT_FOUND", `No existe la tarea con id ${taskId}`, { taskId });
  }
  return task;
}

function assertCanBecomeSummary<T extends WbsTask>(
  tasks: readonly T[],
  candidate: T,
  options: WbsOptions,
): void {
  if (!options.dependencies || candidate.isSummary) return;
  const involved = options.dependencies.some(
    (d) => d.predecessorId === candidate.id || d.successorId === candidate.id,
  );
  if (involved) {
    throw new EngineError(
      "INVALID_MOVE",
      `La tarea ${candidate.wbsCode || candidate.id} tiene dependencias y no puede convertirse en resumen`,
      { taskId: candidate.id, reason: "SUMMARY_WITH_DEPENDENCIES" },
    );
  }
}
