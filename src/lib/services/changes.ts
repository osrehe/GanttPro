import { prisma } from "@/lib/db";
import { toAuditLogDto, type AuditLogDto } from "@/lib/dto";
import type { ChangesQuery } from "@/lib/schemas";

export interface ChangesPage {
  changes: AuditLogDto[];
  /** Marca de tiempo del último cambio devuelto (o la actual si no hay cambios): siguiente `since`. */
  cursor: string;
}

/**
 * Feed de cambios del proyecto sobre `AuditLog` (UC-34, UC-36): entradas posteriores a `since`, en
 * orden cronológico. El cliente hace polling con el `cursor` devuelto.
 */
export async function listChanges(projectId: string, query: ChangesQuery): Promise<ChangesPage> {
  const since = query.since ? new Date(query.since) : null;
  const rows = await prisma.auditLog.findMany({
    where: { projectId, ...(since ? { createdAt: { gt: since } } : {}) },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: query.limit ?? 200,
  });
  const last = rows[rows.length - 1];
  return {
    changes: rows.map(toAuditLogDto),
    cursor: (last ? last.createdAt : (since ?? new Date())).toISOString(),
  };
}
