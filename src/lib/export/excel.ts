import ExcelJS from "exceljs";
import {
  addDays,
  assignmentHours,
  convertAmount,
  createCalendar,
  dayOfWeek,
  diffDays,
  projectCosts,
  type CurrencyDisplay,
  type IsoDate,
  type WorkingCalendar,
} from "@ganttpro/engine";
import type { ProjectFullDto, ResourceDto, TaskDto } from "@/lib/dto";
import { formatPredecessors } from "@/lib/predecessors";

/**
 * Exportación a Excel (UC-26): un libro con las hojas Tareas, Gantt, Recursos, Dependencias y
 * Resumen. Las nueve primeras columnas de "Tareas" coinciden con la plantilla de importación
 * (`src/lib/import/columns.ts`), de modo que un libro exportado se puede volver a importar.
 */

export type GanttGranularity = "day" | "week";

export interface ExcelExportOptions {
  /** Una columna por día o por semana en la hoja Gantt. */
  readonly gantt: GanttGranularity;
  readonly display: CurrencyDisplay;
  /** Fecha de exportación (`YYYY-MM-DD`); por defecto hoy en UTC. */
  readonly exportedAt?: IsoDate;
}

/** Máximo de columnas de tiempo en la hoja Gantt; por encima se pasa a semanas. */
export const MAX_GANTT_COLUMNS = 1000;

export const DATE_FORMAT = "dd-mm-yyyy";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEDE9FE" },
};
const NON_WORKING_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F1FB" },
};
const DEFAULT_BAR = "FF7C3AED";
const SUMMARY_BAR = "FF4C1D95";
const CRITICAL_BAR = "FFE11D48";

const STATUS_LABELS: Readonly<Record<TaskDto["status"], string>> = {
  NOT_STARTED: "No iniciada",
  IN_PROGRESS: "En curso",
  DONE: "Terminada",
  ON_HOLD: "En pausa",
  CANCELLED: "Cancelada",
};
const PRIORITY_LABELS: Readonly<Record<TaskDto["priority"], string>> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};
const RESOURCE_TYPE_LABELS: Readonly<Record<ResourceDto["type"], string>> = {
  PERSON: "Persona",
  TEAM: "Equipo",
  MATERIAL: "Material",
};
const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Construye el libro completo del proyecto. */
export async function buildProjectWorkbook(
  full: ProjectFullDto,
  options: ExcelExportOptions,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "GanttPro";
  workbook.created = new Date();
  const calendar = createCalendar({
    workingDays: full.calendar.workingDays,
    hoursPerDay: full.calendar.hoursPerDay,
    holidays: full.calendar.holidays.map((h) => h.date),
  });
  const ctx: ExportContext = {
    full,
    calendar,
    display: options.display,
    tasksById: new Map(full.tasks.map((t) => [t.id, t])),
    resourcesById: new Map(full.resources.map((r) => [r.id, r])),
    costs: projectCosts(
      full.tasks,
      full.assignments,
      full.resources.map((r) => ({
        id: r.id,
        capacityHoursPerDay: r.capacityHoursPerDay,
        rate: r.rate,
        rateCurrency: r.rateCurrency,
      })),
      calendar,
      options.display,
    ),
    exportedAt: options.exportedAt ?? new Date().toISOString().slice(0, 10),
  };
  addTasksSheet(workbook, ctx);
  addGanttSheet(workbook, ctx, options.gantt);
  addResourcesSheet(workbook, ctx);
  addDependenciesSheet(workbook, ctx);
  addSummarySheet(workbook, ctx);
  return workbook;
}

/** Nombre de archivo seguro: `mi-proyecto-tareas.xlsx`. */
export function exportFileName(projectName: string, suffix: string, extension: string): string {
  const slug =
    projectName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "proyecto";
  return `${slug}-${suffix}.${extension}`;
}

// ---------------------------------------------------------------------------------------------

interface ExportContext {
  readonly full: ProjectFullDto;
  readonly calendar: WorkingCalendar;
  readonly display: CurrencyDisplay;
  readonly tasksById: Map<string, TaskDto>;
  readonly resourcesById: Map<string, ResourceDto>;
  readonly costs: ReturnType<typeof projectCosts>;
  readonly exportedAt: IsoDate;
}

function depthOf(task: TaskDto): number {
  return task.wbsCode.split(".").length;
}

/** Fecha ISO como celda de fecha de Excel (medianoche UTC, formato dd-mm-yyyy). */
function excelDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
  row.border = { bottom: { style: "thin", color: { argb: "FFC4B5FD" } } };
}

function resourceNames(ctx: ExportContext, taskId: string): string {
  return ctx.full.assignments
    .filter((a) => a.taskId === taskId)
    .map((a) => {
      const r = ctx.resourcesById.get(a.resourceId);
      if (!r) return "";
      return a.allocationPct === 100 ? r.name : `${r.name} [${a.allocationPct}%]`;
    })
    .filter(Boolean)
    .join("; ");
}

function addTasksSheet(workbook: ExcelJS.Workbook, ctx: ExportContext): void {
  const sheet = workbook.addWorksheet("Tareas", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
    properties: { outlineProperties: { summaryBelow: false, summaryRight: false } },
  });
  const currency = ctx.display.currency;
  sheet.columns = [
    { header: "WBS", key: "wbs", width: 10 },
    { header: "Nombre", key: "name", width: 44 },
    { header: "Duración (días)", key: "duration", width: 15 },
    { header: "Inicio", key: "start", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Fin", key: "end", width: 12, style: { numFmt: DATE_FORMAT } },
    { header: "Hito", key: "milestone", width: 7 },
    { header: "Avance %", key: "progress", width: 10, style: { numFmt: '0"%"' } },
    { header: "Predecesoras", key: "predecessors", width: 20 },
    { header: "Recursos", key: "resources", width: 28 },
    { header: "Notas", key: "notes", width: 32 },
    { header: "Estado", key: "status", width: 13 },
    { header: "Prioridad", key: "priority", width: 10 },
    { header: "Esfuerzo (h)", key: "effort", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Horas asignadas", key: "hours", width: 15, style: { numFmt: "#,##0.00" } },
    { header: `Costo (${currency})`, key: "cost", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Crítica", key: "critical", width: 8 },
    { header: "Holgura (días)", key: "float", width: 13 },
  ];
  styleHeader(sheet.getRow(1));
  for (const task of ctx.full.tasks) {
    const cost = ctx.costs.byTask.get(task.id);
    const row = sheet.addRow({
      wbs: task.wbsCode,
      name: task.name,
      duration: task.durationDays,
      start: excelDate(task.startDate),
      end: excelDate(task.endDate),
      milestone: task.isMilestone ? "Sí" : "No",
      progress: task.progressPct,
      predecessors: formatPredecessors(task.id, ctx.full.dependencies, ctx.tasksById),
      resources: resourceNames(ctx, task.id),
      notes: task.notes ?? "",
      status: STATUS_LABELS[task.status],
      priority: PRIORITY_LABELS[task.priority],
      effort: task.effortHours ?? null,
      hours: cost?.hours ?? 0,
      cost: cost?.plannedCost ?? null,
      critical: task.isCritical ? "Sí" : "",
      float: task.totalFloatDays ?? null,
    });
    row.outlineLevel = Math.min(7, depthOf(task) - 1);
    row.getCell("name").alignment = { indent: depthOf(task) - 1 };
    if (task.isSummary) row.font = { bold: true };
    if (task.isMilestone) row.getCell("wbs").font = { italic: true };
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
}

interface GanttColumn {
  readonly from: IsoDate;
  /** Último día incluido. */
  readonly to: IsoDate;
  readonly label: string;
  readonly nonWorking: boolean;
}

/** Columnas de tiempo de la hoja Gantt. */
export function ganttColumns(
  from: IsoDate,
  to: IsoDate,
  granularity: GanttGranularity,
  calendar: WorkingCalendar,
): { columns: GanttColumn[]; granularity: GanttGranularity } {
  const totalDays = diffDays(from, to) + 1;
  const effective: GanttGranularity =
    granularity === "day" && totalDays > MAX_GANTT_COLUMNS ? "week" : granularity;
  const columns: GanttColumn[] = [];
  if (effective === "day") {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      columns.push({
        from: d,
        to: d,
        label: String(Number(d.slice(8, 10))),
        nonWorking: !calendar.isWorkingDay(d),
      });
    }
  } else {
    // Semanas de lunes a domingo, empezando en el lunes anterior o igual a `from`.
    const offset = (dayOfWeek(from) + 6) % 7;
    for (let start = addDays(from, -offset); start <= to; start = addDays(start, 7)) {
      columns.push({
        from: start,
        to: addDays(start, 6),
        label: `${start.slice(8, 10)}-${start.slice(5, 7)}`,
        nonWorking: calendar.countWorkingDays(start, addDays(start, 6)) === 0,
      });
    }
  }
  return { columns: columns.slice(0, MAX_GANTT_COLUMNS), granularity: effective };
}

function monthLabel(iso: IsoDate): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function barColor(task: TaskDto): string {
  if (task.isSummary) return SUMMARY_BAR;
  if (task.isCritical) return CRITICAL_BAR;
  if (task.color && /^#[0-9a-f]{6}$/i.test(task.color)) {
    return `FF${task.color.slice(1).toUpperCase()}`;
  }
  return DEFAULT_BAR;
}

function addGanttSheet(
  workbook: ExcelJS.Workbook,
  ctx: ExportContext,
  granularity: GanttGranularity,
): void {
  const tasks = ctx.full.tasks;
  const sheet = workbook.addWorksheet("Gantt", {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
  });
  const projectStart = ctx.full.project.startDate;
  let from = projectStart;
  let to = projectStart;
  for (const t of tasks) {
    if (t.startDate < from) from = t.startDate;
    if (t.endDate > to) to = t.endDate;
  }
  const { columns, granularity: effective } = ganttColumns(from, to, granularity, ctx.calendar);
  const FIRST = 3; // primera columna de tiempo (A = WBS, B = Nombre)

  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 40;
  sheet.getCell(1, 1).value = "WBS";
  sheet.getCell(1, 2).value = "Nombre";
  sheet.mergeCells(1, 1, 2, 1);
  sheet.mergeCells(1, 2, 2, 2);
  styleHeader(sheet.getRow(1));
  styleHeader(sheet.getRow(2));

  // Cabecera superior: meses fusionados; inferior: día o inicio de semana.
  let groupStart = 0;
  for (let i = 0; i <= columns.length; i++) {
    const current = columns[i];
    const previous = columns[groupStart];
    if (previous && (!current || monthLabel(current.from) !== monthLabel(previous.from))) {
      if (i - 1 > groupStart) sheet.mergeCells(1, FIRST + groupStart, 1, FIRST + i - 1);
      const cell = sheet.getCell(1, FIRST + groupStart);
      cell.value = monthLabel(previous.from);
      cell.alignment = { horizontal: "center" };
      groupStart = i;
    }
  }
  columns.forEach((c, i) => {
    const col = sheet.getColumn(FIRST + i);
    col.width = effective === "day" ? 3.2 : 6.5;
    const cell = sheet.getCell(2, FIRST + i);
    cell.value = c.label;
    cell.alignment = { horizontal: "center" };
    cell.font = { size: 8, bold: true };
  });

  tasks.forEach((task, index) => {
    const rowNumber = FIRST + index;
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = task.wbsCode;
    row.getCell(2).value = task.name;
    row.getCell(2).alignment = { indent: depthOf(task) - 1 };
    if (task.isSummary) row.font = { bold: true };
    const color = barColor(task);
    columns.forEach((c, i) => {
      const cell = row.getCell(FIRST + i);
      if (c.nonWorking) cell.fill = NON_WORKING_FILL;
      if (task.isMilestone) {
        if (task.startDate >= c.from && task.startDate <= c.to) {
          cell.value = "◆";
          cell.alignment = { horizontal: "center" };
          cell.font = { bold: true, color: { argb: SUMMARY_BAR } };
        }
        return;
      }
      if (task.endDate < c.from || task.startDate > c.to) return;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    });
  });
  sheet.getRow(1).getCell(1).note =
    effective === "day"
      ? "Una columna por día; sombreado gris = no laborable."
      : "Una columna por semana (fecha del lunes); sombreado gris = semana sin días hábiles.";
}

function addResourcesSheet(workbook: ExcelJS.Workbook, ctx: ExportContext): void {
  const sheet = workbook.addWorksheet("Recursos", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 1 }],
  });
  const currency = ctx.display.currency;
  sheet.columns = [
    { header: "Nombre", key: "name", width: 30 },
    { header: "Tipo", key: "type", width: 10 },
    { header: "Correo", key: "email", width: 28 },
    { header: "Tarifa", key: "rate", width: 12, style: { numFmt: "#,##0.00" } },
    { header: "Moneda", key: "currency", width: 8 },
    { header: "Capacidad (h/día)", key: "capacity", width: 16, style: { numFmt: "0.00" } },
    { header: "Activo", key: "active", width: 8 },
    { header: "Tareas asignadas", key: "tasks", width: 16 },
    { header: "Horas asignadas", key: "hours", width: 15, style: { numFmt: "#,##0.00" } },
    { header: `Costo (${currency})`, key: "cost", width: 14, style: { numFmt: "#,##0.00" } },
  ];
  styleHeader(sheet.getRow(1));
  for (const resource of ctx.full.resources) {
    let hours = 0;
    let count = 0;
    for (const a of ctx.full.assignments) {
      if (a.resourceId !== resource.id) continue;
      const task = ctx.tasksById.get(a.taskId);
      if (!task || task.isSummary) continue;
      count += 1;
      hours += assignmentHours(task, a.allocationPct, ctx.calendar);
    }
    const cost = convertAmount(hours * resource.rate, resource.rateCurrency, ctx.display);
    sheet.addRow({
      name: resource.name,
      type: RESOURCE_TYPE_LABELS[resource.type],
      email: resource.email ?? "",
      rate: resource.rate,
      currency: resource.rateCurrency,
      capacity: resource.capacityHoursPerDay,
      active: resource.isActive ? "Sí" : "No",
      tasks: count,
      hours: Math.round(hours * 100) / 100,
      cost: cost === null ? null : Math.round(cost * 100) / 100,
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

const DEPENDENCY_LABELS = {
  FS: "Fin a inicio (FS)",
  SS: "Inicio a inicio (SS)",
  FF: "Fin a fin (FF)",
  SF: "Inicio a fin (SF)",
} as const;

function addDependenciesSheet(workbook: ExcelJS.Workbook, ctx: ExportContext): void {
  const sheet = workbook.addWorksheet("Dependencias", {
    views: [{ state: "frozen", xSplit: 0, ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Predecesora (WBS)", key: "predWbs", width: 16 },
    { header: "Predecesora", key: "predName", width: 36 },
    { header: "Sucesora (WBS)", key: "succWbs", width: 15 },
    { header: "Sucesora", key: "succName", width: 36 },
    { header: "Tipo", key: "type", width: 20 },
    { header: "Desfase (días)", key: "lag", width: 14 },
  ];
  styleHeader(sheet.getRow(1));
  const rows = ctx.full.dependencies
    .map((d) => ({
      pred: ctx.tasksById.get(d.predecessorId),
      succ: ctx.tasksById.get(d.successorId),
      d,
    }))
    .filter((r) => r.pred && r.succ)
    .sort((a, b) => compareWbs(a.succ!.wbsCode, b.succ!.wbsCode));
  for (const { pred, succ, d } of rows) {
    sheet.addRow({
      predWbs: pred!.wbsCode,
      predName: pred!.name,
      succWbs: succ!.wbsCode,
      succName: succ!.name,
      type: DEPENDENCY_LABELS[d.type],
      lag: d.lagDays,
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
}

function addSummarySheet(workbook: ExcelJS.Workbook, ctx: ExportContext): void {
  const sheet = workbook.addWorksheet("Resumen");
  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 40;
  const { project, tasks } = ctx.full;
  const leaves = tasks.filter((t) => !t.isSummary);
  let start = project.startDate;
  let end = project.startDate;
  for (const t of tasks) {
    if (t.startDate < start) start = t.startDate;
    if (t.endDate > end) end = t.endDate;
  }
  const weight = leaves.reduce((s, t) => s + Math.max(t.durationDays, t.isMilestone ? 0 : 1), 0);
  const progress =
    weight === 0
      ? 0
      : Math.round(
          leaves.reduce(
            (s, t) => s + Math.max(t.durationDays, t.isMilestone ? 0 : 1) * t.progressPct,
            0,
          ) / weight,
        );
  const rows: Array<[string, ExcelJS.CellValue, string?]> = [
    ["Proyecto", project.name],
    ["Descripción", project.description ?? ""],
    ["Inicio", excelDate(start), DATE_FORMAT],
    ["Fin", excelDate(end), DATE_FORMAT],
    ["Fecha de estado", project.statusDate ? excelDate(project.statusDate) : "", DATE_FORMAT],
    ["Duración (días hábiles)", ctx.calendar.countWorkingDays(start, end)],
    ["Tareas", tasks.length],
    ["Tareas hoja", leaves.filter((t) => !t.isMilestone).length],
    ["Hitos", leaves.filter((t) => t.isMilestone).length],
    ["Dependencias", ctx.full.dependencies.length],
    ["Recursos", ctx.full.resources.length],
    ["Avance %", progress, '0"%"'],
    ["Horas asignadas", ctx.costs.totalHours, "#,##0.00"],
    [`Costo planificado (${ctx.display.currency})`, ctx.costs.plannedCost ?? "", "#,##0.00"],
    [`Costo consumido (${ctx.display.currency})`, ctx.costs.consumedCost ?? "", "#,##0.00"],
    ["Valor UF", ctx.display.ufValue ?? "", "#,##0.00"],
    ["Exportado el", excelDate(ctx.exportedAt), DATE_FORMAT],
    ["Generado por", "GanttPro"],
  ];
  rows.forEach(([label, value, numFmt], i) => {
    const row = sheet.getRow(i + 1);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
    if (numFmt) row.getCell(2).numFmt = numFmt;
    row.getCell(2).alignment = { horizontal: "left" };
  });
}

function compareWbs(a: string, b: string): number {
  const ka = a.split(".").map(Number);
  const kb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
