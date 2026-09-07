"use client";

import type { TimeScale } from "@ganttpro/engine";
import { ImageDown, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BaselineDto } from "@/lib/dto";
import { cn } from "@/lib/utils";
import type { ColorMode, LabelMode } from "./gantt-model";

const SCALES: Array<{ value: TimeScale; label: string }> = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
];

interface Props {
  scale: TimeScale;
  onScale(scale: TimeScale): void;
  onZoom(direction: 1 | -1): void;
  onFit(): void;
  showCritical: boolean;
  onShowCritical(value: boolean): void;
  baselines: readonly BaselineDto[];
  baselineId: string | null;
  onBaseline(id: string | null): void;
  colorMode: ColorMode;
  onColorMode(mode: ColorMode): void;
  labelMode: LabelMode;
  onLabelMode(mode: LabelMode): void;
  onExportPng(): void;
  exporting: boolean;
}

export function GanttToolbar(props: Props) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm"
      role="toolbar"
      aria-label="Opciones del Gantt"
    >
      <div className="flex items-center rounded-md border p-0.5" role="group" aria-label="Escala">
        {SCALES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={props.scale === s.value}
            data-testid={`scale-${s.value}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              props.scale === s.value ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
            onClick={() => props.onScale(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Alejar (Ctrl+rueda)"
        onClick={() => props.onZoom(-1)}
      >
        <ZoomOut className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Acercar (Ctrl+rueda)"
        onClick={() => props.onZoom(1)}
      >
        <ZoomIn className="size-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={props.onFit} data-testid="fit-project">
        <Maximize2 className="size-4" />
        Ajustar al proyecto
      </Button>
      <span className="bg-border mx-1 h-6 w-px" />
      <Button
        variant={props.showCritical ? "default" : "outline"}
        size="sm"
        aria-pressed={props.showCritical}
        onClick={() => props.onShowCritical(!props.showCritical)}
        data-testid="toggle-critical"
      >
        Ruta crítica
      </Button>
      <Select
        value={props.baselineId ?? "none"}
        onValueChange={(v) => props.onBaseline(v === "none" ? null : v)}
        disabled={props.baselines.length === 0}
      >
        <SelectTrigger className="h-8 w-44" aria-label="Línea base">
          <SelectValue placeholder="Línea base" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin línea base</SelectItem>
          {props.baselines.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="bg-border mx-1 h-6 w-px" />
      <label className="text-muted-foreground flex items-center gap-1 text-xs">
        Color
        <Select value={props.colorMode} onValueChange={(v) => props.onColorMode(v as ColorMode)}>
          <SelectTrigger className="h-8 w-32" aria-label="Color de barras">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="task">Por tarea</SelectItem>
            <SelectItem value="resource">Por recurso</SelectItem>
            <SelectItem value="status">Por estado</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="text-muted-foreground flex items-center gap-1 text-xs">
        Etiqueta
        <Select value={props.labelMode} onValueChange={(v) => props.onLabelMode(v as LabelMode)}>
          <SelectTrigger className="h-8 w-32" aria-label="Etiqueta de barras">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Nombre</SelectItem>
            <SelectItem value="resources">Recursos</SelectItem>
            <SelectItem value="none">Ninguna</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <span className="bg-border mx-1 h-6 w-px" />
      <Button
        variant="outline"
        size="sm"
        onClick={props.onExportPng}
        disabled={props.exporting}
        data-testid="export-png"
        title="Descargar el Gantt visible como imagen PNG"
      >
        <ImageDown className="size-4" />
        PNG
      </Button>
    </div>
  );
}
