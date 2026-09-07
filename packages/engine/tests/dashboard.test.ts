import { describe, expect, it } from "vitest";
import { takeBaseline } from "../src/baseline";
import { projectKpis, sCurve } from "../src/dashboard";
import type { EngineAssignment, EngineResource } from "../src/resources";
import { scheduleProject } from "../src/schedule";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, task } from "./helpers";

const ana: EngineResource = { id: "ana", capacityHoursPerDay: 8, rate: 1.5, rateCurrency: "UF" };

function project() {
  const raw = renumber([
    task("A", { orderIndex: 0, durationDays: 5, progressPct: 60 }),
    task("B", { orderIndex: 1, durationDays: 3, progressPct: 20 }),
    task("H", { orderIndex: 2, isMilestone: true, durationDays: 0 }),
  ]);
  const deps = [dep("A", "B"), dep("B", "H")];
  return { tasks: scheduleProject(raw, deps, CL_CALENDAR).tasks, deps };
}

describe("projectKpis (UC-22)", () => {
  it("calcula avance, atrasos, hitos próximos, costos y fin estimado", () => {
    const { tasks } = project();
    const assignments: EngineAssignment[] = [
      { id: "a", taskId: "A", resourceId: "ana", allocationPct: 50 },
    ];
    const baseline = takeBaseline(tasks.map((t) => ({ ...t, endDate: "2026-09-16" })));
    const kpis = projectKpis({
      tasks,
      assignments,
      resources: [ana],
      calendar: CL_CALENDAR,
      statusDate: "2026-09-15",
      display: { currency: "UF", ufValue: 39000 },
      baseline,
    });
    // A: 60 % de 5 d; B: 20 % de 3 d → (300 + 60) / 8 = 45 %
    expect(kpis.progressPct).toBe(45);
    // Esperado al 15-09: A 100 %, B 67 % → (500 + 201) / 8 ≈ 88 %
    expect(kpis.expectedProgressPct).toBe(88);
    expect(kpis.lateTaskIds.sort()).toEqual(["A", "B"]);
    expect(kpis.lateTaskCount).toBe(2);
    // El hito H (17-09) está dentro de los 15 días siguientes al 15-09.
    expect(kpis.upcomingMilestones).toEqual([{ taskId: "H", wbsCode: "3", date: "2026-09-17" }]);
    expect(kpis.plannedCost).toBe(30); // 20 h × 1,5 UF
    expect(kpis.consumedCost).toBe(18);
    expect(kpis.totalHours).toBe(20);
    expect(kpis.projectStart).toBe("2026-09-07");
    expect(kpis.estimatedEnd).toBe("2026-09-17");
    expect(kpis.baselineEnd).toBe("2026-09-16");
    expect(kpis.endVarianceDays).toBe(1);
    expect(kpis.leafCount).toBe(3);
    expect(kpis.milestoneCount).toBe(1);
  });

  it("sin línea base ni tareas devuelve nulos y ceros", () => {
    const kpis = projectKpis({
      tasks: [],
      assignments: [],
      resources: [],
      calendar: CL_CALENDAR,
      statusDate: "2026-09-15",
      display: { currency: "UF", ufValue: null },
    });
    expect(kpis).toMatchObject({
      progressPct: 0,
      expectedProgressPct: 0,
      lateTaskCount: 0,
      upcomingMilestones: [],
      plannedCost: 0,
      estimatedEnd: null,
      baselineEnd: null,
      endVarianceDays: null,
    });
  });
});

describe("sCurve (UC-22)", () => {
  it("la curva planificada crece de 0 a 100 y la real termina en el avance actual", () => {
    const { tasks } = project();
    const points = sCurve(tasks, CL_CALENDAR, "2026-09-15", 1);
    expect(points[0]?.planned).toBe(0);
    expect(points[points.length - 1]?.planned).toBe(100);
    expect(points[points.length - 1]?.actual).toBeNull(); // después de la fecha de estado
    const atStatus = points.find((p) => p.date === "2026-09-15")!;
    // Planificado al 15-09: A completa (5) + B 2 de 3 → 7/8 = 87,5 %; real = 45 %.
    expect(atStatus.planned).toBe(87.5);
    expect(atStatus.actual).toBe(45);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.planned).toBeGreaterThanOrEqual(points[i - 1]!.planned);
    }
  });

  it("agrupa por semana y devuelve vacío sin hojas", () => {
    const { tasks } = project();
    const weekly = sCurve(tasks, CL_CALENDAR, "2026-09-15");
    expect(weekly.length).toBeGreaterThanOrEqual(2);
    expect(weekly[weekly.length - 1]?.date).toBe("2026-09-16"); // el hito (duración 0) no pesa en la curva
    expect(sCurve([], CL_CALENDAR, "2026-09-15")).toEqual([]);
  });
});
