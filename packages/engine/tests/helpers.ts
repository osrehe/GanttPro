import { createCalendar } from "../src/calendar";
import type { EngineDependency, EngineTask, DependencyType } from "../src/types";

/** Calendario lunes a viernes, 8 h, con el feriado de Fiestas Patrias 2026 (18-09 es viernes). */
export const CL_CALENDAR = createCalendar({
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  holidays: ["2026-09-18"],
});

let seq = 0;

/** Crea una tarea hoja con valores razonables; cualquier campo puede sobreescribirse. */
export function task(id: string, overrides: Partial<EngineTask> = {}): EngineTask {
  seq++;
  const anchor = overrides.anchorDate === undefined ? "2026-09-07" : overrides.anchorDate;
  return {
    id,
    parentId: null,
    orderIndex: seq,
    wbsCode: "",
    anchorDate: anchor,
    startDate: anchor ?? "2026-09-07",
    endDate: anchor ?? "2026-09-07",
    durationDays: 1,
    effortHours: null,
    progressPct: 0,
    isMilestone: false,
    isSummary: false,
    ...overrides,
  };
}

/** Crea una dependencia; el tipo por defecto es FS con lag 0. */
export function dep(
  predecessorId: string,
  successorId: string,
  type: DependencyType = "FS",
  lagDays = 0,
): EngineDependency {
  return {
    id: `${predecessorId}-${successorId}-${type}`,
    predecessorId,
    successorId,
    type,
    lagDays,
  };
}

/** Devuelve `{ id: "start – end" }` para comparar programaciones de forma legible. */
export function spans(tasks: readonly EngineTask[]): Record<string, string> {
  return Object.fromEntries(tasks.map((t) => [t.id, `${t.startDate} – ${t.endDate}`]));
}

/** Devuelve `{ id: wbsCode }`. */
export function codes(tasks: readonly EngineTask[]): Record<string, string> {
  return Object.fromEntries(tasks.map((t) => [t.id, t.wbsCode]));
}
