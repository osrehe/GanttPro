"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { describeError, useProjectStore } from "@/stores/project-store";

/** Carga el proyecto completo y lo vuelca en el store; las vistas leen siempre del store. */
export function ProjectLoader({ projectId, children }: { projectId: string; children: ReactNode }) {
  const hydrate = useProjectStore((s) => s.hydrate);
  const loadedId = useProjectStore((s) => (s.loaded ? s.projectId : null));
  const query = useQuery({
    queryKey: ["project", projectId, "full"],
    queryFn: () => api.projects.full(projectId),
  });

  useEffect(() => {
    if (query.data) {
      hydrate(query.data);
      performance.mark("project:hydrated");
    }
  }, [query.data, hydrate]);

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
