import { describe, expect, it } from "vitest";
import {
  createTimeAxis,
  fitToWidth,
  layoutArrows,
  layoutBars,
  markerX,
  nonWorkingRanges,
  SCALE_PX_PER_DAY,
  visibleRowRange,
  type TimeScale,
} from "../src/layout";
import { scheduleProject } from "../src/schedule";
import type { EngineTask } from "../src/types";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, task } from "./helpers";

const RANGE = { from: "2026-08-31", to: "2026-10-04" } as const; // lunes 31-08 a domingo 04-10

describe("createTimeAxis", () => {
  it("calcula ancho, xOf y dateAt de forma consistente", () => {
    const axis = createTimeAxis({ scale: "day", ...RANGE });
    expect(axis.totalDays).toBe(35);
    expect(axis.pxPerDay).toBe(40);
    expect(axis.width).toBe(1400);
    expect(axis.xOf("2026-08-31")).toBe(0);
    expect(axis.xOf("2026-09-07")).toBe(280);
    expect(axis.dateAt(280)).toBe("2026-09-07");
    expect(axis.dateAt(319.9)).toBe("2026-09-07");
    expect(axis.dateAt(-50)).toBe("2026-08-31");
    expect(axis.dateAt(99_999)).toBe("2026-10-04");
  });

  it("acepta un pxPerDay personalizado (zoom) y rechaza rangos invertidos", () => {
    const axis = createTimeAxis({ scale: "week", ...RANGE, pxPerDay: 20 });
    expect(axis.width).toBe(700);
    expect(() => createTimeAxis({ scale: "day", from: "2026-09-10", to: "2026-09-01" })).toThrow(
      "Rango de eje inválido",
    );
  });

  it.each(["day", "week", "month", "quarter"] as TimeScale[])(
    "la cabecera de dos niveles en escala %s coincide con el snapshot",
    (scale) => {
      const axis = createTimeAxis({ scale, from: "2026-08-24", to: "2027-01-10" });
      expect(axis.pxPerDay).toBe(SCALE_PX_PER_DAY[scale]);
      const compact = {
        top: axis.header.top.map((c) => `${c.label} [${c.start}..${c.end}] x=${c.x} w=${c.width}`),
        bottom: axis.header.bottom
          .slice(0, 12)
          .map((c) => `${c.label} [${c.start}..${c.end}] x=${c.x} w=${c.width}`),
        bottomCount: axis.header.bottom.length,
      };
      expect(compact).toMatchSnapshot();
    },
  );

  it("las celdas cubren exactamente el ancho del eje sin huecos", () => {
    for (const scale of ["day", "week", "month", "quarter"] as TimeScale[]) {
      const axis = createTimeAxis({ scale, from: "2026-09-03", to: "2027-02-17" });
      for (const level of [axis.header.top, axis.header.bottom]) {
        expect(level[0]?.x).toBe(0);
        const total = level.reduce((sum, c) => sum + c.width, 0);
        expect(total).toBeCloseTo(axis.width, 6);
        for (let i = 1; i < level.length; i++) {
          const prev = level[i - 1]!;
          expect(level[i]!.x).toBeCloseTo(prev.x + prev.width, 6);
        }
      }
    }
  });

  it("las semanas empiezan en lunes y los trimestres en enero, abril, julio y octubre", () => {
    const week = createTimeAxis({ scale: "week", from: "2026-09-03", to: "2026-09-20" });
    expect(week.header.bottom.map((c) => c.label)).toEqual(["31 ago", "7 sep", "14 sep"]);
    expect(week.header.bottom[0]?.start).toBe("2026-09-03"); // recortada al inicio del eje
    const quarter = createTimeAxis({ scale: "quarter", from: "2026-05-15", to: "2027-02-01" });
    expect(quarter.header.bottom.map((c) => c.label)).toEqual([
      "T2 2026",
      "T3 2026",
      "T4 2026",
      "T1 2027",
    ]);
    expect(quarter.header.top.map((c) => c.label)).toEqual(["2026", "2027"]);
  });
});

describe("fitToWidth", () => {
  it("elige la escala según los píxeles por día disponibles", () => {
    expect(fitToWidth("2026-09-01", "2026-09-30", 1500)).toEqual({ scale: "day", pxPerDay: 50 });
    expect(fitToWidth("2026-09-01", "2026-12-31", 1220).scale).toBe("week");
    expect(fitToWidth("2026-01-01", "2026-12-31", 1460).scale).toBe("month");
    expect(fitToWidth("2026-01-01", "2028-12-31", 1000).scale).toBe("quarter");
    expect(fitToWidth("2026-09-01", "2026-09-01", 0).pxPerDay).toBe(0.25);
  });
});

describe("nonWorkingRanges / markerX", () => {
  it("fusiona días no hábiles consecutivos, incluido el feriado pegado al fin de semana", () => {
    const axis = createTimeAxis({ scale: "day", from: "2026-09-14", to: "2026-09-22" });
    const ranges = nonWorkingRanges(axis, CL_CALENDAR);
    expect(ranges).toEqual([{ from: "2026-09-18", to: "2026-09-20", x: 160, width: 120 }]);
    const axis2 = createTimeAxis({ scale: "day", from: "2026-09-12", to: "2026-09-13" });
    expect(nonWorkingRanges(axis2, CL_CALENDAR)).toEqual([
      { from: "2026-09-12", to: "2026-09-13", x: 0, width: 80 },
    ]);
  });

  it("markerX devuelve el centro del día o nulo fuera del eje", () => {
    const axis = createTimeAxis({ scale: "day", ...RANGE });
    expect(markerX(axis, "2026-09-07")).toBe(300);
    expect(markerX(axis, "2026-12-25")).toBeNull();
    expect(markerX(axis, "2026-08-01")).toBeNull();
  });
});

function sample(): { tasks: EngineTask[]; deps: ReturnType<typeof dep>[] } {
  const raw = renumber([
    task("R", { orderIndex: 0 }),
    task("A", { parentId: "R", orderIndex: 0, durationDays: 5, progressPct: 40 }),
    task("B", { parentId: "R", orderIndex: 1, durationDays: 3 }),
    task("H", { orderIndex: 1, anchorDate: "2026-09-21", isMilestone: true, durationDays: 0 }),
  ]);
  const deps = [dep("A", "B"), dep("B", "H", "FF")];
  return { tasks: scheduleProject(raw, deps, CL_CALENDAR).tasks, deps };
}

describe("layoutBars", () => {
  it("genera barra, corchete de resumen y rombo de hito con su avance", () => {
    const { tasks } = sample();
    const axis = createTimeAxis({ scale: "day", ...RANGE });
    const bars = layoutBars(tasks, axis);
    expect(bars.map((b) => [b.taskId, b.kind, b.rowIndex])).toEqual([
      ["R", "summary", 0],
      ["A", "task", 1],
      ["B", "task", 2],
      ["H", "milestone", 3],
    ]);
    const a = bars[1]!;
    expect(a.x).toBe(280); // 07-09
    expect(a.width).toBe(200); // 5 días × 40 (fin inclusive)
    expect(a.y).toBe(32 + 7);
    expect(a.height).toBe(18);
    expect(a.centerY).toBe(48);
    expect(a.progressWidth).toBe(80);
    expect(a.labelX).toBe(488);
    const r = bars[0]!;
    expect(r.x).toBe(280);
    expect(r.width).toBe(400); // R abarca de A (07-09) a B (16-09): 10 días × 40
    const h = bars[3]!;
    expect(h.width).toBe(14);
    expect(h.height).toBe(14);
    expect(h.x).toBe(axis.xOf("2026-09-21") + 20 - 7);
    expect(h.progressWidth).toBe(0);
  });

  it("respeta opciones de fila y barra", () => {
    const { tasks } = sample();
    const axis = createTimeAxis({ scale: "week", ...RANGE });
    const bars = layoutBars(tasks, axis, {
      rowHeight: 40,
      barHeight: 20,
      milestoneSize: 10,
      labelGap: 4,
    });
    expect(bars[1]?.y).toBe(50);
    expect(bars[1]?.height).toBe(20);
    expect(bars[3]?.width).toBe(10);
    expect(bars[1]?.labelX).toBe(bars[1]!.x + bars[1]!.width + 4);
  });
});

describe("layoutArrows", () => {
  const axis = createTimeAxis({ scale: "day", ...RANGE });

  function barsFor(tasks: EngineTask[]) {
    return layoutBars(tasks, axis);
  }

  it("FS hacia adelante: tres segmentos desde el fin de la predecesora al inicio de la sucesora", () => {
    const { tasks, deps } = sample();
    const arrows = layoutArrows(deps, barsFor(tasks));
    const fs = arrows.find((a) => a.type === "FS")!;
    expect(fs.fromTaskId).toBe("A");
    expect(fs.points).toEqual([
      { x: 480, y: 48 }, // fin de A, fila 1
      { x: 490, y: 48 },
      { x: 490, y: 80 }, // fila 2
      { x: 560, y: 80 }, // inicio de B (14-09 = 280 + 7 × 40)
    ]);
  });

  it("FF hacia el hito: gira a mitad de camino y entra por el fin", () => {
    const { tasks, deps } = sample();
    const arrows = layoutArrows(deps, barsFor(tasks));
    const ff = arrows.find((a) => a.type === "FF")!;
    const first = ff.points[0]!;
    const last = ff.points[ff.points.length - 1]!;
    expect(first).toEqual({ x: 680, y: 80 }); // fin de B (16-09 → x = 640 + 40)
    expect(last.y).toBe(112);
    expect(last.x).toBeGreaterThan(first.x);
    expect(ff.points).toHaveLength(4);
  });

  it("ruta hacia atrás: baja por el borde de la fila cuando la sucesora empieza antes", () => {
    const raw = renumber([
      task("P", { orderIndex: 0, anchorDate: "2026-09-14", durationDays: 2 }),
      task("S", { orderIndex: 1, anchorDate: "2026-09-07", durationDays: 2 }),
    ]);
    const tasks = scheduleProject(raw, [], CL_CALENDAR).tasks; // sin dependencia real, solo geometría
    const arrows = layoutArrows([dep("P", "S", "FS", -10)], barsFor(tasks));
    const pts = arrows[0]!.points;
    expect(pts).toHaveLength(6);
    expect(pts[0]).toEqual({ x: 640, y: 16 });
    expect(pts[2]!.y).toBe(32); // borde inferior de la fila 0
    expect(pts[4]).toEqual({ x: 270, y: 48 });
    expect(pts[5]).toEqual({ x: 280, y: 48 });
  });

  it("ruta hacia arriba usa el borde superior, y SS/SF salen por el inicio", () => {
    const raw = renumber([
      task("S", { orderIndex: 0, anchorDate: "2026-09-07", durationDays: 2 }),
      task("P", { orderIndex: 1, anchorDate: "2026-09-14", durationDays: 2 }),
    ]);
    const tasks = scheduleProject(raw, [], CL_CALENDAR).tasks;
    const bars = barsFor(tasks);
    const up = layoutArrows([dep("P", "S", "FS", -10)], bars)[0]!;
    expect(up.points[2]!.y).toBe(48 - 16);
    const ss = layoutArrows([dep("S", "P", "SS")], bars)[0]!;
    expect(ss.points[0]).toEqual({ x: 280, y: 16 }); // inicio de S
    expect(ss.points[ss.points.length - 1]).toEqual({ x: 560, y: 48 }); // inicio de P
    const sf = layoutArrows([dep("S", "P", "SF")], bars)[0]!;
    expect(sf.points[0]).toEqual({ x: 280, y: 16 });
    expect(sf.points[sf.points.length - 1]).toEqual({ x: 640, y: 48 }); // fin de P
  });

  it("omite dependencias cuyas barras no están en pantalla", () => {
    const { tasks, deps } = sample();
    expect(layoutArrows(deps, barsFor(tasks.slice(0, 2)))).toEqual([]);
  });
});

describe("visibleRowRange", () => {
  it("calcula el rango con margen y lo acota", () => {
    expect(visibleRowRange(0, 320, 32, 1000)).toEqual({ start: 0, end: 16 });
    expect(visibleRowRange(3200, 320, 32, 1000)).toEqual({ start: 95, end: 116 });
    expect(visibleRowRange(31_900, 320, 32, 1000)).toEqual({ start: 991, end: 1000 });
    expect(visibleRowRange(100, 320, 32, 10, 0)).toEqual({ start: 3, end: 10 });
    expect(visibleRowRange(0, 320, 32, 0)).toEqual({ start: 0, end: 0 });
    expect(visibleRowRange(-50, 320, 0, 10)).toEqual({ start: 0, end: 0 });
  });
});
