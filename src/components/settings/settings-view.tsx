"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { formatDateCl, todayIso } from "@/lib/dates";
import type { HolidayDto } from "@/lib/dto";
import { availableHolidayYears, chileanHolidays } from "@/lib/holidays";
import { describeError } from "@/stores/project-store";

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
] as const;

/** Configuración global (UC-37) y calendario laboral por proyecto (UC-04). */
export function SettingsView() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Configuración</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Preferencias que aplican a toda la aplicación y calendario laboral de cada proyecto.
        </p>
      </div>
      <GlobalSettingsCard />
      <CalendarCard />
    </div>
  );
}

function GlobalSettingsCard() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings.get });
  const [ufValue, setUfValue] = useState("");
  const [ufValueDate, setUfValueDate] = useState("");
  const [currency, setCurrency] = useState<"UF" | "CLP">("UF");
  const [dateFormat, setDateFormat] = useState<"dd-mm-yyyy" | "yyyy-mm-dd">("dd-mm-yyyy");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    const data = settings.data;
    if (!data) return;
    setUfValue(data.ufValue === null ? "" : String(data.ufValue));
    setUfValueDate(data.ufValueDate ?? "");
    setCurrency(data.displayCurrency);
    setDateFormat(data.dateFormat);
    setLogoUrl(data.logoUrl ?? "");
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => {
      const parsed = ufValue.trim() === "" ? null : Number(ufValue.replace(",", "."));
      if (parsed !== null && !(parsed > 0)) {
        throw new Error("El valor de la UF debe ser un número mayor que cero");
      }
      return api.settings.update({
        ufValue: parsed,
        ufValueDate: ufValueDate === "" ? null : ufValueDate,
        displayCurrency: currency,
        dateFormat,
        logoUrl: logoUrl.trim() === "" ? null : logoUrl.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Configuración guardada");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <Card data-testid="global-settings">
      <CardHeader>
        <CardTitle>Preferencias generales</CardTitle>
        <CardDescription>
          Valor de la UF para los costos, moneda de visualización, formato de fechas y logo de los
          documentos exportados.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {settings.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="uf-value">Valor de la UF (pesos)</Label>
                <Input
                  id="uf-value"
                  inputMode="decimal"
                  placeholder="38.000,00"
                  value={ufValue}
                  onChange={(e) => setUfValue(e.target.value)}
                  data-testid="uf-value"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="uf-date">Fecha del valor</Label>
                <Input
                  id="uf-date"
                  type="date"
                  value={ufValueDate}
                  onChange={(e) => setUfValueDate(e.target.value)}
                  data-testid="uf-value-date"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="display-currency">Moneda de visualización</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as "UF" | "CLP")}>
                  <SelectTrigger id="display-currency" data-testid="display-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="CLP">Pesos (CLP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="date-format">Formato de fechas</Label>
                <Select
                  value={dateFormat}
                  onValueChange={(v) => setDateFormat(v as "dd-mm-yyyy" | "yyyy-mm-dd")}
                >
                  <SelectTrigger id="date-format" data-testid="date-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dd-mm-yyyy">31-12-2026</SelectItem>
                    <SelectItem value="yyyy-mm-dd">2026-12-31</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="logo-url">Logo para exportaciones (URL)</Label>
              <Input
                id="logo-url"
                type="url"
                placeholder="https://mi-empresa.cl/logo.png"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                data-testid="logo-url"
              />
              <p className="text-muted-foreground text-xs">
                Aparece en el encabezado del PDF cuando la opción &laquo;Logo&raquo; está activada.
              </p>
            </div>
            <div>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                data-testid="save-settings"
              >
                {save.isPending ? "Guardando…" : "Guardar preferencias"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CalendarCard() {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects.list });
  const editable = useMemo(
    () => (projects.data ?? []).filter((p) => p.role !== "VIEWER" && p.status === "ACTIVE"),
    [projects.data],
  );
  const [projectId, setProjectId] = useState<string | null>(null);
  const selected = projectId ?? editable[0]?.id ?? null;

  const calendar = useQuery({
    queryKey: ["project", selected, "calendar"],
    queryFn: () => api.projects.calendar(selected as string),
    enabled: selected !== null,
  });

  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hoursPerDay, setHoursPerDay] = useState("8");
  const [holidays, setHolidays] = useState<HolidayDto[]>([]);
  const [newDate, setNewDate] = useState(todayIso());
  const [newName, setNewName] = useState("");
  const [year, setYear] = useState(String(availableHolidayYears().at(-1) ?? 2026));

  useEffect(() => {
    const data = calendar.data;
    if (!data) return;
    setWorkingDays([...data.workingDays]);
    setHoursPerDay(String(data.hoursPerDay));
    setHolidays([...data.holidays]);
  }, [calendar.data]);

  const save = useMutation({
    mutationFn: () => {
      const hours = Number(hoursPerDay.replace(",", "."));
      if (!(hours > 0) || hours > 24) throw new Error("Las horas por día deben estar entre 0 y 24");
      if (workingDays.length === 0) throw new Error("Debe haber al menos un día laborable");
      return api.projects.updateCalendar(selected as string, {
        workingDays,
        hoursPerDay: hours,
        holidays: holidays.map((h) => ({ date: h.date, name: h.name })),
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.affected.length === 0
          ? "Calendario guardado"
          : `Calendario guardado; se reprogramaron ${result.affected.length} tareas`,
      );
      void queryClient.invalidateQueries({ queryKey: ["project", selected] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (error) => toast.error(describeError(error)),
  });

  function toggleDay(day: number, checked: boolean) {
    setWorkingDays((current) =>
      checked
        ? [...new Set([...current, day])].sort((a, b) => a - b)
        : current.filter((d) => d !== day),
    );
  }

  function addHoliday() {
    const name = newName.trim();
    if (name === "" || newDate === "") {
      toast.error("Indica la fecha y el nombre del feriado");
      return;
    }
    if (holidays.some((h) => h.date === newDate)) {
      toast.error("Ya hay un feriado en esa fecha");
      return;
    }
    setHolidays((current) => [...current, { date: newDate, name }].sort(byDate));
    setNewName("");
  }

  function loadChileanHolidays() {
    const list = chileanHolidays(Number(year));
    if (list.length === 0) {
      toast.error(`No hay feriados cargados para ${year}; agrégalos a mano`);
      return;
    }
    setHolidays((current) => {
      const map = new Map(current.map((h) => [h.date, h]));
      for (const h of list) map.set(h.date, { date: h.date, name: h.name });
      return [...map.values()].sort(byDate);
    });
    toast.success(`${list.length} feriados de Chile ${year} agregados; recuerda guardar`);
  }

  if (projects.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (editable.length === 0) {
    return (
      <Card data-testid="calendar-settings">
        <CardHeader>
          <CardTitle>Calendario laboral</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No tienes proyectos con permiso de edición. Crea uno en Proyectos para configurar su
            calendario.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="calendar-settings">
      <CardHeader>
        <CardTitle>Calendario laboral del proyecto</CardTitle>
        <CardDescription>
          Días hábiles, horas por día y feriados. Guardar reprograma las tareas del proyecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1.5 sm:max-w-sm">
          <Label htmlFor="calendar-project">Proyecto</Label>
          <Select value={selected ?? ""} onValueChange={setProjectId}>
            <SelectTrigger id="calendar-project" data-testid="calendar-project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {editable.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {calendar.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Días laborables</legend>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((day) => (
                  <label key={day.value} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={workingDays.includes(day.value)}
                      onCheckedChange={(v) => toggleDay(day.value, v === true)}
                      data-testid={`working-day-${day.value}`}
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-1.5 sm:max-w-[12rem]">
              <Label htmlFor="hours-per-day">Horas por día hábil</Label>
              <Input
                id="hours-per-day"
                inputMode="decimal"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
                data-testid="hours-per-day"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-date">Feriado</Label>
                  <Input
                    id="holiday-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    data-testid="add-holiday-date"
                  />
                </div>
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="holiday-name">Nombre</Label>
                  <Input
                    id="holiday-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Feriado regional"
                    data-testid="add-holiday-name"
                  />
                </div>
                <Button variant="outline" onClick={addHoliday} data-testid="add-holiday">
                  <Plus className="size-4" />
                  Agregar
                </Button>
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-year">Feriados de Chile</Label>
                  <div className="flex items-center gap-2">
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger id="holiday-year" className="w-28" data-testid="holiday-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableHolidayYears().map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={loadChileanHolidays}
                      data-testid="load-chile-holidays"
                    >
                      <CalendarDays className="size-4" />
                      Cargar
                    </Button>
                  </div>
                </div>
              </div>

              {holidays.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  El calendario no tiene feriados. Agrégalos a mano o carga los de Chile.
                </p>
              ) : (
                <ul className="divide-y rounded-md border" data-testid="holiday-list">
                  {holidays.map((h) => (
                    <li
                      key={h.date}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm"
                      data-testid="holiday-row"
                    >
                      <span className="tabular-nums">{formatDateCl(h.date)}</span>
                      <span className="text-muted-foreground truncate">{h.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-auto"
                        aria-label={`Quitar el feriado ${h.name}`}
                        onClick={() => setHolidays((c) => c.filter((x) => x.date !== h.date))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                data-testid="save-calendar"
              >
                {save.isPending ? "Guardando…" : "Guardar calendario"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function byDate(a: HolidayDto, b: HolidayDto): number {
  return a.date.localeCompare(b.date);
}
