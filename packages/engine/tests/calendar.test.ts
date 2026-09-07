import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR_DEFINITION, createCalendar } from "../src/calendar";
import { EngineError } from "../src/errors";
import { CL_CALENDAR } from "./helpers";

describe("createCalendar", () => {
  it("normaliza y ordena la definición", () => {
    const cal = createCalendar({
      workingDays: [5, 1, 1, 3],
      hoursPerDay: 6,
      holidays: ["2026-12-25", "2026-01-01"],
    });
    expect(cal.definition.workingDays).toEqual([1, 3, 5]);
    expect(cal.definition.holidays).toEqual(["2026-01-01", "2026-12-25"]);
    expect(cal.hoursPerDay).toBe(6);
  });

  it("rechaza calendarios inválidos con mensajes en español", () => {
    expect(() => createCalendar({ workingDays: [], hoursPerDay: 8, holidays: [] })).toThrow(
      "al menos un día laborable",
    );
    expect(() => createCalendar({ workingDays: [7], hoursPerDay: 8, holidays: [] })).toThrow(
      "Día de la semana inválido",
    );
    expect(() => createCalendar({ workingDays: [1.5], hoursPerDay: 8, holidays: [] })).toThrow(
      EngineError,
    );
    expect(() => createCalendar({ workingDays: [1], hoursPerDay: 0, holidays: [] })).toThrow(
      "horas por día",
    );
    expect(() =>
      createCalendar({ workingDays: [1], hoursPerDay: 8, holidays: ["2026-02-30"] }),
    ).toThrow("Fecha inválida");
  });
});

describe("isWorkingDay", () => {
  it("distingue días de semana, fines de semana y feriados", () => {
    expect(CL_CALENDAR.isWorkingDay("2026-09-07")).toBe(true); // lunes
    expect(CL_CALENDAR.isWorkingDay("2026-09-12")).toBe(false); // sábado
    expect(CL_CALENDAR.isWorkingDay("2026-09-13")).toBe(false); // domingo
    expect(CL_CALENDAR.isWorkingDay("2026-09-18")).toBe(false); // feriado (viernes)
    expect(CL_CALENDAR.isWorkingDay("2026-09-17")).toBe(true);
  });

  it("respeta calendarios con otros días laborables", () => {
    const sabados = createCalendar({ workingDays: [6], hoursPerDay: 4, holidays: [] });
    expect(sabados.isWorkingDay("2026-09-12")).toBe(true);
    expect(sabados.isWorkingDay("2026-09-14")).toBe(false);
  });
});

describe("snapForward / snapBackward", () => {
  it("ajusta al día hábil más cercano en la dirección pedida", () => {
    expect(CL_CALENDAR.snapForward("2026-09-12")).toBe("2026-09-14"); // sábado → lunes
    expect(CL_CALENDAR.snapForward("2026-09-18")).toBe("2026-09-21"); // feriado viernes → lunes
    expect(CL_CALENDAR.snapForward("2026-09-07")).toBe("2026-09-07");
    expect(CL_CALENDAR.snapBackward("2026-09-13")).toBe("2026-09-11"); // domingo → viernes
    expect(CL_CALENDAR.snapBackward("2026-09-18")).toBe("2026-09-17");
    expect(CL_CALENDAR.snapBackward("2026-09-07")).toBe("2026-09-07");
  });
});

describe("addWorkingDays", () => {
  it("cruza fines de semana", () => {
    expect(CL_CALENDAR.addWorkingDays("2026-09-07", 4)).toBe("2026-09-11"); // lun + 4 = vie
    expect(CL_CALENDAR.addWorkingDays("2026-09-07", 5)).toBe("2026-09-14"); // salta el finde
  });

  it("salta feriados", () => {
    // 14, 15, 16, 17, (18 feriado), 21
    expect(CL_CALENDAR.addWorkingDays("2026-09-14", 4)).toBe("2026-09-21");
    expect(CL_CALENDAR.addWorkingDays("2026-09-17", 1)).toBe("2026-09-21");
  });

  it("con 0 días ajusta al siguiente día hábil si parte de uno no hábil", () => {
    expect(CL_CALENDAR.addWorkingDays("2026-09-12", 0)).toBe("2026-09-14");
    expect(CL_CALENDAR.addWorkingDays("2026-09-18", 0)).toBe("2026-09-21");
    expect(CL_CALENDAR.addWorkingDays("2026-09-14", 0)).toBe("2026-09-14");
  });

  it("retrocede con valores negativos, ajustando hacia atrás desde días no hábiles", () => {
    expect(CL_CALENDAR.addWorkingDays("2026-09-14", -1)).toBe("2026-09-11");
    expect(CL_CALENDAR.addWorkingDays("2026-09-21", -1)).toBe("2026-09-17"); // salta el feriado
    expect(CL_CALENDAR.addWorkingDays("2026-09-13", -1)).toBe("2026-09-10"); // dom → vie 11 → jue 10
    expect(CL_CALENDAR.addWorkingDays("2026-09-13", -0)).toBe("2026-09-14"); // -0 es 0 → adelante
  });

  it("es consistente en ida y vuelta para distancias grandes (extiende el índice)", () => {
    const start = "2026-09-07";
    const far = CL_CALENDAR.addWorkingDays(start, 5000);
    expect(CL_CALENDAR.addWorkingDays(far, -5000)).toBe(start);
    expect(CL_CALENDAR.workingDaysBetween(start, far)).toBe(5000);
    const past = CL_CALENDAR.addWorkingDays(start, -3000);
    expect(CL_CALENDAR.addWorkingDays(past, 3000)).toBe(start);
  });

  it("funciona con un calendario recién creado en cualquier dirección", () => {
    const cal = createCalendar(DEFAULT_CALENDAR_DEFINITION);
    expect(cal.addWorkingDays("2030-01-01", -1)).toBe("2029-12-31");
    const cal2 = createCalendar(DEFAULT_CALENDAR_DEFINITION);
    expect(cal2.snapBackward("2030-01-06")).toBe("2030-01-04");
  });

  it("rechaza cantidades no enteras", () => {
    expect(() => CL_CALENDAR.addWorkingDays("2026-09-07", 1.5)).toThrow(EngineError);
  });

  it("maneja calendarios con muy pocos días hábiles extendiendo el índice", () => {
    // Un calendario donde el único día laborable siempre es feriado durante décadas.
    const holidays: string[] = [];
    for (let year = 1990; year <= 2090; year++) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 28; day++) {
          const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          holidays.push(date);
        }
      }
    }
    const cal = createCalendar({ workingDays: [1, 2, 3, 4, 5, 6, 0], hoursPerDay: 8, holidays });
    // Solo los días 29, 30 y 31 son hábiles; hay suficientes en el rango, así que funciona.
    expect(cal.isWorkingDay("2026-09-29")).toBe(true);
    expect(cal.addWorkingDays("2026-09-29", 2)).toBe("2026-10-29");
  });
});

describe("workingDaysBetween / countWorkingDays / workingHoursBetween", () => {
  it("cuenta los días hábiles en (from, to] con signo", () => {
    expect(CL_CALENDAR.workingDaysBetween("2026-09-11", "2026-09-14")).toBe(1); // vie → lun
    expect(CL_CALENDAR.workingDaysBetween("2026-09-07", "2026-09-07")).toBe(0);
    expect(CL_CALENDAR.workingDaysBetween("2026-09-07", "2026-09-21")).toBe(9); // salta finde y feriado
    expect(CL_CALENDAR.workingDaysBetween("2026-09-21", "2026-09-07")).toBe(-9);
    expect(CL_CALENDAR.workingDaysBetween("2026-09-12", "2026-09-13")).toBe(0);
  });

  it("cuenta el intervalo cerrado [from, to]", () => {
    expect(CL_CALENDAR.countWorkingDays("2026-09-07", "2026-09-21")).toBe(10);
    expect(CL_CALENDAR.countWorkingDays("2026-09-07", "2026-09-07")).toBe(1);
    expect(CL_CALENDAR.countWorkingDays("2026-09-12", "2026-09-13")).toBe(0);
    expect(CL_CALENDAR.countWorkingDays("2026-09-12", "2026-09-14")).toBe(1);
    expect(CL_CALENDAR.countWorkingDays("2026-09-14", "2026-09-07")).toBe(0);
  });

  it("convierte a horas con las horas por día del calendario", () => {
    expect(CL_CALENDAR.workingHoursBetween("2026-09-07", "2026-09-11")).toBe(40);
  });
});
