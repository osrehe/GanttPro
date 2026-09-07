import { describe, expect, it } from "vitest";
import { applyCriticalPath, criticalPath } from "../src/cpm";
import { scheduleProject } from "../src/schedule";
import type { EngineDependency, EngineTask } from "../src/types";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, task } from "./helpers";

/** Red de UC-20: A (5), B (3, FS A), C (2, FS A), D (1, FS B y C), E (4, FS B). */
function network(cDuration = 2): { tasks: EngineTask[]; deps: EngineDependency[] } {
  const raw = renumber([
    task("A", { orderIndex: 0, durationDays: 5 }),
    task("B", { orderIndex: 1, durationDays: 3 }),
    task("C", { orderIndex: 2, durationDays: cDuration }),
    task("D", { orderIndex: 3, durationDays: 1 }),
    task("E", { orderIndex: 4, durationDays: 4 }),
  ]);
  const deps = [dep("A", "B"), dep("A", "C"), dep("B", "D"), dep("C", "D"), dep("B", "E")];
  return { tasks: scheduleProject(raw, deps, CL_CALENDAR).tasks, deps };
}

describe("criticalPath (UC-20)", () => {
  it("calcula holguras total y libre del ejemplo de la spec", () => {
    const { tasks, deps } = network();
    const result = criticalPath(tasks, deps, CL_CALENDAR);
    expect(result.projectStart).toBe("2026-09-07");
    expect(result.projectEnd).toBe("2026-09-23");
    const floats = Object.fromEntries(
      [...result.leaves.values()].map((l) => [
        l.taskId,
        [l.totalFloatDays, l.freeFloatDays, l.isCritical],
      ]),
    );
    expect(floats).toEqual({
      A: [0, 0, true],
      B: [0, 0, true],
      C: [4, 1, false],
      D: [3, 3, false],
      E: [0, 0, true],
    });
    expect([...result.criticalTaskIds].sort()).toEqual(["A", "B", "E"]);
    const c = result.leaves.get("C");
    expect(c?.lateStart).toBe("2026-09-21");
    expect(c?.lateFinish).toBe("2026-09-22");
  });

  it("al alargar C a 6 días, C y D pasan a ser críticas", () => {
    const { tasks, deps } = network(6);
    const c = tasks.find((t) => t.id === "C") as EngineTask;
    const d = tasks.find((t) => t.id === "D") as EngineTask;
    expect(`${c.startDate} – ${c.endDate}`).toBe("2026-09-14 – 2026-09-22");
    expect(d.startDate).toBe("2026-09-23");
    const result = criticalPath(tasks, deps, CL_CALENDAR);
    expect(result.projectEnd).toBe("2026-09-23");
    expect([...result.criticalTaskIds].sort()).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("una tarea anclada tarde no es crítica por sí misma, pero su predecesora gana holgura", () => {
    const raw = renumber([
      task("A", { orderIndex: 0, durationDays: 2 }),
      task("B", { orderIndex: 1, anchorDate: "2026-09-21", durationDays: 1 }),
    ]);
    const deps = [dep("A", "B")];
    const scheduled = scheduleProject(raw, deps, CL_CALENDAR).tasks;
    const result = criticalPath(scheduled, deps, CL_CALENDAR);
    expect(result.leaves.get("B")?.totalFloatDays).toBe(0);
    // A termina el 08-09; B empieza el 21-09 por su ancla: A puede atrasarse hasta el 17-09.
    expect(result.leaves.get("A")?.totalFloatDays).toBe(7);
    expect(result.leaves.get("A")?.freeFloatDays).toBe(7);
  });

  it("maneja SS, FF y SF en el paso atrás", () => {
    const raw = renumber([
      task("P", { orderIndex: 0, durationDays: 3 }),
      task("S1", { orderIndex: 1, durationDays: 5 }),
      task("S2", { orderIndex: 2, durationDays: 2 }),
      task("S3", { orderIndex: 3, durationDays: 2 }),
    ]);
    const deps = [dep("P", "S1", "SS", 1), dep("P", "S2", "FF"), dep("S2", "S3", "SF", 3)];
    const scheduled = scheduleProject(raw, deps, CL_CALENDAR).tasks;
    const result = criticalPath(scheduled, deps, CL_CALENDAR);
    // S1: 08-09 – 14-09 (5 días desde el 08). S2 termina con P (09-09): 08-09 – 09-09.
    // S3 SF+3: fin ≥ inicio de S2 (08-09) + 3 − 1 = 10-09 → 09-09 – 10-09. Fin del proyecto: 14-09.
    expect(result.projectEnd).toBe("2026-09-14");
    expect(result.leaves.get("S1")?.isCritical).toBe(true);
    for (const l of result.leaves.values()) {
      expect(l.totalFloatDays).toBeGreaterThanOrEqual(0);
      expect(l.freeFloatDays).toBeLessThanOrEqual(l.totalFloatDays);
    }
    // S2: su sucesora S3 (SF+3) tiene LF 14-09 → LS de S2 = 10-09 → holgura 2 (08 → 10).
    expect(result.leaves.get("S2")?.totalFloatDays).toBe(2);
    expect(result.leaves.get("S3")?.totalFloatDays).toBe(2);
    expect(result.leaves.get("P")?.totalFloatDays).toBe(0);
  });

  it("sin dependencias, solo las tareas que terminan al final son críticas", () => {
    const raw = renumber([
      task("A", { orderIndex: 0, durationDays: 5 }),
      task("B", { orderIndex: 1, durationDays: 2 }),
    ]);
    const result = criticalPath(scheduleProject(raw, [], CL_CALENDAR).tasks, [], CL_CALENDAR);
    expect(result.leaves.get("A")?.isCritical).toBe(true);
    expect(result.leaves.get("B")?.totalFloatDays).toBe(3);
    expect(result.leaves.get("B")?.freeFloatDays).toBe(3);
  });

  it("un resumen es crítico si alguna hoja descendiente lo es, y devuelve nulos en sus holguras", () => {
    const raw = renumber([
      task("R"),
      task("R.1", { parentId: "R", durationDays: 5 }),
      task("R.2", { parentId: "R", durationDays: 1 }),
      task("Q"),
      task("Q.1", { parentId: "Q", durationDays: 1 }),
    ]);
    const deps = [dep("R.1", "R.2")];
    const scheduled = scheduleProject(raw, deps, CL_CALENDAR).tasks;
    const applied = applyCriticalPath(scheduled, deps, CL_CALENDAR);
    const byId = Object.fromEntries(applied.map((t) => [t.id, t]));
    expect(byId.R?.isCritical).toBe(true);
    expect(byId.R?.totalFloatDays).toBeNull();
    expect(byId.Q?.isCritical).toBe(false);
    expect(byId["Q.1"]?.totalFloatDays).toBe(5);
    expect(byId["R.2"]?.isCritical).toBe(true);
  });

  it("devuelve un resultado vacío sin hojas", () => {
    const result = criticalPath([], [], CL_CALENDAR);
    expect(result.projectEnd).toBeNull();
    expect(result.leaves.size).toBe(0);
    expect(applyCriticalPath([], [], CL_CALENDAR)).toEqual([]);
  });

  it("ignora dependencias que apuntan a tareas desconocidas o resumen", () => {
    const raw = renumber([task("R"), task("R.1", { parentId: "R", durationDays: 2 })]);
    const scheduled = scheduleProject(raw, [], CL_CALENDAR).tasks;
    const result = criticalPath(scheduled, [dep("R", "R.1"), dep("X", "R.1")], CL_CALENDAR);
    expect(result.leaves.get("R.1")?.isCritical).toBe(true);
  });
});
