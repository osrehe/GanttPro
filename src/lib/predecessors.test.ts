import { describe, expect, it } from "vitest";
import type { DependencyDto, TaskDto } from "./dto";
import { diffPredecessors, formatPredecessors, parsePredecessors } from "./predecessors";

function task(id: string, wbsCode: string, isSummary = false): TaskDto {
  return {
    id,
    projectId: "p",
    parentId: null,
    orderIndex: 0,
    wbsCode,
    name: id,
    description: null,
    anchorDate: "2026-09-07",
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    durationDays: 1,
    effortHours: null,
    progressPct: 0,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    color: null,
    isMilestone: false,
    isSummary,
    isCritical: false,
    totalFloatDays: null,
    freeFloatDays: null,
    notes: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
    updatedById: null,
  };
}

function dep(
  id: string,
  predecessorId: string,
  successorId: string,
  type: DependencyDto["type"] = "FS",
  lagDays = 0,
): DependencyDto {
  return { id, projectId: "p", predecessorId, successorId, type, lagDays };
}

const tasks = [
  task("a", "1"),
  task("b", "2"),
  task("c", "3"),
  task("d", "4"),
  task("s", "5", true),
];
const byId = new Map(tasks.map((t) => [t.id, t]));

describe("parsePredecessors", () => {
  it("acepta los formatos abreviados y completos", () => {
    expect(parsePredecessors("3")).toEqual([{ wbsCode: "3", type: "FS", lagDays: 0 }]);
    expect(parsePredecessors("3FS+2d; 5SS")).toEqual([
      { wbsCode: "3", type: "FS", lagDays: 2 },
      { wbsCode: "5", type: "SS", lagDays: 0 },
    ]);
    expect(parsePredecessors("1.2.3ff-1")).toEqual([{ wbsCode: "1.2.3", type: "FF", lagDays: -1 }]);
    expect(parsePredecessors(" 2 SF + 3 d , 4 ")).toEqual([
      { wbsCode: "2", type: "SF", lagDays: 3 },
      { wbsCode: "4", type: "FS", lagDays: 0 },
    ]);
    expect(parsePredecessors("")).toEqual([]);
  });

  it("rechaza tokens inválidos y repetidos con mensajes claros", () => {
    expect(() => parsePredecessors("3XX")).toThrow('"3XX" no es válido');
    expect(() => parsePredecessors("abc")).toThrow("no es válido");
    expect(() => parsePredecessors("3; 3SS")).toThrow("aparece más de una vez");
  });
});

describe("formatPredecessors", () => {
  it("omite FS y lag 0, y ordena por código WBS", () => {
    const deps = [
      dep("d1", "c", "d", "SS"),
      dep("d2", "a", "d", "FS", 2),
      dep("d3", "b", "d"),
      dep("d4", "a", "b"),
    ];
    expect(formatPredecessors("d", deps, byId)).toBe("1FS+2d; 2; 3SS");
    expect(formatPredecessors("b", deps, byId)).toBe("1");
    expect(formatPredecessors("a", deps, byId)).toBe("");
    expect(formatPredecessors("d", [dep("x", "c", "d", "FF", -1)], byId)).toBe("3FF-1d");
  });
});

describe("diffPredecessors", () => {
  it("calcula altas, cambios y bajas", () => {
    const deps = [dep("d1", "a", "d"), dep("d2", "b", "d", "SS")];
    const diff = diffPredecessors("d", parsePredecessors("1FS+1d; 3"), deps, tasks);
    expect(diff.create).toEqual([{ predecessorId: "c", type: "FS", lagDays: 0 }]);
    expect(diff.update).toEqual([{ dependencyId: "d1", type: "FS", lagDays: 1 }]);
    expect(diff.remove).toEqual(["d2"]);
  });

  it("no propone cambios si el texto coincide con el estado", () => {
    const deps = [dep("d1", "a", "d", "FS", 2)];
    const diff = diffPredecessors("d", parsePredecessors("1FS+2d"), deps, tasks);
    expect(diff).toEqual({ create: [], update: [], remove: [] });
  });

  it("rechaza códigos inexistentes, la propia tarea y resúmenes", () => {
    expect(() => diffPredecessors("d", parsePredecessors("9"), [], tasks)).toThrow(
      "No existe la tarea 9",
    );
    expect(() => diffPredecessors("d", parsePredecessors("4"), [], tasks)).toThrow("sí misma");
    expect(() => diffPredecessors("d", parsePredecessors("5"), [], tasks)).toThrow("resumen");
  });
});
