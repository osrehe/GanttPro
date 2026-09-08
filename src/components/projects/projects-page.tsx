"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Copy, Pencil, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { MembersDialog } from "@/components/members/members-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDateCl } from "@/lib/dates";
import type { ProjectSummaryDto } from "@/lib/dto";
import { describeError } from "@/stores/project-store";
import { ProjectDialog } from "./project-dialog";

export function ProjectsPage() {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ProjectSummaryDto | null | "new">(null);
  const [sharing, setSharing] = useState<ProjectSummaryDto | null>(null);
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["projects"] });
  const duplicate = useMutation({
    mutationFn: (id: string) => api.projects.duplicate(id),
    onSuccess: (copy) => {
      toast.success(`Proyecto duplicado como "${copy.name}"`);
      void invalidate();
    },
    onError: (error) => toast.error(describeError(error)),
  });
  const toggleArchive = useMutation({
    mutationFn: (p: ProjectSummaryDto) =>
      api.projects.update(p.id, { status: p.status === "ARCHIVED" ? "ACTIVE" : "ARCHIVED" }),
    onSuccess: (updated) => {
      toast.success(updated.status === "ARCHIVED" ? "Proyecto archivado" : "Proyecto restaurado");
      void invalidate();
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const list = (projects.data ?? []).filter((p) => (showArchived ? true : p.status === "ACTIVE"));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Proyectos</h2>
        <label className="text-muted-foreground ml-auto flex items-center gap-2 text-sm">
          <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(v === true)} />
          Mostrar archivados
        </label>
        <Button onClick={() => setEditing("new")} data-testid="new-project">
          <Plus className="size-4" />
          Nuevo proyecto
        </Button>
      </div>

      {projects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : projects.isError ? (
        <p className="text-destructive">{describeError(projects.error)}</p>
      ) : list.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground mb-4">
            {showArchived ? "No hay proyectos." : "Aún no tienes proyectos activos."}
          </p>
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
          {list.map((p) => (
            <Card key={p.id} className="flex flex-col" data-testid="project-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <Link href={`/projects/${p.id}/table`} className="hover:underline">
                    {p.name}
                  </Link>
                  {p.status === "ARCHIVED" ? <Badge variant="secondary">Archivado</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground flex-1 space-y-2 text-sm">
                <p>
                  {p.planStart
                    ? `${formatDateCl(p.planStart)} – ${formatDateCl(p.planEnd)}`
                    : `Inicio ${formatDateCl(p.startDate)}`}
                </p>
                <p>
                  {p.taskCount} tareas · rol {roleLabel(p.role)}
                </p>
                <div className="flex items-center gap-2">
                  <Progress
                    value={p.progressPct}
                    className="h-2"
                    aria-label={`Avance de ${p.name}`}
                  />
                  <span className="w-10 text-right tabular-nums">{p.progressPct} %</span>
                </div>
              </CardContent>
              <CardFooter className="justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Miembros y compartir"
                  title={
                    p.role === "ADMIN"
                      ? "Miembros y compartir"
                      : "Solo un administrador del proyecto puede gestionar miembros"
                  }
                  data-testid="open-members"
                  disabled={p.role !== "ADMIN"}
                  onClick={() => setSharing(p)}
                >
                  <Users className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar"
                  title={
                    p.role === "VIEWER"
                      ? "Necesitas rol editor para modificar el proyecto"
                      : "Editar"
                  }
                  data-testid="edit-project"
                  disabled={p.role === "VIEWER"}
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Duplicar"
                  title="Duplicar"
                  disabled={duplicate.isPending}
                  onClick={() => duplicate.mutate(p.id)}
                >
                  <Copy className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={p.status === "ARCHIVED" ? "Restaurar" : "Archivar"}
                  title={p.status === "ARCHIVED" ? "Restaurar" : "Archivar"}
                  disabled={toggleArchive.isPending || p.role !== "ADMIN"}
                  onClick={() => toggleArchive.mutate(p)}
                >
                  {p.status === "ARCHIVED" ? (
                    <ArchiveRestore className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {sharing ? (
        <MembersDialog
          open
          onOpenChange={(open) => !open && setSharing(null)}
          projectId={sharing.id}
          projectName={sharing.name}
          isAdmin={sharing.role === "ADMIN"}
        />
      ) : null}

      <ProjectDialog
        open={editing !== null}
        project={editing === "new" ? null : editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void invalidate();
        }}
      />
    </div>
  );
}

function roleLabel(role: ProjectSummaryDto["role"]): string {
  return role === "ADMIN" ? "administrador" : role === "EDITOR" ? "editor" : "lector";
}
