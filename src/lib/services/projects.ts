import { Prisma, type ProjectRole } from "@prisma/client";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  toAssignmentDto,
  toBaselineDto,
  toCalendarDto,
  toDependencyDto,
  toProjectDto,
  toResourceDto,
  toTaskDto,
  type MemberDto,
  type ProjectDto,
  type ProjectFullDto,
  type ProjectSummaryDto,
} from "@/lib/dto";
import { chileanHolidays } from "@/lib/holidays";
import type { CreateProjectInput, UpdateProjectInput } from "@/lib/schemas";
import { rescheduleProject } from "./scheduling";

interface LeafStats {
  projectId: string;
  taskCount: bigint;
  leafCount: bigint;
  weightedProgress: bigint | null;
  totalDuration: bigint | null;
  planStart: Date | null;
  planEnd: Date | null;
}

/** Proyectos del usuario con resumen para las tarjetas (UC-01). */
export async function listProjects(userId: string): Promise<ProjectSummaryDto[]> {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: { project: true },
    orderBy: { project: { updatedAt: "desc" } },
  });
  if (memberships.length === 0) return [];
  const ids = memberships.map((m) => m.projectId);
  const stats = await prisma.$queryRaw<LeafStats[]>`
    SELECT "projectId",
           count(*)                                                    AS "taskCount",
           count(*) FILTER (WHERE NOT "isSummary")                     AS "leafCount",
           sum("durationDays" * "progressPct") FILTER (WHERE NOT "isSummary") AS "weightedProgress",
           sum("durationDays") FILTER (WHERE NOT "isSummary")          AS "totalDuration",
           min("startDate")                                            AS "planStart",
           max("endDate")                                              AS "planEnd"
    FROM "Task"
    WHERE "projectId" IN (${Prisma.join(ids)})
    GROUP BY "projectId"`;
  const statsById = new Map(stats.map((s) => [s.projectId, s]));
  return memberships.map((m) => {
    const s = statsById.get(m.projectId);
    const total = Number(s?.totalDuration ?? 0);
    const weighted = Number(s?.weightedProgress ?? 0);
    return {
      ...toProjectDto(m.project),
      role: m.role,
      taskCount: Number(s?.taskCount ?? 0),
      leafCount: Number(s?.leafCount ?? 0),
      progressPct: total > 0 ? Math.round(weighted / total) : 0,
      planStart: s?.planStart ? fromDbDate(s.planStart) : null,
      planEnd: s?.planEnd ? fromDbDate(s.planEnd) : null,
    };
  });
}

/** Crea un proyecto con su calendario base (feriados de Chile del año de inicio) y al creador como ADMIN. */
export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectDto> {
  return withAudit(async (tx) => {
    const year = input.holidaysYear ?? Number(input.startDate.slice(0, 4));
    const holidays = chileanHolidays(year);
    const project = await tx.project.create({
      data: {
        name: input.name,
        description: input.description ?? null,
        startDate: toDbDate(input.startDate),
        progressWeighting: input.progressWeighting ?? "DURATION",
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
    const dto = toProjectDto(project);
    const audit: AuditEntry[] = [
      {
        projectId: project.id,
        userId,
        entityType: "Project",
        entityId: project.id,
        action: "CREATE",
        after: dto,
        summary: `creó el proyecto "${project.name}"`,
      },
    ];
    return { result: dto, audit };
  });
}

export async function getProject(projectId: string): Promise<ProjectDto> {
  const row = await prisma.project.findUnique({ where: { id: projectId } });
  if (!row) throw new ApiError("NOT_FOUND", "El proyecto no existe", { projectId });
  return toProjectDto(row);
}

/** Actualiza datos del proyecto; cambios de inicio o ponderación reprograman. Archivar fija `archivedAt`. */
export async function updateProject(
  projectId: string,
  userId: string,
  input: UpdateProjectInput,
): Promise<ProjectDto> {
  return withAudit(async (tx) => {
    const before = await tx.project.findUnique({ where: { id: projectId } });
    if (!before) throw new ApiError("NOT_FOUND", "El proyecto no existe", { projectId });
    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.startDate !== undefined) data.startDate = toDbDate(input.startDate);
    if (input.statusDate !== undefined)
      data.statusDate = input.statusDate ? toDbDate(input.statusDate) : null;
    if (input.progressWeighting !== undefined) data.progressWeighting = input.progressWeighting;
    if (input.status !== undefined) {
      data.status = input.status;
      data.archivedAt = input.status === "ARCHIVED" ? new Date() : null;
    }
    const updated = await tx.project.update({ where: { id: projectId }, data });
    if (input.startDate !== undefined || input.progressWeighting !== undefined) {
      await rescheduleProject(tx, projectId);
    }
    const dto = toProjectDto(updated);
    const summary =
      input.status === "ARCHIVED"
        ? `archivó el proyecto "${updated.name}"`
        : input.status === "ACTIVE" && before.status === "ARCHIVED"
          ? `restauró el proyecto "${updated.name}"`
          : `editó el proyecto "${updated.name}"`;
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "Project",
        entityId: projectId,
        action: "UPDATE",
        before: toProjectDto(before),
        after: dto,
        summary,
      },
    ];
    return { result: dto, audit };
  });
}

/** Elimina el proyecto y todo su contenido (cascada). */
export async function deleteProject(projectId: string): Promise<void> {
  await prisma.project.delete({ where: { id: projectId } });
}

/** Duplica un proyecto: calendarios, tareas, dependencias, recursos y asignaciones (sin líneas base). */
export async function duplicateProject(projectId: string, userId: string): Promise<ProjectDto> {
  return withAudit(async (tx) => {
    const source = await tx.project.findUnique({
      where: { id: projectId },
      include: {
        calendars: { include: { holidays: true } },
        tasks: true,
        dependencies: true,
        resources: true,
      },
    });
    if (!source) throw new ApiError("NOT_FOUND", "El proyecto no existe", { projectId });
    const assignments = await tx.assignment.findMany({ where: { task: { projectId } } });

    const copy = await tx.project.create({
      data: {
        name: `${source.name} (copia)`,
        description: source.description,
        startDate: source.startDate,
        statusDate: source.statusDate,
        progressWeighting: source.progressWeighting,
        createdById: userId,
        members: { create: { userId, role: "ADMIN" } },
      },
    });
    const calendarMap = new Map<string, string>();
    for (const c of source.calendars) {
      const created = await tx.calendar.create({
        data: {
          projectId: copy.id,
          name: c.name,
          isBase: c.isBase,
          workingDays: c.workingDays,
          hoursPerDay: c.hoursPerDay,
          holidays: { create: c.holidays.map((h) => ({ date: h.date, name: h.name })) },
        },
      });
      calendarMap.set(c.id, created.id);
    }
    const taskMap = new Map(source.tasks.map((t) => [t.id, crypto.randomUUID()]));
    await tx.task.createMany({
      data: source.tasks.map((t) => ({
        id: taskMap.get(t.id) as string,
        projectId: copy.id,
        parentId: t.parentId ? (taskMap.get(t.parentId) ?? null) : null,
        orderIndex: t.orderIndex,
        wbsCode: t.wbsCode,
        name: t.name,
        description: t.description,
        anchorDate: t.anchorDate,
        startDate: t.startDate,
        endDate: t.endDate,
        durationDays: t.durationDays,
        effortHours: t.effortHours,
        progressPct: t.progressPct,
        status: t.status,
        priority: t.priority,
        color: t.color,
        isMilestone: t.isMilestone,
        isSummary: t.isSummary,
        isCritical: t.isCritical,
        totalFloatDays: t.totalFloatDays,
        freeFloatDays: t.freeFloatDays,
        notes: t.notes,
        updatedById: userId,
      })),
    });
    await tx.dependency.createMany({
      data: source.dependencies.map((d) => ({
        projectId: copy.id,
        predecessorId: taskMap.get(d.predecessorId) as string,
        successorId: taskMap.get(d.successorId) as string,
        type: d.type,
        lagDays: d.lagDays,
      })),
    });
    const resourceMap = new Map<string, string>();
    for (const r of source.resources) {
      const created = await tx.resource.create({
        data: {
          projectId: copy.id,
          name: r.name,
          type: r.type,
          email: r.email,
          rate: r.rate,
          rateCurrency: r.rateCurrency,
          capacityHoursPerDay: r.capacityHoursPerDay,
          calendarId: r.calendarId ? (calendarMap.get(r.calendarId) ?? null) : null,
          color: r.color,
          isActive: r.isActive,
        },
      });
      resourceMap.set(r.id, created.id);
    }
    await tx.assignment.createMany({
      data: assignments.map((a) => ({
        taskId: taskMap.get(a.taskId) as string,
        resourceId: resourceMap.get(a.resourceId) as string,
        allocationPct: a.allocationPct,
      })),
    });
    const dto = toProjectDto(copy);
    const audit: AuditEntry[] = [
      {
        projectId: copy.id,
        userId,
        entityType: "Project",
        entityId: copy.id,
        action: "CREATE",
        after: dto,
        summary: `duplicó el proyecto "${source.name}"`,
      },
    ];
    return { result: dto, audit };
  });
}

/** Proyecto completo para la carga inicial del cliente. */
export async function getProjectFull(
  projectId: string,
  role: ProjectRole,
): Promise<ProjectFullDto> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      calendars: { include: { holidays: true }, orderBy: [{ isBase: "desc" }, { name: "asc" }] },
      tasks: true,
      dependencies: { orderBy: { createdAt: "asc" } },
      resources: { orderBy: { name: "asc" } },
      members: { include: { user: { select: { name: true, email: true } } } },
      baselines: {
        include: { _count: { select: { tasks: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) throw new ApiError("NOT_FOUND", "El proyecto no existe", { projectId });
  const assignments = await prisma.assignment.findMany({ where: { task: { projectId } } });
  const base = project.calendars.find((c) => c.isBase);
  if (!base) throw new ApiError("NOT_FOUND", "El proyecto no tiene calendario base", { projectId });
  const members: MemberDto[] = project.members.map((m) => ({
    id: m.id,
    userId: m.userId,
    role: m.role,
    name: m.user.name,
    email: m.user.email,
  }));
  return {
    project: toProjectDto(project),
    role,
    calendar: toCalendarDto(base),
    calendars: project.calendars.map(toCalendarDto),
    tasks: sortByWbs(project.tasks.map(toTaskDto)),
    dependencies: project.dependencies.map(toDependencyDto),
    resources: project.resources.map(toResourceDto),
    assignments: assignments.map(toAssignmentDto),
    members,
    baselines: project.baselines.map(toBaselineDto),
  };
}

function sortByWbs<T extends { wbsCode: string }>(tasks: T[]): T[] {
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
