"use client";

import { Download, FileSpreadsheet, FileText, ImageDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { downloadFromApi } from "@/lib/download";
import { exportFileName } from "@/lib/export/excel";
import { useMounted } from "@/hooks/use-mounted";
import { describeError } from "@/stores/project-store";
import { PdfExportDialog } from "./pdf-export-dialog";

interface Props {
  projectId: string | null;
  projectName: string | null;
  /** Vista activa del proyecto (`table`, `gantt`, …); el PNG solo existe en el Gantt. */
  view: string | null;
}

/** Menú Exportar del header (UC-26, UC-27, UC-28). */
export function ExportMenu({ projectId, projectName, view }: Props) {
  const [pdfOpen, setPdfOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useMounted();

  async function downloadExcel(gantt: "day" | "week") {
    if (!projectId) return;
    setBusy(true);
    try {
      const name = await downloadFromApi(
        api.export.xlsxUrl(projectId, gantt),
        exportFileName(projectName ?? "proyecto", "plan", "xlsx"),
      );
      toast.success(`Excel descargado: ${name}`);
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  const label = (
    <>
      <Download className="size-4" />
      Exportar
    </>
  );

  // Antes de montar se dibuja el mismo botón sin el menú: los identificadores que Radix genera con
  // `useId` no existen en el HTML del servidor y no pueden discrepar al hidratar.
  if (!mounted) {
    return (
      <Button variant="outline" size="sm" disabled data-testid="export-menu">
        <Download className="size-4" />
        Exportar
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={!projectId || busy}
            data-testid="export-menu"
            title={projectId ? "Exportar el proyecto" : "Abre un proyecto para exportarlo"}
          >
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Excel</DropdownMenuLabel>
          <DropdownMenuItem data-testid="export-xlsx" onSelect={() => void downloadExcel("day")}>
            <FileSpreadsheet className="size-4" />
            Libro Excel (Gantt por día)
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="export-xlsx-week"
            onSelect={() => void downloadExcel("week")}
          >
            <FileSpreadsheet className="size-4" />
            Libro Excel (Gantt por semana)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="export-pdf" onSelect={() => setPdfOpen(true)}>
            <FileText className="size-4" />
            PDF del Gantt…
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="export-png-menu"
            disabled={view !== "gantt"}
            onSelect={() => window.dispatchEvent(new CustomEvent("ganttpro:export-png"))}
          >
            <ImageDown className="size-4" />
            PNG del Gantt visible
            {view !== "gantt" ? (
              <span className="text-muted-foreground ml-auto text-xs">solo en Gantt</span>
            ) : null}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {projectId ? (
        <PdfExportDialog
          open={pdfOpen}
          onOpenChange={setPdfOpen}
          projectId={projectId}
          projectName={projectName ?? "proyecto"}
        />
      ) : null}
    </>
  );
}
