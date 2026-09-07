import { scheduleProject } from "@ganttpro/engine";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { fromDbDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toDependencyDto, type DependencyDto, type TaskDto } from "@/lib/dto";
import type { CreateDependencyInput, UpdateDependencyInput } from "@/lib/schemas";
import { loadGraph, rescheduleProject, toEngineDependency, toEngineTask } from "./scheduling";

export async function listDependencies(projectId: string): Promise<DependencyDto[]> {
  const rows = await prisma.dependency.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDependencyDto);
}

/**
 * Crea una dependencia entre dos hojas del proyecto (UC-10). Antes de persistir ejecuta el engine con
 * la dependencia nueva: si cierra un ciclo, lanza `CYCLE` con los `wbsCode` y nada cambia.
 */
export async function createDependency(
  projectId: string,
  userId: string,
  input: CreateDependencyInput,
): Promise<{ dependency: DependencyDto; affected: TaskDto[] }> {
  if (input.predecessorId === input.successorId) {
    throw new ApiError("VALIDATION", "Una tarea no puede depender de sí misma");
  }
  return withAudit(async (tx) => {
    const graph = await loadGraph(tx, projectId);
    const byId = new Map(graph.tasks.map((t) => [t.id, t]));
    const pred = byId.get(input.predecessorId);
    const succ = byId.get(input.successorId);
    if (!pred || !succ) {
      throw new ApiError("NOT_FOUND", "Ambas tareas deben existir en este proyecto", {
        predecessorId: input.predecessorId,
        successorId: input.successorId,
      });
    }
    for (const t of [pred, succ]) {
      if (t.isSummary) {
        throw new ApiError(
          "VALIDATION",
          `Las tareas resumen no admiten dependencias (${t.wbsCode})`,
          {
            taskId: t.id,
          },
        );
      }
    }
    const existing = graph.dependencies.find(
      (d) => d.predecessorId === input.predecessorId && d.successorId === input.successorId,
    );
    if (existing) {
      throw new ApiError(
        "CONFLICT",
        "Ya existe una dependencia entre estas tareas; edita la existente",
        {
          dependencyId: existing.id,
        },
      );
    }
    const candidate = {
      id: "__nueva__",
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type: input.type ?? ("FS" as const),
      lagDays: input.lagDays ?? 0,
    };
    // Detección de ciclos con el engine (lanza EngineError CYCLE → 422 con details.cycle).
    scheduleProject(
      graph.tasks.map(toEngineTask),
      [...graph.dependencies.map(toEngineDependency), candidate],
      graph.calendar,
      { projectStartDate: fromDbDate(graph.project.startDate) },
    );
    const created = await tx.dependency.create({
      data: {
        projectId,
        predecessorId: candidate.predecessorId,
        successorId: candidate.successorId,
        type: candidate.type,
        lagDays: candidate.lagDays,
      },
    });
    const { affected } = await rescheduleProject(tx, projectId);
    const dependency = toDependencyDto(created);
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "Dependency",
        entityId: created.id,
        action: "CREATE",
        after: dependency,
        summary: `creó la dependencia ${pred.wbsCode} → ${succ.wbsCode} (${describe(candidate)})`,
      },
    ];
    return { result: { dependency, affected }, audit };
  });
}

/** Cambia tipo o desfase de una dependencia existente y reprograma. */
export async function updateDependency(
  dependencyId: string,
  userId: string,
  input: UpdateDependencyInput,
): Promise<{ dependency: DependencyDto; affected: TaskDto[] }> {
  return withAudit(async (tx) => {
    const row = await tx.dependency.findUnique({
      where: { id: dependencyId },
      include: { predecessor: true, successor: true },
    });
    if (!row) throw new ApiError("NOT_FOUND", "La dependencia no existe", { dependencyId });
    const updated = await tx.dependency.update({
      where: { id: dependencyId },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.lagDays !== undefined ? { lagDays: input.lagDays } : {}),
      },
    });
    const { affected } = await rescheduleProject(tx, row.projectId);
    const dependency = toDependencyDto(updated);
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Dependency",
        entityId: dependencyId,
        action: "UPDATE",
        before: toDependencyDto(row),
        after: dependency,
        summary: `cambió la dependencia ${row.predecessor.wbsCode} → ${row.successor.wbsCode} a ${describe(updated)}`,
      },
    ];
    return { result: { dependency, affected }, audit };
  });
}

/** Elimina una dependencia; la sucesora vuelve a su ancla si no tiene otras predecesoras (UC-13). */
export async function deleteDependency(
  dependencyId: string,
  userId: string,
): Promise<{ affected: TaskDto[] }> {
  return withAudit(async (tx) => {
    const row = await tx.dependency.findUnique({
      where: { id: dependencyId },
      include: { predecessor: true, successor: true },
    });
    if (!row) throw new ApiError("NOT_FOUND", "La dependencia no existe", { dependencyId });
    await tx.dependency.delete({ where: { id: dependencyId } });
    const { affected } = await rescheduleProject(tx, row.projectId);
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Dependency",
        entityId: dependencyId,
        action: "DELETE",
        before: toDependencyDto(row),
        summary: `eliminó la dependencia ${row.predecessor.wbsCode} → ${row.successor.wbsCode}`,
      },
    ];
    return { result: { affected }, audit };
  });
}

/** Resolución del proyecto de una dependencia para la verificación de acceso. */
export async function dependencyProjectId(dependencyId: string): Promise<string> {
  const row = await prisma.dependency.findUnique({
    where: { id: dependencyId },
    select: { projectId: true },
  });
  if (!row) throw new ApiError("NOT_FOUND", "La dependencia no existe", { dependencyId });
  return row.projectId;
}

function describe(d: { type: string; lagDays: number }): string {
  const lag = d.lagDays === 0 ? "" : d.lagDays > 0 ? `+${d.lagDays}d` : `${d.lagDays}d`;
  return `${d.type}${lag}`;
}
