"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Los dos gráficos de Recharts, aislados en un módulo propio para poder cargarlos bajo demanda:
 * la librería pesa más que el resto de la vista y solo hace falta al abrir el Dashboard o el
 * histograma de recursos. Ver `dashboard-view.tsx` y `resource-histogram.tsx`.
 */

export interface SCurvePoint {
  readonly label: string;
  readonly planned: number;
  readonly actual: number | null;
}

/** Curva S: avance planificado contra el real (UC-22). */
export function SCurveChart({
  data,
  height = 280,
}: {
  data: readonly SCurvePoint[];
  height?: number;
}) {
  return (
    // Altura explícita: el gráfico se monta después del layout y midiendo "100%" quedaba en cero.
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={[...data]}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit=" %" />
        <ChartTooltip formatter={(value) => `${value} %`} />
        <Legend />
        <Line
          type="monotone"
          dataKey="planned"
          name="Planificado"
          stroke="#a5b4fc"
          dot={false}
          strokeWidth={2}
        />
        <Line
          type="monotone"
          dataKey="actual"
          name="Real"
          stroke="#7c3aed"
          dot={false}
          strokeWidth={2}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface LoadPoint {
  readonly key: string;
  readonly label: string;
  readonly hours: number;
  readonly capacity: number;
  readonly over: boolean;
}

/** Histograma de carga de un recurso con su línea de capacidad (UC-17). */
export function LoadChart({
  points,
  color,
  onSelectIndex,
  height = 256,
}: {
  points: readonly LoadPoint[];
  color: string;
  onSelectIndex(index: number): void;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={[...points]}
        onClick={(state) => {
          const idx = (state as { activeTooltipIndex?: number } | null)?.activeTooltipIndex;
          if (typeof idx === "number") onSelectIndex(idx);
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} unit=" h" />
        <ChartTooltip formatter={(value) => `${value} h`} />
        <ReferenceLine
          y={points[0]?.capacity ?? 0}
          stroke="#4c1d95"
          strokeDasharray="4 3"
          label={{ value: "capacidad", fontSize: 10, position: "insideTopRight" }}
        />
        <Bar dataKey="hours" name="Horas" cursor="pointer">
          {points.map((p) => (
            <Cell key={p.key} fill={p.over ? "#e11d48" : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
