"use client";

import { ChevronDown, ChevronRight, Diamond } from "lucide-react";
import type { PointerEvent } from "react";
import { ColumnResizeHandle } from "@/components/columns/column-resize-handle";
import { columnVar, type ColumnSpec } from "@/lib/column-widths";
import { formatDateCl } from "@/lib/dates";
import type { DependencyDto, TaskDto } from "@/lib/dto";
import { formatPredecessors } from "@/lib/predecessors";
import { cn } from "@/lib/utils";
import { depthOf } from "@/stores/project-store";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./gantt-model";

export type GanttColumnKey = "wbs" | "name" | "start" | "end" | "pred";

/**
 * Columnas de la tabla reducida. La suma de los anchos por omisión (440 px) es el ancho inicial del
 * panel; al arrastrar un tirador el panel crece o se encoge con la columna.
 */
export const GANTT_COLUMNS: Array<ColumnSpec<GanttColumnKey> & { label: string }> = [
  { key: "wbs", label: "WBS", defaultWidth: 52, minWidth: 40 },
  { key: "name", label: "Nombre", defaultWidth: 132, minWidth: 120 },
  { key: "start", label: "Inicio", defaultWidth: 84, minWidth: 70 },
  { key: "end", label: "Fin", defaultWidth: 84, minWidth: 70 },
  { key: "pred", label: "Pred.", defaultWidth: 88, minWidth: 60 },
];

/** Identificador de la vista en `localStorage` y prefijo de las variables CSS de ancho. */
export const GANTT_COLUMNS_VIEW = "gantt";

const LAST_COLUMN: GanttColumnKey = "pred";

interface Props {
  rows: readonly TaskDto[];
  range: { start: number; end: number };
  /** Ancho del panel como expresión CSS (suma de las variables de columna). */
  width: string;
  selectedTaskId: string | null;
  highlighted: Record<string, number>;
  collapsed: Record<string, true>;
  dependencies: readonly DependencyDto[];
  tasksById: ReadonlyMap<string, TaskDto>;
  onSelect(taskId: string): void;
  onOpenDetail(taskId: string): void;
  onToggle(taskId: string): void;
  onColumnResizeStart(key: GanttColumnKey, event: PointerEvent): void;
  onColumnReset(key: GanttColumnKey): void;
}

function colStyle(key: GanttColumnKey) {
  return { width: columnVar(GANTT_COLUMNS_VIEW, key) } as const;
}

/** Tabla reducida del Gantt (WBS, Nombre, Inicio, Fin, Predecesoras), sincronizada con la línea de tiempo. */
export function GanttLeftPane({
  rows,
  range,
  width,
  selectedTaskId,
  highlighted,
  collapsed,
  dependencies,
  tasksById,
  onSelect,
  onOpenDetail,
  onToggle,
  onColumnResizeStart,
  onColumnReset,
}: Props) {
  const paneHeight = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  return (
    <div
      className="bg-background sticky left-0 z-20 shrink-0 border-r"
      style={{ width, height: paneHeight }}
      data-testid="gantt-left-pane"
    >
      <div
        className="bg-muted/60 sticky top-0 z-30 flex items-stretch border-b text-xs font-medium"
        style={{ height: HEADER_HEIGHT }}
      >
        {GANTT_COLUMNS.map((c) => (
          <div
            key={c.key}
            className="relative flex items-end overflow-hidden px-2 py-1.5 whitespace-nowrap"
            style={colStyle(c.key)}
          >
            {c.label}
            {/* La última columna la redimensiona el separador de alto completo del borde derecho. */}
            {c.key === LAST_COLUMN ? null : (
              <ColumnResizeHandle
                label={c.label}
                onPointerDown={(e) => onColumnResizeStart(c.key, e)}
                onDoubleClick={() => onColumnReset(c.key)}
              />
            )}
          </div>
        ))}
      </div>
      {rows.slice(range.start, range.end).map((task, i) => {
        const index = range.start + i;
        const selected = task.id === selectedTaskId;
        return (
          <div
            key={task.id}
            // Sin roles de tabla: la vista accesible con semántica de grilla es la Tabla; aquí la
            // fila es un elemento gráfico que se recorre con el teclado desde el contenedor.
            data-testid="gantt-row"
            data-task-id={task.id}
            data-wbs={task.wbsCode}
            data-selected={selected ? "true" : "false"}
            aria-current={selected ? true : undefined}
            className={cn(
              "absolute left-0 flex w-full items-center border-b text-xs transition-colors duration-500",
              selected ? "bg-primary/10" : "hover:bg-muted/40",
              highlighted[task.id] && "bg-amber-100 dark:bg-amber-900/40",
              task.isSummary && "font-medium",
            )}
            style={{ top: HEADER_HEIGHT + index * ROW_HEIGHT, height: ROW_HEIGHT }}
            onClick={() => onSelect(task.id)}
            onDoubleClick={() => onOpenDetail(task.id)}
          >
            <div
              className="text-muted-foreground truncate px-2"
              style={colStyle("wbs")}
              data-col="wbs"
            >
              {task.wbsCode}
            </div>
            <div
              className="flex items-center gap-1 truncate px-2"
              style={{ ...colStyle("name"), paddingLeft: 8 + depthOf(task) * 14 }}
              data-col="name"
            >
              {task.isSummary ? (
                <button
                  type="button"
                  aria-label={collapsed[task.id] ? "Expandir" : "Colapsar"}
                  className="hover:bg-muted rounded p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(task.id);
                  }}
                >
                  {collapsed[task.id] ? (
                    <ChevronRight className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </button>
              ) : (
                <span className="inline-block w-4" />
              )}
              {task.isMilestone ? <Diamond className="size-3 shrink-0" aria-label="Hito" /> : null}
              <span className={cn("truncate", task.isCritical && "text-red-700 dark:text-red-400")}>
                {task.name}
              </span>
            </div>
            <div className="truncate px-2 tabular-nums" style={colStyle("start")} data-col="start">
              {formatDateCl(task.startDate)}
            </div>
            <div className="truncate px-2 tabular-nums" style={colStyle("end")} data-col="end">
              {formatDateCl(task.endDate)}
            </div>
            <div
              className="text-muted-foreground truncate px-2"
              style={colStyle("pred")}
              data-col="predecessors"
            >
              {formatPredecessors(task.id, dependencies, tasksById)}
            </div>
          </div>
        );
      })}
      {/* Borde derecho del panel: redimensiona la última columna, de modo que el panel completo
          crece o se encoge con el arrastre. */}
      <ColumnResizeHandle
        label="Pred."
        className="z-40"
        testId="gantt-pane-resize"
        onPointerDown={(e) => onColumnResizeStart(LAST_COLUMN, e)}
        onDoubleClick={() => onColumnReset(LAST_COLUMN)}
      />
    </div>
  );
}
