"use client";

import { createCalendar, projectKpis, sCurve, type BaselineSnapshot } from "@ganttpro/engine";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatDateCl, todayIso } from "@/lib/dates";
import { describeError, useProjectStore } from "@/stores/project-store";

/** Dashboard del proyecto (UC-22): KPIs, hitos próximos, costos y curva S. */
export function DashboardView() {
  const projectId = useProjectStore((s) => s.projectId) as string;
  const project = useProjectStore((s) => s.project);
  const calendarDto = useProjectStore((s) => s.calendar);
  const tasks = useProjectStore((s) => s.tasks);
  const tasksById = useProjectStore((s) => s.tasksById);
  const assignments = useProjectStore((s) => s.assignments);
  const resources = useProjectStore((s) => s.resources);
  const baselines = useProjectStore((s) => s.baselines);
  const role = useProjectStore((s) => s.role);
  const setProject = useProjectStore((s) => s.setProject);
  const canEdit = role === "ADMIN" || role === "EDITOR";
  const [baselineId, setBaselineId] = useState<string | null>(baselines[0]?.id ?? null);

  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const baselineDetail = useQuery({
    queryKey: ["baseline", baselineId],
    queryFn: () => api.baselines.get(baselineId as string),
    enabled: baselineId !== null,
  });
  const statusDate = project?.statusDate ?? todayIso();

  const calendar = useMemo(
    () =>
      calendarDto
        ? createCalendar({
            workingDays: calendarDto.workingDays,
            hoursPerDay: calendarDto.hoursPerDay,
            holidays: calendarDto.holidays.map((h) => h.date),
          })
        : null,
    [calendarDto],
  );
  const engineResources = useMemo(
    () =>
      resources.map((r) => ({
        id: r.id,
        capacityHoursPerDay: r.capacityHoursPerDay,
        rate: r.rate,
        rateCurrency: r.rateCurrency,
      })),
    [resources],
  );
  const display = useMemo(
    () => ({
      currency: settings.data?.displayCurrency ?? "UF",
      ufValue: settings.data?.ufValue ?? null,
    }),
    [settings.data],
  );
  const baselineSnapshots = useMemo<BaselineSnapshot[] | null>(() => {
    const rows = baselineDetail.data?.tasks as
      | Array<{
          taskId: string;
          wbsCode: string;
          startDate: string;
          endDate: string;
          durationDays: number;
          progressPct: number;
        }>
      | undefined;
    return rows ?? null;
  }, [baselineDetail.data]);

  const kpis = useMemo(
    () =>
      calendar
        ? projectKpis({
            tasks,
            assignments,
            resources: engineResources,
            calendar,
            statusDate,
            display,
            baseline: baselineSnapshots,
          })
        : null,
    [tasks, assignments, engineResources, calendar, statusDate, display, baselineSnapshots],
  );
  const curve = useMemo(
    () => (calendar ? sCurve(tasks, calendar, statusDate) : []),
    [tasks, calendar, statusDate],
  );

  const updateStatusDate = useMutation({
    mutationFn: (value: string | null) => api.projects.update(projectId, { statusDate: value }),
    onSuccess: (updated) => {
      setProject(updated);
      toast.success(
        updated.statusDate
          ? `Fecha de estado: ${formatDateCl(updated.statusDate)}`
          : "Fecha de estado: hoy",
      );
    },
    onError: (error) => toast.error(describeError(error)),
  });

  if (!kpis) return null;
  const money = (value: number | null) =>
    value === null
      ? null
      : `${value.toLocaleString("es-CL", { maximumFractionDigits: display.currency === "UF" ? 2 : 0 })} ${display.currency}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" data-testid="dashboard">
      <div className="flex flex-wrap items-end gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <div className="ml-auto flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="status-date">Fecha de estado</Label>
            <Input
              id="status-date"
              type="date"
              className="w-44"
              value={project?.statusDate ?? ""}
              disabled={!canEdit || updateStatusDate.isPending}
              onChange={(e) => updateStatusDate.mutate(e.target.value || null)}
              data-testid="status-date"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dash-baseline">Línea base</Label>
            <Select
              value={baselineId ?? "none"}
              onValueChange={(v) => setBaselineId(v === "none" ? null : v)}
              disabled={baselines.length === 0}
            >
              <SelectTrigger id="dash-baseline" className="w-52">
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
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Avance global" testId="kpi-progress">
          <p className="text-3xl font-semibold tabular-nums">{kpis.progressPct} %</p>
          <p className="text-muted-foreground text-xs">
            esperado {kpis.expectedProgressPct} % al {formatDateCl(statusDate)}
          </p>
        </Kpi>
        <Kpi title="Tareas atrasadas" testId="kpi-late">
          <p
            className={`text-3xl font-semibold tabular-nums ${kpis.lateTaskCount > 0 ? "text-red-600" : ""}`}
          >
            {kpis.lateTaskCount}
          </p>
          <p className="text-muted-foreground text-xs">de {kpis.leafCount} tareas hoja</p>
        </Kpi>
        <Kpi title="Hitos próximos (15 días)" testId="kpi-milestones">
          {kpis.upcomingMilestones.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ninguno</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {kpis.upcomingMilestones.slice(0, 4).map((m) => (
                <li key={m.taskId}>
                  <span className="font-medium">{m.wbsCode}</span> {tasksById.get(m.taskId)?.name} ·{" "}
                  {formatDateCl(m.date)}
                </li>
              ))}
            </ul>
          )}
        </Kpi>
        <Kpi title="Costo" testId="kpi-cost">
          {kpis.plannedCost === null ? (
            <p className="text-sm">
              — ·{" "}
              <Link href="/settings" className="underline underline-offset-4">
                Configura el valor UF
              </Link>
            </p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">{money(kpis.consumedCost)}</p>
              <p className="text-muted-foreground text-xs">
                consumido de {money(kpis.plannedCost)} planificado · {kpis.totalHours} h
              </p>
            </>
          )}
        </Kpi>
        <Kpi title="Fin estimado" testId="kpi-end">
          <p className="text-2xl font-semibold tabular-nums">
            {formatDateCl(kpis.estimatedEnd) || "—"}
          </p>
          <p className="text-muted-foreground text-xs">
            {kpis.baselineEnd
              ? `línea base ${formatDateCl(kpis.baselineEnd)} · ${kpis.endVarianceDays === 0 ? "sin desviación" : `${(kpis.endVarianceDays ?? 0) > 0 ? "+" : ""}${kpis.endVarianceDays} días hábiles`}`
              : "sin línea base seleccionada"}
          </p>
        </Kpi>
        <Kpi
          title="Tareas atrasadas (detalle)"
          testId="kpi-late-list"
          className="sm:col-span-2 lg:col-span-3"
        >
          {kpis.lateTaskIds.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todo al día según la fecha de estado.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {kpis.lateTaskIds.slice(0, 12).map((id) => {
                const t = tasksById.get(id);
                return t ? (
                  <li key={id} className="truncate">
                    <span className="font-medium">{t.wbsCode}</span> {t.name}{" "}
                    <span className="text-muted-foreground">({t.progressPct} %)</span>
                  </li>
                ) : null;
              })}
            </ul>
          )}
        </Kpi>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Curva S · avance planificado vs. real</CardTitle>
        </CardHeader>
        <CardContent className="h-72" data-testid="s-curve">
          {curve.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin tareas con duración para graficar.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve.map((p) => ({ ...p, label: formatDateCl(p.date) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit=" %" />
                <ChartTooltip formatter={(value) => `${value} %`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="planned"
                  name="Planificado"
                  stroke="#6b7280"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Real"
                  stroke="#2563eb"
                  dot={false}
                  strokeWidth={2}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  title,
  children,
  testId,
  className,
}: {
  title: string;
  children: ReactNode;
  testId: string;
  className?: string;
}) {
  return (
    <Card className={className} data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
