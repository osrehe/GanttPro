"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DependencyDto } from "@/lib/dto";
import { removeDependencyCommand, updateDependencyCommand } from "@/stores/commands";
import { useProjectStore } from "@/stores/project-store";

export interface ArrowPopoverState {
  dependency: DependencyDto;
  /** Posición relativa al contenedor del Gantt. */
  x: number;
  y: number;
}

/** Popover sobre una flecha: cambiar tipo o desfase, o eliminar la dependencia (UC-24). */
export function DependencyPopover({
  state,
  onClose,
}: {
  state: ArrowPopoverState | null;
  onClose(): void;
}) {
  const tasksById = useProjectStore((s) => s.tasksById);
  const run = useProjectStore((s) => s.run);
  const [type, setType] = useState<DependencyDto["type"]>("FS");
  const [lag, setLag] = useState("0");

  useEffect(() => {
    if (state) {
      setType(state.dependency.type);
      setLag(String(state.dependency.lagDays));
    }
  }, [state]);

  if (!state) return null;
  const { dependency } = state;
  const pred = tasksById.get(dependency.predecessorId);
  const succ = tasksById.get(dependency.successorId);

  async function save() {
    const lagDays = Number(lag) || 0;
    if (type === dependency.type && lagDays === dependency.lagDays) return onClose();
    const ok = await run(updateDependencyCommand(dependency, { type, lagDays }));
    if (ok) onClose();
  }

  async function remove() {
    const ok = await run(removeDependencyCommand(dependency));
    if (ok) onClose();
  }

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <div
          className="pointer-events-none absolute size-px"
          style={{ left: state.x, top: state.y }}
          aria-hidden
        />
      </PopoverAnchor>
      <PopoverContent className="w-72 space-y-3" data-testid="dependency-popover" align="start">
        <p className="text-sm font-medium">
          {pred?.wbsCode} → {succ?.wbsCode}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {pred?.name} → {succ?.name}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="arrow-type">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as DependencyDto["type"])}>
              <SelectTrigger id="arrow-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FS">FS</SelectItem>
                <SelectItem value="SS">SS</SelectItem>
                <SelectItem value="FF">FF</SelectItem>
                <SelectItem value="SF">SF</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="arrow-lag">Desfase (días)</Label>
            <Input
              id="arrow-lag"
              type="number"
              value={lag}
              onChange={(e) => setLag(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => void remove()}
            data-testid="arrow-delete"
          >
            <Trash2 className="size-4" />
            Eliminar
          </Button>
          <Button size="sm" onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
