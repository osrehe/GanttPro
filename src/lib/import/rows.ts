import { createCalendar, detectCycle, isIsoDate } from "@ganttpro/engine";
import { parsePredecessors, PredecessorParseError, type PredecessorRef } from "@/lib/predecessors";
import type { ColumnKey } from "./columns";
import type {
  ImportCounts,
  ImportedPlan,
  ImportedTask,
  ImportIssue,
  ImportPreview,
  ImportSource,
} from "./types";

/** Valor crudo de una celda tal como lo entregan exceljs o el parser CSV. */
export type CellValue = string | number | Date | boolean | null | undefined;

export interface RawRow {
  /** Número de fila en el archivo (1 = primera fila; los encabezados suelen ser la 1). */
  row: number;
  cells: Partial<Record<ColumnKey, CellValue>>;
}

export interface RowsToPlanOptions {
  projectName?: string | null;
  startDate?: string | null;
  resources?: ImportedPlan["resources"];
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/** Calendario lunes a viernes sin feriados para deducir duraciones a partir de Inicio y Fin. */
const WEEKDAY_CALENDAR = createCalendar({
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  holidays: [],
});

function isBlank(value: CellValue): boolean {
  return (
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  );
}

function asText(value: CellValue): string {
  if (isBlank(value)) return "";
  if (value instanceof Date) return parseDateCell(value) ?? "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value).trim();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Convierte una celda de fecha a `YYYY-MM-DD`. Acepta `Date`, seriales de Excel y textos
 * `aaaa-mm-dd`, `dd-mm-aaaa`, `dd/mm/aaaa`, `dd.mm.aaaa`. Devuelve `null` si no se reconoce.
 */
export function parseDateCell(value: CellValue): string | null {
  if (isBlank(value)) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // exceljs entrega medianoche UTC; si viene con hora local, usamos los componentes locales.
    const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0;
    return utcMidnight
      ? value.toISOString().slice(0, 10)
      : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 20000 || value > 80000) return null;
    return new Date(EXCEL_EPOCH_MS + Math.round(value) * 86_400_000).toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (match) return checkDate(match[1] as string, match[2] as string, match[3] as string);
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (match) return checkDate(match[3] as string, match[2] as string, match[1] as string);
  return null;
}

function checkDate(y: string, m: string, d: string): string | null {
  const iso = `${y}-${pad(Number(m))}-${pad(Number(d))}`;
  return isIsoDate(iso) ? iso : null;
}

/** Interpreta Sí/No, true/false, 1/0, x. `null` si el texto no se reconoce. */
export function parseBooleanCell(value: CellValue): boolean | null {
  if (isBlank(value)) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (["si", "sí", "s", "yes", "y", "true", "verdadero", "1", "x", "✓"].includes(text)) return true;
  if (["no", "n", "false", "falso", "0", "-"].includes(text)) return false;
  return null;
}

function parseNumberCell(value: CellValue): number | null {
  if (isBlank(value)) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return null;
  const text = String(value)
    .trim()
    .replace(/%$/, "")
    .replace(/\s*(d|dias|días|h)$/i, "")
    .replace(",", ".")
    .trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function splitList(value: CellValue): string[] {
  const text = asText(value);
  if (text === "") return [];
  return text
    .split(/[;,\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function wbsDepth(wbs: string): number {
  return wbs.split(".").length;
}

/**
 * Convierte filas crudas en un plan validado. La jerarquía sale de la columna WBS; si está vacía en
 * todas las filas, de la columna Nivel; si tampoco existe, todas las tareas son de primer nivel.
 */
export function rowsToPlan(
  rows: readonly RawRow[],
  source: ImportSource,
  options: RowsToPlanOptions = {},
): ImportPreview {
  const issues: ImportIssue[] = [];
  const dataRows = rows.filter((r) => Object.values(r.cells).some((v) => !isBlank(v)));
  const hasWbs = dataRows.some((r) => !isBlank(r.cells.wbs));
  const hasLevel = dataRows.some((r) => !isBlank(r.cells.level));
  const counters: number[] = [];
  const tasks: ImportedTask[] = [];

  for (const r of dataRows) {
    const c = r.cells;
    const push = (
      column: string | null,
      message: string,
      severity: "error" | "warning" = "error",
    ) => issues.push({ row: r.row, column, severity, message });

    // Jerarquía
    let wbs = "";
    if (hasWbs) {
      wbs = asText(c.wbs).replace(/\.+$/, "");
      if (typeof c.wbs === "number") wbs = String(c.wbs);
      if (!/^\d+(?:\.\d+)*$/.test(wbs)) {
        push("WBS", wbs === "" ? "Falta el código WBS" : `El código WBS "${wbs}" no es válido`);
      }
    } else {
      let level = 1;
      if (hasLevel) {
        const parsed = parseNumberCell(c.level);
        if (parsed === null || parsed < 1 || !Number.isInteger(parsed)) {
          push("Nivel", `El nivel "${asText(c.level)}" no es válido (entero desde 1)`);
        } else {
          level = parsed;
        }
      }
      if (level > counters.length + 1) {
        push(
          "Nivel",
          `El nivel ${level} salta niveles (la fila anterior era de nivel ${counters.length})`,
        );
        level = counters.length + 1;
      }
      counters.length = level;
      counters[level - 1] = (counters[level - 1] ?? 0) + 1;
      wbs = counters.join(".");
    }

    // Nombre
    const name = asText(c.name);
    // El nombre vacío lo reporta validatePlan (también para planes enviados por el cliente).

    // Hito
    let isMilestone = false;
    const milestone = parseBooleanCell(c.milestone);
    if (milestone === null) {
      push("Hito", `"${asText(c.milestone)}" no se reconoce: usa Sí o No`);
    } else {
      isMilestone = milestone;
    }

    // Duración
    let durationDays = isMilestone ? 0 : 1;
    if (!isBlank(c.duration)) {
      const parsed = parseNumberCell(c.duration);
      if (parsed === null || parsed < 0) {
        push(
          "Duración (días)",
          `La duración "${asText(c.duration)}" no es válida (días hábiles ≥ 0)`,
        );
      } else if (isMilestone) {
        if (parsed !== 0)
          push("Duración (días)", "Un hito dura 0 días; se ignora la duración", "warning");
      } else {
        durationDays = Math.round(parsed);
        if (durationDays !== parsed) {
          push(
            "Duración (días)",
            `La duración ${parsed} se redondea a ${durationDays} días`,
            "warning",
          );
        }
      }
    }

    // Inicio
    let startDate: string | null = null;
    if (!isBlank(c.start)) {
      startDate = parseDateCell(c.start);
      if (startDate === null) {
        push("Inicio", `La fecha "${asText(c.start)}" no es válida (usa dd-mm-aaaa o aaaa-mm-dd)`);
      }
    }

    // Fin (UC-29): solo se usa para deducir la duración cuando la celda Duración viene vacía.
    if (!isBlank(c.end)) {
      const endDate = parseDateCell(c.end);
      if (endDate === null) {
        push("Fin", `La fecha "${asText(c.end)}" no es válida (usa dd-mm-aaaa o aaaa-mm-dd)`);
      } else if (startDate !== null && endDate < startDate) {
        push("Fin", `La fecha de fin ${endDate} es anterior al inicio ${startDate}`);
      } else if (isBlank(c.duration) && !isMilestone) {
        if (startDate === null) {
          push("Fin", "Para usar Fin sin Duración la fila necesita también la fecha de Inicio");
        } else {
          // En el parseo aún no se conoce el calendario del proyecto: se cuenta lunes a viernes
          // sin feriados. La reprogramación posterior usa el calendario real.
          durationDays = Math.max(1, WEEKDAY_CALENDAR.countWorkingDays(startDate, endDate));
        }
      }
    }

    // Avance
    let progressPct = 0;
    if (!isBlank(c.progress)) {
      let parsed = parseNumberCell(c.progress);
      if (parsed !== null && typeof c.progress === "number" && parsed > 0 && parsed < 1)
        parsed *= 100;
      if (parsed === null || parsed < 0 || parsed > 100) {
        push("Avance %", `El avance "${asText(c.progress)}" no es válido (0 a 100)`);
      } else {
        progressPct = Math.round(parsed);
      }
    }

    tasks.push({
      row: r.row,
      wbs,
      level: wbs === "" ? 1 : wbsDepth(wbs),
      name,
      durationDays,
      startDate,
      isMilestone,
      progressPct,
      predecessors: asText(c.predecessors),
      resources: splitList(c.resources),
      notes: asText(c.notes) || null,
    });
  }

  const plan: ImportedPlan = {
    source,
    projectName: options.projectName?.trim() || null,
    startDate: options.startDate ?? null,
    tasks,
    resources: options.resources ?? [],
  };
  const validated = validatePlan(plan);
  return finish(plan, [...issues, ...validated.issues], validated.counts);
}

/**
 * Valida un plan ya construido (lo usan los parsers y el servidor antes de escribir): estructura
 * WBS, campos, predecesoras (sintaxis, existencia, resúmenes, ciclos) y recursos.
 */
export function validatePlan(plan: ImportedPlan): ImportPreview {
  const issues: ImportIssue[] = [];
  const byWbs = new Map<string, ImportedTask>();
  const seen = new Set<string>();

  for (const t of plan.tasks) {
    if (!/^\d+(?:\.\d+)*$/.test(t.wbs)) continue; // ya reportado por el parser
    if (seen.has(t.wbs)) {
      issues.push({
        row: t.row,
        column: "WBS",
        severity: "error",
        message: `El código WBS ${t.wbs} está repetido`,
      });
    } else {
      seen.add(t.wbs);
      byWbs.set(t.wbs, t);
    }
  }
  const parents = new Set<string>();
  for (const t of byWbs.values()) {
    const parentCode = t.wbs.includes(".") ? t.wbs.slice(0, t.wbs.lastIndexOf(".")) : null;
    if (parentCode !== null) {
      if (!byWbs.has(parentCode)) {
        issues.push({
          row: t.row,
          column: "WBS",
          severity: "error",
          message: `La tarea ${t.wbs} no tiene padre: falta la fila con WBS ${parentCode}`,
        });
      } else {
        parents.add(parentCode);
      }
    }
  }

  const edges: Array<{ predecessorId: string; successorId: string }> = [];
  let dependencies = 0;
  let assignments = 0;
  const declared = new Map(plan.resources.map((r) => [r.name.trim().toLowerCase(), r.name]));
  const referenced = new Map<string, string>();
  const undeclaredWarned = new Set<string>();

  for (const t of plan.tasks) {
    const isSummary = parents.has(t.wbs);
    if (t.name.trim() === "") {
      issues.push({
        row: t.row,
        column: "Nombre",
        severity: "error",
        message: "El nombre es obligatorio",
      });
    }
    if (!Number.isInteger(t.durationDays) || t.durationDays < 0 || t.durationDays > 3650) {
      issues.push({
        row: t.row,
        column: "Duración (días)",
        severity: "error",
        message: "Duración fuera de rango (0 a 3650 días)",
      });
    }
    if (!Number.isInteger(t.progressPct) || t.progressPct < 0 || t.progressPct > 100) {
      issues.push({
        row: t.row,
        column: "Avance %",
        severity: "error",
        message: "Avance fuera de rango (0 a 100)",
      });
    }
    if (t.startDate !== null && !isIsoDate(t.startDate)) {
      issues.push({
        row: t.row,
        column: "Inicio",
        severity: "error",
        message: "Fecha de inicio inválida",
      });
    }
    if (isSummary && t.progressPct > 0) {
      issues.push({
        row: t.row,
        column: "Avance %",
        severity: "warning",
        message: `La tarea ${t.wbs} es un resumen: su avance se calcula desde las subtareas y se ignora`,
      });
    }
    if (isSummary && t.isMilestone) {
      issues.push({
        row: t.row,
        column: "Hito",
        severity: "error",
        message: `La tarea ${t.wbs} tiene subtareas y no puede ser hito`,
      });
    }

    let refs: PredecessorRef[] = [];
    if (t.predecessors.trim() !== "") {
      try {
        refs = parsePredecessors(t.predecessors);
      } catch (error) {
        const message =
          error instanceof PredecessorParseError ? error.message : "Predecesoras inválidas";
        issues.push({ row: t.row, column: "Predecesoras", severity: "error", message });
      }
    }
    for (const ref of refs) {
      const pred = byWbs.get(ref.wbsCode);
      if (!pred) {
        issues.push({
          row: t.row,
          column: "Predecesoras",
          severity: "error",
          message: `No existe la tarea ${ref.wbsCode} indicada como predecesora`,
        });
        continue;
      }
      if (pred.wbs === t.wbs) {
        issues.push({
          row: t.row,
          column: "Predecesoras",
          severity: "error",
          message: "Una tarea no puede depender de sí misma",
        });
        continue;
      }
      if (parents.has(pred.wbs)) {
        issues.push({
          row: t.row,
          column: "Predecesoras",
          severity: "error",
          message: `La tarea ${pred.wbs} es un resumen y no admite dependencias`,
        });
        continue;
      }
      if (isSummary) {
        issues.push({
          row: t.row,
          column: "Predecesoras",
          severity: "error",
          message: `La tarea ${t.wbs} es un resumen y no admite dependencias`,
        });
        continue;
      }
      edges.push({ predecessorId: pred.wbs, successorId: t.wbs });
      dependencies++;
    }

    for (const name of t.resources) {
      const key = name.trim().toLowerCase();
      if (key === "") continue;
      assignments++;
      if (!referenced.has(key)) referenced.set(key, name.trim());
      if (!declared.has(key) && !undeclaredWarned.has(key)) {
        undeclaredWarned.add(key);
        issues.push({
          row: t.row,
          column: "Recursos",
          severity: "warning",
          message: `El recurso "${name.trim()}" no está declarado: se creará como persona con tarifa 0`,
        });
      }
    }
  }

  const cycle = detectCycle(edges);
  if (cycle) {
    const first = byWbs.get(cycle[0] ?? "");
    issues.push({
      row: first?.row ?? null,
      column: "Predecesoras",
      severity: "error",
      message: `Las predecesoras forman un ciclo: ${cycle.join(" → ")}`,
    });
  }

  const resourceNames = new Set([...declared.keys(), ...referenced.keys()]);
  return finish(plan, issues, {
    tasks: plan.tasks.length,
    dependencies,
    resources: resourceNames.size,
    assignments,
    errors: 0,
    warnings: 0,
  });
}

function finish(plan: ImportedPlan, issues: ImportIssue[], counts: ImportCounts): ImportPreview {
  const sorted = [...issues].sort((a, b) => (a.row ?? Infinity) - (b.row ?? Infinity));
  return {
    plan,
    issues: sorted,
    counts: {
      ...counts,
      errors: sorted.filter((i) => i.severity === "error").length,
      warnings: sorted.filter((i) => i.severity === "warning").length,
    },
  };
}
