import { describe, expect, it } from "vitest";
import { parseBooleanCell, parseDateCell, rowsToPlan, validatePlan, type RawRow } from "./rows";
import type { ImportedPlan, ImportedTask } from "./types";

function row(rowNumber: number, cells: RawRow["cells"]): RawRow {
  return { row: rowNumber, cells };
}

function task(partial: Partial<ImportedTask> & { wbs: string; name: string }): ImportedTask {
  return {
    row: 0,
    level: partial.wbs.split(".").length,
    durationDays: 1,
    startDate: null,
    isMilestone: false,
    progressPct: 0,
    predecessors: "",
    resources: [],
    notes: null,
    ...partial,
  };
}

function plan(tasks: ImportedTask[], resources: ImportedPlan["resources"] = []): ImportedPlan {
  return { source: "csv", projectName: null, startDate: null, tasks, resources };
}

function errorsOf(preview: ReturnType<typeof validatePlan>) {
  return preview.issues.filter((i) => i.severity === "error").map((i) => [i.row, i.message]);
}

describe("parseDateCell", () => {
  it("acepta Date, seriales de Excel y textos en varios formatos", () => {
    expect(parseDateCell(new Date(Date.UTC(2026, 8, 7)))).toBe("2026-09-07");
    expect(parseDateCell(46272)).toBe("2026-09-07");
    expect(parseDateCell("2026-09-07")).toBe("2026-09-07");
    expect(parseDateCell("07-09-2026")).toBe("2026-09-07");
    expect(parseDateCell("7/9/2026")).toBe("2026-09-07");
    expect(parseDateCell("2026-09-07T08:00:00")).toBe("2026-09-07");
    expect(parseDateCell("31-02-2026")).toBeNull();
    expect(parseDateCell("mañana")).toBeNull();
    expect(parseDateCell("")).toBeNull();
  });
});

describe("parseBooleanCell", () => {
  it("interpreta Sí/No y variantes", () => {
    expect(parseBooleanCell("Sí")).toBe(true);
    expect(parseBooleanCell("si")).toBe(true);
    expect(parseBooleanCell("x")).toBe(true);
    expect(parseBooleanCell(1)).toBe(true);
    expect(parseBooleanCell(true)).toBe(true);
    expect(parseBooleanCell("No")).toBe(false);
    expect(parseBooleanCell("")).toBe(false);
    expect(parseBooleanCell(null)).toBe(false);
    expect(parseBooleanCell("quizás")).toBeNull();
  });
});

describe("rowsToPlan: validación por fila", () => {
  it("reporta nombre vacío, duración, fecha, hito y avance inválidos con su fila", () => {
    const preview = rowsToPlan(
      [
        row(2, { wbs: "1", name: "", duration: 3 }),
        row(3, { wbs: "2", name: "B", duration: "-2" }),
        row(4, { wbs: "3", name: "C", duration: 2, start: "32-13-2026" }),
        row(5, { wbs: "4", name: "D", milestone: "tal vez" }),
        row(6, { wbs: "5", name: "E", progress: 150 }),
        row(7, { wbs: "6", name: "F", duration: "abc" }),
      ],
      "csv",
    );
    expect(errorsOf(preview)).toEqual([
      [2, "El nombre es obligatorio"],
      [3, 'La duración "-2" no es válida (días hábiles ≥ 0)'],
      [4, 'La fecha "32-13-2026" no es válida (usa dd-mm-aaaa o aaaa-mm-dd)'],
      [5, '"tal vez" no se reconoce: usa Sí o No'],
      [6, 'El avance "150" no es válido (0 a 100)'],
      [7, 'La duración "abc" no es válida (días hábiles ≥ 0)'],
    ]);
    expect(preview.counts.errors).toBe(6);
  });

  it("un hito fuerza duración 0 y una duración decimal se redondea con advertencia", () => {
    const preview = rowsToPlan(
      [
        row(2, { wbs: "1", name: "Hito", duration: 5, milestone: "Sí" }),
        row(3, { wbs: "2", name: "Media", duration: "2,5" }),
        row(4, { wbs: "3", name: "Porcentaje Excel", duration: 1, progress: 0.4 }),
      ],
      "csv",
    );
    expect(preview.counts.errors).toBe(0);
    expect(preview.plan.tasks[0]).toMatchObject({ durationDays: 0, isMilestone: true });
    expect(preview.plan.tasks[1]?.durationDays).toBe(3);
    expect(preview.plan.tasks[2]?.progressPct).toBe(40);
    expect(preview.issues.map((i) => i.severity)).toEqual(["warning", "warning"]);
  });

  it("salta filas totalmente vacías", () => {
    const preview = rowsToPlan(
      [
        row(2, { wbs: "1", name: "A" }),
        row(3, { wbs: "", name: "   " }),
        row(4, { wbs: "2", name: "B" }),
      ],
      "csv",
    );
    expect(preview.plan.tasks.map((t) => t.row)).toEqual([2, 4]);
    expect(preview.counts.errors).toBe(0);
  });

  it("rechaza códigos WBS inválidos y saltos de nivel", () => {
    const bad = rowsToPlan([row(2, { wbs: "1.a", name: "A" })], "csv");
    expect(errorsOf(bad)).toEqual([[2, 'El código WBS "1.a" no es válido']]);
    const jump = rowsToPlan(
      [row(2, { level: 1, name: "A" }), row(3, { level: 3, name: "B" })],
      "csv",
    );
    expect(errorsOf(jump)[0]?.[1]).toContain("salta niveles");
  });
});

describe("rowsToPlan: columna Fin (UC-29)", () => {
  it("deduce la duración en días hábiles entre Inicio y Fin cuando Duración viene vacía", () => {
    const preview = rowsToPlan(
      [
        row(2, { wbs: "1", name: "Semana", start: "05-10-2026", end: "09-10-2026" }),
        row(3, { wbs: "2", name: "Cruza fin de semana", start: "2026-10-08", end: "2026-10-13" }),
        row(4, { wbs: "3", name: "Mismo día", start: "2026-10-05", end: "2026-10-05" }),
        row(5, {
          wbs: "4",
          name: "Manda la duración",
          duration: 2,
          start: "2026-10-05",
          end: "2026-10-30",
        }),
        row(6, {
          wbs: "5",
          name: "Hito con fin",
          milestone: "Sí",
          start: "2026-10-05",
          end: "2026-10-05",
        }),
      ],
      "csv",
    );
    expect(preview.counts.errors).toBe(0);
    expect(preview.plan.tasks.map((t) => t.durationDays)).toEqual([5, 4, 1, 2, 0]);
  });

  it("rechaza Fin sin Inicio, Fin anterior al Inicio y fechas inválidas", () => {
    const preview = rowsToPlan(
      [
        row(2, { wbs: "1", name: "Sin inicio", end: "2026-10-09" }),
        row(3, { wbs: "2", name: "Al revés", start: "2026-10-09", end: "2026-10-05" }),
        row(4, { wbs: "3", name: "Fecha rara", start: "2026-10-05", end: "ayer" }),
        row(5, {
          wbs: "4",
          name: "Fin sin inicio pero con duración",
          duration: 3,
          end: "2026-10-09",
        }),
      ],
      "csv",
    );
    expect(errorsOf(preview)).toEqual([
      [2, "Para usar Fin sin Duración la fila necesita también la fecha de Inicio"],
      [3, "La fecha de fin 2026-10-05 es anterior al inicio 2026-10-09"],
      [4, 'La fecha "ayer" no es válida (usa dd-mm-aaaa o aaaa-mm-dd)'],
    ]);
    expect(preview.plan.tasks[3]?.durationDays).toBe(3);
  });
});

describe("validatePlan: estructura y predecesoras", () => {
  it("detecta WBS repetido y falta del padre", () => {
    const preview = validatePlan(
      plan([
        task({ row: 2, wbs: "1", name: "A" }),
        task({ row: 3, wbs: "1", name: "A bis" }),
        task({ row: 4, wbs: "2.1", name: "Huérfana" }),
      ]),
    );
    expect(errorsOf(preview)).toEqual([
      [3, "El código WBS 1 está repetido"],
      [4, "La tarea 2.1 no tiene padre: falta la fila con WBS 2"],
    ]);
  });

  it("valida sintaxis, existencia, autodependencia y resúmenes en las predecesoras", () => {
    const preview = validatePlan(
      plan([
        task({ row: 2, wbs: "1", name: "Resumen" }),
        task({ row: 3, wbs: "1.1", name: "Hoja", predecessors: "9" }),
        task({ row: 4, wbs: "1.2", name: "Hoja 2", predecessors: "1.2" }),
        task({ row: 5, wbs: "2", name: "Depende de resumen", predecessors: "1" }),
        task({ row: 6, wbs: "3", name: "Sintaxis", predecessors: "1.1 XX" }),
      ]),
    );
    expect(errorsOf(preview)).toEqual([
      [3, "No existe la tarea 9 indicada como predecesora"],
      [4, "Una tarea no puede depender de sí misma"],
      [5, "La tarea 1 es un resumen y no admite dependencias"],
      [6, '"1.1 XX" no es válido: usa el formato 3FS+2d (tipos FS, SS, FF, SF)'],
    ]);
    expect(preview.counts.dependencies).toBe(0);
  });

  it("detecta ciclos entre predecesoras", () => {
    const preview = validatePlan(
      plan([
        task({ row: 2, wbs: "1", name: "A", predecessors: "3" }),
        task({ row: 3, wbs: "2", name: "B", predecessors: "1" }),
        task({ row: 4, wbs: "3", name: "C", predecessors: "2SS+1d" }),
      ]),
    );
    const cycle = preview.issues.find((i) => i.message.includes("ciclo"));
    expect(cycle?.severity).toBe("error");
    expect(cycle?.message).toContain("→");
  });

  it("advierte avance en resúmenes y recursos no declarados; cuenta correctamente", () => {
    const preview = validatePlan(
      plan(
        [
          task({ row: 2, wbs: "1", name: "Resumen", progressPct: 50 }),
          task({ row: 3, wbs: "1.1", name: "A", resources: ["Ana", "Beto"] }),
          task({ row: 4, wbs: "1.2", name: "B", predecessors: "1.1FS+2d", resources: ["ana"] }),
        ],
        [{ name: "Ana", type: "PERSON", rate: 1, rateCurrency: "UF", capacityHoursPerDay: 8 }],
      ),
    );
    expect(preview.counts).toEqual({
      tasks: 3,
      dependencies: 1,
      resources: 2,
      assignments: 3,
      errors: 0,
      warnings: 2,
    });
    expect(preview.issues.map((i) => i.message)).toEqual([
      "La tarea 1 es un resumen: su avance se calcula desde las subtareas y se ignora",
      'El recurso "Beto" no está declarado: se creará como persona con tarifa 0',
    ]);
  });
});
