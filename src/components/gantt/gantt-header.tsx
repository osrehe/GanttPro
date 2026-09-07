"use client";

import type { TimeAxis } from "@ganttpro/engine";
import { HEADER_HEIGHT } from "./gantt-model";

/** Cabecera de dos niveles de la línea de tiempo (mes/día, mes/semana, año/mes, año/trimestre). */
export function GanttHeader({ axis }: { axis: TimeAxis }) {
  const half = HEADER_HEIGHT / 2;
  return (
    <svg
      width={axis.width}
      height={HEADER_HEIGHT}
      className="bg-muted/60 block"
      aria-hidden
      data-testid="gantt-header"
    >
      {axis.header.top.map((c) => (
        <g key={`t-${c.start}`}>
          <rect
            x={c.x}
            y={0}
            width={c.width}
            height={half}
            className="stroke-border fill-transparent"
          />
          <text x={c.x + 6} y={half - 7} className="fill-foreground text-[11px] font-medium">
            {c.width > 40 ? c.label : ""}
          </text>
        </g>
      ))}
      {axis.header.bottom.map((c) => (
        <g key={`b-${c.start}`}>
          <rect
            x={c.x}
            y={half}
            width={c.width}
            height={half}
            className="stroke-border fill-transparent"
          />
          <text
            x={c.x + c.width / 2}
            y={HEADER_HEIGHT - 7}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {c.width >= 18 ? c.label : ""}
          </text>
        </g>
      ))}
    </svg>
  );
}
