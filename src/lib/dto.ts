import type {
  Assignment,
  AuditLog,
  Baseline,
  BaselineTask,
  Calendar,
  Dependency,
  Holiday,
  Project,
  ProjectMember,
  Resource,
  Task,
} from "@prisma/client";
import { fromDbDate, fromDbDateOrNull } from "./dates";

/**
 * DTOs que viajan por la API: fechas de plan como `YYYY-MM-DD`, decimales como number,
 * marcas de tiempo como ISO 8601. Son la forma que consume el store del cliente.
 */

export interface TaskDto {
  id: string;
  projectId: string;
  parentId: string | null;
  orderIndex: number;
  wbsCode: string;
  name: string;
  description: string | null;
  anchorDate: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  effortHours: number | null;
  progressPct: number;
  status: Task["status"];
  priority: Task["priority"];
  color: string | null;
  isMilestone: boolean;
  isSummary: boolean;
  isCritical: boolean;
  totalFloatDays: number | null;
  freeFloatDays: number | null;
  notes: string | null;
  updatedAt: string;
  updatedById: string | null;
}

export function toTaskDto(t: Task): TaskDto {
  return {
    id: t.id,
    projectId: t.projectId,
    parentId: t.parentId,
    orderIndex: t.orderIndex,
    wbsCode: t.wbsCode,
    name: t.name,
    description: t.description,
    anchorDate: fromDbDateOrNull(t.anchorDate),
    startDate: fromDbDate(t.startDate),
    endDate: fromDbDate(t.endDate),
    durationDays: t.durationDays,
    effortHours: t.effortHours === null ? null : Number(t.effortHours),
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
    updatedAt: t.updatedAt.toISOString(),
    updatedById: t.updatedById,
  };
}

export interface DependencyDto {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: Dependency["type"];
  lagDays: number;
}

export function toDependencyDto(d: Dependency): DependencyDto {
  return {
    id: d.id,
    projectId: d.projectId,
    predecessorId: d.predecessorId,
    successorId: d.successorId,
    type: d.type,
    lagDays: d.lagDays,
  };
}

export interface HolidayDto {
  date: string;
  name: string;
}

export interface CalendarDto {
  id: string;
  projectId: string;
  name: string;
  isBase: boolean;
  workingDays: number[];
  hoursPerDay: number;
  holidays: HolidayDto[];
}

export function toCalendarDto(c: Calendar & { holidays: Holiday[] }): CalendarDto {
  return {
    id: c.id,
    projectId: c.projectId,
    name: c.name,
    isBase: c.isBase,
    workingDays: c.workingDays,
    hoursPerDay: Number(c.hoursPerDay),
    holidays: [...c.holidays]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((h) => ({ date: fromDbDate(h.date), name: h.name })),
  };
}

export interface ResourceDto {
  id: string;
  projectId: string;
  name: string;
  type: Resource["type"];
  email: string | null;
  rate: number;
  rateCurrency: Resource["rateCurrency"];
  capacityHoursPerDay: number;
  calendarId: string | null;
  color: string | null;
  isActive: boolean;
}

export function toResourceDto(r: Resource): ResourceDto {
  return {
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    type: r.type,
    email: r.email,
    rate: Number(r.rate),
    rateCurrency: r.rateCurrency,
    capacityHoursPerDay: Number(r.capacityHoursPerDay),
    calendarId: r.calendarId,
    color: r.color,
    isActive: r.isActive,
  };
}

export interface AssignmentDto {
  id: string;
  taskId: string;
  resourceId: string;
  allocationPct: number;
}

export function toAssignmentDto(a: Assignment): AssignmentDto {
  return { id: a.id, taskId: a.taskId, resourceId: a.resourceId, allocationPct: a.allocationPct };
}

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: Project["status"];
  startDate: string;
  statusDate: string | null;
  progressWeighting: Project["progressWeighting"];
  createdById: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toProjectDto(p: Project): ProjectDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    startDate: fromDbDate(p.startDate),
    statusDate: fromDbDateOrNull(p.statusDate),
    progressWeighting: p.progressWeighting,
    createdById: p.createdById,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Tarjeta de la lista de proyectos: resumen calculado a partir de las hojas. */
export interface ProjectSummaryDto extends ProjectDto {
  role: ProjectMember["role"];
  taskCount: number;
  leafCount: number;
  progressPct: number;
  planStart: string | null;
  planEnd: string | null;
}

export interface MemberDto {
  id: string;
  userId: string;
  role: ProjectMember["role"];
  name: string;
  email: string;
}

export interface BaselineDto {
  id: string;
  projectId: string;
  name: string;
  createdById: string;
  createdAt: string;
  taskCount: number;
}

export function toBaselineDto(b: Baseline & { _count?: { tasks: number } }): BaselineDto {
  return {
    id: b.id,
    projectId: b.projectId,
    name: b.name,
    createdById: b.createdById,
    createdAt: b.createdAt.toISOString(),
    taskCount: b._count?.tasks ?? 0,
  };
}

export interface BaselineTaskDto {
  taskId: string;
  wbsCode: string;
  name: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  progressPct: number;
}

export function toBaselineTaskDto(t: BaselineTask): BaselineTaskDto {
  return {
    taskId: t.taskId,
    wbsCode: t.wbsCode,
    name: t.name,
    startDate: fromDbDate(t.startDate),
    endDate: fromDbDate(t.endDate),
    durationDays: t.durationDays,
    progressPct: t.progressPct,
  };
}

export interface AuditLogDto {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  entityType: string;
  entityId: string;
  action: AuditLog["action"];
  before: unknown;
  after: unknown;
  summary: string;
  operationId: string | null;
  createdAt: string;
}

export function toAuditLogDto(a: AuditLog & { user: { name: string } }): AuditLogDto {
  return {
    id: a.id,
    projectId: a.projectId,
    userId: a.userId,
    userName: a.user.name,
    entityType: a.entityType,
    entityId: a.entityId,
    action: a.action,
    before: a.before,
    after: a.after,
    summary: a.summary,
    operationId: a.operationId,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Proyecto completo para la carga inicial del cliente (`GET /api/projects/:id/full`). */
export interface ProjectFullDto {
  project: ProjectDto;
  role: ProjectMember["role"];
  calendar: CalendarDto;
  calendars: CalendarDto[];
  tasks: TaskDto[];
  dependencies: DependencyDto[];
  resources: ResourceDto[];
  assignments: AssignmentDto[];
  members: MemberDto[];
  baselines: BaselineDto[];
}

/** Respuesta de las mutaciones de tareas: la tarea afectada directamente y todas las demás que cambiaron. */
export interface TaskMutationResult {
  task: TaskDto | null;
  affected: TaskDto[];
  /** Ids eliminados (solo en DELETE). */
  deletedIds?: string[];
}
