import type { IsoDate } from "./dates";

/** Tipo de dependencia entre tareas (ver ADR-003). */
export type DependencyType = "FS" | "SS" | "FF" | "SF";

/** Cómo se pondera el avance de una tarea resumen. */
export type ProgressWeighting = "DURATION" | "EFFORT";

/** Definición de un calendario laboral, tal como se persiste en `Calendar` + `Holiday`. */
export interface CalendarDefinition {
  /** Días de la semana laborables: 0 = domingo … 6 = sábado. */
  readonly workingDays: readonly number[];
  /** Horas de trabajo por día hábil (> 0). */
  readonly hoursPerDay: number;
  /** Feriados como fechas ISO `YYYY-MM-DD`. */
  readonly holidays: readonly IsoDate[];
}

/**
 * Vista de una tarea que necesita el engine. Coincide con los campos de `Task` del modelo de datos;
 * el resto de campos (nombre, estado, notas…) se conservan intactos porque las funciones son
 * genéricas sobre `T extends EngineTask`.
 */
export interface EngineTask {
  readonly id: string;
  readonly parentId: string | null;
  readonly orderIndex: number;
  readonly wbsCode: string;
  /** Intención del usuario ("no empezar antes de"). Nulo en tareas resumen. */
  readonly anchorDate: IsoDate | null;
  /** Derivado: inicio efectivo. */
  readonly startDate: IsoDate;
  /** Derivado: fin efectivo (inclusive). */
  readonly endDate: IsoDate;
  /** Días hábiles. 0 solo en hitos. En resúmenes es derivado. */
  readonly durationDays: number;
  readonly effortHours: number | null;
  /** 0–100. En resúmenes es derivado. */
  readonly progressPct: number;
  readonly isMilestone: boolean;
  /** Derivado: true si la tarea tiene hijos. */
  readonly isSummary: boolean;
}

/** Vista de una dependencia que necesita el engine. Coincide con `Dependency`. */
export interface EngineDependency {
  readonly id: string;
  readonly predecessorId: string;
  readonly successorId: string;
  readonly type: DependencyType;
  /** Desfase en días hábiles; negativo = adelanto (lead). */
  readonly lagDays: number;
}

/** Arista mínima para detección de ciclos y orden topológico. */
export type DependencyEdge = Pick<EngineDependency, "predecessorId" | "successorId">;
