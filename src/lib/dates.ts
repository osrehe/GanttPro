import { assertIsoDate, type IsoDate } from "@ganttpro/engine";

/**
 * Conversión entre las fechas date-only del dominio (`YYYY-MM-DD`) y los `Date` que Prisma usa
 * para columnas `DATE` (medianoche UTC). Nunca se usa la zona horaria local.
 */

/** `Date` a medianoche UTC para escribir en una columna `@db.Date`. */
export function toDbDate(iso: IsoDate): Date {
  return new Date(`${assertIsoDate(iso)}T00:00:00.000Z`);
}

/** Fecha ISO `YYYY-MM-DD` a partir de un `Date` leído de una columna `@db.Date`. */
export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Variante que preserva nulos. */
export function fromDbDateOrNull(date: Date | null | undefined): IsoDate | null {
  return date ? fromDbDate(date) : null;
}

/** Fecha de hoy en formato ISO, calculada en UTC para que sea estable en servidor y cliente. */
export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}

/** Formatea `YYYY-MM-DD` como `dd-mm-yyyy` (formato de la UI en Chile). */
export function formatDateCl(iso: IsoDate | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}
