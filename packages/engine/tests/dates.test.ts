import { describe, expect, it } from "vitest";
import {
  addDays,
  assertIsoDate,
  compareIsoDates,
  dayOfWeek,
  diffDays,
  fromEpochDay,
  isIsoDate,
  maxIsoDate,
  minIsoDate,
  toEpochDay,
} from "../src/dates";

describe("isIsoDate", () => {
  it("acepta fechas válidas con formato YYYY-MM-DD", () => {
    expect(isIsoDate("2026-09-06")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // año bisiesto
    expect(isIsoDate("1970-01-01")).toBe(true);
  });

  it("rechaza formatos incorrectos", () => {
    expect(isIsoDate("06-09-2026")).toBe(false);
    expect(isIsoDate("2026-9-6")).toBe(false);
    expect(isIsoDate("2026-09-06T00:00:00Z")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("rechaza fechas que no existen en el calendario", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false); // no bisiesto
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2026-04-00")).toBe(false);
  });
});

describe("assertIsoDate", () => {
  it("devuelve la misma fecha si es válida", () => {
    expect(assertIsoDate("2026-09-06")).toBe("2026-09-06");
  });

  it("lanza un error descriptivo en español si es inválida", () => {
    expect(() => assertIsoDate("hoy")).toThrow(
      'Fecha inválida: se esperaba YYYY-MM-DD y se recibió "hoy"',
    );
  });
});

describe("toEpochDay / fromEpochDay", () => {
  it("1970-01-01 es el día 0", () => {
    expect(toEpochDay("1970-01-01")).toBe(0);
    expect(fromEpochDay(0)).toBe("1970-01-01");
  });

  it("son inversas entre sí", () => {
    for (const date of ["2000-02-29", "2026-09-06", "2099-12-31", "1969-12-31"]) {
      expect(fromEpochDay(toEpochDay(date))).toBe(date);
    }
  });

  it("maneja fechas anteriores a 1970 con valores negativos", () => {
    expect(toEpochDay("1969-12-31")).toBe(-1);
    expect(fromEpochDay(-1)).toBe("1969-12-31");
  });

  it("fromEpochDay rechaza valores no enteros", () => {
    expect(() => fromEpochDay(1.5)).toThrow("Epoch day inválido");
  });

  it("toEpochDay rechaza fechas inválidas", () => {
    expect(() => toEpochDay("2026-02-30")).toThrow("Fecha inválida");
  });
});

describe("addDays", () => {
  it("suma días calendario cruzando fin de mes y de año", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });

  it("resta días con valores negativos", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("sumar 0 devuelve la misma fecha", () => {
    expect(addDays("2026-09-06", 0)).toBe("2026-09-06");
  });

  it("rechaza cantidades no enteras", () => {
    expect(() => addDays("2026-09-06", 0.5)).toThrow("Cantidad de días inválida");
  });
});

describe("diffDays", () => {
  it("calcula la diferencia con signo", () => {
    expect(diffDays("2026-09-01", "2026-09-06")).toBe(5);
    expect(diffDays("2026-09-06", "2026-09-01")).toBe(-5);
    expect(diffDays("2026-09-06", "2026-09-06")).toBe(0);
  });

  it("cuenta correctamente a través de un año bisiesto", () => {
    expect(diffDays("2024-01-01", "2025-01-01")).toBe(366);
    expect(diffDays("2025-01-01", "2026-01-01")).toBe(365);
  });
});

describe("dayOfWeek", () => {
  it("devuelve el día de la semana con 0 = domingo", () => {
    expect(dayOfWeek("1970-01-01")).toBe(4); // jueves
    expect(dayOfWeek("2026-09-06")).toBe(0); // domingo
    expect(dayOfWeek("2026-09-07")).toBe(1); // lunes
    expect(dayOfWeek("2026-09-12")).toBe(6); // sábado
  });

  it("no devuelve valores negativos para fechas anteriores a 1970", () => {
    expect(dayOfWeek("1969-12-31")).toBe(3); // miércoles
    expect(dayOfWeek("1969-12-28")).toBe(0); // domingo
  });
});

describe("compareIsoDates / minIsoDate / maxIsoDate", () => {
  it("compara fechas", () => {
    expect(compareIsoDates("2026-01-01", "2026-01-02")).toBeLessThan(0);
    expect(compareIsoDates("2026-01-02", "2026-01-01")).toBeGreaterThan(0);
    expect(compareIsoDates("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("obtiene la menor y la mayor de varias fechas", () => {
    expect(minIsoDate("2026-05-10", "2026-01-31", "2026-12-01")).toBe("2026-01-31");
    expect(maxIsoDate("2026-05-10", "2026-01-31", "2026-12-01")).toBe("2026-12-01");
  });

  it("funcionan con una sola fecha", () => {
    expect(minIsoDate("2026-05-10")).toBe("2026-05-10");
    expect(maxIsoDate("2026-05-10")).toBe("2026-05-10");
  });
});
