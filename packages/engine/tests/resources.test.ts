import { describe, expect, it } from "vitest";
import { createCalendar } from "../src/calendar";
import {
  aggregateWeekly,
  assignmentHours,
  convertAmount,
  projectCosts,
  resourceLoad,
  weekStartOf,
  type EngineAssignment,
  type EngineResource,
} from "../src/resources";
import { scheduleProject } from "../src/schedule";
import type { EngineTask } from "../src/types";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, task } from "./helpers";

const ana: EngineResource = { id: "ana", capacityHoursPerDay: 8, rate: 1.5, rateCurrency: "UF" };

/** UC-17: Ana 100 % en A (07–11) y C (14–15), 50 % en B (14–16). */
function uc17(): { tasks: EngineTask[]; assignments: EngineAssignment[] } {
  const raw = renumber([
    task("A", { orderIndex: 0, durationDays: 5 }),
    task("B", { orderIndex: 1, anchorDate: "2026-09-14", durationDays: 3 }),
    task("C", { orderIndex: 2, anchorDate: "2026-09-14", durationDays: 2 }),
  ]);
  const tasks = scheduleProject(raw, [], CL_CALENDAR).tasks;
  const assignments: EngineAssignment[] = [
    { id: "a1", taskId: "A", resourceId: "ana", allocationPct: 100 },
    { id: "a2", taskId: "C", resourceId: "ana", allocationPct: 100 },
    { id: "a3", taskId: "B", resourceId: "ana", allocationPct: 50 },
  ];
  return { tasks, assignments };
}

describe("assignmentHours (UC-16)", () => {
  it("duración × horas/día × dedicación", () => {
    expect(assignmentHours({ durationDays: 5, isMilestone: false }, 50, CL_CALENDAR)).toBe(20);
    expect(assignmentHours({ durationDays: 5, isMilestone: false }, 150, CL_CALENDAR)).toBe(60);
    expect(assignmentHours({ durationDays: 5, isMilestone: true }, 100, CL_CALENDAR)).toBe(0);
  });
});

describe("resourceLoad (UC-17)", () => {
  it("calcula la carga diaria y marca los días sobreasignados", () => {
    const { tasks, assignments } = uc17();
    const { byResource, overallocatedTaskIds } = resourceLoad(
      tasks,
      assignments,
      [ana],
      CL_CALENDAR,
    );
    const load = byResource.get("ana");
    const hours = Object.fromEntries((load?.days ?? []).map((d) => [d.date, d.hours]));
    expect(hours).toEqual({
      "2026-09-07": 8,
      "2026-09-08": 8,
      "2026-09-09": 8,
      "2026-09-10": 8,
      "2026-09-11": 8,
      "2026-09-14": 12,
      "2026-09-15": 12,
      "2026-09-16": 4,
    });
    expect(load?.overallocatedDates).toEqual(["2026-09-14", "2026-09-15"]);
    expect(load?.totalHours).toBe(68);
    expect([...overallocatedTaskIds].sort()).toEqual(["B", "C"]);
    const day14 = load?.days.find((d) => d.date === "2026-09-14");
    expect(day14?.items.map((i) => [i.taskId, i.hours])).toEqual([
      ["C", 8],
      ["B", 4],
    ]);
    expect(day14?.capacityHours).toBe(8);
  });

  it("agrega por semana con la capacidad de los días hábiles de la semana", () => {
    const { tasks, assignments } = uc17();
    const load = resourceLoad(tasks, assignments, [ana], CL_CALENDAR).byResource.get("ana");
    const weeks = aggregateWeekly(load!, ana, CL_CALENDAR);
    expect(weeks).toEqual([
      { weekStart: "2026-09-07", hours: 40, capacityHours: 40, isOverallocated: false },
      { weekStart: "2026-09-14", hours: 28, capacityHours: 32, isOverallocated: false },
    ]);
  });

  it("respeta el calendario propio del recurso e ignora hitos, resúmenes y tareas desconocidas", () => {
    const soloLunes: EngineResource = {
      ...ana,
      id: "lu",
      calendar: createCalendar({ workingDays: [1], hoursPerDay: 8, holidays: [] }),
    };
    const raw = renumber([
      task("R"),
      task("R.1", { parentId: "R", durationDays: 5 }),
      task("H", { isMilestone: true, durationDays: 0 }),
    ]);
    const tasks = scheduleProject(raw, [], CL_CALENDAR).tasks;
    const assignments: EngineAssignment[] = [
      { id: "x1", taskId: "R.1", resourceId: "lu", allocationPct: 100 },
      { id: "x2", taskId: "R", resourceId: "lu", allocationPct: 100 },
      { id: "x3", taskId: "H", resourceId: "lu", allocationPct: 100 },
      { id: "x4", taskId: "ZZZ", resourceId: "lu", allocationPct: 100 },
    ];
    const load = resourceLoad(tasks, assignments, [soloLunes], CL_CALENDAR).byResource.get("lu");
    expect(load?.days.map((d) => d.date)).toEqual(["2026-09-07"]);
    expect(load?.totalHours).toBe(8);
  });

  it("un recurso sin asignaciones tiene carga vacía", () => {
    const { tasks } = uc17();
    const load = resourceLoad(tasks, [], [ana], CL_CALENDAR).byResource.get("ana");
    expect(load?.days).toEqual([]);
    expect(load?.totalHours).toBe(0);
  });

  it("weekStartOf devuelve el lunes", () => {
    expect(weekStartOf("2026-09-07")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-13")).toBe("2026-09-07");
    expect(weekStartOf("2026-09-16")).toBe("2026-09-14");
  });
});

describe("convertAmount y projectCosts (UC-38)", () => {
  it("convierte entre UF y CLP y devuelve nulo sin valor UF", () => {
    expect(convertAmount(30, "UF", { currency: "UF", ufValue: null })).toBe(30);
    expect(convertAmount(30, "UF", { currency: "CLP", ufValue: 39000 })).toBe(1_170_000);
    expect(convertAmount(78000, "CLP", { currency: "UF", ufValue: 39000 })).toBe(2);
    expect(convertAmount(30, "UF", { currency: "CLP", ufValue: null })).toBeNull();
    expect(convertAmount(30, "UF", { currency: "CLP", ufValue: 0 })).toBeNull();
  });

  it("costo planificado y consumido de la tarea 1 en UF y CLP", () => {
    const raw = renumber([task("1", { orderIndex: 0, durationDays: 5, progressPct: 60 })]);
    const tasks = scheduleProject(raw, [], CL_CALENDAR).tasks;
    const assignments: EngineAssignment[] = [
      { id: "a", taskId: "1", resourceId: "ana", allocationPct: 50 },
    ];
    const uf = projectCosts(tasks, assignments, [ana], CL_CALENDAR, {
      currency: "UF",
      ufValue: 39000,
    });
    expect(uf.byTask.get("1")).toEqual({
      taskId: "1",
      hours: 20,
      plannedCost: 30,
      consumedCost: 18,
    });
    expect(uf.plannedCost).toBe(30);
    expect(uf.consumedCost).toBe(18);
    expect(uf.totalHours).toBe(20);

    const clp = projectCosts(tasks, assignments, [ana], CL_CALENDAR, {
      currency: "CLP",
      ufValue: 39000,
    });
    expect(clp.byTask.get("1")?.plannedCost).toBe(1_170_000);
    expect(clp.byTask.get("1")?.consumedCost).toBe(702_000);

    const sinUf = projectCosts(tasks, assignments, [ana], CL_CALENDAR, {
      currency: "CLP",
      ufValue: null,
    });
    expect(sinUf.byTask.get("1")?.plannedCost).toBeNull();
    expect(sinUf.byTask.get("1")?.consumedCost).toBeNull();
    expect(sinUf.plannedCost).toBeNull();
    expect(sinUf.totalHours).toBe(20);
  });

  it("los resúmenes suman a sus descendientes y se ignoran recursos desconocidos", () => {
    const clp: EngineResource = {
      id: "clp",
      capacityHoursPerDay: 8,
      rate: 10000,
      rateCurrency: "CLP",
    };
    const raw = renumber([
      task("R"),
      task("R.1", { parentId: "R", durationDays: 2, progressPct: 100 }),
      task("R.2", { parentId: "R", durationDays: 1, progressPct: 0 }),
      task("S", { durationDays: 1 }),
    ]);
    const tasks = scheduleProject(raw, [dep("R.1", "R.2")], CL_CALENDAR).tasks;
    const assignments: EngineAssignment[] = [
      { id: "a", taskId: "R.1", resourceId: "ana", allocationPct: 100 }, // 16 h × 1,5 UF = 24 UF
      { id: "b", taskId: "R.2", resourceId: "clp", allocationPct: 100 }, // 8 h × 10.000 = 80.000 CLP
      { id: "c", taskId: "S", resourceId: "nadie", allocationPct: 100 },
    ];
    const enUf = projectCosts(tasks, assignments, [ana, clp], CL_CALENDAR, {
      currency: "UF",
      ufValue: 40000,
    });
    expect(enUf.byTask.get("R")).toEqual({
      taskId: "R",
      hours: 24,
      plannedCost: 26,
      consumedCost: 24,
    });
    expect(enUf.byTask.get("S")).toEqual({
      taskId: "S",
      hours: 0,
      plannedCost: 0,
      consumedCost: 0,
    });
    expect(enUf.plannedCost).toBe(26);
    expect(enUf.consumedCost).toBe(24);
    const sinUf = projectCosts(tasks, assignments, [ana, clp], CL_CALENDAR, {
      currency: "UF",
      ufValue: null,
    });
    expect(sinUf.byTask.get("R")?.plannedCost).toBeNull();
    expect(sinUf.byTask.get("R.1")?.plannedCost).toBe(24);
    expect(sinUf.plannedCost).toBeNull();
  });
});
