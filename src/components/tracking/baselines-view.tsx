"use client";

import { compareWithBaseline, createCalendar, type BaselineSnapshot } from "@ganttpro/engine";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { formatDateCl } from "@/lib/dates";
import type { BaselineDto } from "@/lib/dto";
import { cn } from "@/lib/utils";
import { describeError, useProjectStore } from "@/stores/project-store";

/** Líneas base: guardar (máx. 5), elegir y comparar contra el plan actual (UC-19). */
export function BaselinesView() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const role = useProjectStore((s) => s.role);
  const baselines = useProjectStore((s) => s.baselines);
  const tasksById = useProjectStore((s) => s.tasksById);
  const tasks = useProjectStore((s) => s.tasks);
  const calendarDto = useProjectStore((s) => s.calendar);
  const setBaselines = useProjectStore((s) => s.setBaselines);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(baselines[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<BaselineDto | null>(null);
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    if (selectedId && !baselines.some((b) => b.id === selectedId))
      setSelectedId(baselines[0]?.id ?? null);
    if (!selectedId && baselines[0]) setSelectedId(baselines[0].id);
  }, [baselines, selectedId]);

  const detail = useQuery({
    queryKey: ["baseline", selectedId],
    queryFn: () => api.baselines.get(selectedId as string),
    enabled: selectedId !== null,
  });

  const create = useMutation({
    mutationFn: () => api.baselines.create(projectId, name.trim() ? { name: name.trim() } : {}),
    onSuccess: (created) => {
      setBaselines([...baselines, created]);
      setSelectedId(created.id);
      setCreating(false);
      setName("");
      toast.success(`Línea base "${created.name}" guardada`);
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.baselines.remove(id),
    onSuccess: (_, id) => {
      setBaselines(baselines.filter((b) => b.id !== id));
      void queryClient.invalidateQueries({ queryKey: ["baseline", id] });
      toast.success("Línea base eliminada");
    },
    onError: (error) => toast.error(describeError(error)),
  });

  // La comparativa se calcula en el cliente con la fotografía y las tareas actuales del store,
  // así refleja cualquier cambio reciente sin depender de la caché de la consulta.
  const variance = useMemo(() => {
    const snapshots = (detail.data?.tasks ?? []) as BaselineSnapshot[];
    if (!calendarDto || snapshots.length === 0) return [];
    const calendar = createCalendar({
      workingDays: calendarDto.workingDays,
      hoursPerDay: calendarDto.hoursPerDay,
      holidays: calendarDto.holidays.map((h) => h.date),
    });
    return compareWithBaseline(tasks, snapshots, calendar);
  }, [detail.data, tasks, calendarDto]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Líneas base</h2>
        <p className="text-muted-foreground text-sm">{baselines.length} de 5</p>
        {isAdmin ? (
          <Button
            className="ml-auto"
            onClick={() => setCreating(true)}
            disabled={baselines.length >= 5}
            data-testid="new-baseline"
          >
            <Plus className="size-4" />
            Guardar línea base
          </Button>
        ) : null}
      </div>

      {baselines.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            Aún no hay líneas base. Guarda una fotografía del plan para comparar el avance real
            contra lo planificado.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Líneas base">
          {baselines.map((b) => (
            <div key={b.id} className="flex items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={selectedId === b.id}
                data-testid="baseline-tab"
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  selectedId === b.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
                onClick={() => setSelectedId(b.id)}
              >
                {b.name}{" "}
                <span className="opacity-70">· {formatDateCl(b.createdAt.slice(0, 10))}</span>
              </button>
              {isAdmin ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${b.name}`}
                  onClick={() => setDeleting(b)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {selectedId ? (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WBS</TableHead>
                <TableHead>Tarea</TableHead>
                <TableHead>Inicio base</TableHead>
                <TableHead>Fin base</TableHead>
                <TableHead>Inicio actual</TableHead>
                <TableHead>Fin actual</TableHead>
                <TableHead className="text-right">Var. inicio</TableHead>
                <TableHead className="text-right">Var. fin</TableHead>
                <TableHead className="text-right">Var. avance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="variance-table">
              {variance.map((row) => (
                <TableRow key={row.taskId} data-testid="variance-row" data-wbs={row.wbsCode}>
                  <TableCell className="font-medium">{row.wbsCode}</TableCell>
                  <TableCell>
                    {tasksById.get(row.taskId)?.name ?? "—"}{" "}
                    {row.status === "NEW" ? <Badge variant="secondary">Nueva</Badge> : null}
                    {row.status === "DELETED" ? (
                      <Badge variant="destructive">Eliminada</Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateCl(row.baseline?.startDate)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateCl(row.baseline?.endDate)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateCl(row.current?.startDate)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateCl(row.current?.endDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-col="start-variance">
                    <Variance value={row.startVarianceDays} suffix=" d" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-col="end-variance">
                    <Variance value={row.endVarianceDays} suffix=" d" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-col="progress-variance">
                    <Variance value={row.progressVariancePct} suffix=" %" invert />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <DialogHeader>
              <DialogTitle>Guardar línea base</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="baseline-name">Nombre</Label>
              <Input
                id="baseline-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Línea base ${baselines.length + 1}`}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending} data-testid="confirm-baseline">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la línea base «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Variance({
  value,
  suffix,
  invert = false,
}: {
  value: number | null;
  suffix: string;
  invert?: boolean;
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const bad = invert ? value < 0 : value > 0;
  const good = invert ? value > 0 : value < 0;
  return (
    <span className={cn(bad && "text-red-600", good && "text-green-700")}>
      {value > 0 ? "+" : ""}
      {value}
      {suffix}
    </span>
  );
}
