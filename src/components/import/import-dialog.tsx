"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileDown, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { api } from "@/lib/api-client";
import { formatDateCl, todayIso } from "@/lib/dates";
import type { ImportPreview } from "@/lib/import/types";
import { cn } from "@/lib/utils";
import { describeError } from "@/stores/project-store";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Proyecto abierto (permite "agregar al proyecto actual"); nulo desde la lista de proyectos. */
  projectId: string | null;
  projectName: string | null;
  canEditProject: boolean;
}

type ImportMode = "new" | "append" | "replace";

const ACCEPT = ".xlsx,.csv,.txt,.xml";
const PREVIEW_ROWS = 60;

/** Importación desde Excel/CSV (plantilla) o MS Project XML (UC-29, UC-30). */
export function ImportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  canEditProject,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mode, setMode] = useState<ImportMode>("new");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setMode(projectId && canEditProject ? "append" : "new");
    setReplaceConfirmed(false);
    setName("");
    setStartDate(todayIso());
    if (fileRef.current) fileRef.current.value = "";
  }, [open, projectId, canEditProject]);

  async function analyze(selected: File) {
    setFile(selected);
    setPreview(null);
    setAnalyzing(true);
    try {
      const result = await api.import.preview(selected);
      setPreview(result);
      setName(
        (current) => current || result.plan.projectName || selected.name.replace(/\.[^.]+$/, ""),
      );
      if (result.plan.startDate) setStartDate(result.plan.startDate);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setAnalyzing(false);
    }
  }

  async function runImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const result = await api.import.run({
        plan: preview.plan,
        target:
          mode !== "new" && projectId
            ? { mode, projectId }
            : { mode: "new", name: name.trim() || "Proyecto importado", startDate },
      });
      toast.success(
        `Importadas ${result.created.tasks} tareas, ${result.created.dependencies} dependencias y ${result.created.resources} recursos`,
      );
      onOpenChange(false);
      if (mode !== "new" && projectId) {
        await queryClient.invalidateQueries({ queryKey: ["project", projectId, "full"] });
      } else {
        router.push(`/projects/${result.projectId}/table`);
      }
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setImporting(false);
    }
  }

  const errors = preview?.counts.errors ?? 0;
  const busy = analyzing || importing;
  const canImport =
    preview !== null &&
    errors === 0 &&
    !busy &&
    (mode === "new" ? Boolean(name.trim()) : true) &&
    (mode !== "replace" || replaceConfirmed);

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar plan</DialogTitle>
          <DialogDescription>
            Acepta la plantilla Excel/CSV de GanttPro y archivos XML de Microsoft Project (MSPDI).
            Primero se analiza el archivo y se muestran los errores por fila; solo se importa si no
            hay errores.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="import-file">Archivo (.xlsx, .csv o .xml)</Label>
              <Input
                id="import-file"
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                data-testid="import-file"
                disabled={busy}
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void analyze(selected);
                }}
              />
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={api.import.templateUrl} download data-testid="import-template">
                <FileDown className="size-4" />
                Descargar plantilla
              </a>
            </Button>
          </div>

          <fieldset className="grid gap-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Destino</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="import-mode"
                value="new"
                checked={mode === "new"}
                onChange={() => setMode("new")}
                data-testid="import-mode-new"
              />
              Crear un proyecto nuevo
            </label>
            {mode === "new" ? (
              <div className="grid gap-3 pl-6 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="import-name">Nombre del proyecto</Label>
                  <Input
                    id="import-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="import-name"
                    maxLength={120}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="import-start">Fecha de inicio</Label>
                  <Input
                    id="import-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <label
              className={cn(
                "flex items-center gap-2 text-sm",
                (!projectId || !canEditProject) && "text-muted-foreground",
              )}
            >
              <input
                type="radio"
                name="import-mode"
                value="append"
                checked={mode === "append"}
                disabled={!projectId || !canEditProject}
                onChange={() => setMode("append")}
                data-testid="import-mode-append"
              />
              Agregar al proyecto actual{projectName ? ` (${projectName})` : ""}
              {projectId && !canEditProject ? " · requiere rol editor" : ""}
            </label>
            <label
              className={cn(
                "flex items-center gap-2 text-sm",
                (!projectId || !canEditProject) && "text-muted-foreground",
              )}
            >
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={mode === "replace"}
                disabled={!projectId || !canEditProject}
                onChange={() => setMode("replace")}
                data-testid="import-mode-replace"
              />
              Reemplazar las tareas del proyecto actual
            </label>
            {mode === "replace" ? (
              <label className="text-destructive flex items-center gap-2 pl-6 text-sm">
                <Checkbox
                  checked={replaceConfirmed}
                  onCheckedChange={(v) => setReplaceConfirmed(v === true)}
                  data-testid="import-replace-confirm"
                />
                Entiendo que se eliminarán todas las tareas, dependencias y asignaciones actuales
              </label>
            ) : null}
          </fieldset>

          {analyzing ? (
            <p className="text-muted-foreground text-sm" data-testid="import-analyzing">
              Analizando {file?.name}…
            </p>
          ) : null}

          {preview ? (
            <div className="grid gap-3" data-testid="import-preview">
              <div
                className="flex flex-wrap items-center gap-2 text-sm"
                data-testid="import-counts"
              >
                <Badge variant="secondary">
                  {preview.plan.source === "mspdi"
                    ? "MS Project"
                    : preview.plan.source.toUpperCase()}
                </Badge>
                <span>{preview.counts.tasks} tareas</span>
                <span>· {preview.counts.dependencies} dependencias</span>
                <span>· {preview.counts.resources} recursos</span>
                <span>· {preview.counts.assignments} asignaciones</span>
                <span className="ml-auto flex items-center gap-1">
                  {errors > 0 ? (
                    <>
                      <XCircle className="text-destructive size-4" aria-hidden />
                      <span className="text-destructive font-medium">
                        {errors} {errors === 1 ? "error" : "errores"}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4 text-green-600" aria-hidden />
                      <span className="font-medium text-green-700">Sin errores</span>
                    </>
                  )}
                  {preview.counts.warnings > 0 ? (
                    <span className="text-amber-700">
                      · {preview.counts.warnings}{" "}
                      {preview.counts.warnings === 1 ? "aviso" : "avisos"}
                    </span>
                  ) : null}
                </span>
              </div>

              {preview.issues.length > 0 ? (
                <div className="max-h-40 overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Fila</th>
                        <th className="px-2 py-1 text-left">Columna</th>
                        <th className="px-2 py-1 text-left">Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.issues.map((issue, i) => (
                        <tr
                          key={i}
                          data-testid="import-issue"
                          data-severity={issue.severity}
                          className={cn(
                            "border-t",
                            issue.severity === "error" ? "text-destructive" : "text-amber-700",
                          )}
                        >
                          <td className="px-2 py-1">{issue.row ?? "—"}</td>
                          <td className="px-2 py-1">{issue.column ?? "—"}</td>
                          <td className="flex items-center gap-1 px-2 py-1">
                            {issue.severity === "error" ? (
                              <XCircle className="size-3 shrink-0" aria-hidden />
                            ) : (
                              <AlertTriangle className="size-3 shrink-0" aria-hidden />
                            )}
                            {issue.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="max-h-64 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">WBS</th>
                      <th className="px-2 py-1 text-left">Nombre</th>
                      <th className="px-2 py-1 text-right">Duración</th>
                      <th className="px-2 py-1 text-left">Inicio</th>
                      <th className="px-2 py-1 text-right">Avance</th>
                      <th className="px-2 py-1 text-left">Predecesoras</th>
                      <th className="px-2 py-1 text-left">Recursos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.plan.tasks.slice(0, PREVIEW_ROWS).map((task) => (
                      <tr key={task.row} className="border-t" data-testid="import-task-row">
                        <td className="px-2 py-1 font-mono">{task.wbs}</td>
                        <td
                          className="px-2 py-1"
                          style={{ paddingLeft: 8 + (task.level - 1) * 12 }}
                        >
                          {task.isMilestone ? "◆ " : ""}
                          {task.name}
                        </td>
                        <td className="px-2 py-1 text-right">
                          {task.isMilestone ? "hito" : `${task.durationDays} d`}
                        </td>
                        <td className="px-2 py-1">{formatDateCl(task.startDate)}</td>
                        <td className="px-2 py-1 text-right">{task.progressPct} %</td>
                        <td className="px-2 py-1">{task.predecessors}</td>
                        <td className="px-2 py-1">{task.resources.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.plan.tasks.length > PREVIEW_ROWS ? (
                  <p className="text-muted-foreground border-t px-2 py-1 text-xs">
                    … y {preview.plan.tasks.length - PREVIEW_ROWS} tareas más
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={() => void runImport()}
            disabled={!canImport}
            data-testid="import-confirm"
          >
            {importing ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
