import type { AuditLogDto } from "@/lib/dto";

/**
 * Resumen en español de un lote de cambios ajenos para el aviso de colaboración (UC-34).
 * Los cambios propios se descartan: el usuario ya los vio de forma optimista.
 */

export interface ChangesSummary {
  /** Texto del aviso; nulo si no hay nada ajeno que informar. */
  readonly message: string | null;
  /** Cambios ajenos considerados. */
  readonly count: number;
  /** Nombres de los autores, en orden de aparición. */
  readonly authors: string[];
}

/**
 * Entidades cuyo cambio obliga a recargar el proyecto. Un comentario ajeno se avisa, pero no
 * cambia el plan: recargar todo por él costaba una consulta completa y volver a dibujar la tabla.
 */
const ENTITIES_THAT_CHANGE_THE_PLAN = new Set([
  "Task",
  "Dependency",
  "Resource",
  "Assignment",
  "Project",
  "Calendar",
  "Baseline",
  "ProjectMember",
]);

/** `true` si alguno de los cambios ajenos afecta a los datos que muestran las vistas del plan. */
export function needsProjectReload(
  changes: readonly AuditLogDto[],
  currentUserId: string | null,
): boolean {
  return changes.some(
    (c) => c.userId !== currentUserId && ENTITIES_THAT_CHANGE_THE_PLAN.has(c.entityType),
  );
}

/** Hasta este número de cambios se listan uno a uno; por encima se agrupan. */
export const MAX_DETAILED_CHANGES = 3;

export function summarizeChanges(
  changes: readonly AuditLogDto[],
  currentUserId: string | null,
): ChangesSummary {
  const others = changes.filter((c) => c.userId !== currentUserId);
  const authors: string[] = [];
  for (const change of others)
    if (!authors.includes(change.userName)) authors.push(change.userName);
  if (others.length === 0) return { message: null, count: 0, authors };

  if (others.length <= MAX_DETAILED_CHANGES) {
    const message = others.map((c) => `${c.userName} ${c.summary}`).join(" · ");
    return { message, count: others.length, authors };
  }

  const first = authors[0] ?? "Alguien";
  const rest = authors.length - 1;
  const who =
    rest === 0
      ? first
      : rest === 1
        ? `${first} y 1 persona más`
        : `${first} y ${rest} personas más`;
  const verb = rest === 0 ? "hizo" : "hicieron";
  return {
    message: `${who} ${verb} ${others.length} cambios`,
    count: others.length,
    authors,
  };
}
