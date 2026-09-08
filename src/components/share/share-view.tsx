import {
  createCalendar,
  createTimeAxis,
  diffDays,
  markerX,
  nonWorkingRanges,
  type TimeScale,
} from "@ganttpro/engine";
import {
  BAR_HEIGHT,
  CRITICAL_COLOR,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  barColor,
  buildScene,
  ganttRows,
  pointsToPath,
  projectRange,
} from "@/components/gantt/gantt-model";
import { formatDateCl, todayIso } from "@/lib/dates";
import type { ProjectFullDto, TaskDto } from "@/lib/dto";

/**
 * Datos que sí se publican en un enlace de solo lectura: el plan y su calendario. Deja fuera
 * `members` (nombres y correos de las personas del proyecto) y cualquier dato de contacto.
 */
export type SharedProject = Pick<
  ProjectFullDto,
  "project" | "calendar" | "tasks" | "dependencies" | "resources" | "assignments"
>;

/**
 * Vista pública de solo lectura de un proyecto (UC-33). Componente de servidor sin interactividad
 * ni acceso al store: dibuja la tabla WBS y una línea de tiempo continua con la misma geometría
 * del engine que usan la pantalla y la impresión.
 */

const GRID_COLOR = "#e5e7eb";
const SHADE_COLOR = "#f3f4f6";
const TEXT_COLOR = "#111827";
const MUTED_COLOR = "#6b7280";
const TODAY_COLOR = "#2563eb";
const STATUS_COLOR = "#d97706";
const FONT = "Plus Jakarta Sans, Segoe UI, Arial, sans-serif";

/** Escala según cuánto dura el proyecto, para que quepa sin desplazamientos enormes. */
function scaleFor(from: string, to: string): TimeScale {
  const days = diffDays(from, to);
  if (days <= 70) return "day";
  if (days <= 400) return "week";
  return "month";
}

function depthOf(task: TaskDto): number {
  return task.wbsCode.split(".").length;
}

export function ShareView({ full }: { full: SharedProject }) {
  const { project, tasks, dependencies, calendar: calendarDto } = full;
  const rows = ganttRows(tasks, {});
  const range = projectRange(tasks, project.startDate);
  const axis = createTimeAxis({ scale: scaleFor(range.from, range.to), ...range });
  const calendar = createCalendar({
    workingDays: calendarDto.workingDays,
    hoursPerDay: calendarDto.hoursPerDay,
    holidays: calendarDto.holidays.map((h) => h.date),
  });
  const shading = nonWorkingRanges(axis, calendar);
  const scene = buildScene(rows, dependencies, axis);
  const bodyHeight = Math.max(rows.length, 1) * ROW_HEIGHT;
  const todayX = markerX(axis, todayIso());
  const statusX = project.statusDate ? markerX(axis, project.statusDate) : null;
  const colorCtx = { assignments: full.assignments, resources: full.resources };

  return (
    <div className="flex min-h-screen flex-col bg-white" data-testid="share-view">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight" data-testid="share-project-name">
          {project.name}
        </h1>
        <span
          className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
          data-testid="share-readonly"
        >
          Solo lectura
        </span>
        <p className="text-muted-foreground ml-auto text-xs">
          {rows.length} tareas · inicio {formatDateCl(project.startDate)}
          {project.statusDate ? ` · fecha de estado ${formatDateCl(project.statusDate)}` : ""}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-6 text-sm">Este proyecto todavía no tiene tareas.</p>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-auto">
          <table
            className="shrink-0 border-r text-sm"
            style={{ borderCollapse: "collapse" }}
            data-testid="share-table"
          >
            <caption className="sr-only">Tareas del proyecto {project.name}</caption>
            <thead>
              <tr style={{ height: HEADER_HEIGHT }} className="bg-muted/60 align-bottom">
                <th className="w-16 px-2 pb-2 text-left text-xs font-medium">WBS</th>
                <th className="w-72 px-2 pb-2 text-left text-xs font-medium">Nombre</th>
                <th className="w-24 px-2 pb-2 text-left text-xs font-medium">Inicio</th>
                <th className="w-24 px-2 pb-2 text-left text-xs font-medium">Fin</th>
                <th className="w-20 px-2 pb-2 text-right text-xs font-medium">Duración</th>
                <th className="w-20 px-2 pb-2 text-right text-xs font-medium">Avance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr
                  key={task.id}
                  style={{ height: ROW_HEIGHT }}
                  className="border-t"
                  data-testid="share-row"
                >
                  <td className="text-muted-foreground px-2 text-xs tabular-nums">
                    {task.wbsCode}
                  </td>
                  <td
                    className={task.isSummary ? "px-2 font-medium" : "px-2"}
                    style={{ paddingLeft: 8 + (depthOf(task) - 1) * 14 }}
                  >
                    {task.isMilestone ? "◆ " : ""}
                    {task.name}
                  </td>
                  <td className="px-2 text-xs tabular-nums">{formatDateCl(task.startDate)}</td>
                  <td className="px-2 text-xs tabular-nums">{formatDateCl(task.endDate)}</td>
                  <td className="px-2 text-right text-xs tabular-nums">
                    {task.isMilestone ? "hito" : `${task.durationDays} d`}
                  </td>
                  <td className="px-2 text-right text-xs tabular-nums">{task.progressPct} %</td>
                </tr>
              ))}
            </tbody>
          </table>

          <svg
            width={axis.width}
            height={HEADER_HEIGHT + bodyHeight}
            className="shrink-0"
            role="img"
            aria-label={`Carta Gantt de ${project.name}`}
            data-testid="share-gantt"
          >
            <defs>
              <marker
                id="share-arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 z" fill={MUTED_COLOR} />
              </marker>
            </defs>

            {/* Cabecera de dos niveles */}
            <g>
              <rect x={0} y={0} width={axis.width} height={HEADER_HEIGHT} fill={SHADE_COLOR} />
              {axis.header.top.map((c) => (
                <g key={`t-${c.start}`}>
                  <rect
                    x={c.x}
                    y={0}
                    width={c.width}
                    height={HEADER_HEIGHT / 2}
                    fill="none"
                    stroke={GRID_COLOR}
                  />
                  <text
                    x={c.x + 6}
                    y={HEADER_HEIGHT / 2 - 7}
                    fontSize={11}
                    fontFamily={FONT}
                    fontWeight={600}
                    fill={TEXT_COLOR}
                  >
                    {c.width > 40 ? c.label : ""}
                  </text>
                </g>
              ))}
              {axis.header.bottom.map((c) => (
                <g key={`b-${c.start}`}>
                  <rect
                    x={c.x}
                    y={HEADER_HEIGHT / 2}
                    width={c.width}
                    height={HEADER_HEIGHT / 2}
                    fill="none"
                    stroke={GRID_COLOR}
                  />
                  <text
                    x={c.x + c.width / 2}
                    y={HEADER_HEIGHT - 7}
                    textAnchor="middle"
                    fontSize={10}
                    fontFamily={FONT}
                    fill={MUTED_COLOR}
                  >
                    {c.width >= 18 ? c.label : ""}
                  </text>
                </g>
              ))}
            </g>

            <g transform={`translate(0,${HEADER_HEIGHT})`}>
              {/* Días no laborables */}
              {shading.map((s) => (
                <rect
                  key={s.from}
                  x={s.x}
                  y={0}
                  width={s.width}
                  height={bodyHeight}
                  fill={SHADE_COLOR}
                />
              ))}
              {/* Grilla vertical y separadores de fila */}
              {axis.header.bottom.map((c) => (
                <line
                  key={`g-${c.start}`}
                  x1={c.x}
                  x2={c.x}
                  y1={0}
                  y2={bodyHeight}
                  stroke={GRID_COLOR}
                />
              ))}
              {rows.map((task, i) => (
                <line
                  key={`r-${task.id}`}
                  x1={0}
                  x2={axis.width}
                  y1={i * ROW_HEIGHT}
                  y2={i * ROW_HEIGHT}
                  stroke={GRID_COLOR}
                />
              ))}

              {/* Flechas de dependencia */}
              {scene.arrows.map((arrow) => (
                <path
                  key={arrow.dependencyId}
                  d={pointsToPath(arrow.points)}
                  fill="none"
                  stroke={MUTED_COLOR}
                  strokeWidth={1.25}
                  markerEnd="url(#share-arrowhead)"
                />
              ))}

              {/* Barras, resúmenes e hitos */}
              {scene.bars.map((bar) => {
                const task = rows[bar.rowIndex];
                if (!task) return null;
                const color = task.isCritical ? CRITICAL_COLOR : barColor(task, "task", colorCtx);
                if (bar.kind === "milestone") {
                  const cx = bar.x + bar.width / 2;
                  const cy = bar.centerY;
                  const r = bar.width / 2;
                  return (
                    <path
                      key={task.id}
                      d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`}
                      fill={color}
                      stroke="#ffffff"
                    />
                  );
                }
                if (bar.kind === "summary") {
                  const y = bar.centerY - 6;
                  return (
                    <path
                      key={task.id}
                      d={`M${bar.x} ${y + 10} L${bar.x} ${y} L${bar.x + bar.width} ${y} L${bar.x + bar.width} ${y + 10} L${bar.x + bar.width - 5} ${y + 4} L${bar.x + 5} ${y + 4} Z`}
                      fill={color}
                    />
                  );
                }
                return (
                  <g key={task.id}>
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={BAR_HEIGHT}
                      rx={3}
                      fill={color}
                      fillOpacity={0.35}
                      stroke={color}
                    />
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={Math.max(0, bar.progressWidth)}
                      height={BAR_HEIGHT}
                      rx={3}
                      fill={color}
                    />
                  </g>
                );
              })}

              {/* Líneas "Hoy" y "Fecha de estado" */}
              {todayX !== null ? (
                <line
                  x1={todayX}
                  x2={todayX}
                  y1={0}
                  y2={bodyHeight}
                  stroke={TODAY_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              ) : null}
              {statusX !== null ? (
                <line
                  x1={statusX}
                  x2={statusX}
                  y1={0}
                  y2={bodyHeight}
                  stroke={STATUS_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                />
              ) : null}
            </g>
          </svg>
        </div>
      )}

      <footer className="text-muted-foreground border-t px-6 py-3 text-xs">
        Vista compartida de solo lectura generada por GanttPro. No es posible editar el proyecto
        desde aquí.
      </footer>
    </div>
  );
}
