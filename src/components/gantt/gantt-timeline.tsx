"use client";

import type { ArrowGeometry, BarGeometry, ShadedRange, TimeAxis } from "@ganttpro/engine";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { DependencyDto, TaskDto } from "@/lib/dto";
import { cn } from "@/lib/utils";
import {
  BAR_HEIGHT,
  BASELINE_COLOR,
  CRITICAL_COLOR,
  ROW_HEIGHT,
  pointsToPath,
  type ColorMode,
  type LabelMode,
} from "./gantt-model";
import type { DragMode } from "./use-gantt-interactions";

export interface BaselineSpan {
  readonly startDate: string;
  readonly endDate: string;
}

interface Props {
  axis: TimeAxis;
  rows: readonly TaskDto[];
  range: { start: number; end: number };
  bars: readonly BarGeometry[];
  arrows: readonly ArrowGeometry[];
  shading: readonly ShadedRange[];
  todayX: number | null;
  statusX: number | null;
  selectedTaskId: string | null;
  hoverTaskId: string | null;
  highlighted: Record<string, number>;
  showCritical: boolean;
  colorMode: ColorMode;
  labelMode: LabelMode;
  colorOf(task: TaskDto): string;
  labelOf(task: TaskDto): string;
  baselineById: ReadonlyMap<string, BaselineSpan> | null;
  dependenciesById: ReadonlyMap<string, DependencyDto>;
  dragging: DragMode | null;
  canEdit: boolean;
  svgRef: RefObject<SVGSVGElement | null>;
  previewRef: RefObject<SVGRectElement | null>;
  connectRef: RefObject<SVGLineElement | null>;
  onBarPointerDown(
    event: ReactPointerEvent,
    taskId: string,
    mode: DragMode,
    side?: "start" | "end" | null,
  ): void;
  onSelect(taskId: string): void;
  onOpenDetail(taskId: string): void;
  onHover(taskId: string | null): void;
  onArrowClick(dependency: DependencyDto, clientX: number, clientY: number): void;
}

/** Cuerpo SVG de la línea de tiempo: sombreado, grilla, barras, flechas y líneas de referencia. */
export function GanttTimeline(props: Props) {
  const { axis, rows, range, bars, arrows, shading, todayX, statusX } = props;
  const height = Math.max(rows.length * ROW_HEIGHT, ROW_HEIGHT);
  const visibleBars = bars.slice(range.start, range.end);
  const visibleIndex = new Set(rows.slice(range.start, range.end).map((t) => t.id));
  const visibleArrows = arrows.filter(
    (a) => visibleIndex.has(a.fromTaskId) || visibleIndex.has(a.toTaskId),
  );

  return (
    <svg
      ref={props.svgRef}
      width={axis.width}
      height={height}
      className={cn("block select-none", props.dragging && "cursor-grabbing")}
      data-testid="gantt-svg"
      onPointerLeave={() => props.onHover(null)}
    >
      <defs>
        <marker
          id="gantt-arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
        </marker>
        <marker
          id="gantt-arrowhead-active"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" fill={CRITICAL_COLOR} />
        </marker>
      </defs>

      {/* Fines de semana y feriados */}
      <g data-testid="gantt-shading" className="pointer-events-none">
        {shading.map((s) => (
          <rect
            key={s.from}
            x={s.x}
            y={0}
            width={s.width}
            height={height}
            className="fill-muted/60"
          />
        ))}
      </g>

      {/* Grilla vertical según la cabecera inferior */}
      <g className="stroke-border/70 pointer-events-none">
        {axis.header.bottom.map((c) => (
          <line key={c.start} x1={c.x} x2={c.x} y1={0} y2={height} strokeWidth={1} />
        ))}
      </g>

      {/* Filas: selección y resaltado */}
      <g className="pointer-events-none">
        {rows.slice(range.start, range.end).map((task, i) => {
          const index = range.start + i;
          const selected = task.id === props.selectedTaskId;
          const lit = Boolean(props.highlighted[task.id]);
          if (!selected && !lit) return null;
          return (
            <rect
              key={task.id}
              x={0}
              y={index * ROW_HEIGHT}
              width={axis.width}
              height={ROW_HEIGHT}
              className={cn(lit ? "fill-amber-200/50" : "fill-primary/10")}
            />
          );
        })}
      </g>

      {/* Líneas base */}
      {props.baselineById ? (
        <g data-testid="gantt-baselines" className="pointer-events-none">
          {visibleBars.map((bar) => {
            const span = props.baselineById?.get(bar.taskId);
            const task = rows[bar.rowIndex];
            if (!span || !task || task.isSummary) return null;
            const x = axis.xOf(span.startDate);
            const width = axis.xOf(span.endDate) + axis.pxPerDay - x;
            return (
              <rect
                key={`bl-${bar.taskId}`}
                x={x}
                y={bar.centerY + BAR_HEIGHT / 2 - 1}
                width={Math.max(2, width)}
                height={5}
                rx={1}
                fill={BASELINE_COLOR}
                opacity={0.8}
              />
            );
          })}
        </g>
      ) : null}

      {/* Flechas de dependencia */}
      <g data-testid="gantt-arrows" fill="none">
        {visibleArrows.map((arrow) => {
          const active =
            props.hoverTaskId === arrow.fromTaskId ||
            props.hoverTaskId === arrow.toTaskId ||
            props.selectedTaskId === arrow.fromTaskId ||
            props.selectedTaskId === arrow.toTaskId;
          const dep = props.dependenciesById.get(arrow.dependencyId);
          return (
            <g
              key={arrow.dependencyId}
              data-testid="gantt-arrow"
              data-dependency-id={arrow.dependencyId}
            >
              {/* Zona de clic amplia */}
              <path
                d={pointsToPath(arrow.points)}
                stroke="transparent"
                strokeWidth={10}
                className={cn(dep && props.canEdit && "cursor-pointer")}
                onClick={(e) => dep && props.onArrowClick(dep, e.clientX, e.clientY)}
              />
              <path
                d={pointsToPath(arrow.points)}
                stroke={active ? CRITICAL_COLOR : "currentColor"}
                className="text-muted-foreground pointer-events-none"
                strokeWidth={active ? 2 : 1.25}
                markerEnd={active ? "url(#gantt-arrowhead-active)" : "url(#gantt-arrowhead)"}
              />
            </g>
          );
        })}
      </g>

      {/* Barras */}
      <g data-testid="gantt-bars">
        {visibleBars.map((bar) => {
          const task = rows[bar.rowIndex] as TaskDto;
          const critical = props.showCritical && task.isCritical;
          const color = critical ? CRITICAL_COLOR : props.colorOf(task);
          const label = props.labelOf(task);
          const common = {
            "data-task-id": task.id,
            onPointerEnter: () => props.onHover(task.id),
            onClick: () => props.onSelect(task.id),
            onDoubleClick: () => props.onOpenDetail(task.id),
          } as const;

          if (bar.kind === "milestone") {
            const cx = bar.x + bar.width / 2;
            const cy = bar.centerY;
            const r = bar.width / 2;
            return (
              <g key={task.id} {...common} className={cn("group", props.canEdit && "cursor-move")}>
                <path
                  d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`}
                  fill={color}
                  stroke="white"
                  strokeWidth={1}
                  data-handle="move"
                  onPointerDown={(e) => props.onBarPointerDown(e, task.id, "move")}
                />
                <Connectors
                  bar={bar}
                  taskId={task.id}
                  canEdit={props.canEdit}
                  onPointerDown={props.onBarPointerDown}
                />
                {label ? (
                  <text
                    x={bar.labelX}
                    y={cy + 4}
                    className="fill-foreground pointer-events-none text-[11px]"
                  >
                    {label}
                  </text>
                ) : null}
              </g>
            );
          }

          if (bar.kind === "summary") {
            const y = bar.centerY - 6;
            const h = 10;
            return (
              <g key={task.id} {...common} className="group">
                <path
                  d={`M${bar.x} ${y + h} L${bar.x} ${y} L${bar.x + bar.width} ${y} L${bar.x + bar.width} ${y + h} L${bar.x + bar.width - 5} ${y + 4} L${bar.x + 5} ${y + 4} Z`}
                  fill={color}
                  data-handle="none"
                />
                {label ? (
                  <text
                    x={bar.labelX}
                    y={bar.centerY + 4}
                    className="fill-foreground pointer-events-none text-[11px] font-medium"
                  >
                    {label}
                  </text>
                ) : null}
              </g>
            );
          }

          return (
            <g key={task.id} {...common} className={cn("group", props.canEdit && "cursor-move")}>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={3}
                fill={color}
                fillOpacity={0.35}
                stroke={color}
                data-handle="move"
                onPointerDown={(e) => props.onBarPointerDown(e, task.id, "move")}
              />
              <rect
                x={bar.x}
                y={bar.y}
                width={Math.max(0, bar.progressWidth)}
                height={bar.height}
                rx={3}
                fill={color}
                className="pointer-events-none"
              />
              {props.canEdit ? (
                <>
                  {/* Handle de duración (borde derecho) */}
                  <rect
                    x={bar.x + bar.width - 5}
                    y={bar.y}
                    width={6}
                    height={bar.height}
                    fill="transparent"
                    className="cursor-ew-resize"
                    data-handle="resize"
                    onPointerDown={(e) => props.onBarPointerDown(e, task.id, "resize")}
                  />
                  {/* Handle de avance (triángulo bajo la barra) */}
                  <path
                    d={`M${bar.x + bar.progressWidth} ${bar.y + bar.height} l-5 6 h10 z`}
                    fill={color}
                    className="cursor-col-resize opacity-0 group-hover:opacity-100"
                    data-handle="progress"
                    onPointerDown={(e) => props.onBarPointerDown(e, task.id, "progress")}
                  />
                  <Connectors
                    bar={bar}
                    taskId={task.id}
                    canEdit={props.canEdit}
                    onPointerDown={props.onBarPointerDown}
                  />
                </>
              ) : null}
              {label ? (
                <text
                  x={bar.labelX}
                  y={bar.centerY + 4}
                  className="fill-foreground pointer-events-none text-[11px]"
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* Previsualización de arrastre (se actualiza por DOM, sin re-render) */}
      <rect
        ref={props.previewRef}
        visibility="hidden"
        rx={3}
        fill={CRITICAL_COLOR}
        fillOpacity={0.35}
        stroke={CRITICAL_COLOR}
        strokeDasharray="4 3"
        className="pointer-events-none"
        data-testid="gantt-preview"
      />
      <line
        ref={props.connectRef}
        visibility="hidden"
        stroke={CRITICAL_COLOR}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        className="pointer-events-none"
        data-testid="gantt-connect-preview"
      />

      {/* Líneas "Hoy" y "Fecha de estado" */}
      {todayX !== null ? (
        <g data-testid="gantt-today" className="pointer-events-none">
          <line
            x1={todayX}
            x2={todayX}
            y1={0}
            y2={height}
            stroke="#2563eb"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </g>
      ) : null}
      {statusX !== null ? (
        <g data-testid="gantt-status-date" className="pointer-events-none">
          <line
            x1={statusX}
            x2={statusX}
            y1={0}
            y2={height}
            stroke="#d97706"
            strokeWidth={1.5}
            strokeDasharray="6 3"
          />
        </g>
      ) : null}
    </svg>
  );
}

function Connectors({
  bar,
  taskId,
  canEdit,
  onPointerDown,
}: {
  bar: BarGeometry;
  taskId: string;
  canEdit: boolean;
  onPointerDown: Props["onBarPointerDown"];
}) {
  if (!canEdit) return null;
  const r = 5;
  return (
    <>
      <circle
        cx={bar.x - r - 1}
        cy={bar.centerY}
        r={r}
        className="fill-background stroke-primary cursor-crosshair opacity-0 group-hover:opacity-100"
        strokeWidth={1.5}
        data-connector="start"
        data-task-id={taskId}
        aria-label="Conector de inicio"
        onPointerDown={(e) => onPointerDown(e, taskId, "connect", "start")}
      />
      <circle
        cx={bar.x + bar.width + r + 1}
        cy={bar.centerY}
        r={r}
        className="fill-background stroke-primary cursor-crosshair opacity-0 group-hover:opacity-100"
        strokeWidth={1.5}
        data-connector="end"
        data-task-id={taskId}
        aria-label="Conector de fin"
        onPointerDown={(e) => onPointerDown(e, taskId, "connect", "end")}
      />
    </>
  );
}
