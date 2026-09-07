import { describe, expect, it } from "vitest";
import { EngineError } from "../src/errors";
import type { EngineTask } from "../src/types";
import {
  buildChildrenMap,
  getAncestorIds,
  getDepth,
  getDescendantIds,
  indentTask,
  moveTask,
  moveTaskDown,
  moveTaskUp,
  outdentTask,
  renumber,
  sortTasksDepthFirst,
} from "../src/wbs";
import { codes, dep, task } from "./helpers";

/** A, B y C en el nivel raíz (1, 2, 3). */
function abc(): EngineTask[] {
  return [
    task("A", { orderIndex: 0, anchorDate: "2026-09-07", startDate: "2026-09-07" }),
    task("B", { orderIndex: 1 }),
    task("C", { orderIndex: 2 }),
  ];
}

/** 1 (A) con hijos 1.1 (B) y 1.2 (C), y 2 (D). */
function nested(): EngineTask[] {
  return renumber([
    task("A", { orderIndex: 0 }),
    task("B", { orderIndex: 0, parentId: "A" }),
    task("C", { orderIndex: 1, parentId: "A" }),
    task("D", { orderIndex: 1 }),
  ]);
}

describe("renumber", () => {
  it("asigna códigos WBS jerárquicos y orderIndex contiguos", () => {
    const result = renumber([
      task("D", { orderIndex: 10 }),
      task("A", { orderIndex: 2 }),
      task("B", { orderIndex: 7, parentId: "A" }),
      task("C", { orderIndex: 3, parentId: "B" }),
    ]);
    expect(result.map((t) => t.id)).toEqual(["A", "B", "C", "D"]);
    expect(codes(result)).toEqual({ A: "1", B: "1.1", C: "1.1.1", D: "2" });
    expect(result.map((t) => t.orderIndex)).toEqual([0, 0, 0, 1]);
  });

  it("marca isSummary y quita el ancla a las tareas con hijos", () => {
    const result = renumber([task("A"), task("B", { parentId: "A" })]);
    const a = result.find((t) => t.id === "A") as EngineTask;
    expect(a.isSummary).toBe(true);
    expect(a.anchorDate).toBeNull();
  });

  it("devuelve a hoja un resumen sin hijos, con anchorDate = startDate previo", () => {
    const summary = task("A", { isSummary: true, anchorDate: null, startDate: "2026-09-10" });
    const [a] = renumber([summary]);
    expect(a?.isSummary).toBe(false);
    expect(a?.anchorDate).toBe("2026-09-10");
  });

  it("trata como raíz a una tarea cuyo padre no existe", () => {
    const result = renumber([task("A"), task("B", { parentId: "ZZZ" })]);
    expect(codes(result)).toEqual({ A: "1", B: "2" });
    expect(result.find((t) => t.id === "B")?.parentId).toBeNull();
  });

  it("desempata orderIndex iguales por el orden de entrada", () => {
    const result = renumber([task("X", { orderIndex: 0 }), task("Y", { orderIndex: 0 })]);
    expect(codes(result)).toEqual({ X: "1", Y: "2" });
  });
});

describe("sortTasksDepthFirst / buildChildrenMap", () => {
  it("recorre padres antes que hijos", () => {
    const tasks = nested();
    expect(sortTasksDepthFirst([...tasks].reverse()).map((t) => t.id)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
    const map = buildChildrenMap(tasks);
    expect(map.get(null)?.map((t) => t.id)).toEqual(["A", "D"]);
    expect(map.get("A")?.map((t) => t.id)).toEqual(["B", "C"]);
  });
});

describe("getDescendantIds / getAncestorIds / getDepth", () => {
  it("navega la jerarquía", () => {
    const tasks = renumber([
      task("A"),
      task("B", { parentId: "A" }),
      task("C", { parentId: "B" }),
      task("D"),
    ]);
    expect(getDescendantIds(tasks, "A")).toEqual(["B", "C"]);
    expect(getDescendantIds(tasks, "D")).toEqual([]);
    expect(getAncestorIds(tasks, "C")).toEqual(["B", "A"]);
    expect(getAncestorIds(tasks, "A")).toEqual([]);
    expect(getDepth(tasks, "C")).toBe(2);
    expect(getDepth(tasks, "A")).toBe(0);
  });
});

describe("indentTask (UC-07)", () => {
  it("B pasa a ser 1.1 y A se convierte en resumen", () => {
    const result = indentTask(abc(), "B");
    expect(codes(result)).toEqual({ A: "1", B: "1.1", C: "2" });
    const a = result.find((t) => t.id === "A") as EngineTask;
    expect(a.isSummary).toBe(true);
    expect(a.anchorDate).toBeNull();
  });

  it("indentar C después de B la deja como 1.2", () => {
    const result = indentTask(indentTask(abc(), "B"), "C");
    expect(codes(result)).toEqual({ A: "1", B: "1.1", C: "1.2" });
  });

  it("indenta con todo el subárbol", () => {
    // 1 (A), 2 (D) con hijos 2.1 (E); indentar D bajo A → 1.1 (D), 1.1.1 (E)
    const tasks = renumber([task("A"), task("D"), task("E", { parentId: "D" })]);
    const result = indentTask(tasks, "D");
    expect(codes(result)).toEqual({ A: "1", D: "1.1", E: "1.1.1" });
  });

  it("rechaza indentar la primera tarea de su nivel", () => {
    expect(() => indentTask(abc(), "A")).toThrow("no tiene un hermano anterior");
    expect(() => indentTask(nested(), "B")).toThrow(EngineError);
  });

  it("rechaza convertir en resumen a una hoja con dependencias", () => {
    let caught: unknown;
    try {
      indentTask(abc(), "B", { dependencies: [dep("A", "C")] });
    } catch (error) {
      caught = error;
    }
    const err = caught as EngineError;
    expect(err.code).toBe("INVALID_MOVE");
    expect(err.details.reason).toBe("SUMMARY_WITH_DEPENDENCIES");
    expect(err.message).toContain("tiene dependencias");
  });

  it("permite indentar bajo un resumen existente aunque haya dependencias en otras tareas", () => {
    const tasks = nested(); // A resumen con B y C; D raíz
    const result = indentTask(tasks, "D", { dependencies: [dep("B", "C")] });
    expect(codes(result)).toEqual({ A: "1", B: "1.1", C: "1.2", D: "1.3" });
  });

  it("lanza NOT_FOUND si la tarea no existe", () => {
    expect(() => indentTask(abc(), "ZZZ")).toThrow("No existe la tarea");
  });
});

describe("outdentTask (UC-07)", () => {
  it("B vuelve al nivel raíz y C pasa a ser su hija; A vuelve a ser hoja con su ancla", () => {
    const tasks = indentTask(indentTask(abc(), "B"), "C"); // A=1, B=1.1, C=1.2
    const result = outdentTask(tasks, "B");
    expect(codes(result)).toEqual({ A: "1", B: "2", C: "2.1" });
    const a = result.find((t) => t.id === "A") as EngineTask;
    expect(a.isSummary).toBe(false);
    expect(a.anchorDate).toBe("2026-09-07");
    const b = result.find((t) => t.id === "B") as EngineTask;
    expect(b.isSummary).toBe(true);
  });

  it("desindentar el último hijo no arrastra hermanos y conserva sus propios hijos", () => {
    // 1 (A): 1.1 (B), 1.2 (C): 1.2.1 (E); 2 (D). Desindentar C → 1 (A): 1.1 (B); 2 (C): 2.1 (E); 3 (D)
    const tasks = renumber([
      task("A"),
      task("B", { parentId: "A" }),
      task("C", { parentId: "A" }),
      task("E", { parentId: "C" }),
      task("D"),
    ]);
    const result = outdentTask(tasks, "C");
    expect(codes(result)).toEqual({ A: "1", B: "1.1", C: "2", E: "2.1", D: "3" });
  });

  it("los hermanos siguientes se agregan después de los hijos existentes", () => {
    // 1 (A): 1.1 (B): 1.1.1 (E), 1.2 (C). Desindentar B → 1 (A), 2 (B): 2.1 (E), 2.2 (C)
    const tasks = renumber([
      task("A"),
      task("B", { parentId: "A" }),
      task("E", { parentId: "B" }),
      task("C", { parentId: "A" }),
    ]);
    const result = outdentTask(tasks, "B");
    expect(codes(result)).toEqual({ A: "1", B: "2", E: "2.1", C: "2.2" });
  });

  it("rechaza desindentar una tarea raíz", () => {
    expect(() => outdentTask(abc(), "A")).toThrow("ya está en el nivel raíz");
  });
});

describe("moveTask / moveTaskUp / moveTaskDown (UC-07)", () => {
  it("mover la tarea 1 hacia abajo renumera todo el subárbol", () => {
    const result = moveTaskDown(nested(), "A");
    expect(codes(result)).toEqual({ D: "1", A: "2", B: "2.1", C: "2.2" });
  });

  it("mover arriba es la operación inversa", () => {
    const result = moveTaskUp(moveTaskDown(nested(), "A"), "A");
    expect(codes(result)).toEqual({ A: "1", B: "1.1", C: "1.2", D: "2" });
  });

  it("mover arriba la primera o abajo la última no cambia nada", () => {
    expect(codes(moveTaskUp(nested(), "A"))).toEqual(codes(nested()));
    expect(codes(moveTaskDown(nested(), "D"))).toEqual(codes(nested()));
  });

  it("mueve a una posición concreta bajo otro padre", () => {
    const result = moveTask(nested(), "D", { parentId: "A", index: 1 });
    expect(codes(result)).toEqual({ A: "1", B: "1.1", D: "1.2", C: "1.3" });
  });

  it("acota el índice destino al rango válido", () => {
    expect(codes(moveTask(nested(), "D", { parentId: "A", index: 99 }))).toEqual({
      A: "1",
      B: "1.1",
      C: "1.2",
      D: "1.3",
    });
    expect(codes(moveTask(nested(), "D", { parentId: "A", index: -5 }))).toEqual({
      A: "1",
      D: "1.1",
      B: "1.2",
      C: "1.3",
    });
  });

  it("rechaza mover una tarea bajo sí misma o bajo un descendiente", () => {
    expect(() => moveTask(nested(), "A", { parentId: "C", index: 0 })).toThrow(
      "Una tarea no puede moverse dentro de sus propias subtareas",
    );
    expect(() => moveTask(nested(), "A", { parentId: "A", index: 0 })).toThrow(EngineError);
  });

  it("rechaza mover bajo una hoja con dependencias, pero lo permite sin la opción", () => {
    expect(() =>
      moveTask(nested(), "B", { parentId: "D", index: 0 }, { dependencies: [dep("D", "C")] }),
    ).toThrow("tiene dependencias");
    expect(codes(moveTask(nested(), "B", { parentId: "D", index: 0 }))).toEqual({
      A: "1",
      C: "1.1",
      D: "2",
      B: "2.1",
    });
  });

  it("rechaza un padre destino inexistente", () => {
    expect(() => moveTask(nested(), "B", { parentId: "ZZZ", index: 0 })).toThrow(
      "No existe la tarea",
    );
  });

  it("no muta las tareas de entrada", () => {
    const input = nested();
    const snapshot = JSON.stringify(input);
    moveTaskDown(input, "A");
    indentTask(input, "D");
    outdentTask(input, "B");
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
