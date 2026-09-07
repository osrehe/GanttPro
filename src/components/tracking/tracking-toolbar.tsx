"use client";

import { bulkProgressUpdates, createCalendar, getDescendantIds } from "@ganttpro/engine";
import { useMutation } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";
import { formatDateCl } from "@/lib/dates";
import { bulkPatchCommand } from "@/stores/commands";
import { describeError, useProjectStore } from "@/stores/project-store";

/**
 * Fecha de estado y actualización masiva de avance (UC-21). La actualización actúa sobre la tarea
 * seleccionada (y sus subtareas si es un resumen) o sobre todas si no hay selección; nunca reduce
 * un avance real mayor y se registra como un único comando deshacible.
 */
export function TrackingToolbar({ canEdit }: { canEdit: boolean }) {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const project = useProjectStore((s) => s.project);
  const calendarDto = useProjectStore((s) => s.calendar);
  const tasks = useProjectStore((s) => s.tasks);
  const selectedTaskId = useProjectStore((s) => s.selectedTaskId);
  const setProject = useProjectStore((s) => s.setProject);
  const run = useProjectStore((s) => s.run);
  const busy = useProjectStore((s) => s.busy);

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

  const updateStatusDate = useMutation({
    mutationFn: (value: string | null) => api.projects.update(projectId, { statusDate: value }),
    onSuccess: (updated) => setProject(updated),
    onError: (error) => toast.error(describeError(error)),
  });

  async function markProgress() {
    if (!calendar || !project?.statusDate) return toast.error("Define primero la fecha de estado");
    let scope: ReadonlySet<string> | null = null;
    if (selectedTaskId) {
      scope = new Set([selectedTaskId, ...getDescendantIds(tasks, selectedTaskId)]);
    }
    const updates = bulkProgressUpdates(tasks, project.statusDate, calendar, scope);
    if (updates.length === 0) return toast.message("Ninguna tarea necesita actualizar su avance");
    const ok = await run(
      bulkPatchCommand(
        projectId,
        updates.map((u) => ({ id: u.taskId, progressPct: u.progressPct })),
        "marcar avance según fecha de estado",
        `marcó el avance de ${updates.length} tarea(s) según la fecha de estado ${formatDateCl(project.statusDate)}`,
      ),
    );
    if (ok) toast.success(`Avance actualizado en ${updates.length} tarea(s)`);
  }

  return (
    <div className="ml-2 flex items-center gap-1" data-testid="tracking-toolbar">
      <label className="text-muted-foreground flex items-center gap-1 text-xs">
        Fecha de estado
        <Input
          type="date"
          className="h-8 w-40"
          aria-label="Fecha de estado"
          value={project?.statusDate ?? ""}
          disabled={!canEdit || updateStatusDate.isPending}
          onChange={(e) => updateStatusDate.mutate(e.target.value || null)}
          data-testid="status-date-input"
        />
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canEdit || busy || !project?.statusDate}
            onClick={() => void markProgress()}
            aria-label="Marcar avance según fecha de estado"
            data-testid="mark-progress"
          >
            <CalendarCheck className="size-4" /> Avance a fecha
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Fija el avance esperado a la fecha de estado en la tarea seleccionada (y sus subtareas) o
          en todas. Nunca reduce un avance mayor.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
