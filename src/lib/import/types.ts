/**
 * Tipos de la importación (UC-28…UC-30). Un archivo (Excel, CSV o MS Project XML) se convierte en
 * un `ImportedPlan` neutral que se valida fila a fila y se previsualiza antes de escribirse.
 */

export type ImportSource = "xlsx" | "csv" | "mspdi";

export interface ImportedTask {
  /** Número de fila del archivo de origen (para los mensajes de la previsualización). */
  row: number;
  /** Código jerárquico: "1", "1.1", "1.1.2". */
  wbs: string;
  /** Profundidad: 1 = nivel superior. */
  level: number;
  name: string;
  durationDays: number;
  /** `YYYY-MM-DD` o nulo (lo más pronto posible según predecesoras e inicio del proyecto). */
  startDate: string | null;
  isMilestone: boolean;
  progressPct: number;
  /** Texto en el formato de la app: `1.2FS+3d; 2SS`. */
  predecessors: string;
  resources: string[];
  notes: string | null;
}

export interface ImportedResource {
  name: string;
  type: "PERSON" | "TEAM" | "MATERIAL";
  rate: number;
  rateCurrency: "UF" | "CLP";
  capacityHoursPerDay: number;
}

export interface ImportedPlan {
  source: ImportSource;
  projectName: string | null;
  startDate: string | null;
  tasks: ImportedTask[];
  resources: ImportedResource[];
}

export interface ImportIssue {
  row: number | null;
  column: string | null;
  severity: "error" | "warning";
  message: string;
}

export interface ImportCounts {
  tasks: number;
  dependencies: number;
  resources: number;
  assignments: number;
  errors: number;
  warnings: number;
}

export interface ImportPreview {
  plan: ImportedPlan;
  issues: ImportIssue[];
  counts: ImportCounts;
}

export interface ImportResult {
  projectId: string;
  created: { tasks: number; dependencies: number; resources: number; assignments: number };
}
