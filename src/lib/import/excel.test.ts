import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { TEMPLATE_COLUMNS, mapHeaders, matchColumn } from "./columns";
import { excelToPreview } from "./excel";
import { buildImportTemplate } from "./template";

describe("columnas de la plantilla", () => {
  it("reconoce encabezados con sinónimos, acentos y mayúsculas", () => {
    expect(matchColumn("DURACIÓN (DÍAS)")).toBe("duration");
    expect(matchColumn("Duracion")).toBe("duration");
    expect(matchColumn("EDT")).toBe("wbs");
    expect(matchColumn("Fecha de inicio")).toBe("start");
    expect(matchColumn("% Avance")).toBe("progress");
    expect(matchColumn("Predecesores")).toBe("predecessors");
    expect(matchColumn("Nombres de los recursos")).toBe("resources");
    expect(matchColumn("Nivel de esquema")).toBe("level");
    expect(matchColumn("Término")).toBe("end");
    expect(matchColumn("Fecha de fin")).toBe("end");
    expect(matchColumn("Columna rara")).toBeNull();
    const map = mapHeaders(["WBS", "Tarea", "Días", "Extra", "Comienzo"]);
    expect([...map.entries()]).toEqual([
      [0, "wbs"],
      [1, "name"],
      [2, "duration"],
      [4, "start"],
    ]);
  });
});

describe("plantilla de importación", () => {
  it("se genera con las hojas y formatos esperados y se reimporta sin errores (round-trip)", async () => {
    const workbook = await buildImportTemplate();
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Tareas", "Recursos", "Instrucciones"]);
    const tasks = workbook.getWorksheet("Tareas") as ExcelJS.Worksheet;
    expect(tasks.getRow(1).values).toEqual([undefined, ...TEMPLATE_COLUMNS.map((c) => c.header)]);
    expect(tasks.views[0]?.state).toBe("frozen");
    expect(tasks.autoFilter).toBeTruthy();
    expect(tasks.getCell("F2").dataValidation.type).toBe("list");
    expect(tasks.getCell("E3").numFmt).toBe("dd-mm-yyyy");
    expect(tasks.getCell("D3").numFmt).toBe("dd-mm-yyyy");

    const buffer = await workbook.xlsx.writeBuffer();
    const preview = await excelToPreview(buffer as ArrayBuffer);
    expect(preview.counts.errors).toBe(0);
    expect(preview.plan.source).toBe("xlsx");
    expect(preview.plan.tasks.map((t) => [t.wbs, t.level, t.name])).toEqual([
      ["1", 1, "Levantamiento"],
      ["1.1", 2, "Entrevistas con usuarios"],
      ["1.2", 2, "Documento de requisitos"],
      ["2", 1, "Diseño"],
      ["2.1", 2, "Diseño aprobado"],
      ["3", 1, "Construcción"],
    ]);
    // Fila 1.1: Duración vacía, Inicio 05-10 y Fin 09-10 → 5 días hábiles.
    expect(preview.plan.tasks[1]).toMatchObject({
      durationDays: 5,
      startDate: "2026-10-05",
      progressPct: 100,
      resources: ["Ana Pérez"],
    });
    expect(preview.plan.tasks[4]).toMatchObject({
      isMilestone: true,
      durationDays: 0,
      predecessors: "1.2FS+1d",
    });
    expect(preview.plan.tasks[5]?.predecessors).toBe("1.2FS+2d; 2.1");
    expect(preview.plan.tasks[5]?.resources).toEqual(["Equipo Desarrollo", "Ana Pérez"]);
    expect(preview.plan.resources).toEqual([
      { name: "Ana Pérez", type: "PERSON", rate: 2.5, rateCurrency: "UF", capacityHoursPerDay: 8 },
      {
        name: "Equipo Desarrollo",
        type: "TEAM",
        rate: 4,
        rateCurrency: "UF",
        capacityHoursPerDay: 8,
      },
    ]);
    expect(preview.counts).toMatchObject({
      tasks: 6,
      dependencies: 4,
      resources: 2,
      assignments: 4,
    });
    // Los recursos están declarados: no hay advertencias por recursos.
    expect(preview.issues.filter((i) => i.column === "Recursos")).toHaveLength(0);
  });
});

describe("excelToPreview", () => {
  it("lee encabezados con sinónimos, fechas Excel, títulos previos, hoja Resumen y columnas extra", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plan");
    sheet.addRow(["Plan de trabajo 2026"]); // título antes de los encabezados
    sheet.addRow([]);
    sheet.addRow(["EDT", "Tarea", "Duracion", "Comienzo", "Predecesores", "Costo (extra)"]);
    sheet.addRow(["1", "Fase", null, null, null, 100]);
    sheet.addRow(["1.1", "Análisis", 4, new Date(Date.UTC(2026, 8, 7)), null, 50]);
    sheet.addRow(["1.2", "Diseño", 2, null, "1.1", 50]);
    sheet.addRow([1.3, "Con WBS numérico", 2, 46272, "1.2SS", 0]);
    const summary = workbook.addWorksheet("Resumen");
    summary.addRow(["Proyecto", "Mi proyecto"]);
    summary.addRow(["Inicio", new Date(Date.UTC(2026, 8, 1))]);

    const preview = await excelToPreview(await workbook.xlsx.writeBuffer());
    expect(preview.counts.errors).toBe(0);
    expect(preview.plan.projectName).toBe("Mi proyecto");
    expect(preview.plan.startDate).toBe("2026-09-01");
    expect(preview.plan.tasks.map((t) => [t.row, t.wbs])).toEqual([
      [4, "1"],
      [5, "1.1"],
      [6, "1.2"],
      [7, "1.3"],
    ]);
    expect(preview.plan.tasks[1]?.startDate).toBe("2026-09-07");
    expect(preview.plan.tasks[3]?.startDate).toBe("2026-09-07");
    expect(preview.plan.tasks[3]?.predecessors).toBe("1.2SS");
  });

  it("informa cuando no encuentra encabezados", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Hoja1").addRow(["a", "b"]);
    const preview = await excelToPreview(await workbook.xlsx.writeBuffer());
    expect(preview.counts.errors).toBe(1);
    expect(preview.issues[0]?.message).toContain("encabezados");
  });
});
