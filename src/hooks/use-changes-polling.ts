"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useProjectStore } from "@/stores/project-store";
import { summarizeChanges } from "./changes-summary";

/**
 * Cada cuántos milisegundos se consulta el feed de cambios (UC-34). El criterio de aceptación pide
 * que un cambio ajeno se vea en menos de 3 s y cada aviso cuesta dos peticiones (el feed y la
 * recarga del proyecto), así que 2 s no dejaban margen: se usa 1,5 s (ADR-010).
 */
export const POLL_INTERVAL_MS = 1500;

/**
 * Colaboración simultánea: consulta `/changes` cada 2 s, avisa de los cambios ajenos con un toast y
 * recarga el proyecto para que gane la última escritura.
 *
 * El polling se detiene mientras la pestaña está oculta (no tiene sentido avisar a nadie), mientras
 * hay un comando en vuelo (`busy`) y mientras hay una celda en edición, para no pisar ni una
 * actualización optimista ni lo que la persona está escribiendo.
 */
export function useChangesPolling(projectId: string | null, currentUserId: string | null): void {
  const queryClient = useQueryClient();
  const busy = useProjectStore((s) => s.busy);
  const editing = useProjectStore((s) => s.editing);
  const loaded = useProjectStore((s) => s.loaded);
  const [visible, setVisible] = useState(true);
  // Solo interesan los cambios ocurridos desde que se abrió el proyecto.
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    cursorRef.current = projectId ? new Date().toISOString() : null;
  }, [projectId]);

  // Tampoco se consulta mientras hay una celda abierta: recargar el proyecto la desmontaría y se
  // perdería lo que la persona está escribiendo.
  const enabled = Boolean(projectId) && loaded && visible && !busy && !editing;

  const query = useQuery({
    queryKey: ["project", projectId, "changes"],
    enabled,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
    gcTime: 0,
    queryFn: async () => {
      const since = cursorRef.current ?? new Date().toISOString();
      return api.projects.changes(projectId as string, { since, limit: 100 });
    },
  });

  const data = query.data;
  useEffect(() => {
    if (!data || !projectId) return;
    cursorRef.current = data.cursor;
    const summary = summarizeChanges(data.changes, currentUserId);
    if (summary.message === null) return;
    toast.info(summary.message, { id: `cambios-${projectId}` });
    void queryClient.invalidateQueries({ queryKey: ["project", projectId, "full"] });
  }, [data, projectId, currentUserId, queryClient]);
}
