"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import type { AuditLogDto } from "@/lib/dto";
import { describeError, useProjectStore } from "@/stores/project-store";

const ACTION_LABEL: Record<AuditLogDto["action"], string> = {
  CREATE: "Creación",
  UPDATE: "Edición",
  DELETE: "Eliminación",
  MOVE: "Movimiento",
  RESCHEDULE: "Reprogramación",
  IMPORT: "Importación",
  RESTORE: "Restauración",
};

/** Historial de cambios filtrable por tarea, usuario y fecha (UC-36). */
export function AuditView() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const tasks = useProjectStore((s) => s.tasks);
  const members = useProjectStore((s) => s.members);
  const [entityId, setEntityId] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);

  const query = useQuery({
    queryKey: ["audit", projectId, entityId, userId, from, to, limit],
    queryFn: () =>
      api.projects.changes(projectId, {
        entityId: entityId === "all" ? undefined : entityId,
        userId: userId === "all" ? undefined : userId,
        from: from || undefined,
        to: to || undefined,
        order: "desc",
        limit,
      }),
  });

  const rows = query.data?.changes ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <h2 className="text-xl font-semibold tracking-tight">Historial de cambios</h2>
      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="audit-task">Tarea</Label>
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger id="audit-task">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.wbsCode} {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-user">Usuario</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger id="audit-user">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-from">Desde</Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to">Hasta</Label>
          <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {query.isError ? (
        <p className="text-destructive text-sm">{describeError(query.error)}</p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Fecha y hora</TableHead>
              <TableHead className="w-44">Usuario</TableHead>
              <TableHead className="w-32">Acción</TableHead>
              <TableHead className="w-28">Entidad</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="audit-table">
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground p-6 text-center">
                  {query.isLoading ? "Cargando…" : "Sin cambios para los filtros elegidos."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-testid="audit-row">
                  <TableCell className="tabular-nums">
                    {new Date(row.createdAt).toLocaleString("es-CL", { hour12: false })}
                  </TableCell>
                  <TableCell>{row.userName}</TableCell>
                  <TableCell>{ACTION_LABEL[row.action]}</TableCell>
                  <TableCell className="text-muted-foreground">{row.entityType}</TableCell>
                  <TableCell>
                    {row.userName} {row.summary}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {rows.length >= limit ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setLimit((l) => Math.min(500, l + 100))}>
            Cargar más
          </Button>
        </div>
      ) : null}
    </div>
  );
}
