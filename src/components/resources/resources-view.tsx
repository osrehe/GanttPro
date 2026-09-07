"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { ResourceDto } from "@/lib/dto";
import { describeError, useProjectStore } from "@/stores/project-store";
import { ResourceDialog } from "./resource-dialog";

const TYPE_LABEL: Record<ResourceDto["type"], string> = {
  PERSON: "Persona",
  TEAM: "Equipo",
  MATERIAL: "Material",
};

/** Página de recursos del proyecto: CRUD y asignaciones por recurso (UC-15). */
export function ResourcesView() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const role = useProjectStore((s) => s.role);
  const resources = useProjectStore((s) => s.resources);
  const assignments = useProjectStore((s) => s.assignments);
  const tasksById = useProjectStore((s) => s.tasksById);
  const applyResource = useProjectStore((s) => s.applyResource);
  const removeResource = useProjectStore((s) => s.removeResource);
  const [editing, setEditing] = useState<ResourceDto | null | "new">(null);
  const [deleting, setDeleting] = useState<ResourceDto | null>(null);
  const canEdit = role === "ADMIN" || role === "EDITOR";

  const assignmentsByResource = useMemo(() => {
    const map = new Map<string, Array<{ taskLabel: string; pct: number; hours: number }>>();
    for (const a of assignments) {
      const task = tasksById.get(a.taskId);
      if (!task) continue;
      const list = map.get(a.resourceId) ?? [];
      list.push({
        taskLabel: `${task.wbsCode} ${task.name}`,
        pct: a.allocationPct,
        hours: (task.durationDays * 8 * a.allocationPct) / 100,
      });
      map.set(a.resourceId, list);
    }
    return map;
  }, [assignments, tasksById]);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.resources.remove(deleting.id);
      removeResource(deleting.id);
      toast.success(`Recurso "${deleting.name}" eliminado`);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Recursos</h2>
        <p className="text-muted-foreground text-sm">{resources.length} en el proyecto</p>
        {canEdit ? (
          <Button className="ml-auto" onClick={() => setEditing("new")} data-testid="new-resource">
            <Plus className="size-4" />
            Nuevo recurso
          </Button>
        ) : null}
      </div>

      {resources.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            Aún no hay recursos. Crea personas, equipos o materiales para asignarlos a las tareas.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Tarifa</TableHead>
                <TableHead className="text-right">Capacidad (h/día)</TableHead>
                <TableHead>Asignaciones</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {resources.map((r) => {
                const list = assignmentsByResource.get(r.id) ?? [];
                const hours = list.reduce((sum, a) => sum + a.hours, 0);
                return (
                  <TableRow key={r.id} data-testid="resource-row">
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block size-3 rounded-full border"
                          style={{ backgroundColor: r.color ?? "transparent" }}
                          aria-hidden
                        />
                        {r.name}
                        {!r.isActive ? <Badge variant="secondary">Inactivo</Badge> : null}
                      </span>
                      {r.email ? <p className="text-muted-foreground text-xs">{r.email}</p> : null}
                    </TableCell>
                    <TableCell>{TYPE_LABEL[r.type]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.rate.toLocaleString("es-CL", { maximumFractionDigits: 2 })}{" "}
                      {r.rateCurrency}/h
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.capacityHoursPerDay}
                    </TableCell>
                    <TableCell>
                      {list.length === 0 ? (
                        <span className="text-muted-foreground text-sm">Sin asignaciones</span>
                      ) : (
                        <ul className="space-y-0.5 text-sm">
                          {list.map((a, i) => (
                            <li key={i}>
                              {a.taskLabel}{" "}
                              <span className="text-muted-foreground">({a.pct} %)</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {hours.toLocaleString("es-CL")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${r.name}`}
                            onClick={() => setEditing(r)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar ${r.name}`}
                            onClick={() => setDeleting(r)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ResourceDialog
        open={editing !== null}
        projectId={projectId}
        resource={editing === "new" ? null : editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(saved) => {
          applyResource(saved);
          setEditing(null);
        }}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el recurso?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán también sus {assignmentsByResource.get(deleting?.id ?? "")?.length ?? 0}{" "}
              asignaciones. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
