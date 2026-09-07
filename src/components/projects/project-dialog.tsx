"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { todayIso } from "@/lib/dates";
import type { ProjectDto } from "@/lib/dto";
import { describeError } from "@/stores/project-store";

interface ProjectDialogProps {
  open: boolean;
  project: ProjectDto | null;
  onOpenChange(open: boolean): void;
  onSaved(project: ProjectDto): void;
}

/** Crear o editar un proyecto (UC-01). */
export function ProjectDialog({ open, project, onOpenChange, onSaved }: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [weighting, setWeighting] = useState<"DURATION" | "EFFORT">("DURATION");

  useEffect(() => {
    if (!open) return;
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setStartDate(project?.startDate ?? todayIso());
    setWeighting(project?.progressWeighting ?? "DURATION");
  }, [open, project]);

  const save = useMutation({
    mutationFn: () =>
      project
        ? api.projects.update(project.id, {
            name,
            description: description || null,
            startDate,
            progressWeighting: weighting,
          })
        : api.projects.create({
            name,
            description: description || null,
            startDate,
            progressWeighting: weighting,
          }),
    onSuccess: (saved) => {
      toast.success(project ? "Proyecto actualizado" : `Proyecto "${saved.name}" creado`);
      onSaved(saved);
    },
    onError: (error) => toast.error(describeError(error)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{project ? "Editar proyecto" : "Nuevo proyecto"}</DialogTitle>
            <DialogDescription>
              {project
                ? "Cambiar la fecha de inicio o la ponderación reprograma el proyecto."
                : "Se creará con un calendario lunes a viernes y los feriados de Chile del año de inicio."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Nombre</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">Descripción</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-start">Fecha de inicio</Label>
              <Input
                id="project-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-weighting">Ponderar avance por</Label>
              <Select
                value={weighting}
                onValueChange={(v) => setWeighting(v as "DURATION" | "EFFORT")}
              >
                <SelectTrigger id="project-weighting">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DURATION">Duración</SelectItem>
                  <SelectItem value="EFFORT">Esfuerzo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending || name.trim() === ""}>
              {save.isPending ? "Guardando…" : project ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
