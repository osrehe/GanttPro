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
  const createdAt: { gt?: Date; gte?: Date; lte?: Date } = {};
  if (since) createdAt.gt = since;
  if (query.from) createdAt.gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) createdAt.lte = new Date(`${query.to}T23:59:59.999Z`);
  const rows = await prisma.auditLog.findMany({
    where: {
      projectId,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: query.order ?? "asc" },
    take: query.limit ?? 200,
  });
  const newest = rows.reduce<Date | null>(
    (max, r) => (max === null || r.createdAt > max ? r.createdAt : max),
    null,
  );
  return {
    changes: rows.map(toAuditLogDto),
    cursor: (newest ?? since ?? new Date()).toISOString(),
  };
}
