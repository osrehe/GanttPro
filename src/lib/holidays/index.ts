import type { IsoDate } from "@ganttpro/engine";
import cl2026 from "./cl-2026.json";

export interface HolidayDefinition {
  readonly date: IsoDate;
  readonly name: string;
}

/**
 * Feriados legales de Chile por año, como datos estáticos versionados (ADR: sin llamadas externas
 * en v1). No incluye feriados electorales ni regionales. Para agregar un año, crea `cl-AAAA.json`
 * y regístralo aquí.
 */
const HOLIDAYS_BY_YEAR: Readonly<Record<number, readonly HolidayDefinition[]>> = {
  2026: cl2026 as HolidayDefinition[],
};

/** Años para los que hay feriados cargados. */
export function availableHolidayYears(): number[] {
  return Object.keys(HOLIDAYS_BY_YEAR)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Feriados de Chile del año indicado; lista vacía si el año no está cargado. */
export function chileanHolidays(year: number): readonly HolidayDefinition[] {
  return HOLIDAYS_BY_YEAR[year] ?? [];
}
