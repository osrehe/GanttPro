"use client";

import {
  createCalendar,
  createTimeAxis,
  fitToWidth,
  markerX,
  nonWorkingRanges,
  visibleRowRange,
  type TimeScale,
} from "@ganttpro/engine";
import { useQuery } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { TaskSheet } from "@/components/table/task-sheet";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { todayIso } from "@/lib/dates";
import { exportFileName } from "@/lib/export/excel";
import { exportGanttPng } from "@/lib/export/png";
import type { DependencyDto, TaskDto } from "@/lib/dto";
import { depthOf, useProjectStore } from "@/stores/project-store";
import { DependencyPopover, type ArrowPopoverState } from "./dependency-popover";
import { GanttHeader } from "./gantt-header";
import { GanttLeftPane } from "./gantt-left-pane";
import {
  HEADER_HEIGHT,
  ROW_HEIGHT,
  barColor,
  barLabel,
  buildScene,
  clampPxPerDay,
  ganttRows,
  projectRange,
  type ColorMode,
  type LabelMode,
} from "./gantt-model";
import { GanttTimeline, type BaselineSpan } from "./gantt-timeline";
import { GanttToolbar } from "./gantt-toolbar";
import { useGanttInteractions } from "./use-gantt-interactions";

const DEFAULT_LEFT_WIDTH = 440;

/** Vista Gantt interactiva (UC-24): tabla reducida + línea de tiempo SVG sobre el mismo store. */
export function GanttView() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const project = useProjectStore((s) => s.project);
  const calendarDto = useProjectStore((s) => s.calendar);
  const role = useProjectStore((s) => s.role);
  const tasks = useProjectStore((s) => s.tasks);
  const tasksById = useProjectStore((s) => s.tasksById);
  const collapsed = useProjectStore((s) => s.collapsed);
  const dependencies = useProjectStore((s) => s.dependencies);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const baselines = useProjectStore((s) => s.baselines);
  const selectedTaskId = useProjectStore((s) => s.selectedTaskId);
  const highlighted = useProjectStore((s) => s.highlighted);
  const select = useProjectStore((s) => s.select);
  const openDetail = useProjectStore((s) => s.openDetail);
  const toggleCollapsed = useProjectStore((s) => s.toggleCollapsed);
  const canEdit = role === "ADMIN" || role === "EDITOR";

  const [scale, setScale] = useState<TimeScale>("day");
  const [pxPerDay, setPxPerDay] = useState<number | undefined>(undefined);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [showCritical, setShowCritical] = useState(true);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>("task");
  const [labelMode, setLabelMode] = useState<LabelMode>("name");
  const [hoverTaskId, setHoverTaskId] = useState<string | null>(null);
  const [popover, setPopover] = useState<ArrowPopoverState | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 600, width: 1200 });
  const [exporting, setExporting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const previewRef = useRef<SVGRectElement>(null);
  const connectRef = useRef<SVGLineElement>(null);

  const rows = useMemo(() => ganttRows(tasks, collapsed), [tasks, collapsed]);
  const range = useMemo(
    () => projectRange(tasks, project?.startDate ?? todayIso()),
    [tasks, project?.startDate],
  );
  const axis = useMemo(
    () =>
      createTimeAxis({ scale, from: range.from, to: range.to, ...(pxPerDay ? { pxPerDay } : {}) }),
    [scale, range.from, range.to, pxPerDay],
  );
  const calendar = useMemo(
    () =>
      calendarDto
        ? createCalendar({
            workingDays: calendarDto.workingDays,
            hoursPerDay: calendarDto.hoursPerDay,
            holidays: calendarDto.holidays.map((h) => h.date),
          })
        : null,
    [calendarDto],
  );
  const shading = useMemo(
    () => (calendar ? nonWorkingRanges(axis, calendar) : []),
    [axis, calendar],
  );
  const scene = useMemo(() => buildScene(rows, dependencies, axis), [rows, dependencies, axis]);
  const dependenciesById = useMemo(
    () => new Map(dependencies.map((d) => [d.id, d])),
    [dependencies],
  );
  const rowRange = useMemo(
    () =>
      visibleRowRange(
        viewport.scrollTop,
        viewport.height - HEADER_HEIGHT,
        ROW_HEIGHT,
        rows.length,
        8,
      ),
    [viewport.scrollTop, viewport.height, rows.length],
  );
  const todayX = markerX(axis, todayIso());
  const statusX = project?.statusDate ? markerX(axis, project.statusDate) : null;
  const colorCtx = useMemo(() => ({ assignments, resources }), [assignments, resources]);

  const baselineQuery = useQuery({
    queryKey: ["baseline", baselineId],
    queryFn: () => api.baselines.get(baselineId as string),
    enabled: baselineId !== null,
  });
  const baselineById = useMemo<ReadonlyMap<string, BaselineSpan> | null>(() => {
    if (!baselineId || !baselineQuery.data) return null;
    const rowsB = baselineQuery.data.tasks as Array<{
      taskId: string;
      startDate: string;
      endDate: string;
    }>;
    return new Map(rowsB.map((t) => [t.taskId, { startDate: t.startDate, endDate: t.endDate }]));
  }, [baselineId, baselineQuery.data]);

  const { dragging, onBarPointerDown } = useGanttInteractions({
    axis,
    calendar,
    barsById: scene.barsById,
    projectId,
    canEdit,
    previewRef,
    connectRef,
    svgRef,
  });

  // Scroll y tamaño del viewport (virtualización vertical).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setViewport({ scrollTop: el.scrollTop, height: el.clientHeight, width: el.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, []);

  // Zoom con Ctrl+rueda (listener no pasivo para poder cancelar el zoom del navegador).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setPxPerDay((current) =>
        clampPxPerDay((current ?? axis.pxPerDay) * (event.deltaY < 0 ? 1.2 : 1 / 1.2)),
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [axis.pxPerDay]);

  // Marca de rendimiento: primer render con barras (la lee el test de rendimiento).
  const marked = useRef(false);
  useEffect(() => {
    if (!marked.current && scene.bars.length > 0) {
      marked.current = true;
      performance.mark("gantt:rendered");
    }
  }, [scene.bars.length]);

  const fit = useCallback(() => {
    const available = Math.max(200, viewport.width - leftWidth - 2);
    const best = fitToWidth(range.from, range.to, available);
    setScale(best.scale);
    setPxPerDay(clampPxPerDay(best.pxPerDay));
  }, [viewport.width, leftWidth, range.from, range.to]);

  const onResizeStart = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = leftWidth;
      const onMove = (e: PointerEvent) =>
        setLeftWidth(Math.max(240, Math.min(900, startWidth + e.clientX - startX)));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [leftWidth],
  );

  // Exportación PNG del Gantt visible (UC-28): también la dispara el menú Exportar del header.
  const exportPng = useCallback(async () => {
    const headerSvg = scrollRef.current?.querySelector<SVGSVGElement>(
      '[data-testid="gantt-header"]',
    );
    const timelineSvg = svgRef.current;
    if (!headerSvg || !timelineSvg || rows.length === 0) {
      toast.info("No hay nada que exportar: el Gantt está vacío");
      return;
    }
    setExporting(true);
    try {
      await exportGanttPng(
        {
          headerSvg,
          timelineSvg,
          rows: rows.map((t) => ({
            wbsCode: t.wbsCode,
            name: t.name,
            depth: depthOf(t),
            isSummary: t.isSummary,
            isMilestone: t.isMilestone,
          })),
          rowHeight: ROW_HEIGHT,
          headerHeight: HEADER_HEIGHT,
          leftWidth,
          title: project?.name ?? "Gantt",
        },
        exportFileName(project?.name ?? "proyecto", "gantt", "png"),
      );
      toast.success("PNG descargado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo exportar el PNG");
    } finally {
      setExporting(false);
    }
  }, [rows, leftWidth, project?.name]);

  useEffect(() => {
    const handler = () => void exportPng();
    window.addEventListener("ganttpro:export-png", handler);
    return () => window.removeEventListener("ganttpro:export-png", handler);
  }, [exportPng]);

  const onArrowClick = useCallback(
    (dependency: DependencyDto, clientX: number, clientY: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPopover({
        dependency,
        x: clientX - rect.left + el.scrollLeft,
        y: clientY - rect.top + el.scrollTop,
      });
    },
    [],
  );

  const colorOf = useCallback(
    (task: TaskDto) => barColor(task, colorMode, colorCtx),
    [colorMode, colorCtx],
  );
  const labelOf = useCallback(
    (task: TaskDto) => barLabel(task, labelMode, colorCtx),
    [labelMode, colorCtx],
  );

  return (
    <div className="flex h-full flex-col" data-testid="gantt-view">
      <GanttToolbar
        scale={scale}
        onScale={(s) => {
          setScale(s);
          setPxPerDay(undefined);
        }}
        onZoom={(dir) =>
          setPxPerDay((c) => clampPxPerDay((c ?? axis.pxPerDay) * (dir > 0 ? 1.25 : 0.8)))
        }
        onFit={fit}
        showCritical={showCritical}
        onShowCritical={setShowCritical}
        baselines={baselines}
        baselineId={baselineId}
        onBaseline={setBaselineId}
        colorMode={colorMode}
        onColorMode={setColorMode}
        labelMode={labelMode}
        onLabelMode={setLabelMode}
        onExportPng={() => void exportPng()}
        exporting={exporting}
      />
      <div ref={scrollRef} className="relative flex-1 overflow-auto" data-testid="gantt-scroll">
        <div
          className="flex"
          style={{
            width: leftWidth + axis.width,
            minHeight: HEADER_HEIGHT + rows.length * ROW_HEIGHT,
          }}
        >
          <GanttLeftPane
            rows={rows}
            range={rowRange}
            width={leftWidth}
            selectedTaskId={selectedTaskId}
            highlighted={highlighted}
            collapsed={collapsed}
            dependencies={dependencies}
            tasksById={tasksById}
            onSelect={select}
            onOpenDetail={openDetail}
            onToggle={toggleCollapsed}
            onResizeStart={onResizeStart}
          />
          <div className="relative" style={{ width: axis.width }}>
            <div className="sticky top-0 z-10">
              <GanttHeader axis={axis} />
            </div>
            <GanttTimeline
              axis={axis}
              rows={rows}
              range={rowRange}
              bars={scene.bars}
              arrows={scene.arrows}
              shading={shading}
              todayX={todayX}
              statusX={statusX}
              selectedTaskId={selectedTaskId}
              hoverTaskId={hoverTaskId}
              highlighted={highlighted}
              showCritical={showCritical}
              colorMode={colorMode}
              labelMode={labelMode}
              colorOf={colorOf}
              labelOf={labelOf}
              baselineById={baselineById}
              dependenciesById={dependenciesById}
              dragging={dragging}
              canEdit={canEdit}
              svgRef={svgRef}
              previewRef={previewRef}
              connectRef={connectRef}
              onBarPointerDown={onBarPointerDown}
              onSelect={select}
              onOpenDetail={openDetail}
              onHover={setHoverTaskId}
              onArrowClick={onArrowClick}
            />
          </div>
        </div>
        <DependencyPopover state={popover} onClose={() => setPopover(null)} />
      </div>
      {rows.length === 0 ? (
        <p className="text-muted-foreground border-t px-4 py-2 text-sm">
          No hay tareas. Créalas en la vista Tabla para verlas en el Gantt.
        </p>
      ) : null}
      <TaskSheet />
    </div>
  );
}
