import { describe, expect, it } from "vitest";
import {
  bulkProgressUpdates,
  compareWithBaseline,
  expectedProgressAt,
  takeBaseline,
  trackingStatus,
} from "../src/baseline";
import { scheduleProject } from "../src/schedule";
import type { EngineTask } from "../src/types";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, task } from "./helpers";

/** A (07–11, 5 días) y B (FS de A, 3 días → 14–16). */
function plan(): EngineTask[] {
  const raw = renumber([
    task("A", { orderIndex: 0, durationDays: 5 }),
    task("B", { orderIndex: 1, durationDays: 3 }),
  ]);
  return scheduleProject(raw, [dep("A", "B")], CL_CALENDAR).tasks;
}

describe("takeBaseline / compareWithBaseline (UC-19)", () => {
  it("fotografía las tareas con sus fechas", () => {
    const snap = takeBaseline(plan());
    expect(snap).toEqual([
      {
        taskId: "A",
        wbsCode: "1",
        startDate: "2026-09-07",
        endDate: "2026-09-11",
        durationDays: 5,
        progressPct: 0,
      },
      {
        taskId: "B",
        wbsCode: "2",
        startDate: "2026-09-14",
        endDate: "2026-09-16",
        durationDays: 3,
        progressPct: 0,
      },
    ]);
  });

  it("mover A tres días hábiles produce +3/+3 en A y en B", () => {
    const base = plan();
    const snap = takeBaseline(base);
    const moved = base.map((t) =>
      t.id === "A" ? { ...t, anchorDate: "2026-09-10", progressPct: 40 } : t,
    );
    const current = scheduleProject(moved, [dep("A", "B")], CL_CALENDAR).tasks;
    const rows = compareWithBaseline(current, snap, CL_CALENDAR);
    const byId = Object.fromEntries(rows.map((r) => [r.taskId, r]));
    expect(byId.A).toMatchObject({
      status: "OK",
      startVarianceDays: 3,
      endVarianceDays: 3,
      progressVariancePct: 40,
    });
    expect(byId.B).toMatchObject({
      status: "OK",
      startVarianceDays: 3,
      endVarianceDays: 3,
      progressVariancePct: 0,
    });
    expect(byId.B?.current?.endDate).toBe("2026-09-22");
  });

  it("marca tareas nuevas y eliminadas", () => {
    const base = plan();
    const snap = takeBaseline(base);
    const current = renumber([...base.filter((t) => t.id !== "B"), task("C", { durationDays: 1 })]);
    const rows = compareWithBaseline(current, snap, CL_CALENDAR);
    expect(rows.map((r) => [r.taskId, r.status])).toEqual([
      ["A", "OK"],
      ["C", "NEW"],
      ["B", "DELETED"],
    ]);
    const deleted = rows.find((r) => r.taskId === "B");
    expect(deleted?.baseline?.startDate).toBe("2026-09-14");
    expect(deleted?.current).toBeNull();
    expect(deleted?.startVarianceDays).toBeNull();
    const created = rows.find((r) => r.taskId === "C");
    expect(created?.baseline).toBeNull();
    expect(created?.progressVariancePct).toBeNull();
  });

  it("un adelanto da variación negativa", () => {
    const base = plan();
    const snap = takeBaseline(base);
    const earlier = base.map((t) => (t.id === "B" ? { ...t, durationDays: 1 } : t));
    const current = scheduleProject(earlier, [dep("A", "B")], CL_CALENDAR).tasks;
    const b = compareWithBaseline(current, snap, CL_CALENDAR).find((r) => r.taskId === "B");
    expect(b?.startVarianceDays).toBe(0);
    expect(b?.endVarianceDays).toBe(-2);
  });
});

describe("expectedProgressAt / trackingStatus (UC-21)", () => {
  const [A, B] = plan() as [EngineTask, EngineTask];

  it("A está completa al 15-09 y B lleva 2 de 3 días", () => {
    expect(expectedProgressAt(A, "2026-09-15", CL_CALENDAR)).toBe(100);
    expect(expectedProgressAt(B, "2026-09-15", CL_CALENDAR)).toBe(67);
    expect(expectedProgressAt(B, "2026-09-13", CL_CALENDAR)).toBe(0);
    expect(expectedProgressAt(B, "2026-09-14", CL_CALENDAR)).toBe(33);
    expect(expectedProgressAt(B, "2026-09-30", CL_CALENDAR)).toBe(100);
  });

  it("los hitos son 100 si su fecha ya pasó", () => {
    const h = {
      ...task("H", { anchorDate: "2026-09-14", isMilestone: true, durationDays: 0 }),
      startDate: "2026-09-14",
      endDate: "2026-09-14",
    };
    expect(expectedProgressAt(h, "2026-09-15", CL_CALENDAR)).toBe(100);
    expect(expectedProgressAt(h, "2026-09-14", CL_CALENDAR)).toBe(100);
    expect(expectedProgressAt(h, "2026-09-11", CL_CALENDAR)).toBe(0);
  });

  it("calcula atraso y días de desviación", () => {
    const a = trackingStatus({ ...A, progressPct: 60 }, "2026-09-15", CL_CALENDAR);
    expect(a).toEqual({ taskId: "A", expectedPct: 100, isLate: true, deviationDays: 2 });
    const b = trackingStatus({ ...B, progressPct: 20 }, "2026-09-15", CL_CALENDAR);
    expect(b).toEqual({ taskId: "B", expectedPct: 67, isLate: true, deviationDays: 1.4 });
    const adelantada = trackingStatus({ ...B, progressPct: 90 }, "2026-09-15", CL_CALENDAR);
    expect(adelantada.isLate).toBe(false);
    expect(adelantada.deviationDays).toBe(-0.7);
  });
});

describe("bulkProgressUpdates (UC-21)", () => {
  it("solo sube el avance, respeta la selección y omite resúmenes", () => {
    const raw = renumber([
      task("R"),
      task("A", { parentId: "R", orderIndex: 0, durationDays: 5, progressPct: 60 }),
      task("B", {
        parentId: "R",
        orderIndex: 1,
        anchorDate: "2026-09-14",
        durationDays: 3,
        progressPct: 20,
      }),
      task("C", { orderIndex: 1, anchorDate: "2026-09-14", durationDays: 3, progressPct: 90 }),
    ]);
    const tasks = scheduleProject(raw, [], CL_CALENDAR).tasks;
    expect(bulkProgressUpdates(tasks, "2026-09-15", CL_CALENDAR)).toEqual([
      { taskId: "A", progressPct: 100 },
      { taskId: "B", progressPct: 67 },
    ]);
    expect(bulkProgressUpdates(tasks, "2026-09-15", CL_CALENDAR, new Set(["B", "C"]))).toEqual([
      { taskId: "B", progressPct: 67 },
    ]);
    expect(bulkProgressUpdates(tasks, "2026-09-01", CL_CALENDAR)).toEqual([]);
  });
});
