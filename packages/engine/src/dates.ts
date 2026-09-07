/**
 * Fechas de planificación en GanttPro.
 *
 * Toda fecha de plan es "date-only": se representa como string ISO `YYYY-MM-DD`
 * y se opera en días enteros, sin horas ni zona horaria. Nunca se usa `new Date()`
 * local para aritmética de plan; internamente se convierte a "epoch day"
 * (días transcurridos desde 1970-01-01) usando `Date.UTC`, que es determinista.
 */

/** Fecha de plan en formato ISO `YYYY-MM-DD`. */
export type IsoDate = string;

/** Día de la semana: 0 = domingo … 6 = sábado (misma convención que `Date#getUTCDay`). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/**
 * Indica si el string tiene forma `YYYY-MM-DD` y corresponde a una fecha real
 * del calendario (rechaza, por ejemplo, `2026-02-30`).
 */
export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

/** Valida y devuelve la fecha; lanza un error descriptivo si no es una fecha ISO válida. */
export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new Error(`Fecha inválida: se esperaba YYYY-MM-DD y se recibió "${value}"`);
  }
  return value;
}

/**
 * Memoización de las conversiones en ambos sentidos. Un proyecto repite las mismas fechas miles de
 * veces durante una reprogramación; parsear el string cada vez dominaba el tiempo de `scheduleProject`.
 * Los mapas se vacían al superar un tamaño acotado para que no crezcan sin límite.
 */
const CACHE_LIMIT = 50_000;
const epochByDate = new Map<string, number>();
const dateByEpoch = new Map<number, IsoDate>();

/** Convierte una fecha ISO a días transcurridos desde 1970-01-01. */
export function toEpochDay(date: IsoDate): number {
  const cached = epochByDate.get(date);
  if (cached !== undefined) return cached;
  assertIsoDate(date);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const epoch = Date.UTC(year, month - 1, day) / MS_PER_DAY;
  if (epochByDate.size >= CACHE_LIMIT) epochByDate.clear();
  epochByDate.set(date, epoch);
  return epoch;
}

/** Convierte días transcurridos desde 1970-01-01 a fecha ISO. */
export function fromEpochDay(epochDay: number): IsoDate {
  const cached = dateByEpoch.get(epochDay);
  if (cached !== undefined) return cached;
  if (!Number.isInteger(epochDay)) {
    throw new Error(`Epoch day inválido: se esperaba un entero y se recibió ${epochDay}`);
  }
  const utc = new Date(epochDay * MS_PER_DAY);
  const year = String(utc.getUTCFullYear()).padStart(4, "0");
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  const iso = `${year}-${month}-${day}`;
  if (dateByEpoch.size >= CACHE_LIMIT) dateByEpoch.clear();
  dateByEpoch.set(epochDay, iso);
  return iso;
}

/** Suma (o resta, si `days` es negativo) días calendario. */
export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) {
    throw new Error(`Cantidad de días inválida: se esperaba un entero y se recibió ${days}`);
  }
  return fromEpochDay(toEpochDay(date) + days);
}

/** Días calendario desde `from` hasta `to` (positivo si `to` es posterior). */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** Día de la semana de una fecha ISO (0 = domingo … 6 = sábado). */
export function dayOfWeek(date: IsoDate): DayOfWeek {
  // 1970-01-01 fue jueves (4). El módulo doble evita resultados negativos.
  return ((((toEpochDay(date) + 4) % 7) + 7) % 7) as DayOfWeek;
}

/** Compara dos fechas ISO: negativo si `a < b`, 0 si iguales, positivo si `a > b`. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** Devuelve la menor de las fechas recibidas. */
export function minIsoDate(first: IsoDate, ...rest: IsoDate[]): IsoDate {
  return rest.reduce((min, d) => (compareIsoDates(d, min) < 0 ? d : min), assertIsoDate(first));
}

/** Devuelve la mayor de las fechas recibidas. */
export function maxIsoDate(first: IsoDate, ...rest: IsoDate[]): IsoDate {
  return rest.reduce((max, d) => (compareIsoDates(d, max) > 0 ? d : max), assertIsoDate(first));
}
