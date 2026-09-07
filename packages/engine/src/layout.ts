import type { WorkingCalendar } from "./calendar";
import {
  addDays,
  compareIsoDates,
  dayOfWeek,
  fromEpochDay,
  toEpochDay,
  type IsoDate,
} from "./dates";
import type { DependencyType, EngineDependency, EngineTask } from "./types";

/**
 * Modelo de layout del Gantt (ADR-006): convierte tareas, dependencias y una escala de tiempo en
 * geometría (x, y, anchos, rutas de flechas) sin tocar el DOM. Lo consumen la vista SVG, la
 * exportación PNG y la ruta de impresión PDF, que por eso dibujan exactamente lo mismo.
 */

export type TimeScale = "day" | "week" | "month" | "quarter";

/** Píxeles por día calendario por defecto para cada escala. */
export const SCALE_PX_PER_DAY: Readonly<Record<TimeScale, number>> = {
  day: 40,
  week: 12,
  month: 4,
  quarter: 1.5,
};

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const MONTHS_ES_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

export interface HeaderCell {
  readonly label: string;
  readonly start: IsoDate;
  /** Último día incluido. */
  readonly end: IsoDate;
  readonly x: number;
  readonly width: number;
}

export interface TimeAxisOptions {
  readonly scale: TimeScale;
  readonly from: IsoDate;
  /** Último día visible (inclusive). */
  readonly to: IsoDate;
  /** Sobrescribe los píxeles por día de la escala (zoom). */
  readonly pxPerDay?: number;
}

export interface TimeAxis {
  readonly scale: TimeScale;
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly pxPerDay: number;
  readonly totalDays: number;
  readonly width: number;
  readonly header: { readonly top: readonly HeaderCell[]; readonly bottom: readonly HeaderCell[] };
  /** x del borde izquierdo del día (puede quedar fuera de [0, width] si la fecha está fuera). */
  xOf(date: IsoDate): number;
  /** Fecha del día que contiene la coordenada x (acotada al rango del eje). */
  dateAt(x: number): IsoDate;
}

/** Construye el eje de tiempo: escala, ancho total y cabecera de dos niveles. */
export function createTimeAxis(options: TimeAxisOptions): TimeAxis {
  const fromEpoch = toEpochDay(options.from);
  const toEpoch = toEpochDay(options.to);
  if (toEpoch < fromEpoch) {
    throw new Error(`Rango de eje inválido: ${options.from} es posterior a ${options.to}`);
  }
  const pxPerDay = options.pxPerDay ?? SCALE_PX_PER_DAY[options.scale];
  const totalDays = toEpoch - fromEpoch + 1;
  const xOf = (date: IsoDate): number => (toEpochDay(date) - fromEpoch) * pxPerDay;
  const dateAt = (x: number): IsoDate => {
    const offset = Math.min(totalDays - 1, Math.max(0, Math.floor(x / pxPerDay)));
    return fromEpochDay(fromEpoch + offset);
  };
  const axis = {
    scale: options.scale,
    from: options.from,
    to: options.to,
    pxPerDay,
    totalDays,
    width: totalDays * pxPerDay,
    xOf,
    dateAt,
  };
  return { ...axis, header: buildHeader(axis) };
}

type AxisCore = Omit<TimeAxis, "header">;

function buildHeader(axis: AxisCore): TimeAxis["header"] {
  switch (axis.scale) {
    case "day":
      return { top: monthCells(axis, "long"), bottom: dayCells(axis) };
    case "week":
      return { top: monthCells(axis, "long"), bottom: weekCells(axis) };
    case "month":
      return { top: yearCells(axis), bottom: monthCells(axis, "short") };
    case "quarter":
      return { top: yearCells(axis), bottom: quarterCells(axis) };
  }
}

function cell(axis: AxisCore, label: string, start: IsoDate, end: IsoDate): HeaderCell {
  const s = compareIsoDates(start, axis.from) < 0 ? axis.from : start;
  const e = compareIsoDates(end, axis.to) > 0 ? axis.to : end;
  const x = axis.xOf(s);
  return { label, start: s, end: e, x, width: axis.xOf(e) + axis.pxPerDay - x };
}

function ymd(date: IsoDate): { y: number; m: number; d: number } {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)), d: Number(date.slice(8, 10)) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(y: number, m: number): IsoDate {
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  return addDays(next, -1);
}

function dayCells(axis: AxisCore): HeaderCell[] {
  const cells: HeaderCell[] = [];
  for (let d = axis.from; compareIsoDates(d, axis.to) <= 0; d = addDays(d, 1)) {
    cells.push(cell(axis, String(ymd(d).d), d, d));
  }
  return cells;
}

function weekCells(axis: AxisCore): HeaderCell[] {
  const cells: HeaderCell[] = [];
  let monday = addDays(axis.from, -((dayOfWeek(axis.from) + 6) % 7));
  while (compareIsoDates(monday, axis.to) <= 0) {
    const { d, m } = ymd(monday);
    cells.push(cell(axis, `${d} ${MONTHS_ES_SHORT[m - 1]}`, monday, addDays(monday, 6)));
    monday = addDays(monday, 7);
  }
  return cells;
}

function monthCells(axis: AxisCore, style: "long" | "short"): HeaderCell[] {
  const cells: HeaderCell[] = [];
  let { y, m } = ymd(axis.from);
  while (compareIsoDates(`${y}-${pad(m)}-01`, axis.to) <= 0) {
    const label =
      style === "long" ? `${MONTHS_ES[m - 1]} ${y}` : (MONTHS_ES_SHORT[m - 1] as string);
    cells.push(cell(axis, label, `${y}-${pad(m)}-01`, lastDayOfMonth(y, m)));
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return cells;
}

function quarterCells(axis: AxisCore): HeaderCell[] {
  const cells: HeaderCell[] = [];
  let { y, m } = ymd(axis.from);
  m = m - ((m - 1) % 3);
  while (compareIsoDates(`${y}-${pad(m)}-01`, axis.to) <= 0) {
    const q = Math.floor((m - 1) / 3) + 1;
    cells.push(cell(axis, `T${q} ${y}`, `${y}-${pad(m)}-01`, lastDayOfMonth(y, m + 2)));
    m += 3;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return cells;
}

function yearCells(axis: AxisCore): HeaderCell[] {
  const cells: HeaderCell[] = [];
  for (let y = ymd(axis.from).y; y <= ymd(axis.to).y; y++) {
    cells.push(cell(axis, String(y), `${y}-01-01`, `${y}-12-31`));
  }
  return cells;
}

/** Elige escala y píxeles por día para que el rango quepa en el ancho disponible ("Ajustar al proyecto"). */
export function fitToWidth(
  from: IsoDate,
  to: IsoDate,
  availableWidth: number,
): { scale: TimeScale; pxPerDay: number } {
  const days = Math.max(1, toEpochDay(to) - toEpochDay(from) + 1);
  const pxPerDay = Math.max(0.25, availableWidth / days);
  const scale: TimeScale =
    pxPerDay >= 24 ? "day" : pxPerDay >= 8 ? "week" : pxPerDay >= 2.5 ? "month" : "quarter";
  return { scale, pxPerDay };
}

export interface ShadedRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly x: number;
  readonly width: number;
}

/** Tramos contiguos de días no hábiles (fines de semana y feriados) para sombrear. */
export function nonWorkingRanges(axis: TimeAxis, calendar: WorkingCalendar): ShadedRange[] {
  const ranges: ShadedRange[] = [];
  let open: { from: IsoDate; to: IsoDate } | null = null;
  for (let d = axis.from; compareIsoDates(d, axis.to) <= 0; d = addDays(d, 1)) {
    if (calendar.isWorkingDay(d)) {
      if (open) ranges.push(toRange(axis, open));
      open = null;
    } else if (open) {
      open = { from: open.from, to: d };
    } else {
      open = { from: d, to: d };
    }
  }
  if (open) ranges.push(toRange(axis, open));
  return ranges;
}

function toRange(axis: TimeAxis, r: { from: IsoDate; to: IsoDate }): ShadedRange {
  const x = axis.xOf(r.from);
  return { from: r.from, to: r.to, x, width: axis.xOf(r.to) + axis.pxPerDay - x };
}

/** x del centro del día para líneas verticales ("Hoy", "Fecha de estado"); nulo si está fuera del eje. */
export function markerX(axis: TimeAxis, date: IsoDate): number | null {
  if (compareIsoDates(date, axis.from) < 0 || compareIsoDates(date, axis.to) > 0) return null;
  return axis.xOf(date) + axis.pxPerDay / 2;
}

export type BarKind = "task" | "summary" | "milestone";

export interface BarLayoutOptions {
  readonly rowHeight?: number;
  readonly barHeight?: number;
  readonly milestoneSize?: number;
  readonly labelGap?: number;
}

export interface BarGeometry {
  readonly taskId: string;
  readonly kind: BarKind;
  readonly rowIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerY: number;
  /** Ancho del relleno de avance. */
  readonly progressWidth: number;
  /** x donde empieza la etiqueta a la derecha de la barra. */
  readonly labelX: number;
}

const DEFAULT_BAR_OPTIONS: Required<BarLayoutOptions> = {
  rowHeight: 32,
  barHeight: 18,
  milestoneSize: 14,
  labelGap: 8,
};

/** Geometría de las barras para las tareas en su orden de visualización (una fila por tarea). */
export function layoutBars<T extends EngineTask>(
  tasks: readonly T[],
  axis: TimeAxis,
  options: BarLayoutOptions = {},
): BarGeometry[] {
  const o = { ...DEFAULT_BAR_OPTIONS, ...options };
  return tasks.map((task, rowIndex) => {
    const centerY = rowIndex * o.rowHeight + o.rowHeight / 2;
    if (task.isMilestone && !task.isSummary) {
      const size = o.milestoneSize;
      const x = axis.xOf(task.startDate) + axis.pxPerDay / 2 - size / 2;
      return {
        taskId: task.id,
        kind: "milestone",
        rowIndex,
        x,
        y: centerY - size / 2,
        width: size,
        height: size,
        centerY,
        progressWidth: 0,
        labelX: x + size + o.labelGap,
      };
    }
    const x = axis.xOf(task.startDate);
    const width = axis.xOf(task.endDate) + axis.pxPerDay - x;
    return {
      taskId: task.id,
      kind: task.isSummary ? "summary" : "task",
      rowIndex,
      x,
      y: centerY - o.barHeight / 2,
      width,
      height: o.barHeight,
      centerY,
      progressWidth: Math.round(((width * task.progressPct) / 100) * 100) / 100,
      labelX: x + width + o.labelGap,
    };
  });
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface ArrowGeometry {
  readonly dependencyId: string;
  readonly type: DependencyType;
  readonly fromTaskId: string;
  readonly toTaskId: string;
  /** Polilínea ortogonal desde la predecesora hasta la punta en la sucesora. */
  readonly points: readonly Point[];
}

export interface ArrowLayoutOptions {
  /** Separación horizontal mínima antes de girar. */
  readonly gap?: number;
  readonly rowHeight?: number;
}

type Side = "start" | "end";

const SIDES: Readonly<Record<DependencyType, { from: Side; to: Side }>> = {
  FS: { from: "end", to: "start" },
  SS: { from: "start", to: "start" },
  FF: { from: "end", to: "end" },
  SF: { from: "start", to: "end" },
};

/**
 * Flechas ortogonales entre barras. Salen por el lado de la predecesora que define el tipo
 * (fin para FS/FF, inicio para SS/SF) y entran por el lado correspondiente de la sucesora. Si la
 * entrada queda "detrás" de la salida, la ruta baja o sube por el borde de la fila para no cruzar
 * la barra de origen.
 */
export function layoutArrows(
  dependencies: readonly EngineDependency[],
  bars: readonly BarGeometry[],
  options: ArrowLayoutOptions = {},
): ArrowGeometry[] {
  const gap = options.gap ?? 10;
  const rowHeight = options.rowHeight ?? DEFAULT_BAR_OPTIONS.rowHeight;
  const barById = new Map(bars.map((b) => [b.taskId, b]));
  const arrows: ArrowGeometry[] = [];
  for (const dep of dependencies) {
    const from = barById.get(dep.predecessorId);
    const to = barById.get(dep.successorId);
    if (!from || !to) continue;
    const sides = SIDES[dep.type];
    const source = anchor(from, sides.from);
    const target = anchor(to, sides.to);
    const exitDir = sides.from === "end" ? 1 : -1;
    const entryDir = sides.to === "start" ? 1 : -1; // sentido de avance al entrar
    const p1: Point = { x: source.x + exitDir * gap, y: source.y };
    const q1: Point = { x: target.x - entryDir * gap, y: target.y };
    const forward = exitDir === 1 ? q1.x >= p1.x : q1.x <= p1.x;
    const sameDirection = exitDir === entryDir;
    let points: Point[];
    if (forward && sameDirection) {
      points = [source, p1, { x: p1.x, y: target.y }, target];
    } else if (forward) {
      // Salida y entrada en sentidos opuestos (FF/SS): girar a mitad de camino.
      const midX = (p1.x + q1.x) / 2;
      points = [source, { x: midX, y: source.y }, { x: midX, y: target.y }, target];
    } else {
      const down = to.rowIndex >= from.rowIndex;
      const midY = down ? source.y + rowHeight / 2 : source.y - rowHeight / 2;
      points = [source, p1, { x: p1.x, y: midY }, { x: q1.x, y: midY }, q1, target];
    }
    arrows.push({
      dependencyId: dep.id,
      type: dep.type,
      fromTaskId: dep.predecessorId,
      toTaskId: dep.successorId,
      points: dedupe(points),
    });
  }
  return arrows;
}

function anchor(bar: BarGeometry, side: Side): Point {
  return { x: side === "start" ? bar.x : bar.x + bar.width, y: bar.centerY };
}

function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  return out;
}

/** Rango de filas a dibujar con virtualización vertical. `end` es exclusivo. */
export function visibleRowRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  rowCount: number,
  overscan = 5,
): { start: number; end: number } {
  if (rowCount <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight) + 1;
  return {
    start: Math.max(0, first - overscan),
    end: Math.min(rowCount, first + visible + overscan),
  };
}
