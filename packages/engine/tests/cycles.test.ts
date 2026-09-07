import { describe, expect, it } from "vitest";
import { detectCycle, formatCycle, topologicalOrder } from "../src/cycles";
import { EngineError } from "../src/errors";
import { dep } from "./helpers";

describe("detectCycle", () => {
  it("devuelve null en un grafo acíclico", () => {
    expect(detectCycle([dep("A", "B"), dep("B", "C"), dep("A", "C")])).toBeNull();
    expect(detectCycle([])).toBeNull();
  });

  it("detecta A → B → C → A y repite el primero al final", () => {
    expect(detectCycle([dep("A", "B"), dep("B", "C"), dep("C", "A")])).toEqual([
      "A",
      "B",
      "C",
      "A",
    ]);
  });

  it("detecta un ciclo que no incluye al nodo inicial del recorrido", () => {
    // X → A, A → B → C → B
    const cycle = detectCycle([dep("X", "A"), dep("A", "B"), dep("B", "C"), dep("C", "B")]);
    expect(cycle).toEqual(["B", "C", "B"]);
  });

  it("detecta un autociclo", () => {
    expect(detectCycle([dep("A", "A")])).toEqual(["A", "A"]);
  });

  it("detecta el ciclo aunque haya componentes acíclicas antes", () => {
    const cycle = detectCycle([dep("P", "Q"), dep("Q", "R"), dep("M", "N"), dep("N", "M")]);
    expect(cycle).toEqual(["M", "N", "M"]);
  });

  it("maneja una cadena larga sin desbordar la pila", () => {
    const deps = [];
    for (let i = 0; i < 20_000; i++) deps.push(dep(`T${i}`, `T${i + 1}`));
    expect(detectCycle(deps)).toBeNull();
    deps.push(dep("T20000", "T0"));
    const cycle = detectCycle(deps);
    expect(cycle?.[0]).toBe("T0");
    expect(cycle?.at(-1)).toBe("T0");
    expect(cycle).toHaveLength(20_002);
  });
});

describe("topologicalOrder", () => {
  it("ordena respetando las dependencias y conserva el orden de entrada entre independientes", () => {
    const order = topologicalOrder(["C", "A", "B", "D"], [dep("A", "B"), dep("B", "C")]);
    expect(order).toEqual(["A", "D", "B", "C"]);
  });

  it("incluye nodos sin dependencias e ignora dependencias hacia nodos ajenos", () => {
    const order = topologicalOrder(["A", "B"], [dep("A", "B"), dep("Z", "A"), dep("B", "Z")]);
    expect(order).toEqual(["A", "B"]);
  });

  it("lanza EngineError CYCLE con el ciclo en details", () => {
    let caught: unknown;
    try {
      topologicalOrder(["A", "B", "C"], [dep("A", "B"), dep("B", "C"), dep("C", "A")]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EngineError);
    const err = caught as EngineError;
    expect(err.code).toBe("CYCLE");
    expect(err.details.cycle).toEqual(["A", "B", "C", "A"]);
    expect(err.message).toBe("Las dependencias forman un ciclo: A → B → C → A");
  });
});

describe("formatCycle", () => {
  it("une los elementos con flechas y aplica la etiqueta", () => {
    expect(formatCycle(["a", "b", "a"])).toBe("a → b → a");
    const labels: Record<string, string> = { a: "1.2", b: "2.1" };
    expect(formatCycle(["a", "b", "a"], (id) => labels[id] ?? id)).toBe("1.2 → 2.1 → 1.2");
  });
});
