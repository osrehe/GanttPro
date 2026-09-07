"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useChangesPolling } from "@/hooks/use-changes-polling";
import { api } from "@/lib/api-client";
import { describeError, useProjectStore } from "@/stores/project-store";

/** Carga el proyecto completo y lo vuelca en el store; las vistas leen siempre del store. */
export function ProjectLoader({
  projectId,
  currentUserId = null,
  children,
}: {
  projectId: string;
  currentUserId?: string | null;
  children: ReactNode;
}) {
  const hydrate = useProjectStore((s) => s.hydrate);
  const setCurrentUserId = useProjectStore((s) => s.setCurrentUserId);
  const loadedId = useProjectStore((s) => (s.loaded ? s.projectId : null));
  const query = useQuery({
    queryKey: ["project", projectId, "full"],
    queryFn: () => api.projects.full(projectId),
  });

  useEffect(() => setCurrentUserId(currentUserId), [currentUserId, setCurrentUserId]);

  useEffect(() => {
    if (query.data) {
      hydrate(query.data);
      performance.mark("project:hydrated");
    }
  }, [query.data, hydrate]);

  // Colaboración simultánea: avisa de los cambios de otras personas y recarga el proyecto.
  useChangesPolling(projectId, currentUserId);

  if (query.isError) {
    return (
      <div className="p-6">
        <p className="text-destructive" role="alert" data-testid="project-error">
          {describeError(query.error)}
        </p>
      </div>
    );
  }
  if (loadedId !== projectId) {
    return (
      <div className="space-y-3 p-6" aria-busy="true" aria-label="Cargando proyecto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
