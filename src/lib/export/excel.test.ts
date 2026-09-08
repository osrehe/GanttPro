import ExcelJS from "exceljs";
import { createCalendar } from "@ganttpro/engine";
import { describe, expect, it } from "vitest";
import type { ProjectFullDto, TaskDto } from "@/lib/dto";
import { buildProjectWorkbook, exportFileName, ganttColumns } from "./excel";

function task(partial: Partial<TaskDto> & Pick<TaskDto, "id" | "wbsCode" | "name">): TaskDto {
  return {
    projectId: "p1",
    parentId: null,
    orderIndex: 0,
    description: null,
    anchorDate: null,
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    durationDays: 1,
    effortHours: null,
    progressPct: 0,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    color: null,
    isMilestone: false,
    isSummary: false,
    isCritical: false,
    totalFloatDays: 0,
    freeFloatDays: 0,
    notes: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
    updatedById: null,
    ...partial,
  };
}

/** Proyecto pequeño: Fase 1 (1.1 → 1.2 con lag), hito 2 y tarea 3 con recurso. */
function fixture(): ProjectFullDto {
  const tasks: TaskDto[] = [
    task({
      id: "t1",
      wbsCode: "1",
      name: "Fase 1",
      isSummary: true,
      startDate: "2026-09-07",
      endDate: "2026-09-21",
      durationDays: 10,
      progressPct: 25,
    }),
    task({
      id: "t11",
      wbsCode: "1.1",
      name: "Levantamiento",
      parentId: "t1",
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      durationDays: 5,
      progressPct: 40,
      isCritical: true,
      anchorDate: "2026-09-07",
    }),
    task({
      id: "t12",
      wbsCode: "1.2",
      name: "Diseño",
      parentId: "t1",
      orderIndex: 1,
      startDate: "2026-09-15",
      endDate: "2026-09-21",
      durationDays: 4, // 18-09 es feriado
      isCritical: true,
      notes: "Revisar con cliente",
    }),
    task({
      id: "t2",
      wbsCode: "2",
      name: "Aprobación",
      orderIndex: 1,
      isMilestone: true,
      durationDays: 0,
      startDate: "2026-09-21",
      endDate: "2026-09-21",
    }),
    task({
      id: "t3",
      wbsCode: "3",
      name: "Construcción",
      orderIndex: 2,
      startDate: "2026-09-08",
      endDate: "2026-09-09",
      durationDays: 2,
      color: "#16a34a",
    }),
  ];
  return {
    project: {
      id: "p1",
      name: "Proyecto Demo Ñandú",
      description: "Prueba de exportación",
      status: "ACTIVE",
      startDate: "2026-09-07",
      statusDate: "2026-09-10",
      progressWeighting: "DURATION",
      createdById: "u1",
      archivedAt: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    role: "ADMIN",
    calendar: {
      id: "c1",
      projectId: "p1",
      name: "Base",
      isBase: true,
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      holidays: [{ date: "2026-09-18", name: "Fiestas Patrias" }],
    },
    calendars: [],
    tasks,
    dependencies: [
      {
        id: "d1",
        projectId: "p1",
        predecessorId: "t11",
        successorId: "t12",
        type: "FS",
        lagDays: 1,
      },
    ],
    resources: [
      {
        id: "r1",
        projectId: "p1",
        name: "Ana Pérez",
        type: "PERSON",
        email: null,
        rate: 2,
        rateCurrency: "UF",
        capacityHoursPerDay: 8,
        calendarId: null,
        color: null,
        isActive: true,
      },
    ],
    assignments: [{ id: "a1", taskId: "t3", resourceId: "r1", allocationPct: 50 }],
    members: [],
    baselines: [],
  };
}

async function roundTrip(full: ProjectFullDto, gantt: "day" | "week" = "day") {
  const workbook = await buildProjectWorkbook(full, {
    gantt,
    display: { currency: "UF", ufValue: 38000 },
    exportedAt: "2026-09-07",
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer as ArrayBuffer);
  return reloaded;
}

describe("Exportación a Excel (UC-26)", () => {
  it("genera las cinco hojas y la hoja Tareas conserva filas, outline, formatos y filtros", async () => {
    const wb = await roundTrip(fixture());
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "Tareas",
      "Gantt",
      "Recursos",
      "Dependencias",
      "Resumen",
    ]);
    const sheet = wb.getWorksheet("Tareas")!;
    expect(sheet.rowCount).toBe(6);
    const header = sheet.getRow(1);
    expect(header.getCell(1).value).toBe("WBS");
    expect(header.getCell(2).value).toBe("Nombre");
    expect(header.getCell(3).value).toBe("Duración (días)");
    expect(header.getCell(4).value).toBe("Inicio");
    expect(header.getCell(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();

    const fase = sheet.getRow(2);
    expect(fase.getCell(1).value).toBe("1");
    expect(fase.outlineLevel).toBe(0);
    expect(fase.font?.bold).toBe(true);

    const diseno = sheet.getRow(4);
    expect(diseno.getCell(1).value).toBe("1.2");
    expect(diseno.outlineLevel).toBe(1);
    expect(diseno.getCell(4).value).toBeInstanceOf(Date);
    expect((diseno.getCell(4).value as Date).toISOString().slice(0, 10)).toBe("2026-09-15");
    expect(diseno.getCell(4).numFmt).toBe("dd-mm-yyyy");
    expect(diseno.getCell(8).value).toBe("1.1FS+1d");
    expect(diseno.getCell(10).value).toBe("Revisar con cliente");
    expect(diseno.getCell(16).value).toBe("Sí"); // crítica

    const hito = sheet.getRow(5);
    expect(hito.getCell(6).value).toBe("Sí");
    expect(hito.getCell(3).value).toBe(0);

    const construccion = sheet.getRow(6);
    expect(construccion.getCell(7).value).toBe(0);
    expect(construccion.getCell(7).numFmt).toBe('0"%"');
    expect(construccion.getCell(9).value).toBe("Ana Pérez [50%]");
    expect(construccion.getCell(14).value).toBe(8); // 2 d × 8 h × 50 %
    expect(construccion.getCell(15).value).toBe(16); // 8 h × 2 UF
  });

  it("la hoja Gantt tiene una columna por día, sombrea no laborables y marca hitos con ◆", async () => {
    const wb = await roundTrip(fixture());
    const sheet = wb.getWorksheet("Gantt")!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 2 });
    // Rango 07-09 … 21-09 = 15 columnas de tiempo a partir de la C.
    expect(sheet.getCell(1, 3).value).toBe("Septiembre 2026");
    expect(sheet.getCell(2, 3).value).toBe("7");
    expect(sheet.getCell(2, 17).value).toBe("21");
    expect(sheet.getCell(2, 18).value).toBeNull();
    const dayColumn = (iso: string) => 3 + (Number(iso.slice(8, 10)) - 7);
    // Sábado 12-09 sombreado en la fila de Levantamiento (fila 4); 18-09 feriado en Diseño.
    const levantamiento = sheet.getRow(4);
    expect(levantamiento.getCell(dayColumn("2026-09-12")).fill).toMatchObject({
      fgColor: { argb: "FFF3F1FB" },
    });
    // Barra crítica en rojo del 07 al 11.
    expect(levantamiento.getCell(dayColumn("2026-09-09")).fill).toMatchObject({
      fgColor: { argb: "FFE11D48" },
    });
    expect(levantamiento.getCell(dayColumn("2026-09-14")).fill?.type).toBeUndefined();
    // Hito en la columna del 21-09 (fila 6).
    expect(sheet.getRow(6).getCell(dayColumn("2026-09-21")).value).toBe("◆");
    // Color propio de la tarea 3 (fila 7).
    expect(sheet.getRow(7).getCell(dayColumn("2026-09-08")).fill).toMatchObject({
      fgColor: { argb: "FF16A34A" },
    });
  });

  it("por semana agrupa en columnas de lunes a domingo y cambia solo a semana si hay demasiados días", () => {
    const calendar = createCalendar({ workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] });
    const weekly = ganttColumns("2026-09-09", "2026-09-22", "week", calendar);
    expect(weekly.granularity).toBe("week");
    expect(weekly.columns.map((c) => c.from)).toEqual(["2026-09-07", "2026-09-14", "2026-09-21"]);
    expect(weekly.columns[0]?.label).toBe("07-09");
    const daily = ganttColumns("2026-01-01", "2026-01-10", "day", calendar);
    expect(daily.granularity).toBe("day");
    expect(daily.columns).toHaveLength(10);
    const tooLong = ganttColumns("2020-01-01", "2026-01-01", "day", calendar);
    expect(tooLong.granularity).toBe("week");
  });

  it("Recursos, Dependencias y Resumen contienen los datos calculados", async () => {
    const wb = await roundTrip(fixture(), "week");
    const resources = wb.getWorksheet("Recursos")!;
    expect(resources.getRow(2).getCell(1).value).toBe("Ana Pérez");
    expect(resources.getRow(2).getCell(8).value).toBe(1);
    expect(resources.getRow(2).getCell(9).value).toBe(8);
    expect(resources.getRow(2).getCell(10).value).toBe(16);

    const deps = wb.getWorksheet("Dependencias")!;
    expect(deps.rowCount).toBe(2);
    expect(deps.getRow(2).values).toEqual([
      undefined,
      "1.1",
      "Levantamiento",
      "1.2",
      "Diseño",
      "Fin a inicio (FS)",
      1,
    ]);

    const summary = wb.getWorksheet("Resumen")!;
    const byLabel = new Map<string, ExcelJS.CellValue>();
    summary.eachRow((row) => byLabel.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(byLabel.get("Proyecto")).toBe("Proyecto Demo Ñandú");
    expect((byLabel.get("Inicio") as Date).toISOString().slice(0, 10)).toBe("2026-09-07");
    expect((byLabel.get("Fin") as Date).toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(byLabel.get("Tareas")).toBe(5);
    expect(byLabel.get("Hitos")).toBe(1);
    expect(byLabel.get("Duración (días hábiles)")).toBe(10);
    // Avance ponderado por duración de hojas: (5×40 + 4×0 + 2×0) / 11 ≈ 18 %.
    expect(byLabel.get("Avance %")).toBe(18);
    expect(byLabel.get("Costo planificado (UF)")).toBe(16);
    expect(byLabel.get("Generado por")).toBe("GanttPro");
  });

  it("genera nombres de archivo seguros", () => {
    expect(exportFileName("Proyecto Demo Ñandú 2026", "plan", "xlsx")).toBe(
      "proyecto-demo-nandu-2026-plan.xlsx",
    );
    expect(exportFileName("   ", "gantt", "pdf")).toBe("proyecto-gantt.pdf");
  });
});
