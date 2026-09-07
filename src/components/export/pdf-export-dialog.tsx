"use client";

import type { TimeScale } from "@ganttpro/engine";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { api } from "@/lib/api-client";
import { downloadFromApi } from "@/lib/download";
import { exportFileName } from "@/lib/export/excel";
import {
  PAPER_LABELS,
  PAPER_SIZES,
  PDF_DEFAULT_OPTIONS,
  PRINT_COLUMNS,
  PRINT_COLUMN_LABELS,
  pdfOptionsToQuery,
  type PdfOptions,
  type PrintColumn,
} from "@/lib/export/print-model";
import { describeError, useProjectStore } from "@/stores/project-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectId: string;
  projectName: string;
}

const SCALES: Array<{ value: TimeScale; label: string }> = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "quarter", label: "Trimestre" },
];

/** Opciones de exportación a PDF (UC-27). El PDF lo genera el servidor con la ruta de impresión. */
export function PdfExportDialog({ open, onOpenChange, projectId, projectName }: Props) {
  const baselines = useProjectStore((s) => s.baselines);
  const tasks = useProjectStore((s) => s.tasks);
  const [options, setOptions] = useState<PdfOptions>(PDF_DEFAULT_OPTIONS);
  const [customRange, setCustomRange] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOptions({ ...PDF_DEFAULT_OPTIONS, title: null });
    setCustomRange(false);
  }, [open]);

  const projectFrom = tasks.reduce<string | null>(
    (min, t) => (min === null || t.startDate < min ? t.startDate : min),
    null,
  );
  const projectTo = tasks.reduce<string | null>(
    (max, t) => (max === null || t.endDate > max ? t.endDate : max),
    null,
  );

  function patch(partial: Partial<PdfOptions>) {
    setOptions((current) => ({ ...current, ...partial }));
  }

  function toggleColumn(column: PrintColumn, checked: boolean) {
    const next = new Set(options.columns);
    if (checked) next.add(column);
    else next.delete(column);
    patch({ columns: PRINT_COLUMNS.filter((c) => next.has(c)) });
  }

  async function generate() {
    if (options.columns.length === 0) {
      toast.error("Selecciona al menos una columna");
      return;
    }
    setBusy(true);
    try {
      const query = pdfOptionsToQuery({
        ...options,
        from: customRange ? options.from : null,
        to: customRange ? options.to : null,
      });
      const name = await downloadFromApi(
        api.export.pdfUrl(projectId, query),
        exportFileName(projectName, "gantt", "pdf"),
      );
      toast.success(`PDF descargado: ${name}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar a PDF</DialogTitle>
          <DialogDescription>
            Se imprime la tabla WBS junto a la carta Gantt, paginada. El texto queda seleccionable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pdf-title">Título (opcional)</Label>
            <Input
              id="pdf-title"
              placeholder={projectName}
              value={options.title ?? ""}
              onChange={(e) => patch({ title: e.target.value || null })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pdf-scale">Escala de tiempo</Label>
            <Select value={options.scale} onValueChange={(v) => patch({ scale: v as TimeScale })}>
              <SelectTrigger id="pdf-scale" data-testid="pdf-scale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCALES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pdf-orientation">Orientación</Label>
            <Select
              value={options.orientation}
              onValueChange={(v) => patch({ orientation: v as PdfOptions["orientation"] })}
            >
              <SelectTrigger id="pdf-orientation" data-testid="pdf-orientation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="landscape">Horizontal</SelectItem>
                <SelectItem value="portrait">Vertical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pdf-size">Tamaño de papel</Label>
            <Select
              value={options.size}
              onValueChange={(v) => patch({ size: v as PdfOptions["size"] })}
            >
              <SelectTrigger id="pdf-size" data-testid="pdf-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPER_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {PAPER_LABELS[size]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pdf-baseline">Línea base</Label>
            <Select
              value={options.baselineId ?? "none"}
              onValueChange={(v) => patch({ baselineId: v === "none" ? null : v })}
              disabled={baselines.length === 0}
            >
              <SelectTrigger id="pdf-baseline">
                <SelectValue placeholder="Sin línea base" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin línea base</SelectItem>
                {baselines.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Rango de fechas</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pdf-range"
                checked={!customRange}
                onChange={() => setCustomRange(false)}
              />
              Proyecto completo
              {projectFrom && projectTo ? (
                <span className="text-muted-foreground text-xs">
                  ({projectFrom} → {projectTo})
                </span>
              ) : null}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pdf-range"
                checked={customRange}
                onChange={() => {
                  setCustomRange(true);
                  patch({ from: options.from ?? projectFrom, to: options.to ?? projectTo });
                }}
              />
              Personalizado
            </label>
            {customRange ? (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  aria-label="Desde"
                  value={options.from ?? ""}
                  onChange={(e) => patch({ from: e.target.value || null })}
                />
                <span className="text-muted-foreground text-xs">a</span>
                <Input
                  type="date"
                  aria-label="Hasta"
                  value={options.to ?? ""}
                  onChange={(e) => patch({ to: e.target.value || null })}
                />
              </div>
            ) : null}
          </fieldset>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="text-sm font-medium">Columnas de la tabla</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PRINT_COLUMNS.map((column) => (
                <label key={column} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={options.columns.includes(column)}
                    onCheckedChange={(v) => toggleColumn(column, v === true)}
                    data-testid={`pdf-col-${column}`}
                  />
                  {PRINT_COLUMN_LABELS[column]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-wrap gap-4 sm:col-span-2">
            <legend className="sr-only">Opciones</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={options.critical}
                onCheckedChange={(v) => patch({ critical: v === true })}
              />
              Resaltar ruta crítica
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={options.legend}
                onCheckedChange={(v) => patch({ legend: v === true })}
              />
              Leyenda
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={options.logo}
                onCheckedChange={(v) => patch({ logo: v === true })}
              />
              Logo (de Configuración)
            </label>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void generate()} disabled={busy} data-testid="confirm-pdf">
            {busy ? "Generando…" : "Generar PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
