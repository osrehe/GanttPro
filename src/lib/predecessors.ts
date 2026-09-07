import type { DependencyType } from "@ganttpro/engine";
import type { DependencyDto, TaskDto } from "./dto";

/**
 * Texto de la columna Predecesoras (UC-10): lista separada por ";" de `{wbsCode}{type}{±lag}d`.
 * `FS` y lag 0 pueden omitirse: "3" equivale a "3FS+0d"; "3FS+2d; 5SS" son dos dependencias.
 */

export interface PredecessorRef {
  readonly wbsCode: string;
  readonly type: DependencyType;
  readonly lagDays: number;
}

const TOKEN_RE = /^(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)?\s*(?:([+-]\s*\d+)\s*d?)?$/i;

/** Formatea las predecesoras de una tarea. */
export function formatPredecessors(
  taskId: string,
  dependencies: readonly DependencyDto[],
  tasksById: ReadonlyMap<string, TaskDto>,
): string {
  return dependencies
    .filter((d) => d.successorId === taskId)
    .map((d) => {
      const code = tasksById.get(d.predecessorId)?.wbsCode ?? "?";
      const type = d.type === "FS" ? "" : d.type;
      const lag = d.lagDays === 0 ? "" : `${d.lagDays > 0 ? "+" : ""}${d.lagDays}d`;
      const suffix = type === "" && lag !== "" ? `FS${lag}` : `${type}${lag}`;
      return `${code}${suffix}`;
    })
    .sort((a, b) => compareWbs(a, b))
    .join("; ");
}

export class PredecessorParseError extends Error {
  constructor(
    message: string,
    readonly token: string,
  ) {
    super(message);
    this.name = "PredecessorParseError";
  }
}

/** Parsea el texto de predecesoras. Lanza `PredecessorParseError` con el token inválido. */
export function parsePredecessors(text: string): PredecessorRef[] {
  const refs: PredecessorRef[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[;,]/)) {
    const token = raw.trim();
    if (token === "") continue;
    const match = TOKEN_RE.exec(token);
    if (!match) {
      throw new PredecessorParseError(
        `"${token}" no es válido: usa el formato 3FS+2d (tipos FS, SS, FF, SF)`,
        token,
      );
    }
    const wbsCode = match[1] as string;
    if (seen.has(wbsCode)) {
      throw new PredecessorParseError(`La tarea ${wbsCode} aparece más de una vez`, token);
    }
    seen.add(wbsCode);
    refs.push({
      wbsCode,
      type: ((match[2] ?? "FS").toUpperCase() as DependencyType) ?? "FS",
      lagDays: match[3] ? Number(match[3].replace(/\s+/g, "")) : 0,
    });
  }
  return refs;
}

export interface PredecessorDiff {
  readonly create: Array<{ predecessorId: string; type: DependencyType; lagDays: number }>;
  readonly update: Array<{ dependencyId: string; type: DependencyType; lagDays: number }>;
  readonly remove: string[];
}

/**
 * Calcula qué dependencias crear, actualizar o eliminar para que las predecesoras de `taskId`
 * coincidan con `refs`. Lanza `PredecessorParseError` si un código WBS no existe o es la propia tarea.
 */
export function diffPredecessors(
  taskId: string,
  refs: readonly PredecessorRef[],
  dependencies: readonly DependencyDto[],
  tasks: readonly TaskDto[],
): PredecessorDiff {
  const byCode = new Map(tasks.map((t) => [t.wbsCode, t]));
  const current = dependencies.filter((d) => d.successorId === taskId);
  const currentByPred = new Map(current.map((d) => [d.predecessorId, d]));
  const diff: PredecessorDiff = { create: [], update: [], remove: [] };
  const keep = new Set<string>();
  for (const ref of refs) {
    const pred = byCode.get(ref.wbsCode);
    if (!pred) throw new PredecessorParseError(`No existe la tarea ${ref.wbsCode}`, ref.wbsCode);
    if (pred.id === taskId) {
      throw new PredecessorParseError("Una tarea no puede depender de sí misma", ref.wbsCode);
    }
    if (pred.isSummary) {
      throw new PredecessorParseError(
        `La tarea ${ref.wbsCode} es un resumen y no admite dependencias`,
        ref.wbsCode,
      );
    }
    keep.add(pred.id);
    const existing = currentByPred.get(pred.id);
    if (!existing) {
      diff.create.push({ predecessorId: pred.id, type: ref.type, lagDays: ref.lagDays });
    } else if (existing.type !== ref.type || existing.lagDays !== ref.lagDays) {
      diff.update.push({ dependencyId: existing.id, type: ref.type, lagDays: ref.lagDays });
    }
  }
  for (const d of current) if (!keep.has(d.predecessorId)) diff.remove.push(d.id);
  return diff;
}

function compareWbs(a: string, b: string): number {
  const key = (s: string): number[] =>
    (s.match(/^\d+(?:\.\d+)*/)?.[0] ?? "0").split(".").map(Number);
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
