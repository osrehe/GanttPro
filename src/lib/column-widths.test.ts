import { describe, expect, it } from "vitest";
import {
  MAX_COLUMN_WIDTH,
  clampColumnWidth,
  columnVar,
  columnVarName,
  columnVarStyle,
  columnWidthsStorageKey,
  defaultColumnWidths,
  parseColumnWidths,
  serializeColumnWidths,
  totalColumnWidth,
  totalWidthExpression,
  withColumnWidth,
  type ColumnSpec,
} from "./column-widths";

type Key = "wbs" | "name" | "end";

const SPECS: ReadonlyArray<ColumnSpec<Key>> = [
  { key: "wbs", defaultWidth: 80, minWidth: 48 },
  { key: "name", defaultWidth: 300, minWidth: 120 },
  { key: "end", defaultWidth: 128, minWidth: 80 },
];

describe("defaultColumnWidths", () => {
  it("toma el ancho por omisión de cada columna", () => {
    expect(defaultColumnWidths(SPECS)).toEqual({ wbs: 80, name: 300, end: 128 });
  });
});

describe("clampColumnWidth", () => {
  const spec = SPECS[1] as ColumnSpec<Key>;

  it("respeta el mínimo de la columna", () => {
    expect(clampColumnWidth(spec, 10)).toBe(120);
    expect(clampColumnWidth(spec, -400)).toBe(120);
  });

  it("respeta el tope común", () => {
    expect(clampColumnWidth(spec, 5000)).toBe(MAX_COLUMN_WIDTH);
  });

  it("redondea a enteros y descarta valores no numéricos", () => {
    expect(clampColumnWidth(spec, 240.6)).toBe(241);
    expect(clampColumnWidth(spec, Number.NaN)).toBe(spec.defaultWidth);
    expect(clampColumnWidth(spec, Number.POSITIVE_INFINITY)).toBe(spec.defaultWidth);
  });
});

describe("withColumnWidth", () => {
  const widths = defaultColumnWidths(SPECS);

  it("cambia solo la columna indicada", () => {
    expect(withColumnWidth(widths, SPECS, "wbs", 140)).toEqual({ wbs: 140, name: 300, end: 128 });
  });

  it("devuelve el mismo objeto cuando el ancho no cambia", () => {
    expect(withColumnWidth(widths, SPECS, "wbs", 80)).toBe(widths);
    // El mínimo ya está aplicado: seguir arrastrando no genera renders nuevos.
    expect(withColumnWidth({ ...widths, wbs: 48 }, SPECS, "wbs", 10)).toEqual({
      wbs: 48,
      name: 300,
      end: 128,
    });
  });

  it("ignora columnas desconocidas", () => {
    expect(withColumnWidth(widths, SPECS, "otra" as Key, 200)).toBe(widths);
  });
});

describe("parseColumnWidths", () => {
  it("recupera lo guardado y encierra los valores fuera de rango", () => {
    const raw = JSON.stringify({ wbs: 200, name: 10, end: 5000 });
    expect(parseColumnWidths(raw, SPECS)).toEqual({ wbs: 200, name: 120, end: MAX_COLUMN_WIDTH });
  });

  it("cae en los anchos por omisión con datos ausentes o corruptos", () => {
    const defaults = defaultColumnWidths(SPECS);
    expect(parseColumnWidths(null, SPECS)).toEqual(defaults);
    expect(parseColumnWidths("{no es json", SPECS)).toEqual(defaults);
    expect(parseColumnWidths("[1,2,3]", SPECS)).toEqual(defaults);
    expect(parseColumnWidths('"texto"', SPECS)).toEqual(defaults);
    expect(parseColumnWidths(JSON.stringify({ name: "ancha" }), SPECS)).toEqual(defaults);
  });

  it("ignora claves de columnas que ya no existen", () => {
    const raw = JSON.stringify({ wbs: 100, borrada: 999 });
    expect(parseColumnWidths(raw, SPECS)).toEqual({ wbs: 100, name: 300, end: 128 });
  });

  it("hace ida y vuelta con serializeColumnWidths", () => {
    const widths = { wbs: 90, name: 250, end: 100 };
    expect(parseColumnWidths(serializeColumnWidths(widths), SPECS)).toEqual(widths);
  });
});

describe("variables CSS", () => {
  it("arma el nombre y la referencia de cada columna", () => {
    expect(columnVarName("table", "wbs")).toBe("--table-wbs");
    expect(columnVar("table", "wbs")).toBe("var(--table-wbs)");
  });

  it("arma el objeto de estilo en píxeles", () => {
    expect(columnVarStyle("gantt", defaultColumnWidths(SPECS), SPECS)).toEqual({
      "--gantt-wbs": "80px",
      "--gantt-name": "300px",
      "--gantt-end": "128px",
    });
  });

  it("suma los anchos como expresión CSS y como número", () => {
    expect(totalWidthExpression("table", SPECS)).toBe(
      "calc(var(--table-wbs) + var(--table-name) + var(--table-end))",
    );
    expect(totalWidthExpression("table", SPECS, 640)).toBe(
      "calc(var(--table-wbs) + var(--table-name) + var(--table-end) + 640px)",
    );
    expect(totalColumnWidth(defaultColumnWidths(SPECS), SPECS)).toBe(508);
  });
});

describe("columnWidthsStorageKey", () => {
  it("separa las vistas", () => {
    expect(columnWidthsStorageKey("table")).toBe("ganttpro:column-widths:table");
    expect(columnWidthsStorageKey("gantt")).toBe("ganttpro:column-widths:gantt");
  });
});
