import {
  addDays,
  layoutArrows,
  layoutBars,
  type ArrowGeometry,
  type BarGeometry,
  type IsoDate,
  type TimeAxis,
} from "@ganttpro/engine";
import type { AssignmentDto, DependencyDto, ResourceDto, TaskDto } from "@/lib/dto";
import { visibleTasks } from "@/stores/project-store";

/**
 * Modelo puro de la vista Gantt: qué filas se muestran, en qué rango de fechas, con qué color y
 * qué geometría. No toca el DOM; la vista SVG, la exportación PNG y la impresión PDF lo comparten.
 */

export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 48;
export const BAR_HEIGHT = 18;
export const MIN_PX_PER_DAY = 1;
export const MAX_PX_PER_DAY = 160;

export type ColorMode = "task" | "resource" | "status";
export type LabelMode = "name" | "resources" | "none";

export const DEFAULT_TASK_COLOR = "#2563eb";
export const SUMMARY_COLOR = "#111827";
export const MILESTONE_COLOR = "#111827";
export const CRITICAL_COLOR = "#dc2626";
export const BASELINE_COLOR = "#9ca3af";

export const STATUS_COLORS: Readonly<Record<TaskDto["status"], string>> = {
  NOT_STARTED: "#6b7280",
  IN_PROGRESS: "#2563eb",
  DONE: "#16a34a",
  ON_HOLD: "#d97706",
  CANCELLED: "#9ca3af",
};

/** Filas del Gantt: exactamente las mismas que la tabla (mismo store, misma función). */
export function ganttRows(tasks: readonly TaskDto[], collapsed: Record<string, true>): TaskDto[] {
  return visibleTasks(tasks, collapsed);
}

/** Rango de fechas visible: una semana antes del inicio y dos después del fin del proyecto. */
export function projectRange(
  tasks: readonly TaskDto[],
  projectStart: IsoDate,
): { from: IsoDate; to: IsoDate } {
  if (tasks.length === 0) return { from: addDays(projectStart, -7), to: addDays(projectStart, 60) };
  let min = tasks[0]!.startDate;
  let max = tasks[0]!.endDate;
  for (const t of tasks) {
    if (t.startDate < min) min = t.startDate;
    if (t.endDate > max) max = t.endDate;
  }
  return { from: addDays(min, -7), to: addDays(max, 14) };
}

export interface ColorContext {
  readonly assignments: readonly AssignmentDto[];
  readonly resources: readonly ResourceDto[];
}

/** Color de la barra según el modo elegido. La ruta crítica se aplica aparte (tiene prioridad). */
export function barColor(task: TaskDto, mode: ColorMode, ctx: ColorContext): string {
  if (task.isSummary) return SUMMARY_COLOR;
  if (task.isMilestone) return MILESTONE_COLOR;
  switch (mode) {
    case "status":
      return STATUS_COLORS[task.status];
    case "resource": {
      const first = ctx.assignments.find((a) => a.taskId === task.id);
      const resource = first ? ctx.resources.find((r) => r.id === first.resourceId) : undefined;
      return resource?.color ?? "#94a3b8";
    }
    default:
      return task.color ?? DEFAULT_TASK_COLOR;
  }
}

/** Etiqueta a la derecha de la barra. */
export function barLabel(task: TaskDto, mode: LabelMode, ctx: ColorContext): string {
  if (mode === "none") return "";
  if (mode === "resources") {
    return ctx.assignments
      .filter((a) => a.taskId === task.id)
      .map((a) => ctx.resources.find((r) => r.id === a.resourceId)?.name ?? "")
      .filter(Boolean)
      .join(", ");
  }
  return task.name;
}

export interface GanttScene {
  readonly bars: BarGeometry[];
  readonly barsById: Map<string, BarGeometry>;
  readonly arrows: ArrowGeometry[];
}

/** Geometría completa de la escena para las filas dadas. */
export function buildScene(
  rows: readonly TaskDto[],
  dependencies: readonly DependencyDto[],
  axis: TimeAxis,
): GanttScene {
  const bars = layoutBars(rows, axis, { rowHeight: ROW_HEIGHT, barHeight: BAR_HEIGHT });
  const barsById = new Map(bars.map((b) => [b.taskId, b]));
  const arrows = layoutArrows(dependencies, bars, { rowHeight: ROW_HEIGHT });
  return { bars, barsById, arrows };
}

/** Tipo de dependencia según el conector de origen y destino (UC-24). */
export function inferDependencyType(
  from: "start" | "end",
  to: "start" | "end",
): DependencyDto["type"] {
  if (from === "end" && to === "start") return "FS";
  if (from === "start" && to === "start") return "SS";
  if (from === "end" && to === "end") return "FF";
  return "SF";
}

/** Convierte una polilínea en el atributo `d` de un `<path>` SVG. */
export function pointsToPath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** Acota los píxeles por día a un rango razonable de zoom. */
export function clampPxPerDay(value: number): number {
  return Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, value));
}
