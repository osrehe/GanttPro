import type { ProjectRole } from "@prisma/client";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError } from "./response";

const ROLE_RANK: Readonly<Record<ProjectRole, number>> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Usuario autenticado de la petición (401 si no hay sesión). */
export async function requireUser(): Promise<SessionUser> {
  return getSessionUser();
}

export interface ProjectAccess {
  readonly user: SessionUser;
  readonly projectId: string;
  readonly role: ProjectRole;
}

/**
 * Verifica que el usuario pertenece al proyecto con al menos el rol indicado.
 * Sin pertenencia responde 403 (no se revela si el proyecto existe). Un proyecto archivado
 * solo admite lectura.
 */
export async function requireProjectAccess(
  projectId: string,
  minRole: ProjectRole = "VIEWER",
  options: { allowArchived?: boolean } = {},
): Promise<ProjectAccess> {
  const user = await requireUser();
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    include: { project: { select: { status: true } } },
  });
  if (!member) throw new ApiError("FORBIDDEN", "No tienes acceso a este proyecto", { projectId });
  if (ROLE_RANK[member.role] < ROLE_RANK[minRole]) {
    throw new ApiError("FORBIDDEN", `Se requiere rol ${roleLabel(minRole)} en este proyecto`, {
      projectId,
      role: member.role,
      required: minRole,
    });
  }
  if (minRole !== "VIEWER" && member.project.status === "ARCHIVED" && !options.allowArchived) {
    throw new ApiError("VALIDATION", "El proyecto está archivado y es de solo lectura", {
      projectId,
    });
  }
  return { user, projectId, role: member.role };
}

/** Resuelve el proyecto de una tarea y verifica el acceso. 404 si la tarea no existe. */
export async function requireTaskAccess(
  taskId: string,
  minRole: ProjectRole = "VIEWER",
): Promise<ProjectAccess & { taskId: string }> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) throw new ApiError("NOT_FOUND", "La tarea no existe", { taskId });
  const access = await requireProjectAccess(task.projectId, minRole);
  return { ...access, taskId };
}

export function roleLabel(role: ProjectRole): string {
  return role === "ADMIN" ? "administrador" : role === "EDITOR" ? "editor" : "lector";
}
