import {
  createCalendar,
  createTimeAxis,
  markerX,
  nonWorkingRanges,
  type IsoDate,
  type ShadedRange,
  type TimeAxis,
} from "@ganttpro/engine";
import {
  BAR_HEIGHT,
  BASELINE_COLOR,
  CRITICAL_COLOR,
  HEADER_HEIGHT,
  MILESTONE_COLOR,
  ROW_HEIGHT,
  SUMMARY_COLOR,
  barColor,
  buildScene,
  ganttRows,
  pointsToPath,
  projectRange,
  type GanttScene,
} from "@/components/gantt/gantt-model";
import { formatDateCl } from "@/lib/dates";
import type { BaselineTaskDto, ProjectFullDto, TaskDto } from "@/lib/dto";
import {
  PAGE_MARGIN_MM,
  PRINT_COLUMN_LABELS,
  PRINT_COLUMN_WIDTHS,
  PRINT_FOOTER_PX,
  PRINT_HEADER_PX,
  paginate,
  paperMm,
  paperPx,
  printTableWidth,
  type PdfOptions,
  type PrintColumn,
  type PrintPage,
} from "@/lib/export/print-model";
import { formatPredecessors } from "@/lib/predecessors";

/**
 * Documento imprimible del Gantt (UC-27). Componente de servidor sin interactividad: cada página es
 * una `<section class="page">` del tamaño exacto del papel con cabecera, tabla WBS, tramo de la línea
 * de tiempo en SVG (misma geometría del engine que la pantalla) y pie con "Página X de Y".
 * Todo el texto es vectorial y seleccionable; los colores van inline, sin clases de Tailwind.
 */

const TODAY_COLOR = "#2563eb";
const STATUS_COLOR = "#d97706";
const GRID_COLOR = "#e5e7eb";
const HEADER_BG = "#f3f4f6";
const TEXT_COLOR = "#111827";
const MUTED_COLOR = "#6b7280";
const FONT = "Geist, Arial, Helvetica, sans-serif";
/** La tabla nunca ocupa más de este porcentaje del ancho útil para dejar sitio al Gantt. */
const MAX_TABLE_RATIO = 0.6;

export interface PrintBaseline {
  readonly name: string;
  readonly tasks: readonly BaselineTaskDto[];
}

export interface PrintGanttProps {
  readonly full: ProjectFullDto;
  readonly options: PdfOptions;
  readonly logoUrl: string | null;
  readonly baseline: PrintBaseline | null;
  /** Fecha de impresión (`YYYY-MM-DD`). */
  readonly printedAt: IsoDate;
}

interface PrintModel {
  readonly rows: TaskDto[];
  readonly tasksById: Map<string, TaskDto>;
  readonly axis: TimeAxis;
  readonly shading: ShadedRange[];
  readonly scene: GanttScene;
  readonly pages: PrintPage[];
  readonly tableWidth: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly todayX: number | null;
  readonly statusX: number | null;
  readonly baselineById: Map<string, BaselineTaskDto> | null;
  readonly resourcesByTask: Map<string, string>;
}

function buildPrintModel(props: PrintGanttProps): PrintModel {
  const { full, options } = props;
  const rows = ganttRows(full.tasks, {});
  const tasksById = new Map(rows.map((t) => [t.id, t]));
  const range = projectRange(full.tasks, full.project.startDate);
  const from = options.from ?? range.from;
  const to = options.to ?? range.to;
  const axis = createTimeAxis({ scale: options.scale, from: from <= to ? from : to, to });
  const calendar = createCalendar({
    workingDays: full.calendar.workingDays,
    hoursPerDay: full.calendar.hoursPerDay,
    holidays: full.calendar.holidays.map((h) => h.date),
  });
  const shading = nonWorkingRanges(axis, calendar);
  const scene = buildScene(rows, full.dependencies, axis);
  const paper = paperPx(options.size, options.orientation);
  const tableWidth = Math.min(
    printTableWidth(options.columns),
    Math.floor(paper.width * MAX_TABLE_RATIO),
  );
  const pages = paginate({
    rowCount: rows.length,
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    axisWidth: axis.width,
    leftWidth: tableWidth,
    pageWidth: paper.width,
    pageHeight: paper.height,
  });
  const resourceNames = new Map(full.resources.map((r) => [r.id, r.name]));
  const resourcesByTask = new Map<string, string>();
  for (const a of full.assignments) {
    const name = resourceNames.get(a.resourceId);
    if (!name) continue;
    const current = resourcesByTask.get(a.taskId);
    resourcesByTask.set(a.taskId, current ? `${current}, ${name}` : name);
  }
  return {
    rows,
    tasksById,
    axis,
    shading,
    scene,
    pages,
    tableWidth,
    pageWidth: paper.width,
    pageHeight: paper.height,
    todayX: markerX(axis, props.printedAt),
    statusX: full.project.statusDate ? markerX(axis, full.project.statusDate) : null,
    baselineById: props.baseline ? new Map(props.baseline.tasks.map((t) => [t.taskId, t])) : null,
    resourcesByTask,
  };
}

export function PrintGantt(props: PrintGanttProps) {
  const { full, options } = props;
  const model = buildPrintModel(props);
  const paper = paperMm(options.size, options.orientation);
  const title = options.title ?? full.project.name;
  const subtitle = [
    `Impreso el ${formatDateCl(props.printedAt)}`,
    full.project.statusDate ? `Fecha de estado ${formatDateCl(full.project.statusDate)}` : null,
    props.baseline ? `Línea base "${props.baseline.name}"` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const css = `
@page { size: ${options.size} ${options.orientation}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.print-root { color: ${TEXT_COLOR}; font-family: ${FONT}; font-size: 11px; }
.page {
  box-sizing: border-box;
  width: ${paper.width}mm;
  height: ${paper.height - 0.5}mm;
  padding: ${PAGE_MARGIN_MM}mm;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  break-after: page;
  page-break-after: always;
  background: #fff;
}
.page:last-child { break-after: auto; page-break-after: auto; }
.page-header { height: ${PRINT_HEADER_PX}px; display: flex; align-items: center; gap: 12px; }
.page-header h1 { font-size: 16px; font-weight: 600; margin: 0; line-height: 1.2; }
.page-header p { margin: 2px 0 0; font-size: 10px; color: ${MUTED_COLOR}; }
.page-header img { max-height: 36px; max-width: 120px; object-fit: contain; }
.page-body { display: flex; align-items: flex-start; overflow: hidden; }
.print-table { border-collapse: collapse; table-layout: fixed; font-size: 10px; }
.print-table th, .print-table td {
  padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-bottom: 1px solid ${GRID_COLOR}; text-align: left; height: ${ROW_HEIGHT}px;
  line-height: ${ROW_HEIGHT}px; box-sizing: border-box;
}
.print-table th { height: ${HEADER_HEIGHT}px; line-height: ${HEADER_HEIGHT}px; background: ${HEADER_BG}; font-weight: 600; }
.print-table td.num { text-align: right; }
.print-table tr.summary td { font-weight: 600; }
.page-footer {
  height: ${PRINT_FOOTER_PX}px; margin-top: auto; display: flex; align-items: center;
  justify-content: space-between; gap: 12px; font-size: 9px; color: ${MUTED_COLOR};
  border-top: 1px solid ${GRID_COLOR};
}
.legend { display: flex; gap: 10px; align-items: center; flex-wrap: nowrap; }
.legend span { display: inline-flex; align-items: center; gap: 4px; }
@media screen { body { background: #9ca3af; } .page { margin: 8px auto; box-shadow: 0 1px 4px rgba(0,0,0,.3); } }
`;

  return (
    <>
      <style>{css}</style>
      <div data-testid="print-document" data-pages={model.pages.length}>
        {model.pages.map((page) => (
          <section className="page" key={page.index} data-testid="print-page">
            <header className="page-header">
              {options.logo && props.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagen externa configurable, sin optimizar
                <img src={props.logoUrl} alt="" />
              ) : null}
              <div>
                <h1>{title}</h1>
                <p>{subtitle}</p>
              </div>
            </header>
            <div className="page-body">
              <PrintTable model={model} page={page} columns={options.columns} full={full} />
              <PrintTimeline model={model} page={page} options={options} />
            </div>
            <footer className="page-footer">
              <span>{full.project.name}</span>
              {options.legend ? <Legend showBaseline={Boolean(props.baseline)} /> : <span />}
              <span>
                Página {page.index + 1} de {model.pages.length}
              </span>
            </footer>
          </section>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Tabla WBS

function PrintTable({
  model,
  page,
  columns,
  full,
}: {
  model: PrintModel;
  page: PrintPage;
  columns: readonly PrintColumn[];
  full: ProjectFullDto;
}) {
  const natural = printTableWidth(columns);
  const factor = model.tableWidth / natural;
  const band = model.rows.slice(page.rowStart, page.rowEnd);
  return (
    <table className="print-table" style={{ width: model.tableWidth, flex: "none" }}>
      <colgroup>
        {columns.map((c) => (
          <col key={c} style={{ width: Math.floor(PRINT_COLUMN_WIDTHS[c] * factor) }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{PRINT_COLUMN_LABELS[c]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {band.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>No hay tareas</td>
          </tr>
        ) : null}
        {band.map((task) => (
          <tr key={task.id} className={task.isSummary ? "summary" : undefined}>
            {columns.map((c) => (
              <td key={c} className={NUMERIC_COLUMNS.has(c) ? "num" : undefined}>
                {cellText(c, task, model, full)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const NUMERIC_COLUMNS = new Set<PrintColumn>(["duration", "progress"]);

function cellText(
  column: PrintColumn,
  task: TaskDto,
  model: PrintModel,
  full: ProjectFullDto,
): string {
  switch (column) {
    case "wbs":
      return task.wbsCode;
    case "name": {
      const depth = task.wbsCode.split(".").length - 1;
      const indent = " ".repeat(depth * 3);
      return `${indent}${task.isMilestone && !task.isSummary ? "◆ " : ""}${task.name}`;
    }
    case "start":
      return formatDateCl(task.startDate);
    case "end":
      return formatDateCl(task.endDate);
    case "duration":
      return task.isMilestone ? "0 d" : `${task.durationDays} d`;
    case "progress":
      return `${task.progressPct} %`;
    case "resources":
      return model.resourcesByTask.get(task.id) ?? "";
    case "predecessors":
      return formatPredecessors(task.id, full.dependencies, model.tasksById);
  }
}

// ------------------------------------------------------------------ Línea de tiempo

function PrintTimeline({
  model,
  page,
  options,
}: {
  model: PrintModel;
  page: PrintPage;
  options: PdfOptions;
}) {
  const { axis, rows, scene } = model;
  const width = page.xTo - page.xFrom;
  const bandRows = page.rowEnd - page.rowStart;
  const bodyHeight = Math.max(ROW_HEIGHT, bandRows * ROW_HEIGHT);
  const height = HEADER_HEIGHT + bodyHeight;
  const half = HEADER_HEIGHT / 2;
  const clipId = `print-clip-${page.index}`;
  const markerId = `print-arrow-${page.index}`;
  const offsetY = HEADER_HEIGHT - page.rowStart * ROW_HEIGHT;
  const bandIds = new Set(rows.slice(page.rowStart, page.rowEnd).map((t) => t.id));
  const bars = scene.bars.slice(page.rowStart, page.rowEnd);
  const arrows = scene.arrows.filter((a) => bandIds.has(a.fromTaskId) || bandIds.has(a.toTaskId));
  const inSlice = (x0: number, x1: number) => x1 >= page.xFrom - 20 && x0 <= page.xTo + 20;
  const colorCtx = { assignments: [], resources: [] } as const;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`${page.xFrom} 0 ${width} ${height}`}
      style={{ display: "block", flex: "none", fontFamily: FONT }}
      data-testid="print-timeline"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={page.xFrom} y={HEADER_HEIGHT} width={width} height={bodyHeight} />
        </clipPath>
        <marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={MUTED_COLOR} />
        </marker>
      </defs>

      {/* Cabecera de dos niveles */}
      <rect x={page.xFrom} y={0} width={width} height={HEADER_HEIGHT} fill={HEADER_BG} />
      {axis.header.top
        .filter((c) => inSlice(c.x, c.x + c.width))
        .map((c) => (
          <g key={`t-${c.start}`}>
            <rect x={c.x} y={0} width={c.width} height={half} fill="none" stroke={GRID_COLOR} />
            <text
              x={Math.max(c.x, page.xFrom) + 6}
              y={half - 7}
              fontSize={11}
              fontWeight={600}
              fill={TEXT_COLOR}
            >
              {c.width > 40 ? c.label : ""}
            </text>
          </g>
        ))}
      {axis.header.bottom
        .filter((c) => inSlice(c.x, c.x + c.width))
        .map((c) => (
          <g key={`b-${c.start}`}>
            <rect x={c.x} y={half} width={c.width} height={half} fill="none" stroke={GRID_COLOR} />
            <text
              x={c.x + c.width / 2}
              y={HEADER_HEIGHT - 7}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED_COLOR}
            >
              {c.width >= 18 ? c.label : ""}
            </text>
          </g>
        ))}

      <g clipPath={`url(#${clipId})`}>
        {/* Días no laborables */}
        {model.shading
          .filter((s) => inSlice(s.x, s.x + s.width))
          .map((s) => (
            <rect
              key={s.from}
              x={s.x}
              y={HEADER_HEIGHT}
              width={s.width}
              height={bodyHeight}
              fill={HEADER_BG}
              opacity={0.9}
            />
          ))}
        {/* Grilla vertical */}
        {axis.header.bottom
          .filter((c) => inSlice(c.x, c.x))
          .map((c) => (
            <line
              key={`g-${c.start}`}
              x1={c.x}
              x2={c.x}
              y1={HEADER_HEIGHT}
              y2={height}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
          ))}
        {/* Separadores de fila */}
        {Array.from({ length: bandRows + 1 }, (_, i) => (
          <line
            key={`r-${i}`}
            x1={page.xFrom}
            x2={page.xTo}
            y1={HEADER_HEIGHT + i * ROW_HEIGHT}
            y2={HEADER_HEIGHT + i * ROW_HEIGHT}
            stroke={GRID_COLOR}
            strokeWidth={0.5}
          />
        ))}

        <g transform={`translate(0 ${offsetY})`}>
          {/* Línea base */}
          {model.baselineById
            ? bars.map((bar) => {
                const task = rows[bar.rowIndex];
                const span = model.baselineById?.get(bar.taskId);
                if (!span || !task || task.isSummary) return null;
                const x = axis.xOf(span.startDate);
                const w = axis.xOf(span.endDate) + axis.pxPerDay - x;
                if (!inSlice(x, x + w)) return null;
                return (
                  <rect
                    key={`bl-${bar.taskId}`}
                    x={x}
                    y={bar.centerY + BAR_HEIGHT / 2 - 1}
                    width={Math.max(2, w)}
                    height={5}
                    rx={1}
                    fill={BASELINE_COLOR}
                    opacity={0.8}
                  />
                );
              })
            : null}

          {/* Flechas */}
          {arrows.map((arrow) => (
            <path
              key={arrow.dependencyId}
              d={pointsToPath(arrow.points)}
              fill="none"
              stroke={MUTED_COLOR}
              strokeWidth={1.25}
              markerEnd={`url(#${markerId})`}
            />
          ))}

          {/* Barras */}
          {bars.map((bar) => {
            const task = rows[bar.rowIndex];
            if (!task) return null;
            const critical = options.critical && task.isCritical;
            const color = critical ? CRITICAL_COLOR : barColor(task, "task", colorCtx);
            // Se dibuja si empieza antes del borde derecho; el clipPath recorta lo que queda fuera y el
            // resto del texto continúa en el tramo siguiente.
            const labelVisible = bar.labelX < page.xTo;
            const label = labelVisible ? (
              <text
                x={bar.labelX}
                y={bar.centerY + 4}
                fontSize={11}
                fill={TEXT_COLOR}
                fontWeight={task.isSummary ? 600 : 400}
              >
                {task.name}
              </text>
            ) : null;
            if (bar.kind === "milestone") {
              const cx = bar.x + bar.width / 2;
              const cy = bar.centerY;
              const r = bar.width / 2;
              return (
                <g key={task.id}>
                  <path
                    d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`}
                    fill={critical ? CRITICAL_COLOR : MILESTONE_COLOR}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                  {label}
                </g>
              );
            }
            if (bar.kind === "summary") {
              const y = bar.centerY - 6;
              const h = 10;
              return (
                <g key={task.id}>
                  <path
                    d={`M${bar.x} ${y + h} L${bar.x} ${y} L${bar.x + bar.width} ${y} L${bar.x + bar.width} ${y + h} L${bar.x + bar.width - 5} ${y + 4} L${bar.x + 5} ${y + 4} Z`}
                    fill={critical ? CRITICAL_COLOR : SUMMARY_COLOR}
                  />
                  {label}
                </g>
              );
            }
            return (
              <g key={task.id}>
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx={3}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={color}
                />
                <rect
                  x={bar.x}
                  y={bar.y}
                  width={Math.max(0, bar.progressWidth)}
                  height={bar.height}
                  rx={3}
                  fill={color}
                />
                {label}
              </g>
            );
          })}
        </g>

        {/* Hoy y fecha de estado */}
        {model.todayX !== null && inSlice(model.todayX, model.todayX) ? (
          <line
            x1={model.todayX}
            x2={model.todayX}
            y1={HEADER_HEIGHT}
            y2={height}
            stroke={TODAY_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ) : null}
        {model.statusX !== null && inSlice(model.statusX, model.statusX) ? (
          <line
            x1={model.statusX}
            x2={model.statusX}
            y1={HEADER_HEIGHT}
            y2={height}
            stroke={STATUS_COLOR}
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
        ) : null}
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------ Leyenda

function Legend({ showBaseline }: { showBaseline: boolean }) {
  return (
    <span className="legend" data-testid="print-legend">
      <span>
        <Swatch>
          <rect x={0} y={3} width={16} height={8} rx={2} fill="#2563eb" fillOpacity={0.5} />
        </Swatch>
        Tarea
      </span>
      <span>
        <Swatch>
          <path d="M0 11 L0 3 L16 3 L16 11 L13 6 L3 6 Z" fill={SUMMARY_COLOR} />
        </Swatch>
        Resumen
      </span>
      <span>
        <Swatch>
          <path d="M8 1 L14 7 L8 13 L2 7 Z" fill={MILESTONE_COLOR} />
        </Swatch>
        Hito
      </span>
      <span>
        <Swatch>
          <rect x={0} y={3} width={16} height={8} rx={2} fill={CRITICAL_COLOR} />
        </Swatch>
        Ruta crítica
      </span>
      {showBaseline ? (
        <span>
          <Swatch>
            <rect x={0} y={5} width={16} height={4} rx={1} fill={BASELINE_COLOR} />
          </Swatch>
          Línea base
        </span>
      ) : null}
      <span>
        <Swatch>
          <line
            x1={8}
            x2={8}
            y1={0}
            y2={14}
            stroke={TODAY_COLOR}
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
        </Swatch>
        Hoy
      </span>
      <span>
        <Swatch>
          <line
            x1={8}
            x2={8}
            y1={0}
            y2={14}
            stroke={STATUS_COLOR}
            strokeWidth={1.5}
            strokeDasharray="4 2"
          />
        </Swatch>
        Fecha de estado
      </span>
    </span>
  );
}

function Swatch({ children }: { children: React.ReactNode }) {
  return (
    <svg width={16} height={14} viewBox="0 0 16 14" aria-hidden>
      {children}
    </svg>
  );
}
