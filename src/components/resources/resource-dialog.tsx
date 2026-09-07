"use client";

import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api-client";
import type { ResourceDto } from "@/lib/dto";
import { describeError } from "@/stores/project-store";

interface ResourceDialogProps {
  open: boolean;
  projectId: string;
  resource: ResourceDto | null;
  onOpenChange(open: boolean): void;
  onSaved(resource: ResourceDto): void;
}

export function ResourceDialog({
  open,
  projectId,
  resource,
  onOpenChange,
  onSaved,
}: ResourceDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ResourceDto["type"]>("PERSON");
  const [email, setEmail] = useState("");
  const [rate, setRate] = useState("0");
  const [currency, setCurrency] = useState<ResourceDto["rateCurrency"]>("UF");
  const [capacity, setCapacity] = useState("8");
  const [color, setColor] = useState("#2563eb");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setName(resource?.name ?? "");
    setType(resource?.type ?? "PERSON");
    setEmail(resource?.email ?? "");
    setRate(String(resource?.rate ?? 0));
    setCurrency(resource?.rateCurrency ?? "UF");
    setCapacity(String(resource?.capacityHoursPerDay ?? 8));
    setColor(resource?.color ?? "#2563eb");
    setActive(resource?.isActive ?? true);
  }, [open, resource]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        type,
        email: email.trim() === "" ? null : email.trim(),
        rate: Number(rate),
        rateCurrency: currency,
        capacityHoursPerDay: Number(capacity),
        color,
      };
      return resource
        ? api.resources.update(resource.id, { ...payload, isActive: active })
        : api.resources.create(projectId, payload);
    },
    onSuccess: (saved) => {
      toast.success(resource ? "Recurso actualizado" : `Recurso "${saved.name}" creado`);
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
            <DialogTitle>{resource ? "Editar recurso" : "Nuevo recurso"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="resource-name">Nombre</Label>
            <Input
              id="resource-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="resource-type">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as ResourceDto["type"])}>
                <SelectTrigger id="resource-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERSON">Persona</SelectItem>
                  <SelectItem value="TEAM">Equipo</SelectItem>
                  <SelectItem value="MATERIAL">Material</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-email">Correo</Label>
              <Input
                id="resource-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-rate">Tarifa por hora</Label>
              <Input
                id="resource-rate"
                type="number"
                min={0}
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-currency">Moneda</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as ResourceDto["rateCurrency"])}
              >
                <SelectTrigger id="resource-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UF">UF</SelectItem>
                  <SelectItem value="CLP">CLP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-capacity">Capacidad (h/día)</Label>
              <Input
                id="resource-capacity"
                type="number"
                min={0.5}
                max={24}
                step="0.5"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resource-color">Color</Label>
              <Input
                id="resource-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 p-1"
              />
            </div>
          </div>
          {resource ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
              Activo (disponible para nuevas asignaciones)
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending || name.trim() === ""}>
              {save.isPending ? "Guardando…" : resource ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
