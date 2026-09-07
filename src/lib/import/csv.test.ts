import { describe, expect, it } from "vitest";
import { csvToPreview, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("detecta el delimitador y respeta comillas, escapes y BOM", () => {
    const text =
      '﻿WBS;Nombre;Duración (días);Predecesoras\r\n1;"Tarea; con punto y coma";5;\r\n2;"Dice ""hola""";3;1FS+2d\r\n';
    const table = parseCsv(text);
    expect(table.delimiter).toBe(";");
    expect(table.header).toEqual(["WBS", "Nombre", "Duración (días)", "Predecesoras"]);
    expect(table.rows).toEqual([
      ["1", "Tarea; con punto y coma", "5", ""],
      ["2", 'Dice "hola"', "3", "1FS+2d"],
    ]);
  });

  it("acepta coma y tabulador y salta filas vacías", () => {
    expect(parseCsv("a,b\n1,2\n\n3,4\n").rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
    expect(parseCsv("a\tb\n1\t2").delimiter).toBe("\t");
  });

  it("admite saltos de línea dentro de un campo entre comillas", () => {
    const table = parseCsv('Nombre;Notas\nA;"línea 1\nlínea 2"');
    expect(table.rows).toEqual([["A", "línea 1\nlínea 2"]]);
  });
});

describe("csvToPreview", () => {
  it("construye el plan con jerarquía por WBS y numera las filas del archivo", () => {
    const csv = [
      "WBS;Nombre;Duración (días);Inicio;Hito;Avance %;Predecesoras;Recursos",
      "1;Fase 1;;;;;;",
      "1.1;Análisis;5;07-09-2026;No;40;;Ana",
      '1.2;Diseño;3;;No;0;1.1FS+1d;"Ana; Beto"',
      "2;Entrega;0;;Sí;0;1.2;",
    ].join("\n");
    const preview = csvToPreview(csv);
    expect(preview.counts.errors).toBe(0);
    expect(preview.plan.source).toBe("csv");
    expect(preview.plan.tasks.map((t) => [t.row, t.wbs, t.level])).toEqual([
      [2, "1", 1],
      [3, "1.1", 2],
      [4, "1.2", 2],
      [5, "2", 1],
    ]);
    expect(preview.plan.tasks[1]?.startDate).toBe("2026-09-07");
    expect(preview.plan.tasks[2]?.resources).toEqual(["Ana", "Beto"]);
    expect(preview.plan.tasks[3]?.isMilestone).toBe(true);
    expect(preview.counts).toMatchObject({
      tasks: 4,
      dependencies: 2,
      resources: 2,
      assignments: 3,
    });
    // Recursos sin declarar → advertencia (una por recurso)
    expect(preview.issues.filter((i) => i.severity === "warning")).toHaveLength(2);
  });

  it("sin columna WBS usa Nivel, y sin Nivel todo es de primer nivel", () => {
    const withLevel = csvToPreview("Nivel,Tarea,Duración\n1,A,2\n2,B,3\n2,C,1\n1,D,4");
    expect(withLevel.plan.tasks.map((t) => t.wbs)).toEqual(["1", "1.1", "1.2", "2"]);
    const flat = csvToPreview("Tarea,Duración\nA,2\nB,3");
    expect(flat.plan.tasks.map((t) => t.wbs)).toEqual(["1", "2"]);
  });

  it("reporta la falta de la columna Nombre", () => {
    const preview = csvToPreview("Columna X;Otra\n1;2");
    expect(preview.counts.errors).toBeGreaterThan(0);
    expect(preview.issues[0]?.message).toContain('"Nombre"');
  });
});
