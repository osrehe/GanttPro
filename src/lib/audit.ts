import { Prisma, type AuditAction } from "@prisma/client";
import { prisma } from "./db";

/** Cliente o transacción de Prisma sobre la que se escribe el registro. */
export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface AuditEntry {
  readonly projectId: string;
  readonly userId: string;
  readonly entityType:
    | "Project"
    | "Task"
    | "Dependency"
    | "Resource"
    | "Assignment"
    | "Baseline"
    | "Calendar"
    | "ProjectMember"
    | "Comment"
    | "ShareLink"
    | "Setting";
  readonly entityId: string;
  readonly action: AuditAction;
  /** Estado previo serializable (nulo en CREATE). */
  readonly before?: unknown;
  /** Estado posterior serializable (nulo en DELETE). */
  readonly after?: unknown;
  /** Texto en español para la UI: "movió la tarea 1.2 al 15-03-2026". */
  readonly summary: string;
  /** Agrupa las entradas de una misma operación (por ejemplo, un reschedule en cascada). */
  readonly operationId?: string;
}

/** Escribe una entrada de auditoría. Debe llamarse dentro de la misma transacción que la mutación. */
export async function recordAudit(db: DbClient, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      projectId: entry.projectId,
      userId: entry.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: toJson(entry.before),
      after: toJson(entry.after),
      summary: entry.summary,
      operationId: entry.operationId ?? null,
    },
  });
}

/**
 * Ejecuta una mutación dentro de una transacción y registra su auditoría con el mismo cliente.
 * `mutate` devuelve el resultado y las entradas a registrar (puede ser más de una por operación).
 */
export async function withAudit<T>(
  mutate: (tx: Prisma.TransactionClient) => Promise<{ result: T; audit: readonly AuditEntry[] }>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      const { result, audit } = await mutate(tx);
      for (const entry of audit) await recordAudit(tx, entry);
      return result;
    },
    // Un proyecto grande puede actualizar cientos de filas al reprogramar.
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/** Genera un identificador de operación para agrupar entradas relacionadas. */
export function newOperationId(): string {
  return crypto.randomUUID();
}

// Prisma distingue entre "sin valor" y JSON null; para auditoría usamos JSON null explícito.
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
