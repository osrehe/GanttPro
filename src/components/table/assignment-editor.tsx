"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TaskDto } from "@/lib/dto";
import {
  createAssignmentCommand,
  removeAssignmentCommand,
  updateAssignmentCommand,
} from "@/stores/commands";
import { useProjectStore } from "@/stores/project-store";

/** Asignación de recursos a una tarea con porcentaje de dedicación (UC-16). */
export function AssignmentEditor({ task, canEdit }: { task: TaskDto; canEdit: boolean }) {
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const calendar = useProjectStore((s) => s.calendar);
  const run = useProjectStore((s) => s.run);
  const [resourceId, setResourceId] = useState("");
  const [pct, setPct] = useState("100");

  const mine = assignments.filter((a) => a.taskId === task.id);
  const available = resources.filter((r) => r.isActive && !mine.some((a) => a.resourceId === r.id));
  const hoursPerDay = calendar?.hoursPerDay ?? 8;

  if (task.isSummary) {
    return (
      <p className="text-muted-foreground pt-3 text-sm">
        Las tareas resumen no admiten asignaciones.
      </p>
    );
  }

  async function add() {
    if (!resourceId) return toast.error("Elige un recurso");
    const allocationPct = Number(pct);
    if (!Number.isInteger(allocationPct) || allocationPct < 1)
      return toast.error("La dedicación debe ser un entero mayor que 0");
    const ok = await run(createAssignmentCommand(task.id, { resourceId, allocationPct }));
    if (ok) {
      setResourceId("");
      setPct("100");
    }
  }

  return (
    <div className="space-y-4 pt-3">
      {mine.length === 0 ? (
        <p className="text-muted-foreground text-sm">Sin recursos asignados.</p>
      ) : (
        <ul className="divide-y rounded-md border" data-testid="assignment-list">
          {mine.map((a) => {
            const resource = resources.find((r) => r.id === a.resourceId);
            const hours = (task.durationDays * hoursPerDay * a.allocationPct) / 100;
            return (
              <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {resource?.name ?? "Recurso eliminado"}
                </span>
                <span className="text-muted-foreground w-16 text-right tabular-nums">
                  {hours} h
                </span>
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-20"
                  aria-label="Dedicación (%)"
                  defaultValue={a.allocationPct}
                  disabled={!canEdit}
                  onBlur={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isInteger(value) && value >= 1 && value !== a.allocationPct) {
                      void run(updateAssignmentCommand(a, value));
                    }
                  }}
                />
                <span className="text-muted-foreground text-xs">%</span>
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar recurso"
                    onClick={() => void run(removeAssignmentCommand(a))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="rounded-md border p-3">
          <h4 className="mb-2 text-sm font-medium">Asignar recurso</h4>
          {resources.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Crea recursos en la vista Recursos para poder asignarlos.
            </p>
          ) : (
            <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="assign-resource">Recurso</Label>
                <Select value={resourceId} onValueChange={setResourceId}>
                  <SelectTrigger id="assign-resource">
                    <SelectValue placeholder="Elegir recurso…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="assign-pct">Dedicación (%)</Label>
                <Input
                  id="assign-pct"
                  type="number"
                  min={1}
                  className="w-24"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void add()} data-testid="add-assignment">
                <Plus className="size-4" />
                Asignar
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
