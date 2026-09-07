import { describe, expect, it } from "vitest";
import { EngineError } from "../src/errors";
import { earliestStartFromPredecessor, scheduleProject } from "../src/schedule";
import type { EngineTask } from "../src/types";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, dep, spans, task } from "./helpers";

function byId(tasks: readonly EngineTask[], id: string): EngineTask {
  return tasks.find((t) => t.id === id) as EngineTask;
}

/** Tarea 1 (07-09 a 11-09, 5 días) y tarea 2 (ancla 07-09, 3 días). */
function twoTasks(): EngineTask[] {
  return renumber([
    task("1", { orderIndex: 0, durationDays: 5 }),
    task("2", { orderIndex: 1, durationDays: 3 }),
  ]);
}

describe("scheduleProject — hojas sin dependencias", () => {
  it("calcula el fin a partir del ancla y la duración en días hábiles", () => {
    const { tasks } = scheduleProject(twoTasks(), [], CL_CALENDAR);
    expect(spans(tasks)).toEqual({
      "1": "2026-09-07 – 2026-09-11",
      "2": "2026-09-07 – 2026-09-09",
    });
  });

  it("una tarea que cruza el fin de semana termina la semana siguiente", () => {
    const { tasks } = scheduleProject(
      [task("A", { anchorDate: "2026-09-10", durationDays: 4 })],
      [],
      CL_CALENDAR,
    );
    expect(byId(tasks, "A").endDate).toBe("2026-09-15"); // 10, 11, 14, 15
  });

  it("un ancla en feriado o fin de semana se ajusta al siguiente día hábil", () => {
    const { tasks } = scheduleProject(
      [
        task("F", { anchorDate: "2026-09-18", durationDays: 2 }),
        task("S", { anchorDate: "2026-09-12", durationDays: 1 }),
      ],
      [],
      CL_CALENDAR,
    );
    expect(spans(tasks)).toEqual({ F: "2026-09-21 – 2026-09-22", S: "2026-09-14 – 2026-09-14" });
  });

  it("un hito tiene duración 0 y termina el mismo día", () => {
    const { tasks } = scheduleProject(
      [task("H", { anchorDate: "2026-09-18", isMilestone: true, durationDays: 7 })],
      [],
      CL_CALENDAR,
    );
    const h = byId(tasks, "H");
    expect(h.durationDays).toBe(0);
    expect(h.startDate).toBe("2026-09-21");
    expect(h.endDate).toBe("2026-09-21");
  });

  it("usa projectStartDate cuando una hoja no tiene ancla, y acota el avance a 0–100", () => {
    const { tasks } = scheduleProject(
      [task("A", { anchorDate: null, startDate: "2026-01-01", durationDays: 1, progressPct: 140 })],
      [],
      CL_CALENDAR,
      { projectStartDate: "2026-09-12" },
    );
    expect(byId(tasks, "A").startDate).toBe("2026-09-14");
    expect(byId(tasks, "A").anchorDate).toBe("2026-09-12");
    expect(byId(tasks, "A").progressPct).toBe(100);
  });
});

describe("scheduleProject — tipos de dependencia (UC-10)", () => {
  it("FS: la tarea 2 empieza el día hábil siguiente al fin de la 1", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2")], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-14 – 2026-09-16");
  });

  it("FS+2d: salta el feriado del 18", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2", "FS", 2)], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-16 – 2026-09-21");
  });

  it("FS-1d: la tarea 2 empieza el mismo día en que termina la 1", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2", "FS", -1)], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-11 – 2026-09-15");
  });

  it("SS: empiezan juntas", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2", "SS")], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-07 – 2026-09-09");
  });

  it("SS+3d: la sucesora parte tres días hábiles después", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2", "SS", 3)], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-10 – 2026-09-14");
  });

  it("FF: terminan juntas y el inicio se obtiene restando la duración", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2", "FF")], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-09 – 2026-09-11");
  });

  it("SF: la sucesora termina el día hábil anterior al inicio de la predecesora", () => {
    const tasks = renumber([
      task("1", { orderIndex: 0, anchorDate: "2026-09-21", durationDays: 5 }),
      task("2", { orderIndex: 1, anchorDate: "2026-09-07", durationDays: 3 }),
    ]);
    const { tasks: result } = scheduleProject(tasks, [dep("1", "2", "SF")], CL_CALENDAR);
    // Fin ≥ 17-09 (el 18 es feriado, el día hábil anterior al 21 es el 17); inicio = 17 − 2 = 15
    expect(spans(result)["2"]).toBe("2026-09-15 – 2026-09-17");
  });

  it("un lead nunca adelanta a la sucesora por debajo de su ancla", () => {
    const { tasks } = scheduleProject(twoTasks(), [dep("1", "2", "FS", -10)], CL_CALENDAR);
    expect(spans(tasks)["2"]).toBe("2026-09-07 – 2026-09-09");
  });

  it("un hito sucesor con FS toma el día hábil siguiente; con FF el mismo día", () => {
    const tasks = renumber([
      task("1", { orderIndex: 0, durationDays: 5 }),
      task("H", { orderIndex: 1, isMilestone: true, durationDays: 0 }),
    ]);
    expect(spans(scheduleProject(tasks, [dep("1", "H")], CL_CALENDAR).tasks).H).toBe(
      "2026-09-14 – 2026-09-14",
    );
    expect(spans(scheduleProject(tasks, [dep("1", "H", "FF")], CL_CALENDAR).tasks).H).toBe(
      "2026-09-11 – 2026-09-11",
    );
  });

  it("un hito predecesor empuja con FS al día siguiente", () => {
    const tasks = renumber([
      task("H", { orderIndex: 0, isMilestone: true, anchorDate: "2026-09-17" }),
      task("2", { orderIndex: 1, durationDays: 1 }),
    ]);
    expect(spans(scheduleProject(tasks, [dep("H", "2")], CL_CALENDAR).tasks)["2"]).toBe(
      "2026-09-21 – 2026-09-21",
    );
  });

  it("earliestStartFromPredecessor expone la cota para la UI", () => {
    const p = { startDate: "2026-09-07", endDate: "2026-09-11" };
    expect(earliestStartFromPredecessor({ type: "FS", lagDays: 0 }, p, 3, CL_CALENDAR)).toBe(
      "2026-09-14",
    );
    expect(earliestStartFromPredecessor({ type: "SS", lagDays: 1 }, p, 3, CL_CALENDAR)).toBe(
      "2026-09-08",
    );
    expect(earliestStartFromPredecessor({ type: "FF", lagDays: 0 }, p, 3, CL_CALENDAR)).toBe(
      "2026-09-09",
    );
    expect(earliestStartFromPredecessor({ type: "SF", lagDays: 0 }, p, 0, CL_CALENDAR)).toBe(
      "2026-09-04",
    );
  });
});

describe("scheduleProject — reprogramación de sucesoras (UC-11, UC-13)", () => {
  function chain(): { tasks: EngineTask[]; deps: ReturnType<typeof dep>[] } {
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 5 }),
      task("B", { orderIndex: 1, durationDays: 3 }),
      task("C", { orderIndex: 2, durationDays: 2 }),
    ]);
    return { tasks, deps: [dep("A", "B"), dep("B", "C")] };
  }

  it("mover el ancla de A arrastra a B y C, y changed contiene solo lo que cambió", () => {
    const { tasks, deps } = chain();
    const base = scheduleProject(tasks, deps, CL_CALENDAR).tasks;
    const moved = base.map((t) => (t.id === "A" ? { ...t, anchorDate: "2026-09-10" } : t));
    const { tasks: result, changed } = scheduleProject(moved, deps, CL_CALENDAR);
    expect(spans(result)).toEqual({
      A: "2026-09-10 – 2026-09-16",
      B: "2026-09-17 – 2026-09-22",
      C: "2026-09-23 – 2026-09-24",
    });
    expect(changed.map((t) => t.id).sort()).toEqual(["A", "B", "C"]);
  });

  it("acortar A adelanta a B y C", () => {
    const { tasks, deps } = chain();
    const base = scheduleProject(tasks, deps, CL_CALENDAR).tasks;
    const shorter = base.map((t) => (t.id === "A" ? { ...t, durationDays: 4 } : t));
    const { tasks: result } = scheduleProject(shorter, deps, CL_CALENDAR);
    expect(spans(result)).toEqual({
      A: "2026-09-07 – 2026-09-10",
      B: "2026-09-11 – 2026-09-15",
      C: "2026-09-16 – 2026-09-17",
    });
  });

  it("si el ancla de B manda, acortar A no la mueve ni la incluye en changed", () => {
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 5 }),
      task("B", { orderIndex: 1, anchorDate: "2026-09-21", durationDays: 3 }),
    ]);
    const base = scheduleProject(tasks, [dep("A", "B")], CL_CALENDAR).tasks;
    expect(spans(base).B).toBe("2026-09-21 – 2026-09-23");
    const shorter = base.map((t) => (t.id === "A" ? { ...t, durationDays: 2 } : t));
    const { tasks: result, changed } = scheduleProject(shorter, [dep("A", "B")], CL_CALENDAR);
    expect(spans(result).B).toBe("2026-09-21 – 2026-09-23");
    expect(changed.map((t) => t.id)).toEqual(["A"]);
  });

  it("quitar la dependencia devuelve a B a su ancla (UC-13)", () => {
    const { tasks } = chain();
    const pushed = scheduleProject(tasks, [dep("A", "B")], CL_CALENDAR).tasks;
    expect(spans(pushed).B).toBe("2026-09-14 – 2026-09-16");
    const { tasks: released } = scheduleProject(pushed, [], CL_CALENDAR);
    expect(spans(released).B).toBe("2026-09-07 – 2026-09-09");
  });

  it("con dos predecesoras manda la cota mayor; al quitar una, la otra", () => {
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 5 }), // termina 11-09 → cota 14-09
      task("D", { orderIndex: 1, durationDays: 3 }), // termina 09-09 → cota 10-09
      task("B", { orderIndex: 2, durationDays: 2 }),
    ]);
    const both = scheduleProject(tasks, [dep("A", "B"), dep("D", "B")], CL_CALENDAR).tasks;
    expect(spans(both).B).toBe("2026-09-14 – 2026-09-15");
    const onlyD = scheduleProject(both, [dep("D", "B")], CL_CALENDAR).tasks;
    expect(spans(onlyD).B).toBe("2026-09-10 – 2026-09-11");
  });

  it("un ancla movida por el usuario se conserva al quitar la dependencia", () => {
    const tasks = renumber([
      task("A", { orderIndex: 0, durationDays: 5 }),
      task("B", { orderIndex: 1, anchorDate: "2026-09-16", durationDays: 3 }),
    ]);
    const released = scheduleProject(tasks, [], CL_CALENDAR).tasks;
    expect(spans(released).B).toBe("2026-09-16 – 2026-09-21");
  });

  it("una cadena de 50 tareas de 1 día ocupa 50 días hábiles consecutivos", () => {
    const tasks: EngineTask[] = [];
    const deps = [];
    for (let i = 0; i < 50; i++) {
      tasks.push(task(`T${i}`, { orderIndex: i, durationDays: 1 }));
      if (i > 0) deps.push(dep(`T${i - 1}`, `T${i}`));
    }
    const { tasks: result } = scheduleProject(renumber(tasks), deps, CL_CALENDAR);
    const last = byId(result, "T49");
    expect(last.startDate).toBe(CL_CALENDAR.addWorkingDays("2026-09-07", 49));
    expect(last.endDate).toBe(last.startDate);
    expect(CL_CALENDAR.countWorkingDays("2026-09-07", last.endDate)).toBe(50);
  });

  it("el orden de entrada no afecta el resultado", () => {
    const { tasks, deps } = chain();
    const forward = scheduleProject(tasks, deps, CL_CALENDAR).tasks;
    const backward = scheduleProject([...tasks].reverse(), deps, CL_CALENDAR).tasks;
    expect(spans(forward)).toEqual(spans(backward));
  });
});

describe("scheduleProject — rollup de resúmenes (UC-09)", () => {
  function summaryProject(extra: EngineTask[] = []): EngineTask[] {
    return renumber([
      task("1", { orderIndex: 0 }),
      task("1.1", {
        orderIndex: 0,
        parentId: "1",
        anchorDate: "2026-09-07",
        durationDays: 5,
        progressPct: 40,
        effortHours: 40,
      }),
      task("1.2", {
        orderIndex: 1,
        parentId: "1",
        anchorDate: "2026-09-14",
        durationDays: 5,
        progressPct: 0,
        effortHours: 120,
      }),
      ...extra,
    ]);
  }

  it("fechas extremas, duración inclusive y avance ponderado por duración", () => {
    const { tasks } = scheduleProject(summaryProject(), [], CL_CALENDAR);
    const s = byId(tasks, "1");
    expect(spans(tasks)["1.2"]).toBe("2026-09-14 – 2026-09-21");
    expect(s.startDate).toBe("2026-09-07");
    expect(s.endDate).toBe("2026-09-21");
    expect(s.durationDays).toBe(10);
    expect(s.progressPct).toBe(20);
    expect(s.isSummary).toBe(true);
    expect(s.anchorDate).toBeNull();
  });

  it("los hitos no pesan en el avance", () => {
    const withMilestone = summaryProject([
      task("1.3", {
        orderIndex: 2,
        parentId: "1",
        anchorDate: "2026-09-21",
        isMilestone: true,
        durationDays: 0,
      }),
    ]);
    const { tasks } = scheduleProject(withMilestone, [], CL_CALENDAR);
    expect(byId(tasks, "1").progressPct).toBe(20);
    expect(byId(tasks, "1").endDate).toBe("2026-09-21");
  });

  it("ponderación por esfuerzo", () => {
    const { tasks } = scheduleProject(summaryProject(), [], CL_CALENDAR, {
      progressWeighting: "EFFORT",
    });
    expect(byId(tasks, "1").progressPct).toBe(10);
  });

  it("70 % cuando 1.2 está completa", () => {
    const done = summaryProject().map((t) => (t.id === "1.2" ? { ...t, progressPct: 100 } : t));
    const { tasks } = scheduleProject(done, [], CL_CALENDAR);
    expect(byId(tasks, "1").progressPct).toBe(70);
  });

  it("si todas las hojas son hitos (peso 0) usa promedio simple", () => {
    const tasks = renumber([
      task("R"),
      task("H1", { parentId: "R", isMilestone: true, progressPct: 100 }),
      task("H2", { parentId: "R", isMilestone: true, progressPct: 0 }),
    ]);
    expect(byId(scheduleProject(tasks, [], CL_CALENDAR).tasks, "R").progressPct).toBe(50);
  });

  it("con EFFORT y ninguna hoja con esfuerzo usa promedio simple", () => {
    const tasks = renumber([
      task("R"),
      task("A", { parentId: "R", durationDays: 9, progressPct: 100 }),
      task("B", { parentId: "R", durationDays: 1, progressPct: 0 }),
    ]);
    const { tasks: result } = scheduleProject(tasks, [], CL_CALENDAR, {
      progressWeighting: "EFFORT",
    });
    expect(byId(result, "R").progressPct).toBe(50);
  });

  it("propaga el rollup hasta la raíz en tres niveles y las dependencias mueven a los resúmenes", () => {
    const tasks = renumber([
      task("1"),
      task("1.1", { parentId: "1" }),
      task("1.1.1", { parentId: "1.1", durationDays: 2, progressPct: 50 }),
      task("1.1.2", { parentId: "1.1", durationDays: 2, progressPct: 50 }),
      task("2", { durationDays: 1 }),
    ]);
    const deps = [dep("1.1.1", "1.1.2"), dep("1.1.2", "2")];
    const { tasks: result, changed } = scheduleProject(tasks, deps, CL_CALENDAR);
    expect(spans(result)).toEqual({
      "1": "2026-09-07 – 2026-09-10",
      "1.1": "2026-09-07 – 2026-09-10",
      "1.1.1": "2026-09-07 – 2026-09-08",
      "1.1.2": "2026-09-09 – 2026-09-10",
      "2": "2026-09-11 – 2026-09-11",
    });
    expect(byId(result, "1").progressPct).toBe(50);
    expect(byId(result, "1").durationDays).toBe(4);
    expect(changed.map((t) => t.id)).toContain("1");
    // Un segundo cálculo sobre el resultado es estable: nada cambia.
    expect(scheduleProject(result, deps, CL_CALENDAR).changed).toEqual([]);
  });
});

describe("scheduleProject — validaciones", () => {
  it("un ciclo A → B → C → A lanza CYCLE con los códigos WBS", () => {
    const tasks = renumber([
      task("A", { orderIndex: 0 }),
      task("B", { orderIndex: 1 }),
      task("C", { orderIndex: 2 }),
    ]);
    let caught: unknown;
    try {
      scheduleProject(tasks, [dep("A", "B"), dep("B", "C"), dep("C", "A")], CL_CALENDAR);
    } catch (error) {
      caught = error;
    }
    const err = caught as EngineError;
    expect(err).toBeInstanceOf(EngineError);
    expect(err.code).toBe("CYCLE");
    expect(err.details.cycle).toEqual(["1", "2", "3", "1"]);
    expect(err.details.cycleIds).toEqual(["A", "B", "C", "A"]);
    expect(err.message).toBe("La dependencia crearía un ciclo: 1 → 2 → 3 → 1");
  });

  it("rechaza dependencias hacia o desde tareas resumen", () => {
    const tasks = renumber([task("1"), task("1.1", { parentId: "1" }), task("2")]);
    expect(() => scheduleProject(tasks, [dep("1", "2")], CL_CALENDAR)).toThrow(
      "Las tareas resumen no admiten dependencias (1)",
    );
    expect(() => scheduleProject(tasks, [dep("2", "1")], CL_CALENDAR)).toThrow(EngineError);
  });

  it("rechaza dependencias con tareas inexistentes, autodependencias y lag no entero", () => {
    const tasks = renumber([task("A"), task("B")]);
    expect(() => scheduleProject(tasks, [dep("A", "Z")], CL_CALENDAR)).toThrow("tarea inexistente");
    expect(() => scheduleProject(tasks, [dep("A", "A")], CL_CALENDAR)).toThrow(
      "depender de sí misma",
    );
    expect(() => scheduleProject(tasks, [dep("A", "B", "FS", 0.5)], CL_CALENDAR)).toThrow(
      "entero de días hábiles",
    );
  });

  it("no muta la entrada", () => {
    const tasks = twoTasks();
    const snapshot = JSON.stringify(tasks);
    scheduleProject(tasks, [dep("1", "2")], CL_CALENDAR);
    expect(JSON.stringify(tasks)).toBe(snapshot);
  });
});
