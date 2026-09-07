import type { ShareLink } from "@prisma/client";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { formatDateCl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toShareLinkDto, type ShareLinkDto } from "@/lib/dto";
import type { CreateShareLinkInput } from "@/lib/schemas";

/**
 * Enlaces de solo lectura (UC-33). El token viaja en la ruta pública `/share/<token>`; se puede
 * revocar en cualquier momento y opcionalmente vence al terminar la fecha indicada.
 */

/** Token de 32 caracteres hexadecimales. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Un enlace con vencimiento sigue activo durante todo ese día: se guarda el último instante
 * (23:59:59.999 UTC) para que `fromDbDate` devuelva la misma fecha que eligió el usuario.
 */
function expiryInstant(iso: string): Date {
  return new Date(`${iso}T23:59:59.999Z`);
}

export async function listShareLinks(projectId: string): Promise<ShareLinkDto[]> {
  const rows = await prisma.shareLink.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  return rows.map((link) => toShareLinkDto(link, now));
}

/** Proyecto al que pertenece un enlace (para verificar el acceso en las rutas). */
export async function shareLinkProjectId(id: string): Promise<string> {
  const row = await prisma.shareLink.findUnique({ where: { id }, select: { projectId: true } });
  if (!row) throw new ApiError("NOT_FOUND", "El enlace no existe", { id });
  return row.projectId;
}

export async function createShareLink(
  projectId: string,
  userId: string,
  input: CreateShareLinkInput,
): Promise<ShareLinkDto> {
  return withAudit(async (tx) => {
    const link = await tx.shareLink.create({
      data: {
        projectId,
        token: newToken(),
        createdById: userId,
        expiresAt: input.expiresAt ? expiryInstant(input.expiresAt) : null,
      },
    });
    const dto = toShareLinkDto(link);
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "ShareLink",
        entityId: link.id,
        action: "CREATE",
        after: { id: dto.id, expiresAt: dto.expiresAt },
        summary: input.expiresAt
          ? `creó un enlace de solo lectura que vence el ${formatDateCl(input.expiresAt)}`
          : "creó un enlace de solo lectura sin vencimiento",
      },
    ];
    return { result: dto, audit };
  });
}

export async function revokeShareLink(id: string, userId: string): Promise<ShareLinkDto> {
  return withAudit(async (tx) => {
    const link = await tx.shareLink.findUnique({ where: { id } });
    if (!link) throw new ApiError("NOT_FOUND", "El enlace no existe", { id });
    const revoked =
      link.revokedAt !== null
        ? link
        : await tx.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
    const dto = toShareLinkDto(revoked);
    const audit: AuditEntry[] =
      link.revokedAt !== null
        ? []
        : [
            {
              projectId: link.projectId,
              userId,
              entityType: "ShareLink",
              entityId: link.id,
              action: "DELETE",
              before: { id: dto.id, expiresAt: dto.expiresAt },
              summary: "revocó un enlace de solo lectura",
            },
          ];
    return { result: dto, audit };
  });
}

/** Resuelve un token público. Devuelve `null` si no existe, está revocado o venció. */
export async function resolveShareToken(
  token: string,
): Promise<{ projectId: string; link: ShareLink } | null> {
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link || link.revokedAt !== null) return null;
  if (link.expiresAt !== null && link.expiresAt.getTime() <= Date.now()) return null;
  return { projectId: link.projectId, link };
}
