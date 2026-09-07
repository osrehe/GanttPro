"use client";

import { ChevronDown, ChevronRight, Diamond } from "lucide-react";
import type { PointerEvent } from "react";
import { formatDateCl } from "@/lib/dates";
import type { DependencyDto, TaskDto } from "@/lib/dto";
import { formatPredecessors } from "@/lib/predecessors";
import { cn } from "@/lib/utils";
import { depthOf } from "@/stores/project-store";
import { HEADER_HEIGHT, ROW_HEIGHT } from "./gantt-model";

interface Props {
  rows: readonly TaskDto[];
  range: { start: number; end: number };
  width: number;
  selectedTaskId: string | null;
  highlighted: Record<string, number>;
  collapsed: Record<string, true>;
  dependencies: readonly DependencyDto[];
  tasksById: ReadonlyMap<string, TaskDto>;
  onSelect(taskId: string): void;
  onOpenDetail(taskId: string): void;
  onToggle(taskId: string): void;
  onResizeStart(event: PointerEvent): void;
}

const COLS = { wbs: 52, start: 84, end: 84, pred: 88 } as const;

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
  onResizeStart,
}: Props) {
  const nameWidth = Math.max(120, width - COLS.wbs - COLS.start - COLS.end - COLS.pred);
  return (
    <div
      className="bg-background sticky left-0 z-20 shrink-0 border-r"
      style={{ width, height: HEADER_HEIGHT + rows.length * ROW_HEIGHT }}
      data-testid="gantt-left-pane"
    >
      <div
        className="bg-muted/60 sticky top-0 z-30 flex items-end border-b text-xs font-medium"
        style={{ height: HEADER_HEIGHT }}
      >
        <div className="px-2 py-1.5" style={{ width: COLS.wbs }}>
          WBS
        </div>
        <div className="px-2 py-1.5" style={{ width: nameWidth }}>
          Nombre
        </div>
        <div className="px-2 py-1.5" style={{ width: COLS.start }}>
          Inicio
        </div>
        <div className="px-2 py-1.5" style={{ width: COLS.end }}>
          Fin
        </div>
        <div className="px-2 py-1.5" style={{ width: COLS.pred }}>
          Pred.
        </div>
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
              style={{ width: COLS.wbs }}
              data-col="wbs"
            >
              {task.wbsCode}
            </div>
            <div
              className="flex items-center gap-1 truncate px-2"
              style={{ width: nameWidth, paddingLeft: 8 + depthOf(task) * 14 }}
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
            <div
              className="truncate px-2 tabular-nums"
              style={{ width: COLS.start }}
              data-col="start"
            >
              {formatDateCl(task.startDate)}
            </div>
            <div className="truncate px-2 tabular-nums" style={{ width: COLS.end }} data-col="end">
              {formatDateCl(task.endDate)}
            </div>
            <div
              className="text-muted-foreground truncate px-2"
              style={{ width: COLS.pred }}
              data-col="predecessors"
            >
              {formatPredecessors(task.id, dependencies, tasksById)}
            </div>
          </div>
        );
      })}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar panel"
        className="hover:bg-primary/40 absolute top-0 right-0 z-40 h-full w-1.5 cursor-col-resize"
        style={{ height: HEADER_HEIGHT + rows.length * ROW_HEIGHT }}
        onPointerDown={onResizeStart}
      />
    </div>
  );
}
