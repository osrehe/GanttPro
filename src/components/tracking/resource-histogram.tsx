"use client";

import {
  aggregateWeekly,
  createCalendar,
  proposeLeveling,
  resourceLoad,
  type EngineResource,
  type LevelingResult,
} from "@ganttpro/engine";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateCl } from "@/lib/dates";
import type { TaskDto } from "@/lib/dto";
import { cn } from "@/lib/utils";
import { bulkPatchCommand } from "@/stores/commands";
import { useProjectStore } from "@/stores/project-store";

// Recharts se carga solo cuando se abre la vista de recursos.
const LoadChart = dynamic(() => import("./charts").then((m) => m.LoadChart), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

type Mode = "daily" | "weekly";

interface Point {
  key: string;
  label: string;
  hours: number;
  capacity: number;
  over: boolean;
  taskIds: string[];
}

/** Histograma de carga por recurso con capacidad, sobreasignación y nivelación (UC-17, UC-18). */
export function ResourceHistogram() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const project = useProjectStore((s) => s.project);
  const role = useProjectStore((s) => s.role);
  const tasks = useProjectStore((s) => s.tasks);
  const tasksById = useProjectStore((s) => s.tasksById);
  const dependencies = useProjectStore((s) => s.dependencies);
  const assignments = useProjectStore((s) => s.assignments);
  const resources = useProjectStore((s) => s.resources);
  const calendarDto = useProjectStore((s) => s.calendar);
  const run = useProjectStore((s) => s.run);
  const canEdit = role === "ADMIN" || role === "EDITOR";
  const [resourceId, setResourceId] = useState<string>(resources[0]?.id ?? "");
  const [mode, setMode] = useState<Mode>("daily");
  const [selected, setSelected] = useState<Point | null>(null);
  const [proposal, setProposal] = useState<LevelingResult<TaskDto> | null>(null);

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
  const engineResources = useMemo<EngineResource[]>(
    () =>
      resources.map((r) => ({
        id: r.id,
        capacityHoursPerDay: r.capacityHoursPerDay,
        rate: r.rate,
        rateCurrency: r.rateCurrency,
      })),
    [resources],
  );
  const load = useMemo(
    () => (calendar ? resourceLoad(tasks, assignments, engineResources, calendar) : null),
    [tasks, assignments, engineResources, calendar],
  );
  const current = resourceId ? resources.find((r) => r.id === resourceId) : undefined;
  const engineResource = engineResources.find((r) => r.id === resourceId);

  const points = useMemo<Point[]>(() => {
    if (!load || !calendar || !engineResource) return [];
    const rl = load.byResource.get(engineResource.id);
    if (!rl) return [];
    if (mode === "daily") {
      return rl.days.map((d) => ({
        key: d.date,
        label: formatDateCl(d.date).slice(0, 5),
        hours: d.hours,
        capacity: d.capacityHours,
        over: d.isOverallocated,
        taskIds: [...new Set(d.items.map((i) => i.taskId))],
      }));
    }
    return aggregateWeekly(rl, engineResource, calendar).map((w) => {
      const days = rl.days.filter(
        (d) => d.date >= w.weekStart && d.date <= addDaysIso(w.weekStart, 6),
      );
      return {
        key: w.weekStart,
        label: `Sem. ${formatDateCl(w.weekStart).slice(0, 5)}`,
        hours: w.hours,
        capacity: w.capacityHours,
        over: w.isOverallocated,
        taskIds: [...new Set(days.flatMap((d) => d.items.map((i) => i.taskId)))],
      };
    });
  }, [load, calendar, engineResource, mode]);

  const overCount = load
    ? [...load.byResource.values()].reduce((sum, rl) => sum + rl.overallocatedDates.length, 0)
    : 0;

  function level() {
    if (!calendar || !project) return;
    const result = proposeLeveling(tasks, dependencies, assignments, engineResources, calendar, {
      progressWeighting: project.progressWeighting,
      projectStartDate: project.startDate,
    });
    if (result.moves.length === 0 && result.unresolved.size === 0) {
      toast.message("No hay sobreasignaciones que nivelar");
      return;
    }
    setProposal(result);
  }

  async function applyProposal() {
    if (!proposal) return;
    const ok = await run(
      bulkPatchCommand(
        projectId,
        proposal.moves.map((m) => ({ id: m.taskId, anchorDate: m.toAnchorDate })),
        "nivelar recursos",
        `niveló recursos retrasando ${proposal.moves.length} tarea(s)`,
      ),
    );
    if (ok) {
      toast.success(`Nivelación aplicada: ${proposal.moves.length} tarea(s) retrasadas`);
      setProposal(null);
    }
  }

  if (resources.length === 0) return null;

  return (
    <Card data-testid="resource-histogram">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <CardTitle className="text-base">Carga de trabajo</CardTitle>
        <span className={cn("text-xs", overCount > 0 ? "text-red-600" : "text-muted-foreground")}>
          {overCount > 0
            ? `${overCount} día(s) sobreasignado(s) en el proyecto`
            : "sin sobreasignaciones"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={resourceId} onValueChange={setResourceId}>
            <SelectTrigger className="h-8 w-56" aria-label="Recurso">
              <SelectValue placeholder="Recurso" />
            </SelectTrigger>
            <SelectContent>
              {resources.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="flex items-center rounded-md border p-0.5"
            role="group"
            aria-label="Agrupación"
          >
            {(["daily", "weekly"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={cn(
                  "rounded px-2.5 py-1 text-xs",
                  mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
                onClick={() => setMode(m)}
              >
                {m === "daily" ? "Diario" : "Semanal"}
              </button>
            ))}
          </div>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              onClick={level}
              disabled={overCount === 0}
              data-testid="level-resources"
            >
              Nivelar
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {current ? `${current.name} no tiene carga asignada.` : "Elige un recurso."}
          </p>
        ) : (
          <div className="h-64">
            <LoadChart
              points={points}
              color={current?.color ?? "#7c3aed"}
              onSelectIndex={(index) => setSelected(points[index] ?? null)}
            />
          </div>
        )}
        {selected ? (
          <div className="mt-3 rounded-md border p-3 text-sm" data-testid="histogram-detail">
            <p className="mb-1 font-medium">
              {selected.label}: {selected.hours} h de {selected.capacity} h{" "}
              {selected.over ? "· sobreasignado" : ""}
            </p>
            <ul className="text-muted-foreground list-disc pl-5">
              {selected.taskIds.map((id) => {
                const t = tasksById.get(id);
                return t ? (
                  <li key={id}>
                    {t.wbsCode} {t.name}
                  </li>
                ) : null;
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={proposal !== null} onOpenChange={(open) => !open && setProposal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Propuesta de nivelación</DialogTitle>
            <DialogDescription>
              Retrasa tareas no críticas hasta liberar los recursos. Días sobreasignados:{" "}
              {proposal?.overallocatedDaysBefore} → {proposal?.overallocatedDaysAfter}. Se aplica
              como una única operación deshacible.
            </DialogDescription>
          </DialogHeader>
          {proposal && proposal.moves.length > 0 ? (
            <table className="w-full text-sm" data-testid="leveling-moves">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-1">Tarea</th>
                  <th>Inicio actual</th>
                  <th>Nuevo inicio</th>
                  <th className="text-right">Retraso</th>
                </tr>
              </thead>
              <tbody>
                {proposal.moves.map((m) => (
                  <tr key={m.taskId} className="border-t">
                    <td className="py-1">
                      <span className="font-medium">{m.wbsCode}</span>{" "}
                      {tasksById.get(m.taskId)?.name}
                    </td>
                    <td className="tabular-nums">{formatDateCl(m.fromAnchorDate)}</td>
                    <td className="tabular-nums">{formatDateCl(m.toAnchorDate)}</td>
                    <td className="text-right tabular-nums">+{m.delayDays} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm">No hay movimientos posibles.</p>
          )}
          {proposal && proposal.unresolved.size > 0 ? (
            <p className="text-sm text-amber-700">
              Quedan conflictos entre tareas críticas que no se mueven automáticamente:{" "}
              {[...proposal.unresolved.entries()]
                .map(
                  ([rid, dates]) =>
                    `${resources.find((r) => r.id === rid)?.name ?? rid} (${dates.map((d) => formatDateCl(d)).join(", ")})`,
                )
                .join("; ")}
              .
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void applyProposal()}
              disabled={!proposal || proposal.moves.length === 0}
              data-testid="apply-leveling"
            >
              Aplicar nivelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
