import { describe, expect, it } from "vitest";
import { detectCycle } from "../src/cycles";
import { proposeLeveling } from "../src/level";
import { resourceLoad, type EngineAssignment, type EngineResource } from "../src/resources";
import { scheduleProject } from "../src/schedule";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, spans, task } from "./helpers";

const ana: EngineResource = { id: "ana", capacityHoursPerDay: 8, rate: 1, rateCurrency: "UF" };

describe("proposeLeveling (UC-18)", () => {
  it("retrasa la tarea no crítica con más holgura hasta liberar el recurso", () => {
    // A (5 d) y B (2 d) empiezan el mismo día con Ana al 100 % en ambas; C depende de A.
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 5 }),
      task("B", { orderIndex: 1, durationDays: 2 }),
      task("C", { orderIndex: 2, durationDays: 1 }),
    ]);
    const deps = [dep("A", "C")];
    const assignments: EngineAssignment[] = [
      { id: "a1", taskId: "A", resourceId: "ana", allocationPct: 100 },
      { id: "a2", taskId: "B", resourceId: "ana", allocationPct: 100 },
    ];
    const result = proposeLeveling(tasks, deps, assignments, [ana], CL_CALENDAR);
    expect(result.overallocatedDaysBefore).toBe(2); // 07-09 y 08-09
    expect(result.overallocatedDaysAfter).toBe(0);
    expect(result.moves).toHaveLength(1);
    const move = result.moves[0]!;
    expect(move.taskId).toBe("B"); // A es crítica (A → C termina el proyecto)
    expect(move.toAnchorDate).toBe("2026-09-14"); // día hábil siguiente al fin de A
    expect(move.delayDays).toBe(5);
    expect(spans(result.tasks).B).toBe("2026-09-14 – 2026-09-15");
    expect(spans(result.tasks).A).toBe("2026-09-07 – 2026-09-11");
    expect(result.unresolved.size).toBe(0);
  });

  it("nunca mueve tareas críticas: reporta el conflicto como no resuelto", () => {
    // Dos cadenas críticas paralelas del mismo largo con el mismo recurso.
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 3 }),
      task("B", { orderIndex: 1, durationDays: 3 }),
    ]);
    const assignments: EngineAssignment[] = [
      { id: "a1", taskId: "A", resourceId: "ana", allocationPct: 100 },
      { id: "a2", taskId: "B", resourceId: "ana", allocationPct: 100 },
    ];
    const result = proposeLeveling(tasks, [], assignments, [ana], CL_CALENDAR);
    expect(result.moves).toEqual([]);
    expect(result.unresolved.get("ana")).toEqual(["2026-09-07"]);
    expect(result.overallocatedDaysAfter).toBe(result.overallocatedDaysBefore);
  });

  it("resuelve varios conflictos encadenados sin crear ciclos ni tocar la ruta crítica", () => {
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 10 }), // crítica
      task("B", { orderIndex: 1, durationDays: 2 }),
      task("C", { orderIndex: 2, durationDays: 2 }),
      task("D", { orderIndex: 3, durationDays: 1 }),
    ]);
    const deps = [dep("B", "D")];
    const assignments: EngineAssignment[] = [
      { id: "a1", taskId: "A", resourceId: "ana", allocationPct: 50 },
      { id: "a2", taskId: "B", resourceId: "ana", allocationPct: 100 },
      { id: "a3", taskId: "C", resourceId: "ana", allocationPct: 100 },
    ];
    const result = proposeLeveling(tasks, deps, assignments, [ana], CL_CALENDAR);
    expect(result.overallocatedDaysAfter).toBe(0);
    expect(result.moves.map((m) => m.taskId).sort()).toEqual(["B", "C"]);
    // La ruta crítica original (A) no se toca aunque los retrasos extiendan el proyecto.
    expect(spans(result.tasks).A).toBe(spans(scheduleProject(tasks, deps, CL_CALENDAR).tasks).A);
    expect(detectCycle(deps)).toBeNull();
    // Las sucesoras de las tareas movidas se reprogramaron.
    const b = result.tasks.find((t) => t.id === "B")!;
    const d = result.tasks.find((t) => t.id === "D")!;
    expect(d.startDate > b.endDate).toBe(true);
    const load = resourceLoad(result.tasks, assignments, [ana], CL_CALENDAR);
    expect(load.byResource.get("ana")?.overallocatedDates).toEqual([]);
  });

  it("sin sobreasignación no propone nada", () => {
    const tasks = renumber([task("A", { durationDays: 2 })]);
    const result = proposeLeveling(
      tasks,
      [],
      [{ id: "a", taskId: "A", resourceId: "ana", allocationPct: 100 }],
      [ana],
      CL_CALENDAR,
    );
    expect(result.moves).toEqual([]);
    expect(result.overallocatedDaysBefore).toBe(0);
  });
});
