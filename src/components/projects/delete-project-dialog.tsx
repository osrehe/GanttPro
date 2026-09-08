"use client";

import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
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
import { api } from "@/lib/api-client";
import { downloadFromApi } from "@/lib/download";
import { exportFileName } from "@/lib/export/excel";
import type { ProjectSummaryDto } from "@/lib/dto";
import { describeError } from "@/stores/project-store";

interface Props {
  /** Proyecto a eliminar; nulo cierra el diálogo. */
  project: ProjectSummaryDto | null;
  onOpenChange(open: boolean): void;
  onDeleted(): void;
}

/**
 * Confirmación de borrado definitivo (UC-39). Pide escribir el nombre exacto y ofrece descargar
 * antes el libro Excel, porque después no hay vuelta atrás.
 */
export function DeleteProjectDialog({ project, onOpenChange, onDeleted }: Props) {
  const [typed, setTyped] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setTyped("");
  }, [project?.id]);

  const remove = useMutation({
    mutationFn: () => api.projects.remove(project?.id as string),
    onSuccess: (result) => {
      toast.success(
        `Se eliminó "${result.projectName}" con ${result.taskCount} tareas, ${result.dependencyCount} dependencias y ${result.resourceCount} recursos`,
      );
      onDeleted();
      onOpenChange(false);
    },
    onError: (error) => toast.error(describeError(error)),
  });

  async function downloadBackup() {
    if (!project) return;
    setDownloading(true);
    try {
      const name = await downloadFromApi(
        api.export.xlsxUrl(project.id),
        exportFileName(project.name, "plan", "xlsx"),
      );
      toast.success(`Copia descargada: ${name}`);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setDownloading(false);
    }
  }

  const busy = remove.isPending || downloading;
  const confirmed = project !== null && typed.trim() === project.name;

  return (
    <Dialog open={project !== null} onOpenChange={(open) => !busy && onOpenChange(open)}>
      <DialogContent data-testid="delete-project-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" aria-hidden />
            Eliminar el proyecto
          </DialogTitle>
          <DialogDescription>
            Esta acción no se puede deshacer. Si solo quieres sacarlo de la lista, archívalo.
          </DialogDescription>
        </DialogHeader>

        {project ? (
          <div className="grid gap-4">
            <div className="border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm">
              <p className="font-medium">Se borrarán junto con «{project.name}»:</p>
              <ul className="text-muted-foreground mt-1 list-disc pl-5">
                <li>{project.taskCount} tareas con sus dependencias y asignaciones</li>
                <li>los recursos, las líneas base y los comentarios del proyecto</li>
                <li>los enlaces de solo lectura, que dejarán de funcionar</li>
                <li>el historial de cambios del proyecto</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Queda un registro con el nombre, quién lo eliminó, cuándo y cuánto contenía.
              </p>
            </div>

            <Button
              variant="outline"
              onClick={() => void downloadBackup()}
              disabled={busy}
              data-testid="download-before-delete"
            >
              <FileSpreadsheet className="size-4" />
              {downloading ? "Descargando…" : "Descargar una copia en Excel antes de borrar"}
            </Button>

            <div className="grid gap-1.5">
              <Label htmlFor="confirm-name">
                Escribe <span className="font-mono">{project.name}</span> para confirmar
              </Label>
              <Input
                id="confirm-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                data-testid="confirm-project-name"
                disabled={busy}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => remove.mutate()}
            disabled={!confirmed || busy}
            data-testid="confirm-delete-project"
          >
            {remove.isPending ? "Eliminando…" : "Eliminar definitivamente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
