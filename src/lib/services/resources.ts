import type { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { toAssignmentDto, toResourceDto, type AssignmentDto, type ResourceDto } from "@/lib/dto";
import type {
  CreateAssignmentInput,
  CreateResourceInput,
  UpdateAssignmentInput,
  UpdateResourceInput,
} from "@/lib/schemas";

export async function listResources(projectId: string): Promise<ResourceDto[]> {
  const rows = await prisma.resource.findMany({ where: { projectId }, orderBy: { name: "asc" } });
  return rows.map(toResourceDto);
}

export async function createResource(
  projectId: string,
  userId: string,
  input: CreateResourceInput,
): Promise<ResourceDto> {
  return withAudit(async (tx) => {
    if (input.calendarId) await assertCalendarInProject(tx, input.calendarId, projectId);
    const created = await tx.resource.create({
      data: {
        projectId,
        name: input.name,
        type: input.type ?? "PERSON",
        email: input.email ?? null,
        rate: input.rate ?? 0,
        rateCurrency: input.rateCurrency ?? "UF",
        capacityHoursPerDay: input.capacityHoursPerDay ?? 8,
        color: input.color ?? null,
        calendarId: input.calendarId ?? null,
      },
    });
    const dto = toResourceDto(created);
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "Resource",
        entityId: created.id,
        action: "CREATE",
        after: dto,
        summary: `creó el recurso "${created.name}"`,
      },
    ];
    return { result: dto, audit };
  });
}

export async function updateResource(
  resourceId: string,
  userId: string,
  input: UpdateResourceInput,
): Promise<ResourceDto> {
  return withAudit(async (tx) => {
    const row = await tx.resource.findUnique({ where: { id: resourceId } });
    if (!row) throw new ApiError("NOT_FOUND", "El recurso no existe", { resourceId });
    if (input.calendarId) await assertCalendarInProject(tx, input.calendarId, row.projectId);
    const data: Prisma.ResourceUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.type !== undefined) data.type = input.type;
    if (input.email !== undefined) data.email = input.email;
    if (input.rate !== undefined) data.rate = input.rate;
    if (input.rateCurrency !== undefined) data.rateCurrency = input.rateCurrency;
    if (input.capacityHoursPerDay !== undefined)
      data.capacityHoursPerDay = input.capacityHoursPerDay;
    if (input.color !== undefined) data.color = input.color;
    if (input.calendarId !== undefined) data.calendarId = input.calendarId;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const updated = await tx.resource.update({ where: { id: resourceId }, data });
    const dto = toResourceDto(updated);
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Resource",
        entityId: resourceId,
        action: "UPDATE",
        before: toResourceDto(row),
        after: dto,
        summary: `editó el recurso "${updated.name}"`,
      },
    ];
    return { result: dto, audit };
  });
}

export async function deleteResource(resourceId: string, userId: string): Promise<void> {
  await withAudit(async (tx) => {
    const row = await tx.resource.findUnique({ where: { id: resourceId } });
    if (!row) throw new ApiError("NOT_FOUND", "El recurso no existe", { resourceId });
    await tx.resource.delete({ where: { id: resourceId } });
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Resource",
        entityId: resourceId,
        action: "DELETE",
        before: toResourceDto(row),
        summary: `eliminó el recurso "${row.name}"`,
      },
    ];
    return { result: undefined, audit };
  });
}

export async function resourceProjectId(resourceId: string): Promise<string> {
  const row = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { projectId: true },
  });
  if (!row) throw new ApiError("NOT_FOUND", "El recurso no existe", { resourceId });
  return row.projectId;
}

// ---------------------------------------------------------------- Asignaciones (UC-16)

export async function listAssignments(projectId: string): Promise<AssignmentDto[]> {
  const rows = await prisma.assignment.findMany({ where: { task: { projectId } } });
  return rows.map(toAssignmentDto);
}

export async function createAssignment(
  taskId: string,
  userId: string,
  input: CreateAssignmentInput,
): Promise<AssignmentDto> {
  return withAudit(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
    if (task.isSummary) {
      throw new ApiError("VALIDATION", "Las tareas resumen no admiten asignaciones", { taskId });
    }
    const resource = await tx.resource.findFirst({
      where: { id: input.resourceId, projectId: task.projectId },
    });
    if (!resource)
      throw new ApiError("NOT_FOUND", "El recurso no existe en este proyecto", {
        resourceId: input.resourceId,
      });
    const existing = await tx.assignment.findUnique({
      where: { taskId_resourceId: { taskId, resourceId: input.resourceId } },
    });
    if (existing) {
      throw new ApiError(
        "CONFLICT",
        "El recurso ya está asignado a esta tarea; edita el porcentaje",
        {
          assignmentId: existing.id,
        },
      );
    }
    const created = await tx.assignment.create({
      data: { taskId, resourceId: input.resourceId, allocationPct: input.allocationPct ?? 100 },
    });
    const dto = toAssignmentDto(created);
    const audit: AuditEntry[] = [
      {
        projectId: task.projectId,
        userId,
        entityType: "Assignment",
        entityId: created.id,
        action: "CREATE",
        after: dto,
        summary: `asignó "${resource.name}" al ${created.allocationPct} % a la tarea ${task.wbsCode}`,
      },
    ];
    return { result: dto, audit };
  });
}

export async function updateAssignment(
  assignmentId: string,
  userId: string,
  input: UpdateAssignmentInput,
): Promise<AssignmentDto> {
  return withAudit(async (tx) => {
    const row = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: { task: true, resource: true },
    });
    if (!row) throw new ApiError("NOT_FOUND", "La asignación no existe", { assignmentId });
    const updated = await tx.assignment.update({
      where: { id: assignmentId },
      data: { allocationPct: input.allocationPct },
    });
    const dto = toAssignmentDto(updated);
    const audit: AuditEntry[] = [
      {
        projectId: row.task.projectId,
        userId,
        entityType: "Assignment",
        entityId: assignmentId,
        action: "UPDATE",
        before: toAssignmentDto(row),
        after: dto,
        summary: `cambió la dedicación de "${row.resource.name}" en la tarea ${row.task.wbsCode} a ${updated.allocationPct} %`,
      },
    ];
    return { result: dto, audit };
  });
}

export async function deleteAssignment(assignmentId: string, userId: string): Promise<void> {
  await withAudit(async (tx) => {
    const row = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: { task: true, resource: true },
    });
    if (!row) throw new ApiError("NOT_FOUND", "La asignación no existe", { assignmentId });
    await tx.assignment.delete({ where: { id: assignmentId } });
    const audit: AuditEntry[] = [
      {
        projectId: row.task.projectId,
        userId,
        entityType: "Assignment",
        entityId: assignmentId,
        action: "DELETE",
        before: toAssignmentDto(row),
        summary: `quitó a "${row.resource.name}" de la tarea ${row.task.wbsCode}`,
      },
    ];
    return { result: undefined, audit };
  });
}

export async function assignmentProjectId(assignmentId: string): Promise<string> {
  const row = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { task: { select: { projectId: true } } },
  });
  if (!row) throw new ApiError("NOT_FOUND", "La asignación no existe", { assignmentId });
  return row.task.projectId;
}

async function assertCalendarInProject(
  tx: Prisma.TransactionClient,
  calendarId: string,
  projectId: string,
): Promise<void> {
  const calendar = await tx.calendar.findFirst({ where: { id: calendarId, projectId } });
  if (!calendar)
    throw new ApiError("NOT_FOUND", "El calendario no existe en este proyecto", { calendarId });
}
