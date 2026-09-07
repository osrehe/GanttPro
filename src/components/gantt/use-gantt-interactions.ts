"use client";

import {
  addDays,
  applyCriticalPath,
  scheduleProject,
  type BarGeometry,
  type TimeAxis,
  type WorkingCalendar,
} from "@ganttpro/engine";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { toast } from "sonner";
import type { TaskDto } from "@/lib/dto";
import { createDependencyCommand, editableSnapshot, patchTaskCommand } from "@/stores/commands";
import { useProjectStore } from "@/stores/project-store";
import { BAR_HEIGHT, CRITICAL_COLOR, inferDependencyType } from "./gantt-model";

export type DragMode = "move" | "resize" | "progress" | "connect";
type Side = "start" | "end";

interface DragState {
  mode: DragMode;
  taskId: string;
  fromSide: Side | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  overTaskId: string | null;
  overSide: Side | null;
}

interface Options {
  readonly axis: TimeAxis;
  readonly calendar: WorkingCalendar | null;
  readonly barsById: ReadonlyMap<string, BarGeometry>;
  readonly projectId: string;
  readonly canEdit: boolean;
  /** Rectángulo de previsualización (mover, redimensionar, avance); se manipula sin re-render. */
  readonly previewRef: RefObject<SVGRectElement | null>;
  /** Línea de previsualización al crear una dependencia. */
  readonly connectRef: RefObject<SVGLineElement | null>;
  /** Contenedor del SVG, para convertir coordenadas de pantalla a coordenadas del dibujo. */
  readonly svgRef: RefObject<SVGSVGElement | null>;
}

declare global {
  interface Window {
    /** Tiempos de procesamiento (ms) de cada evento de arrastre; los lee el test de rendimiento. */
    __ganttDragStats?: number[];
  }
}

/**
 * Arrastres del Gantt (UC-12, UC-14, UC-10): mover, redimensionar, cambiar avance y crear
 * dependencias desde los conectores. Durante el arrastre solo se actualizan dos elementos SVG por
 * DOM (sin re-render de React) para mantener los frames por debajo de 16 ms; al soltar se aplica la
 * previsualización con el engine en el cliente y se ejecuta el comando deshacible (ADR-008).
 */
export function useGanttInteractions({
  axis,
  calendar,
  barsById,
  projectId,
  canEdit,
  previewRef,
  connectRef,
  svgRef,
}: Options) {
  const [dragging, setDragging] = useState<DragMode | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const queryClient = useQueryClient();

  const onBarPointerDown = useCallback(
    (event: ReactPointerEvent, taskId: string, mode: DragMode, side: Side | null = null) => {
      if (!canEdit || event.button !== 0) return;
      const task = useProjectStore.getState().tasksById.get(taskId);
      if (!task || task.isSummary) return; // los resúmenes se mueven desde sus hojas
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = {
        mode,
        taskId,
        fromSide: side,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        overTaskId: null,
        overSide: null,
      };
      setDragging(mode);
      paintPreview();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit],
  );

  /** Dibuja la previsualización a partir de `dragRef` manipulando el DOM directamente. */
  function paintPreview(): void {
    const state = dragRef.current;
    const rect = previewRef.current;
    const line = connectRef.current;
    if (!state) {
      rect?.setAttribute("visibility", "hidden");
      line?.setAttribute("visibility", "hidden");
      return;
    }
    const bar = barsById.get(state.taskId);
    if (!bar) return;
    const dx = state.x - state.startX;
    if (state.mode === "connect") {
      if (!line || !svgRef.current) return;
      const origin = svgRef.current.getBoundingClientRect();
      const fromX = state.fromSide === "start" ? bar.x : bar.x + bar.width;
      const target = state.overTaskId ? barsById.get(state.overTaskId) : undefined;
      const toX = target
        ? state.overSide === "start"
          ? target.x
          : target.x + target.width
        : state.x - origin.left;
      const toY = target ? target.centerY : state.y - origin.top;
      line.setAttribute("x1", String(fromX));
      line.setAttribute("y1", String(bar.centerY));
      line.setAttribute("x2", String(toX));
      line.setAttribute("y2", String(toY));
      line.setAttribute("visibility", "visible");
      rect?.setAttribute("visibility", "hidden");
      return;
    }
    if (!rect) return;
    const snapped = Math.round(dx / axis.pxPerDay) * axis.pxPerDay;
    let x = bar.x;
    let width = bar.width;
    let y = bar.y;
    let height = BAR_HEIGHT;
    if (state.mode === "move") x = bar.x + snapped;
    else if (state.mode === "resize") width = Math.max(axis.pxPerDay, bar.width + snapped);
    else {
      width = Math.max(0, Math.min(bar.width, bar.progressWidth + dx));
      y = bar.y + 3;
      height = BAR_HEIGHT - 6;
    }
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("visibility", "visible");
    line?.setAttribute("visibility", "hidden");
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent): void => {
      const started = performance.now();
      const current = dragRef.current;
      if (!current) return;
      let overTaskId: string | null = null;
      let overSide: Side | null = null;
      if (current.mode === "connect") {
        const el = document.elementFromPoint(event.clientX, event.clientY);
        const target = el?.closest<HTMLElement>("[data-task-id]");
        overTaskId = target?.dataset.taskId ?? null;
        if (overTaskId && overTaskId !== current.taskId) {
          const connector = el?.closest<HTMLElement>("[data-connector]")?.dataset.connector as
            Side | undefined;
          if (connector) overSide = connector;
          else {
            const rect = target?.getBoundingClientRect();
            overSide = rect ? (event.clientX - rect.left < rect.width / 2 ? "start" : "end") : null;
          }
        } else {
          overTaskId = null;
        }
      }
      current.x = event.clientX;
      current.y = event.clientY;
      current.overTaskId = overTaskId;
      current.overSide = overSide;
      paintPreview();
      (window.__ganttDragStats ??= []).push(performance.now() - started);
    };
    const onUp = (): void => {
      const current = dragRef.current;
      dragRef.current = null;
      paintPreview();
      setDragging(null);
      if (current) void finish(current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  async function finish(state: DragState): Promise<void> {
    const store = useProjectStore.getState();
    const task = store.tasksById.get(state.taskId);
    if (!task || !calendar) return;
    const dx = state.x - state.startX;
    const deltaDays = Math.round(dx / axis.pxPerDay);

    if (state.mode === "connect") {
      if (
        !state.overTaskId ||
        !state.overSide ||
        !state.fromSide ||
        state.overTaskId === state.taskId
      )
        return;
      const type = inferDependencyType(state.fromSide, state.overSide);
      await store.run(
        createDependencyCommand(projectId, {
          predecessorId: state.taskId,
          successorId: state.overTaskId,
          type,
        }),
      );
      return;
    }

    if (state.mode === "move") {
      if (deltaDays === 0) return;
      const anchorDate = calendar.snapForward(addDays(task.startDate, deltaDays));
      if (anchorDate === task.anchorDate) return;
      previewSchedule({ ...task, anchorDate });
      const ok = await store.run(
        patchTaskCommand(task.id, { anchorDate }, editableSnapshot(task), "mover tarea"),
      );
      if (!ok) await resync();
      return;
    }

    if (state.mode === "resize") {
      if (deltaDays === 0) return;
      const endDate = calendar.snapBackward(addDays(task.endDate, deltaDays));
      if (endDate < task.startDate || endDate === task.endDate) return;
      const durationDays = calendar.countWorkingDays(task.startDate, endDate);
      previewSchedule({ ...task, durationDays });
      const ok = await store.run(
        patchTaskCommand(task.id, { endDate }, editableSnapshot(task), "cambiar duración"),
      );
      if (!ok) await resync();
      return;
    }

    if (state.mode === "progress") {
      const bar = barsById.get(task.id);
      if (!bar) return;
      const pct = Math.max(
        0,
        Math.min(100, Math.round(((bar.progressWidth + dx) / bar.width) * 100)),
      );
      if (pct === task.progressPct) return;
      previewSchedule({ ...task, progressPct: pct });
      const ok = await store.run(
        patchTaskCommand(task.id, { progressPct: pct }, editableSnapshot(task), "cambiar avance"),
      );
      if (!ok) await resync();
    }
  }

  /** Previsualización optimista: ejecuta el engine en el cliente y aplica los cambios al store. */
  function previewSchedule(modified: TaskDto): void {
    const store = useProjectStore.getState();
    if (!calendar || !store.project) return;
    try {
      const tasks = store.tasks.map((t) => (t.id === modified.id ? modified : t));
      const scheduled = scheduleProject(tasks, store.dependencies, calendar, {
        progressWeighting: store.project.progressWeighting,
        projectStartDate: store.project.startDate,
      });
      const withCpm = applyCriticalPath(scheduled.tasks, store.dependencies, calendar);
      const changedIds = new Set(scheduled.changed.map((t) => t.id));
      changedIds.add(modified.id);
      store.applyTasks(withCpm.filter((t) => changedIds.has(t.id)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo previsualizar el cambio");
    }
  }

  async function resync(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ["project", projectId, "full"] });
  }

  return { dragging, onBarPointerDown, previewColor: CRITICAL_COLOR };
}
