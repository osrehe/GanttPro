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
import type { DependencyDto, TaskDto } from "@/lib/dto";
import {
  createDependencyCommand,
  removeDependencyCommand,
  updateDependencyCommand,
} from "@/stores/commands";
import { useProjectStore } from "@/stores/project-store";

const TYPES: Array<{ value: DependencyDto["type"]; label: string }> = [
  { value: "FS", label: "FS · fin → inicio" },
  { value: "SS", label: "SS · inicio → inicio" },
  { value: "FF", label: "FF · fin → fin" },
  { value: "SF", label: "SF · inicio → fin" },
];

/** Editor de predecesoras de una tarea con validación de ciclos del engine (UC-10). */
export function DependencyEditor({ task, canEdit }: { task: TaskDto; canEdit: boolean }) {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const tasks = useProjectStore((s) => s.tasks);
  const tasksById = useProjectStore((s) => s.tasksById);
  const dependencies = useProjectStore((s) => s.dependencies);
  const run = useProjectStore((s) => s.run);
  const [predecessorId, setPredecessorId] = useState("");
  const [type, setType] = useState<DependencyDto["type"]>("FS");
  const [lag, setLag] = useState("0");

  const predecessors = dependencies.filter((d) => d.successorId === task.id);
  const successors = dependencies.filter((d) => d.predecessorId === task.id);
  const candidates = tasks.filter(
    (t) => t.id !== task.id && !t.isSummary && !predecessors.some((d) => d.predecessorId === t.id),
  );

  if (task.isSummary) {
    return (
      <p className="text-muted-foreground pt-3 text-sm">
        Las tareas resumen no admiten dependencias.
      </p>
    );
  }

  async function add() {
    if (!predecessorId) return toast.error("Elige la tarea predecesora");
    const ok = await run(
      createDependencyCommand(projectId, {
        predecessorId,
        successorId: task.id,
        type,
        lagDays: Number(lag) || 0,
      }),
    );
    if (ok) {
      setPredecessorId("");
      setLag("0");
    }
  }

  return (
    <div className="space-y-4 pt-3">
      <section>
        <h4 className="mb-2 text-sm font-medium">Predecesoras</h4>
        {predecessors.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sin predecesoras: la tarea empieza en su ancla.
          </p>
        ) : (
          <ul className="divide-y rounded-md border" data-testid="predecessor-list">
            {predecessors.map((d) => {
              const pred = tasksById.get(d.predecessorId);
              return (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{pred?.wbsCode}</span> {pred?.name}
                  </span>
                  <Select
                    value={d.type}
                    disabled={!canEdit}
                    onValueChange={(v) =>
                      void run(updateDependencyCommand(d, { type: v as DependencyDto["type"] }))
                    }
                  >
                    <SelectTrigger className="h-8 w-20" aria-label="Tipo">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="h-8 w-20"
                    aria-label="Desfase en días"
                    defaultValue={d.lagDays}
                    disabled={!canEdit}
                    onBlur={(e) => {
                      const lagDays = Number(e.target.value) || 0;
                      if (lagDays !== d.lagDays) void run(updateDependencyCommand(d, { lagDays }));
                    }}
                  />
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar dependencia"
                      onClick={() => void run(removeDependencyCommand(d))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-md border p-3">
          <h4 className="mb-2 text-sm font-medium">Agregar predecesora</h4>
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="dep-pred">Tarea</Label>
              <Select value={predecessorId} onValueChange={setPredecessorId}>
                <SelectTrigger id="dep-pred">
                  <SelectValue placeholder="Elegir tarea…" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.wbsCode} {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dep-type">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as DependencyDto["type"])}>
                <SelectTrigger id="dep-type" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dep-lag">Desfase (d)</Label>
              <Input
                id="dep-lag"
                type="number"
                className="w-20"
                value={lag}
                onChange={(e) => setLag(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void add()} data-testid="add-dependency">
              <Plus className="size-4" />
              Agregar
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Si la dependencia crea un ciclo se rechaza y se muestra el ciclo detectado.
          </p>
        </section>
      ) : null}

      <section>
        <h4 className="mb-2 text-sm font-medium">Sucesoras</h4>
        {successors.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ninguna tarea depende de esta.</p>
        ) : (
          <ul className="text-sm">
            {successors.map((d) => {
              const succ = tasksById.get(d.successorId);
              return (
                <li key={d.id}>
                  <span className="font-medium">{succ?.wbsCode}</span> {succ?.name} · {d.type}
                  {d.lagDays !== 0 ? ` ${d.lagDays > 0 ? "+" : ""}${d.lagDays}d` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
