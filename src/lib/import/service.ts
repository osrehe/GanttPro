import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { fromDbDate, toDbDate, todayIso } from "@/lib/dates";
import { chileanHolidays } from "@/lib/holidays";
import { parsePredecessors } from "@/lib/predecessors";
import { rescheduleProject } from "@/lib/services/scheduling";
import { validatePlan } from "./rows";
import type { ImportRequestInput } from "./schema";
import type { ImportedResource, ImportedTask, ImportResult } from "./types";

const SOURCE_LABEL = { xlsx: "Excel", csv: "CSV", mspdi: "MS Project" } as const;

function compareWbs(a: string, b: string): number {
  const ka = a.split(".").map(Number);
  const kb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parentOf(wbs: string): string | null {
  return wbs.includes(".") ? wbs.slice(0, wbs.lastIndexOf(".")) : null;
}

/**
 * Escribe un plan importado (UC-28…UC-30): crea el proyecto (modo `new`), agrega las tareas al
 * final de uno existente (modo `append`) o sustituye todas sus tareas conservando los recursos
 * (modo `replace`), con dependencias, recursos y asignaciones, y reprograma
 * con el engine en la misma transacción. Revalida el plan en el servidor: un plan con errores se
 * rechaza con `VALIDATION` y la lista de problemas.
 */
export async function importPlan(userId: string, input: ImportRequestInput): Promise<ImportResult> {
  const preview = validatePlan(input.plan);
  if (preview.counts.errors > 0) {
    throw new ApiError("VALIDATION", "El archivo tiene errores que impiden importarlo", {
      issues: preview.issues.filter((i) => i.severity === "error"),
    });
  }
  const plan = input.plan;
  const tasks = [...plan.tasks].sort((a, b) => compareWbs(a.wbs, b.wbs));
  const parents = new Set(tasks.map((t) => parentOf(t.wbs)).filter((p): p is string => p !== null));

  return withAudit(async (tx) => {
    // 1. Proyecto destino
    let projectId: string;
    let projectStart: string;
    let topLevelOffset = 0;
    const existingResources = new Map<string, string>();
    if (input.target.mode === "new") {
      const earliest = tasks
        .map((t) => t.startDate)
        .filter((d): d is string => d !== null)
        .sort()[0];
      projectStart = input.target.startDate ?? plan.startDate ?? earliest ?? todayIso();
      const year = Number(projectStart.slice(0, 4));
      const holidays = chileanHolidays(year);
      const project = await tx.project.create({
        data: {
          name: input.target.name,
          startDate: toDbDate(projectStart),
          createdById: userId,
          members: { create: { userId, role: "ADMIN" } },
          calendars: {
            create: {
              name: holidays.length > 0 ? `Calendario Chile ${year}` : "Calendario laboral",
              isBase: true,
              holidays: { create: holidays.map((h) => ({ date: toDbDate(h.date), name: h.name })) },
            },
          },
        },
      });
      projectId = project.id;
    } else {
      const project = await tx.project.findUnique({ where: { id: input.target.projectId } });
      if (!project) {
        throw new ApiError("NOT_FOUND", "El proyecto no existe", {
          projectId: input.target.projectId,
        });
      }
      projectId = project.id;
      projectStart = fromDbDate(project.startDate);
      if (input.target.mode === "replace") {
        // Reemplazo del plan: se eliminan las tareas (Prisma borra en cascada dependencias,
        // asignaciones y fotos de líneas base); los recursos se conservan y se reutilizan.
        await tx.dependency.deleteMany({ where: { projectId } });
        await tx.task.deleteMany({ where: { projectId } });
      } else {
        topLevelOffset = await tx.task.count({ where: { projectId, parentId: null } });
      }
      const resources = await tx.resource.findMany({ where: { projectId } });
      for (const r of resources) existingResources.set(r.name.trim().toLowerCase(), r.id);
    }

    // 2. Tareas
    const idByWbs = new Map<string, string>();
    const siblingCounter = new Map<string | null, number>();
    const taskRows: Prisma.TaskCreateManyInput[] = [];
    for (const t of tasks) {
      const id = crypto.randomUUID();
      idByWbs.set(t.wbs, id);
      const parentWbs = parentOf(t.wbs);
      const parentId = parentWbs === null ? null : (idByWbs.get(parentWbs) ?? null);
      const index = siblingCounter.get(parentWbs) ?? 0;
      siblingCounter.set(parentWbs, index + 1);
      const isSummary = parents.has(t.wbs);
      const anchor = t.startDate ?? projectStart;
      taskRows.push({
        id,
        projectId,
        parentId,
        orderIndex: parentWbs === null ? topLevelOffset + index : index,
        wbsCode: "",
        name: t.name.trim(),
        anchorDate: isSummary ? null : toDbDate(anchor),
        startDate: toDbDate(anchor),
        endDate: toDbDate(anchor),
        durationDays: isSummary ? 0 : t.isMilestone ? 0 : t.durationDays,
        isMilestone: isSummary ? false : t.isMilestone,
        isSummary,
        progressPct: isSummary ? 0 : t.progressPct,
        notes: t.notes,
        updatedById: userId,
      });
    }
    await tx.task.createMany({ data: taskRows });

    // 3. Dependencias
    const depRows: Prisma.DependencyCreateManyInput[] = [];
    const seenPairs = new Set<string>();
    for (const t of tasks) {
      if (t.predecessors.trim() === "") continue;
      const successorId = idByWbs.get(t.wbs) as string;
      for (const ref of parsePredecessors(t.predecessors)) {
        const predecessorId = idByWbs.get(ref.wbsCode);
        if (!predecessorId) continue;
        const key = `${predecessorId}>${successorId}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        depRows.push({
          projectId,
          predecessorId,
          successorId,
          type: ref.type,
          lagDays: ref.lagDays,
        });
      }
    }
    if (depRows.length > 0) await tx.dependency.createMany({ data: depRows });

    // 4. Recursos y asignaciones
    const declared = new Map<string, ImportedResource>();
    for (const r of plan.resources) declared.set(r.name.trim().toLowerCase(), r);
    const referenced = new Map<string, string>();
    for (const t of tasks)
      for (const name of t.resources) referenced.set(name.trim().toLowerCase(), name.trim());
    let createdResources = 0;
    const resourceIdByKey = new Map<string, string>(existingResources);
    const wanted = new Set([...declared.keys(), ...referenced.keys()]);
    for (const key of wanted) {
      if (key === "" || resourceIdByKey.has(key)) continue;
      const spec = declared.get(key);
      const created = await tx.resource.create({
        data: {
          projectId,
          name: spec?.name.trim() ?? (referenced.get(key) as string),
          type: spec?.type ?? "PERSON",
          rate: spec?.rate ?? 0,
          rateCurrency: spec?.rateCurrency ?? "UF",
          capacityHoursPerDay: spec?.capacityHoursPerDay ?? 8,
        },
      });
      resourceIdByKey.set(key, created.id);
      createdResources++;
    }
    const assignmentRows: Prisma.AssignmentCreateManyInput[] = [];
    for (const t of tasks) {
      if (parents.has(t.wbs)) continue;
      const taskId = idByWbs.get(t.wbs) as string;
      const seen = new Set<string>();
      for (const name of t.resources) {
        const resourceId = resourceIdByKey.get(name.trim().toLowerCase());
        if (!resourceId || seen.has(resourceId)) continue;
        seen.add(resourceId);
        assignmentRows.push({ taskId, resourceId, allocationPct: 100 });
      }
    }
    if (assignmentRows.length > 0) await tx.assignment.createMany({ data: assignmentRows });

    // 5. Reprogramación (WBS, fechas, ruta crítica) y auditoría
    await rescheduleProject(tx, projectId, { renumber: true });
    const result: ImportResult = {
      projectId,
      created: {
        tasks: taskRows.length,
        dependencies: depRows.length,
        resources: createdResources,
        assignments: assignmentRows.length,
      },
    };
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "Project",
        entityId: projectId,
        action: "IMPORT",
        after: { ...result.created, source: plan.source, mode: input.target.mode },
        summary: `${input.target.mode === "replace" ? "reemplazó el plan: importó" : "importó"} ${result.created.tasks} tareas, ${result.created.dependencies} dependencias y ${result.created.resources} recursos desde ${SOURCE_LABEL[plan.source]}`,
      },
    ];
    return { result, audit };
  });
}

/** Utilidad para tests y servicios: tareas hoja del plan (sin hijos). */
export function leafTasks(tasks: readonly ImportedTask[]): ImportedTask[] {
  const parents = new Set(tasks.map((t) => parentOf(t.wbs)).filter((p): p is string => p !== null));
  return tasks.filter((t) => !parents.has(t.wbs));
}
