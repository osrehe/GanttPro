import { XMLParser } from "fast-xml-parser";
import { parseDateCell, validatePlan } from "./rows";
import type { ImportedPlan, ImportedResource, ImportedTask, ImportPreview } from "./types";

/**
 * Importación de MS Project XML (MSPDI, UC-30). Se leen tareas con su nivel de esquema,
 * duraciones (PTnHnMnS → días hábiles), hitos, avance, notas, vínculos de predecesoras con tipo y
 * desfase, recursos y asignaciones. Los campos que GanttPro calcula (fechas de resúmenes, ruta
 * crítica) se ignoran: el engine los reprograma al importar.
 */

interface XmlPredecessorLink {
  PredecessorUID?: number | string;
  Type?: number | string;
  LinkLag?: number | string;
  LagFormat?: number | string;
}

interface XmlTask {
  UID?: number | string;
  ID?: number | string;
  Name?: string | number;
  OutlineNumber?: string | number;
  OutlineLevel?: number | string;
  Duration?: string;
  Start?: string;
  ConstraintType?: number | string;
  ConstraintDate?: string;
  Milestone?: number | string;
  Summary?: number | string;
  PercentComplete?: number | string;
  Notes?: string | number;
  IsNull?: number | string;
  PredecessorLink?: XmlPredecessorLink[];
}

interface XmlResource {
  UID?: number | string;
  Name?: string | number;
  Type?: number | string;
  StandardRate?: number | string;
  MaxUnits?: number | string;
  IsNull?: number | string;
}

interface XmlAssignment {
  TaskUID?: number | string;
  ResourceUID?: number | string;
  Units?: number | string;
}

interface XmlProject {
  Name?: string | number;
  Title?: string | number;
  StartDate?: string;
  MinutesPerDay?: number | string;
  Tasks?: { Task?: XmlTask[] };
  Resources?: { Resource?: XmlResource[] };
  Assignments?: { Assignment?: XmlAssignment[] };
}

const ARRAY_PATHS = new Set([
  "Project.Tasks.Task",
  "Project.Resources.Resource",
  "Project.Assignments.Assignment",
  "Project.Tasks.Task.PredecessorLink",
]);

/** Tipos de vínculo MSPDI: 0 = FF, 1 = FS, 2 = SF, 3 = SS. */
const LINK_TYPES: Readonly<Record<number, "FF" | "FS" | "SF" | "SS">> = {
  0: "FF",
  1: "FS",
  2: "SF",
  3: "SS",
};

function num(value: number | string | undefined, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: string | number | undefined): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

/** `PT40H0M0S` → horas. Devuelve 0 si el formato no se reconoce. */
export function parseMspdiDurationHours(duration: string | undefined): number {
  if (!duration) return 0;
  const match = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(
    duration.trim(),
  );
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours + minutes / 60 + seconds / 3600;
}

/**
 * Desfase de un vínculo en días hábiles. `LinkLag` viene en décimas de minuto; con `LagFormat`
 * 7/39 (días) o cualquier otro se convierte con las horas por día del proyecto.
 */
export function linkLagDays(lag: number, minutesPerDay: number): number {
  if (lag === 0) return 0;
  const minutes = lag / 10;
  return Math.round(minutes / minutesPerDay);
}

/** MS Project XML → previsualización de importación. */
export function mspdiToPreview(xml: string): ImportPreview {
  const parser = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: true,
    trimValues: true,
    isArray: (_name, jpath) => ARRAY_PATHS.has(String(jpath)),
  });
  let root: { Project?: XmlProject };
  try {
    root = parser.parse(xml) as { Project?: XmlProject };
  } catch {
    return failure("El archivo no es un XML válido");
  }
  const project = root.Project;
  if (!project || !project.Tasks) {
    return failure("El XML no tiene la estructura de MS Project (falta <Project> con <Tasks>)");
  }

  const minutesPerDay = num(project.MinutesPerDay, 480) || 480;
  const hoursPerDay = minutesPerDay / 60;
  const xmlTasks = (project.Tasks.Task ?? []).filter(
    (t) => num(t.IsNull) !== 1 && text(t.Name) !== "" && num(t.OutlineLevel, 1) >= 1,
  );

  // Códigos WBS: OutlineNumber si existe; si no, se reconstruye desde OutlineLevel.
  const counters: number[] = [];
  const wbsByUid = new Map<string, string>();
  const tasksByUid = new Map<string, XmlTask>();
  const prepared: Array<{ task: XmlTask; wbs: string; level: number }> = [];
  for (const t of xmlTasks) {
    const level = Math.max(1, num(t.OutlineLevel, 1));
    let wbs = text(t.OutlineNumber);
    if (!/^\d+(?:\.\d+)*$/.test(wbs) || wbs.split(".").length !== level) {
      if (level > counters.length + 1) counters.length = level - 1;
      counters.length = level;
      counters[level - 1] = (counters[level - 1] ?? 0) + 1;
      wbs = counters.join(".");
    } else {
      counters.length = level;
      const last = wbs.split(".").pop();
      counters[level - 1] = Number(last);
    }
    const uid = text(t.UID);
    wbsByUid.set(uid, wbs);
    tasksByUid.set(uid, t);
    prepared.push({ task: t, wbs, level });
  }
  const summaries = new Set<string>();
  for (const p of prepared) {
    if (p.wbs.includes(".")) summaries.add(p.wbs.slice(0, p.wbs.lastIndexOf(".")));
  }

  // Recursos y asignaciones
  const resourcesByUid = new Map<string, ImportedResource>();
  for (const r of project.Resources?.Resource ?? []) {
    const uid = text(r.UID);
    const name = text(r.Name);
    if (uid === "0" || name === "" || num(r.IsNull) === 1) continue;
    const maxUnits = num(r.MaxUnits, 1) || 1;
    resourcesByUid.set(uid, {
      name,
      type: num(r.Type, 1) === 0 ? "MATERIAL" : "PERSON",
      rate: Math.max(0, num(r.StandardRate)),
      rateCurrency: "CLP",
      capacityHoursPerDay: Math.min(
        24,
        Math.max(1, Math.round(maxUnits * hoursPerDay * 100) / 100),
      ),
    });
  }
  const resourceNamesByTask = new Map<string, string[]>();
  for (const a of project.Assignments?.Assignment ?? []) {
    const resource = resourcesByUid.get(text(a.ResourceUID));
    const taskUid = text(a.TaskUID);
    if (!resource || !tasksByUid.has(taskUid)) continue;
    const list = resourceNamesByTask.get(taskUid) ?? [];
    if (!list.includes(resource.name)) list.push(resource.name);
    resourceNamesByTask.set(taskUid, list);
  }

  // Un vínculo hacia o desde un resumen no existe en GanttPro (ADR-003): se descarta con aviso.
  let discardedLinks = 0;
  let constrained = 0;
  const isSummaryTask = (t: XmlTask, wbs: string) => summaries.has(wbs) || num(t.Summary) === 1;

  const tasks: ImportedTask[] = prepared.map(({ task: t, wbs, level }, index) => {
    const uid = text(t.UID);
    const isSummary = isSummaryTask(t, wbs);
    const isMilestone = !isSummary && num(t.Milestone) === 1;
    const hours = parseMspdiDurationHours(t.Duration);
    const durationDays = isMilestone ? 0 : Math.max(1, Math.round(hours / hoursPerDay));
    const links = (t.PredecessorLink ?? []).filter((l) => {
      const predUid = text(l.PredecessorUID);
      const pred = tasksByUid.get(predUid);
      if (!pred) return false;
      if (isSummary || isSummaryTask(pred, wbsByUid.get(predUid) as string)) {
        discardedLinks++;
        return false;
      }
      return true;
    });
    const predecessors = links
      .map((l) => {
        const code = wbsByUid.get(text(l.PredecessorUID)) as string;
        const type = LINK_TYPES[num(l.Type, 1)] ?? "FS";
        const lag = linkLagDays(num(l.LinkLag), minutesPerDay);
        const lagText = lag === 0 ? "" : `${lag > 0 ? "+" : ""}${lag}d`;
        return `${code}${type === "FS" && lagText === "" ? "" : type}${lagText}`;
      })
      .join("; ");
    // Fecha de inicio: hojas sin predecesoras conservan su Start; una restricción distinta de
    // "lo antes posible" (ConstraintType 0) se importa como "no empezar antes de".
    let start: string | null = null;
    if (!isSummary) {
      const constraintType = num(t.ConstraintType, 0);
      if (constraintType !== 0) {
        start =
          parseDateCell(t.ConstraintDate?.slice(0, 10)) ?? parseDateCell(t.Start?.slice(0, 10));
        if (start !== null) constrained++;
      } else if (links.length === 0) {
        start = parseDateCell(t.Start?.slice(0, 10));
      }
    }
    return {
      row: index + 1,
      wbs,
      level,
      name: text(t.Name),
      durationDays: isSummary ? 1 : durationDays,
      startDate: start,
      isMilestone,
      progressPct: isSummary ? 0 : Math.min(100, Math.max(0, Math.round(num(t.PercentComplete)))),
      predecessors,
      resources: isSummary ? [] : (resourceNamesByTask.get(uid) ?? []),
      notes: text(t.Notes) || null,
    };
  });

  const plan: ImportedPlan = {
    source: "mspdi",
    projectName: text(project.Name ?? project.Title) || null,
    startDate: parseDateCell(project.StartDate?.slice(0, 10)),
    tasks,
    resources: [...resourcesByUid.values()],
  };
  if (tasks.length === 0) return failure("El XML no contiene tareas");
  const preview = validatePlan(plan);
  if (discardedLinks > 0) {
    preview.issues.push({
      row: null,
      column: "Predecesoras",
      severity: "warning",
      message:
        discardedLinks === 1
          ? "1 dependencia descartada: las tareas resumen no admiten dependencias"
          : `${discardedLinks} dependencias descartadas: las tareas resumen no admiten dependencias`,
    });
    preview.counts.warnings++;
  }
  if (constrained > 0) {
    preview.issues.push({
      row: null,
      column: "Inicio",
      severity: "warning",
      message:
        constrained === 1
          ? "1 tarea con restricción de fecha importada como fecha de inicio"
          : `${constrained} tareas con restricción de fecha importadas como fecha de inicio`,
    });
    preview.counts.warnings++;
  }
  return preview;
}

function failure(message: string): ImportPreview {
  return {
    plan: { source: "mspdi", projectName: null, startDate: null, tasks: [], resources: [] },
    issues: [{ row: null, column: null, severity: "error", message }],
    counts: { tasks: 0, dependencies: 0, resources: 0, assignments: 0, errors: 1, warnings: 0 },
  };
}
