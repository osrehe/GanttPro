"use client";

import {
  ArrowDown,
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Diamond,
  Indent,
  Info,
  Outdent,
  PanelRightOpen,
  Plus,
  Trash2,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  createCalendar,
  trackingStatus,
  visibleRowRange,
  type TrackingStatus,
} from "@ganttpro/engine";
import { TrackingToolbar } from "@/components/tracking/tracking-toolbar";
import { ColumnResizeHandle } from "@/components/columns/column-resize-handle";
import { useColumnWidths } from "@/hooks/use-column-widths";
import { columnVar, type ColumnSpec } from "@/lib/column-widths";
import { formatDateCl } from "@/lib/dates";
import type { TaskDto } from "@/lib/dto";
import {
  diffPredecessors,
  formatPredecessors,
  parsePredecessors,
  PredecessorParseError,
} from "@/lib/predecessors";
import type { PatchTaskInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import {
  createTaskCommand,
  deleteTaskCommand,
  editableSnapshot,
  moveTaskCommand,
  patchTaskCommand,
  setPredecessorsCommand,
} from "@/stores/commands";
import { depthOf, useProjectStore, visibleTasks } from "@/stores/project-store";
import { toast } from "sonner";
import { TaskSheet } from "./task-sheet";

type ColumnKey =
  | "wbs"
  | "name"
  | "start"
  | "end"
  | "duration"
  | "progress"
  | "resources"
  | "predecessors"
  | "status"
  | "expected"
  | "deviation";

/**
 * Alto de fila supuesto al primer render. El real se mide del DOM apenas hay una fila dibujada: si
 * el supuesto y el real no coinciden, los espaciadores desplazan el contenido en cada scroll y el
 * puntero nunca acierta la fila.
 */
const DEFAULT_ROW_HEIGHT = 30;

/**
 * Columnas de la grilla. `defaultWidth` es el ancho de partida y `minWidth` el tope al arrastrar;
 * el ancho vigente lo administra `useColumnWidths` y viaja al CSS como variable.
 */
const COLUMNS: Array<
  ColumnSpec<ColumnKey> & {
    label: string;
    editable: boolean;
    align?: "right";
  }
> = [
  { key: "wbs", label: "WBS", defaultWidth: 80, minWidth: 48, editable: false },
  { key: "name", label: "Nombre", defaultWidth: 300, minWidth: 120, editable: true },
  { key: "start", label: "Inicio", defaultWidth: 128, minWidth: 80, editable: true },
  { key: "end", label: "Fin", defaultWidth: 128, minWidth: 80, editable: true },
  {
    key: "duration",
    label: "Duración",
    defaultWidth: 96,
    minWidth: 64,
    editable: true,
    align: "right",
  },
  {
    key: "progress",
    label: "% Avance",
    defaultWidth: 96,
    minWidth: 64,
    editable: true,
    align: "right",
  },
  { key: "resources", label: "Recursos", defaultWidth: 176, minWidth: 80, editable: false },
  { key: "predecessors", label: "Predecesoras", defaultWidth: 160, minWidth: 80, editable: true },
  { key: "status", label: "Estado", defaultWidth: 144, minWidth: 80, editable: true },
  {
    key: "expected",
    label: "Esperado",
    defaultWidth: 96,
    minWidth: 64,
    editable: false,
    align: "right",
  },
  {
    key: "deviation",
    label: "Desv.",
    defaultWidth: 80,
    minWidth: 56,
    editable: false,
    align: "right",
  },
];

/** Identificador de la vista en `localStorage` y prefijo de las variables CSS de ancho. */
const TABLE_COLUMNS_VIEW = "table";

const STATUS_LABEL: Record<TaskDto["status"], string> = {
  NOT_STARTED: "No iniciada",
  IN_PROGRESS: "En curso",
  DONE: "Completada",
  ON_HOLD: "En pausa",
  CANCELLED: "Cancelada",
};

interface Focus {
  row: number;
  col: number;
}

/** Vista Tabla: grilla editable del WBS con navegación por teclado (UC-23). */
export function TaskTable() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const role = useProjectStore((s) => s.role);
  const tasks = useProjectStore((s) => s.tasks);
  const tasksById = useProjectStore((s) => s.tasksById);
  const collapsed = useProjectStore((s) => s.collapsed);
  const dependencies = useProjectStore((s) => s.dependencies);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const selectedTaskId = useProjectStore((s) => s.selectedTaskId);
  const highlighted = useProjectStore((s) => s.highlighted);
  const project = useProjectStore((s) => s.project);
  const calendarDto = useProjectStore((s) => s.calendar);
  const busy = useProjectStore((s) => s.busy);
  const select = useProjectStore((s) => s.select);
  const openDetail = useProjectStore((s) => s.openDetail);
  const toggleCollapsed = useProjectStore((s) => s.toggleCollapsed);
  const setAllCollapsed = useProjectStore((s) => s.setAllCollapsed);
  const run = useProjectStore((s) => s.run);
  const canEdit = role === "ADMIN" || role === "EDITOR";

  // Seguimiento (UC-21): avance esperado y desviación a la fecha de estado.
  const tracking = useMemo(() => {
    const map = new Map<string, TrackingStatus>();
    if (!project?.statusDate || !calendarDto) return map;
    const calendar = createCalendar({
      workingDays: calendarDto.workingDays,
      hoursPerDay: calendarDto.hoursPerDay,
      holidays: calendarDto.holidays.map((h) => h.date),
    });
    for (const t of tasks) {
      if (!t.isSummary) map.set(t.id, trackingStatus(t, project.statusDate, calendar));
    }
    return map;
  }, [tasks, project?.statusDate, calendarDto]);

  const rows = useMemo(() => visibleTasks(tasks, collapsed), [tasks, collapsed]);
  const [focus, setFocus] = useState<Focus>({ row: 0, col: 1 });
  // Virtualización vertical: con proyectos grandes solo se dibujan las filas visibles. Sin esto,
  // 1.000 tareas metían 28.000 nodos en el documento y cada tecla volvía a dibujarlas todas.
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 600 });
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_HEIGHT);
  const range = useMemo(
    () => visibleRowRange(viewport.scrollTop, viewport.height, rowHeight, rows.length, 6),
    [viewport.scrollTop, viewport.height, rowHeight, rows.length],
  );
  const setStoreEditing = useProjectStore((s) => s.setEditing);
  const [editing, setEditing] = useState<{
    row: number;
    col: number;
    value: string;
    selectAll: boolean;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskDto | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRowIntoViewRef = useRef<(row: number) => void>(() => {});
  const rowHeightRef = useRef(DEFAULT_ROW_HEIGHT);
  const focusRef = useRef<Focus>(focus);
  focusRef.current = focus;
  const editorRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  // Anchos de columna redimensionables y recordados por navegador (UC-40).
  const columns = useColumnWidths(TABLE_COLUMNS_VIEW, COLUMNS);

  const selectedIndex = rows.findIndex((t) => t.id === selectedTaskId);
  const selected = selectedIndex >= 0 ? (rows[selectedIndex] as TaskDto) : null;

  // Mantiene el foco en la fila seleccionada cuando cambia la selección desde fuera.
  useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex !== focus.row) {
      setFocus((f) => ({ ...f, row: selectedIndex }));
      scrollRowIntoViewRef.current(selectedIndex);
    }
  }, [selectedIndex, focus.row]);

  useEffect(() => {
    if (editing) editorRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const fila = el.querySelector<HTMLTableRowElement>('tr[data-testid="task-row"]');
      const alto = fila?.getBoundingClientRect().height ?? 0;
      if (alto > 0) setRowHeight((actual) => (Math.abs(actual - alto) > 0.5 ? alto : actual));
      setViewport({ scrollTop: el.scrollTop, height: el.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [rows.length]);

  // Mientras hay una celda abierta, el sondeo de cambios ajenos no recarga el proyecto (UC-34).
  useEffect(() => {
    setStoreEditing(editing !== null);
    return () => setStoreEditing(false);
  }, [editing, setStoreEditing]);

  const resourceNames = useCallback(
    (taskId: string): string =>
      assignments
        .filter((a) => a.taskId === taskId)
        .map((a) => resources.find((r) => r.id === a.resourceId)?.name ?? "?")
        .join(", "),
    [assignments, resources],
  );

  const cellText = useCallback(
    (task: TaskDto, col: ColumnKey): string => {
      switch (col) {
        case "wbs":
          return task.wbsCode;
        case "name":
          return task.name;
        case "start":
          return formatDateCl(task.startDate);
        case "end":
          return formatDateCl(task.endDate);
        case "duration":
          return task.isMilestone ? "0 d" : `${task.durationDays} d`;
        case "progress":
          return `${task.progressPct} %`;
        case "resources":
          return resourceNames(task.id);
        case "predecessors":
          return formatPredecessors(task.id, dependencies, tasksById);
        case "status":
          return STATUS_LABEL[task.status];
        case "expected": {
          const s = tracking.get(task.id);
          return s ? `${s.expectedPct} %` : "";
        }
        case "deviation": {
          const s = tracking.get(task.id);
          if (!s || s.deviationDays === 0) return "";
          return `${s.deviationDays > 0 ? "+" : ""}${s.deviationDays.toLocaleString("es-CL")} d`;
        }
      }
    },
    [dependencies, resourceNames, tasksById, tracking],
  );

  const editValue = (task: TaskDto, col: ColumnKey): string => {
    switch (col) {
      case "name":
        return task.name;
      case "start":
        return task.startDate;
      case "end":
        return task.endDate;
      case "duration":
        return String(task.durationDays);
      case "progress":
        return String(task.progressPct);
      case "predecessors":
        return formatPredecessors(task.id, dependencies, tasksById);
      case "status":
        return task.status;
      default:
        return "";
    }
  };

  const canEditCell = (task: TaskDto, col: ColumnKey): boolean => {
    if (!canEdit) return false;
    const column = COLUMNS.find((c) => c.key === col);
    if (!column?.editable) return false;
    if (task.isSummary && ["start", "end", "duration", "progress", "predecessors"].includes(col))
      return false;
    if (task.isMilestone && col === "duration") return false;
    return true;
  };

  function startEdit(row: number, col: number, initial?: string) {
    const task = rows[row];
    const key = COLUMNS[col]?.key;
    if (!task || !key || !canEditCell(task, key)) return;
    setEditing({
      row,
      col,
      value: initial ?? editValue(task, key),
      selectAll: initial === undefined,
    });
  }

  async function commitEdit(move: "stay" | "right" | "down" = "stay") {
    if (!editing) return;
    const task = rows[editing.row];
    const key = COLUMNS[editing.col]?.key;
    setEditing(null);
    containerRef.current?.focus();
    if (!task || !key) return;
    const value = editing.value.trim();
    if (value === editValue(task, key)) {
      moveFocus(move);
      return;
    }
    const before = editableSnapshot(task);
    let input: PatchTaskInput | null = null;
    switch (key) {
      case "name":
        if (value === "") return;
        input = { name: value };
        break;
      case "start":
        input = { anchorDate: value };
        break;
      case "end":
        input = { endDate: value };
        break;
      case "duration": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0)
          return toast.error("La duración debe ser un entero de días hábiles");
        input = { durationDays: n };
        break;
      }
      case "progress": {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 0 || n > 100)
          return toast.error("El avance debe estar entre 0 y 100");
        input = { progressPct: n };
        break;
      }
      case "status":
        input = { status: value as TaskDto["status"] };
        break;
      case "predecessors": {
        try {
          const diff = diffPredecessors(task.id, parsePredecessors(value), dependencies, tasks);
          if (diff.create.length + diff.update.length + diff.remove.length === 0)
            return moveFocus(move);
          await run(setPredecessorsCommand(projectId, task.id, diff));
        } catch (error) {
          toast.error(error instanceof PredecessorParseError ? error.message : String(error));
        }
        moveFocus(move);
        return;
      }
      default:
        return;
    }
    await run(
      patchTaskCommand(
        task.id,
        input,
        before,
        `editar ${COLUMNS[editing.col]?.label.toLowerCase()}`,
      ),
    );
    moveFocus(move);
  }

  /** Lleva la fila al área visible calculando la posición: con virtualización puede no existir. */
  function scrollRowIntoView(row: number): void {
    const el = containerRef.current;
    if (!el) return;
    const headerHeight = el.querySelector("thead")?.clientHeight ?? 0;
    const top = row * rowHeightRef.current;
    const bottom = top + rowHeightRef.current;
    const visibleTop = el.scrollTop;
    const visibleBottom = el.scrollTop + el.clientHeight - headerHeight;
    if (top < visibleTop) el.scrollTop = top;
    else if (bottom > visibleBottom) el.scrollTop = bottom - el.clientHeight + headerHeight;
  }

  scrollRowIntoViewRef.current = scrollRowIntoView;
  rowHeightRef.current = rowHeight;

  function moveFocus(direction: "stay" | "right" | "down" | "left" | "up") {
    let { row, col } = focusRef.current;
    if (direction === "right") col = Math.min(COLUMNS.length - 1, col + 1);
    if (direction === "left") col = Math.max(0, col - 1);
    if (direction === "down") row = Math.min(rows.length - 1, row + 1);
    if (direction === "up") row = Math.max(0, row - 1);
    const task = rows[row];
    if (task && task.id !== useProjectStore.getState().selectedTaskId) select(task.id);
    setFocus({ row, col });
    scrollRowIntoView(row);
  }

  // ---------------------------------------------------------------- Acciones de la barra

  async function addTask(kind: "task" | "subtask" | "milestone") {
    const base = selected;
    const isMilestone = kind === "milestone";
    if (kind === "subtask" && base) {
      await run(
        createTaskCommand(projectId, {
          name: isMilestone ? "Nuevo hito" : "Nueva subtarea",
          parentId: base.id,
        }),
      );
    } else if (base) {
      await run(
        createTaskCommand(projectId, {
          name: isMilestone ? "Nuevo hito" : "Nueva tarea",
          parentId: base.parentId,
          index: base.orderIndex + 1,
          isMilestone,
        }),
      );
    } else {
      await run(
        createTaskCommand(projectId, {
          name: isMilestone ? "Nuevo hito" : "Nueva tarea",
          isMilestone,
        }),
      );
    }
    // Deja el nombre en edición para escribirlo de inmediato.
    const newId = useProjectStore.getState().selectedTaskId;
    const newRows = visibleTasks(
      useProjectStore.getState().tasks,
      useProjectStore.getState().collapsed,
    );
    const row = newRows.findIndex((t) => t.id === newId);
    if (row >= 0) {
      setFocus({ row, col: 1 });
      const t = newRows[row] as TaskDto;
      setEditing({ row, col: 1, value: t.name, selectAll: true });
      // Con la tabla virtualizada la fila nueva puede quedar fuera del área visible.
      scrollRowIntoView(row);
    }
  }

  async function move(action: "indent" | "outdent" | "up" | "down") {
    if (!selected) return;
    await run(moveTaskCommand(selected.id, { action }));
  }

  async function confirmDeleteTask() {
    if (!confirmDelete) return;
    const task = confirmDelete;
    setConfirmDelete(null);
    await run(deleteTaskCommand(task.id));
    setFocus((f) => ({ ...f, row: Math.min(f.row, Math.max(0, rows.length - 2)) }));
  }

  // ---------------------------------------------------------------- Teclado

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (editing) return; // el editor gestiona sus propias teclas
    const ctrl = event.ctrlKey || event.metaKey;
    // Crear tareas funciona incluso con la tabla vacía (sin fila enfocada).
    if (canEdit && (event.key === "Insert" || (ctrl && event.key === "Enter"))) {
      event.preventDefault();
      void addTask(event.shiftKey ? "subtask" : "task");
      return;
    }
    const task = rows[focus.row];
    const col = COLUMNS[focus.col]?.key;
    if (!task || !col) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveFocus("down");
        return;
      case "ArrowUp":
        event.preventDefault();
        moveFocus("up");
        return;
      case "ArrowRight":
        event.preventDefault();
        if (ctrl && task.isSummary && collapsed[task.id]) toggleCollapsed(task.id);
        else moveFocus("right");
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (ctrl && task.isSummary && !collapsed[task.id]) toggleCollapsed(task.id);
        else moveFocus("left");
        return;
      case "Tab":
        if (!canEdit) return;
        event.preventDefault();
        void move(event.shiftKey ? "outdent" : "indent");
        return;
      case "Enter":
      case "F2":
        event.preventDefault();
        startEdit(focus.row, focus.col);
        return;
      case "Delete":
        if (!canEdit) return;
        event.preventDefault();
        setConfirmDelete(task);
        return;
      case " ":
        event.preventDefault();
        openDetail(task.id);
        return;
      default:
        break;
    }
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) return;
    if (ctrl || event.altKey || event.key.length !== 1) return;
    // Escribir directamente reemplaza el contenido de la celda.
    if (canEditCell(task, col) && col !== "status" && col !== "start" && col !== "end") {
      event.preventDefault();
      startEdit(focus.row, focus.col, event.key);
    }
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitEdit("down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      void commitEdit(event.shiftKey ? "stay" : "right");
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
      containerRef.current?.focus();
    }
    event.stopPropagation();
  }

  // ---------------------------------------------------------------- Render

  const allCollapsed =
    tasks.some((t) => t.isSummary) &&
    tasks.filter((t) => t.isSummary).every((t) => collapsed[t.id]);

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex flex-wrap items-center gap-1 border-b px-3 py-2"
        role="toolbar"
        aria-label="Acciones de tareas"
      >
        <ToolbarButton
          label="Nueva tarea (Insert)"
          onClick={() => void addTask("task")}
          disabled={!canEdit || busy}
          testId="add-task"
        >
          <Plus className="size-4" /> Tarea
        </ToolbarButton>
        <ToolbarButton
          label="Nueva subtarea (Shift+Insert)"
          onClick={() => void addTask("subtask")}
          disabled={!canEdit || busy || !selected}
          testId="add-subtask"
        >
          <Plus className="size-4" /> Subtarea
        </ToolbarButton>
        <ToolbarButton
          label="Nuevo hito"
          onClick={() => void addTask("milestone")}
          disabled={!canEdit || busy}
          testId="add-milestone"
        >
          <Diamond className="size-4" /> Hito
        </ToolbarButton>
        <span className="bg-border mx-1 h-6 w-px" />
        <ToolbarButton
          label="Indentar (Tab)"
          onClick={() => void move("indent")}
          disabled={!canEdit || busy || !selected}
          testId="indent"
        >
          <Indent className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Desindentar (Shift+Tab)"
          onClick={() => void move("outdent")}
          disabled={!canEdit || busy || !selected}
          testId="outdent"
        >
          <Outdent className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Subir"
          onClick={() => void move("up")}
          disabled={!canEdit || busy || !selected}
          testId="move-up"
        >
          <ArrowUp className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Bajar"
          onClick={() => void move("down")}
          disabled={!canEdit || busy || !selected}
          testId="move-down"
        >
          <ArrowDown className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Eliminar (Supr)"
          onClick={() => selected && setConfirmDelete(selected)}
          disabled={!canEdit || busy || !selected}
          testId="delete-task"
        >
          <Trash2 className="size-4" />
        </ToolbarButton>
        <span className="bg-border mx-1 h-6 w-px" />
        <ToolbarButton
          label="Detalles (Espacio)"
          onClick={() => selected && openDetail(selected.id)}
          disabled={!selected}
          testId="open-detail"
        >
          <PanelRightOpen className="size-4" /> Detalles
        </ToolbarButton>
        <ToolbarButton
          label={allCollapsed ? "Expandir todo" : "Colapsar todo"}
          onClick={() => setAllCollapsed(!allCollapsed)}
        >
          {allCollapsed ? (
            <ChevronsUpDown className="size-4" />
          ) : (
            <ChevronsDownUp className="size-4" />
          )}
        </ToolbarButton>
        <TrackingToolbar canEdit={canEdit} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Atajos de teclado" className="ml-auto">
              <Info className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-5">
            Flechas: moverse · Enter/F2 o escribir: editar · Tab / Shift+Tab: indentar y desindentar
            · Insert: nueva tarea (Shift: subtarea) · Ctrl+←/→: colapsar/expandir · Supr: eliminar ·
            Espacio: detalles · Ctrl+Z / Ctrl+Y: deshacer y rehacer · Arrastra el borde derecho de
            un encabezado para cambiar el ancho de la columna (doble clic: restablecer)
          </TooltipContent>
        </Tooltip>
      </div>

      {/* La semántica de grilla va en la tabla; el contenedor solo aporta scroll y foco. */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="flex-1 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset"
        data-testid="task-grid"
      >
        <table
          role="grid"
          aria-label="Tareas del proyecto"
          aria-rowcount={rows.length}
          ref={columns.hostRef as Ref<HTMLTableElement>}
          className="w-full table-fixed border-collapse text-sm"
          style={{ ...columns.varStyle, minWidth: columns.totalExpression() }}
        >
          {/* Los anchos van en el `colgroup` como variables CSS: arrastrar el tirador solo cambia
              la variable, sin volver a renderizar las filas. La última columna no tiene ancho y se
              queda con el espacio sobrante para que el encabezado llegue hasta el borde. */}
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: columnVar(TABLE_COLUMNS_VIEW, c.key) }} />
            ))}
            <col />
          </colgroup>
          <thead className="bg-muted/60 sticky top-0 z-10">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "relative overflow-hidden border-b px-2 py-1.5 text-left font-medium text-ellipsis whitespace-nowrap",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.label}
                  <ColumnResizeHandle
                    label={c.label}
                    onPointerDown={(e) => columns.startResize(c.key, e)}
                    onDoubleClick={() => columns.resetColumn(c.key)}
                  />
                </th>
              ))}
              <th aria-hidden className="border-b" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="text-muted-foreground p-8 text-center">
                  No hay tareas. Crea la primera con el botón «Tarea» o la tecla Insert.
                </td>
              </tr>
            ) : null}
            {range.start > 0 ? (
              <tr aria-hidden style={{ height: range.start * rowHeight }} />
            ) : null}
            {rows.slice(range.start, range.end).map((task, indexEnRango) => {
              const rowIndex = range.start + indexEnRango;
              const isSelected = task.id === selectedTaskId;
              const isHighlighted = Boolean(highlighted[task.id]);
              return (
                <tr
                  key={task.id}
                  role="row"
                  aria-selected={isSelected}
                  data-testid="task-row"
                  data-task-id={task.id}
                  data-wbs={task.wbsCode}

                  className={cn(
                    "border-b transition-colors duration-500",
                    isSelected ? "bg-primary/10" : "hover:bg-muted/40",
                    isHighlighted && "bg-amber-100 dark:bg-amber-900/40",
                    task.isSummary && "font-medium",
                  )}
                  onClick={() => {
                    select(task.id);
                    setFocus((f) => ({ ...f, row: rowIndex }));
                  }}
                  onDoubleClick={() => openDetail(task.id)}
                >
                  {COLUMNS.map((c, colIndex) => {
                    const isFocused = focus.row === rowIndex && focus.col === colIndex;
                    const isEditing = editing?.row === rowIndex && editing.col === colIndex;
                    return (
                      <td
                        key={c.key}
                        role="gridcell"
                        data-col={c.key}
                        className={cn(
                          "overflow-hidden px-2 py-1 align-middle whitespace-nowrap",
                          c.align === "right" && "text-right tabular-nums",
                          isFocused && !isEditing && "ring-primary ring-2 ring-inset",
                        )}
                        title={c.key === "name" ? task.name : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          select(task.id);
                          setFocus({ row: rowIndex, col: colIndex });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEdit(rowIndex, colIndex);
                        }}
                      >
                        {isEditing ? (
                          <CellEditor
                            ref={editorRef}
                            column={c.key}
                            value={editing.value}
                            selectAll={editing.selectAll}
                            onChange={(value) => setEditing((s) => (s ? { ...s, value } : s))}
                            onKeyDown={onEditorKeyDown}
                            onBlur={() => void commitEdit("stay")}
                          />
                        ) : c.key === "name" ? (
                          <span
                            className="flex items-center gap-1"
                            style={{ paddingLeft: `${depthOf(task) * 1.25}rem` }}
                          >
                            {task.isSummary ? (
                              <button
                                type="button"
                                aria-label={collapsed[task.id] ? "Expandir" : "Colapsar"}
                                aria-expanded={!collapsed[task.id]}
                                className="hover:bg-muted rounded p-0.5"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCollapsed(task.id);
                                }}
                              >
                                {collapsed[task.id] ? (
                                  <ChevronRight className="size-4" />
                                ) : (
                                  <ChevronDown className="size-4" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-block w-5" />
                            )}
                            {task.isMilestone ? (
                              <Diamond className="size-3 shrink-0" aria-label="Hito" />
                            ) : null}
                            {tracking.get(task.id)?.isLate ? (
                              <AlertTriangle
                                className="size-3.5 shrink-0 text-amber-600"
                                aria-label="Atrasada según la fecha de estado"
                                data-testid="late-indicator"
                              />
                            ) : null}
                            <span
                              className={cn(task.isCritical && "text-red-700 dark:text-red-400")}
                            >
                              {task.name}
                            </span>
                          </span>
                        ) : (
                          <span className={cn(c.key === "status" && "text-muted-foreground")}>
                            {cellText(task, c.key)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td aria-hidden />
                </tr>
              );
            })}
            {range.end < rows.length ? (
              <tr aria-hidden style={{ height: (rows.length - range.end) * rowHeight }} />
            ) : null}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la tarea {confirmDelete?.wbsCode}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.isSummary
                ? "Se eliminarán también todas sus subtareas y sus dependencias. Puedes deshacerlo con Ctrl+Z."
                : "Se eliminarán sus dependencias y asignaciones. Puedes deshacerlo con Ctrl+Z."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDeleteTask()}
              data-testid="confirm-delete"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskSheet />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          data-testid={testId}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface CellEditorProps {
  column: ColumnKey;
  value: string;
  selectAll: boolean;
  onChange(value: string): void;
  onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>): void;
  onBlur(): void;
}

const CellEditor = forwardRef<HTMLInputElement | HTMLSelectElement, CellEditorProps>(
  function CellEditor({ column, value, selectAll, onChange, onKeyDown, onBlur }, ref) {
    const base = "bg-background h-7 w-full rounded border px-1 text-sm outline-none focus:ring-2";
    if (column === "status") {
      return (
        <select
          ref={ref as Ref<HTMLSelectElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={base}
          aria-label="Estado"
        >
          {Object.entries(STATUS_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      );
    }
    const type =
      column === "start" || column === "end"
        ? "date"
        : column === "duration" || column === "progress"
          ? "number"
          : "text";
    return (
      <input
        ref={ref as Ref<HTMLInputElement>}
        type={type}
        value={value}
        min={type === "number" ? 0 : undefined}
        max={column === "progress" ? 100 : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onFocus={(e) => selectAll && type === "text" && e.currentTarget.select()}
        className={cn(base, type === "number" && "text-right")}
        aria-label={COLUMNS.find((c) => c.key === column)?.label}
      />
    );
  },
);
