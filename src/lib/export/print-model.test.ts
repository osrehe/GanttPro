import { describe, expect, it } from "vitest";
import {
  PDF_DEFAULT_OPTIONS,
  paginate,
  paperPx,
  parsePdfOptions,
  pdfOptionsToQuery,
  printTableWidth,
} from "./print-model";

describe("paginate", () => {
  const base = {
    rowHeight: 32,
    headerHeight: 48,
    leftWidth: 400,
    pageWidth: 1000,
    pageHeight: 600,
  };

  it("un proyecto pequeño cabe en una sola página", () => {
    const pages = paginate({ ...base, rowCount: 10, axisWidth: 500 });
    expect(pages).toEqual([{ index: 0, rowStart: 0, rowEnd: 10, xFrom: 0, xTo: 500 }]);
  });

  it("muchas filas se reparten en bandas que caben en la altura útil", () => {
    // (600 - 48) / 32 = 17 filas por página → 40 filas = 3 bandas.
    const pages = paginate({ ...base, rowCount: 40, axisWidth: 500 });
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => [p.rowStart, p.rowEnd])).toEqual([
      [0, 17],
      [17, 34],
      [34, 40],
    ]);
  });

  it("un eje ancho se corta en tramos de (ancho de página − tabla)", () => {
    // Tramo útil = 600 px → 1.500 px de eje = 3 tramos.
    const pages = paginate({ ...base, rowCount: 5, axisWidth: 1500 });
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => [p.xFrom, p.xTo])).toEqual([
      [0, 600],
      [600, 1200],
      [1200, 1500],
    ]);
  });

  it("ordena banda por banda y dentro de cada banda de izquierda a derecha", () => {
    const pages = paginate({ ...base, rowCount: 20, axisWidth: 700 });
    expect(pages).toHaveLength(4);
    expect(pages.map((p) => `${p.rowStart}-${p.rowEnd}@${p.xFrom}`)).toEqual([
      "0-17@0",
      "0-17@600",
      "17-20@0",
      "17-20@600",
    ]);
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });

  it("siempre devuelve al menos una página con una fila y ancho positivo", () => {
    const pages = paginate({ ...base, rowCount: 0, axisWidth: 0 });
    expect(pages).toHaveLength(1);
    expect(pages[0]?.rowEnd).toBeGreaterThan(pages[0]?.rowStart ?? 0);
    expect(pages[0]?.xTo).toBeGreaterThan(pages[0]?.xFrom ?? 0);
  });
});

describe("opciones del PDF", () => {
  it("sin parámetros devuelve los valores por defecto", () => {
    expect(parsePdfOptions(new URLSearchParams())).toEqual(PDF_DEFAULT_OPTIONS);
  });

  it("parsea la query string con coerción de booleanos y columnas", () => {
    const options = parsePdfOptions(
      new URLSearchParams(
        "orientation=portrait&size=A3&scale=month&from=2026-09-01&to=2026-12-31&columns=wbs,name,progress&critical=0&legend=false&logo=true&baselineId=bl1&title=Plan%20maestro",
      ),
    );
    expect(options).toEqual({
      orientation: "portrait",
      size: "A3",
      scale: "month",
      from: "2026-09-01",
      to: "2026-12-31",
      columns: ["wbs", "name", "progress"],
      critical: false,
      baselineId: "bl1",
      legend: false,
      logo: true,
      title: "Plan maestro",
    });
  });

  it("pdfOptionsToQuery y parsePdfOptions son inversas", () => {
    const options = {
      ...PDF_DEFAULT_OPTIONS,
      orientation: "portrait" as const,
      from: "2026-10-01",
      to: null,
      columns: ["name", "end", "predecessors"] as const,
      critical: false,
      title: "Informe semanal",
    };
    const query = pdfOptionsToQuery({ ...options, columns: [...options.columns] });
    expect(parsePdfOptions(query)).toEqual({ ...options, columns: [...options.columns] });
  });

  it("rechaza columnas desconocidas, fechas mal formadas y rangos invertidos", () => {
    expect(() => parsePdfOptions(new URLSearchParams("columns=wbs,color"))).toThrow(/Columnas/);
    expect(() => parsePdfOptions(new URLSearchParams("from=07-09-2026"))).toThrow(/YYYY-MM-DD/);
    expect(() => parsePdfOptions(new URLSearchParams("from=2026-10-01&to=2026-09-01"))).toThrow(
      /posterior/,
    );
  });

  it("acepta el objeto plano de searchParams de Next", () => {
    const options = parsePdfOptions({ scale: "day", columns: ["wbs", "name"], critical: "1" });
    expect(options.scale).toBe("day");
    expect(options.columns).toEqual(["wbs", "name"]);
    expect(options.critical).toBe(true);
  });
});

describe("papel", () => {
  it("A4 apaisado es más ancho que alto y descuenta márgenes, cabecera y pie", () => {
    const landscape = paperPx("A4", "landscape");
    const portrait = paperPx("A4", "portrait");
    expect(landscape.width).toBeGreaterThan(landscape.height);
    expect(portrait.height).toBeGreaterThan(portrait.width);
    // 297 mm − 20 mm de márgenes = 277 mm ≈ 1046 px.
    expect(landscape.width).toBe(1046);
  });

  it("suma los anchos de las columnas elegidas", () => {
    expect(printTableWidth(["wbs", "name"])).toBe(224);
  });
});
