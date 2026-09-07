/**
 * Columnas canónicas de la plantilla de importación y sinónimos aceptados en los encabezados.
 * La comparación ignora mayúsculas, acentos, espacios y signos.
 */

export type ColumnKey =
  | "wbs"
  | "name"
  | "duration"
  | "start"
  | "end"
  | "milestone"
  | "progress"
  | "predecessors"
  | "resources"
  | "notes"
  | "level";

export interface TemplateColumn {
  readonly key: ColumnKey;
  readonly header: string;
  readonly width: number;
  readonly description: string;
}

/** Columnas de la hoja "Tareas", en el orden de la plantilla (la columna Nivel es opcional y no se incluye). */
export const TEMPLATE_COLUMNS: readonly TemplateColumn[] = [
  {
    key: "wbs",
    header: "WBS",
    width: 10,
    description:
      "Código jerárquico de la tarea: 1, 1.1, 1.2, 2… Define la estructura (1.1 es subtarea de 1).",
  },
  { key: "name", header: "Nombre", width: 40, description: "Nombre de la tarea (obligatorio)." },
  {
    key: "duration",
    header: "Duración (días)",
    width: 16,
    description:
      "Días hábiles. Las tareas resumen (con subtareas) la calculan solas; los hitos usan 0.",
  },
  {
    key: "start",
    header: "Inicio",
    width: 14,
    description:
      "Fecha de inicio deseada (dd-mm-aaaa o aaaa-mm-dd). Vacío = lo antes posible según predecesoras.",
  },
  {
    key: "end",
    header: "Fin",
    width: 14,
    description:
      "Opcional. Si dejas Duración vacía y das Inicio y Fin, la duración se calcula en días hábiles (lunes a viernes) entre ambas fechas. Si hay Duración, manda la Duración.",
  },
  { key: "milestone", header: "Hito", width: 8, description: "Sí/No. Un hito dura 0 días." },
  { key: "progress", header: "Avance %", width: 10, description: "Avance de 0 a 100." },
  {
    key: "predecessors",
    header: "Predecesoras",
    width: 22,
    description:
      'Códigos WBS separados por ";" con tipo y desfase opcionales: "1.2FS+2d; 2.1SS". Tipos FS, SS, FF, SF.',
  },
  {
    key: "resources",
    header: "Recursos",
    width: 24,
    description:
      'Nombres de recursos separados por ";" (por ejemplo "Ana Pérez; Equipo QA"). Se crean si no existen.',
  },
  { key: "notes", header: "Notas", width: 40, description: "Texto libre." },
];

const SYNONYMS: Readonly<Record<ColumnKey, readonly string[]>> = {
  wbs: ["wbs", "edt", "codigo", "codigo wbs", "codigo edt", "numero de esquema", "outline number"],
  name: [
    "nombre",
    "tarea",
    "nombre de tarea",
    "nombre de la tarea",
    "task",
    "task name",
    "actividad",
  ],
  duration: ["duracion dias", "duracion", "duracion en dias", "dias", "duration", "duration days"],
  start: ["inicio", "fecha de inicio", "fecha inicio", "comienzo", "start", "start date"],
  end: [
    "fin",
    "termino",
    "fecha de fin",
    "fecha fin",
    "fecha de termino",
    "fecha termino",
    "finish",
    "finish date",
    "end",
    "end date",
  ],
  milestone: ["hito", "es hito", "milestone"],
  progress: [
    "avance",
    "avance %",
    "% avance",
    "% completado",
    "porcentaje",
    "progress",
    "% complete",
  ],
  predecessors: ["predecesoras", "predecesores", "predecessors", "pred"],
  resources: ["recursos", "recurso", "nombres de los recursos", "resources", "resource names"],
  notes: ["notas", "nota", "observaciones", "comentarios", "notes"],
  level: ["nivel", "nivel de esquema", "outline level", "level"],
};

/** Normaliza un encabezado: minúsculas, sin acentos, sin signos, espacios simples. */
export function normalizeHeader(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

/** Clave canónica de un encabezado o `null` si no se reconoce. */
export function matchColumn(header: string): ColumnKey | null {
  const normalized = normalizeHeader(header);
  if (normalized === "") return null;
  for (const key of Object.keys(SYNONYMS) as ColumnKey[]) {
    if (SYNONYMS[key].some((s) => normalizeHeader(s) === normalized)) return key;
  }
  return null;
}

/** Mapa índice de columna → clave canónica para una fila de encabezados. */
export function mapHeaders(headers: readonly string[]): Map<number, ColumnKey> {
  const map = new Map<number, ColumnKey>();
  const used = new Set<ColumnKey>();
  headers.forEach((h, i) => {
    const key = matchColumn(h);
    if (key && !used.has(key)) {
      map.set(i, key);
      used.add(key);
    }
  });
  return map;
}
