import { describe, expect, it } from "vitest";
import { scheduleProject } from "../src/schedule";
import type { EngineDependency, EngineTask } from "../src/types";
import { renumber } from "../src/wbs";
import { CL_CALENDAR, task } from "./helpers";

/**
 * Proyecto de rendimiento: 10 fases × 10 paquetes × 10 hojas = 1.000 hojas (+110 resúmenes) y
 * ≈1.500 dependencias: una cadena dentro de cada paquete (900), enlaces entre paquetes consecutivos
 * (90), enlaces entre fases (9) y ≈500 enlaces cruzados hacia adelante con tipos y lags variados.
 * Determinista: usa un generador congruencial simple en lugar de Math.random.
 */
function buildPerfProject(): { tasks: EngineTask[]; deps: EngineDependency[] } {
  const raw: EngineTask[] = [];
  const leaves: string[] = [];
  for (let f = 0; f < 10; f++) {
    const phase = `F${f}`;
    raw.push(task(phase, { orderIndex: f }));
    for (let p = 0; p < 10; p++) {
      const pkg = `${phase}P${p}`;
      raw.push(task(pkg, { orderIndex: p, parentId: phase }));
      for (let l = 0; l < 10; l++) {
        const leaf = `${pkg}L${l}`;
        raw.push(
          task(leaf, {
            orderIndex: l,
            parentId: pkg,
            durationDays: 1 + ((f + p + l) % 5),
            progressPct: (l * 13) % 101,
            effortHours: 8 * (1 + (l % 3)),
          }),
        );
        leaves.push(leaf);
      }
    }
  }

  const deps: EngineDependency[] = [];
  const add = (
    predecessorId: string,
    successorId: string,
    type: EngineDependency["type"] = "FS",
    lagDays = 0,
  ): void => {
    deps.push({ id: `d${deps.length}`, predecessorId, successorId, type, lagDays });
  };

  // Cadenas dentro de cada paquete, entre paquetes y entre fases.
  for (let i = 1; i < leaves.length; i++) {
    const prev = leaves[i - 1] as string;
    const curr = leaves[i] as string;
    add(prev, curr);
  }
  // Enlaces cruzados hacia adelante (índice menor → mayor) para no crear ciclos.
  let seed = 12345;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };
  const types: EngineDependency["type"][] = ["FS", "SS", "FF", "SF"];
  while (deps.length < 1500) {
    const a = next() % leaves.length;
    const b = next() % leaves.length;
    if (a === b) continue;
    const [from, to] = a < b ? [a, b] : [b, a];
    add(
      leaves[from] as string,
      leaves[to] as string,
      types[next() % 4] as EngineDependency["type"],
      (next() % 5) - 2,
    );
  }
  return { tasks: renumber(raw), deps };
}

describe("scheduleProject — rendimiento (UC-11)", () => {
  it("reprograma 1.000 hojas y 1.500 dependencias en menos de 50 ms", () => {
    const { tasks, deps } = buildPerfProject();
    expect(tasks.filter((t) => !t.isSummary)).toHaveLength(1000);
    expect(tasks).toHaveLength(1110);
    expect(deps).toHaveLength(1500);

    // Calentamiento: primera programación completa (también construye el índice del calendario).
    const base = scheduleProject(tasks, deps, CL_CALENDAR).tasks;

    // Mover la primera tarea de la cadena más larga y medir el recálculo completo.
    const moved = base.map((t) => (t.id === "F0P0L0" ? { ...t, anchorDate: "2026-09-14" } : t));
    const samples: number[] = [];
    let changedCount = 0;
    for (let i = 0; i < 7; i++) {
      const started = performance.now();
      const result = scheduleProject(moved, deps, CL_CALENDAR);
      samples.push(performance.now() - started);
      changedCount = result.changed.length;
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)] as number;
    const best = samples[0] as number;
    console.info(
      `scheduleProject 1.110 tareas / 1.500 dependencias: mejor ${best.toFixed(1)} ms, ` +
        `mediana ${median.toFixed(1)} ms, tareas afectadas ${changedCount}`,
    );

    expect(changedCount).toBeGreaterThan(100);
    expect(median).toBeLessThan(50);
  });
});
