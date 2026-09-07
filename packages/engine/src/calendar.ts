import { assertIsoDate, fromEpochDay, toEpochDay, type IsoDate } from "./dates";
import { EngineError } from "./errors";
import type { CalendarDefinition } from "./types";

/** Días de relleno que se agregan a cada lado al construir o extender el índice. */
const PADDING_DAYS = 400;
/** Intentos de extensión antes de rendirse (protege contra calendarios sin días hábiles útiles). */
const MAX_EXTENSIONS = 12;

/**
 * Calendario laboral con índice precomputado.
 *
 * Mantiene, para un rango contiguo de días, tres estructuras:
 * - `working[i]`: 1 si el día `origin + i` es hábil.
 * - `prefix[i]`: cantidad de días hábiles en `[origin, origin + i]` (acumulado inclusive).
 * - `ordinalToEpoch[k]`: epoch day del k-ésimo día hábil del rango (0-based).
 *
 * Con ellas `addWorkingDays`, `workingDaysBetween` y los "snaps" son O(1). El rango se extiende
 * automáticamente (reconstruyendo el índice) cuando se consulta una fecha fuera de él.
 */
export class WorkingCalendar {
  readonly definition: CalendarDefinition;
  private readonly weekdayWorking: readonly boolean[];
  private readonly holidayEpochs: ReadonlySet<number>;

  private origin = 0;
  private size = 0;
  private working = new Uint8Array(0);
  private prefix = new Int32Array(0);
  private ordinalToEpoch = new Int32Array(0);
  private built = false;

  constructor(definition: CalendarDefinition) {
    validateDefinition(definition);
    const weekdayWorking = [false, false, false, false, false, false, false];
    for (const day of definition.workingDays) weekdayWorking[day] = true;
    this.weekdayWorking = weekdayWorking;
    this.holidayEpochs = new Set(definition.holidays.map((h) => toEpochDay(assertIsoDate(h))));
    this.definition = {
      workingDays: [...new Set(definition.workingDays)].sort((a, b) => a - b),
      hoursPerDay: definition.hoursPerDay,
      holidays: [...new Set(definition.holidays)].sort(),
    };
  }

  /** Horas laborables por día hábil. */
  get hoursPerDay(): number {
    return this.definition.hoursPerDay;
  }

  /** Indica si la fecha es un día hábil (día de la semana laborable y no feriado). */
  isWorkingDay(date: IsoDate): boolean {
    return this.isWorkingEpoch(toEpochDay(date));
  }

  /** Primer día hábil igual o posterior a la fecha. */
  snapForward(date: IsoDate): IsoDate {
    return fromEpochDay(this.epochOfOrdinal(this.ordinalAtOrAfter(toEpochDay(date)), date));
  }

  /** Último día hábil igual o anterior a la fecha. */
  snapBackward(date: IsoDate): IsoDate {
    return fromEpochDay(this.epochOfOrdinal(this.ordinalAtOrBefore(toEpochDay(date)), date));
  }

  /**
   * Avanza (o retrocede, si `days` es negativo) una cantidad de días hábiles.
   *
   * Si la fecha de partida no es hábil, primero se ajusta al día hábil siguiente (para `days >= 0`)
   * o anterior (para `days < 0`). Así, `addWorkingDays(sábado, 0)` devuelve el lunes y
   * `addWorkingDays(lunes, 0)` devuelve el mismo lunes.
   */
  addWorkingDays(date: IsoDate, days: number): IsoDate {
    if (!Number.isInteger(days)) {
      throw new EngineError(
        "INVALID_CALENDAR",
        `Cantidad de días hábiles inválida: se esperaba un entero y se recibió ${days}`,
      );
    }
    const epoch = toEpochDay(date);
    const base = days >= 0 ? this.ordinalAtOrAfter(epoch) : this.ordinalAtOrBefore(epoch);
    return fromEpochDay(this.epochOfOrdinal(base + days, date));
  }

  /**
   * Días hábiles con signo desde `from` hasta `to`: cuenta los días hábiles en `(from, to]`.
   * Negativo si `to` es anterior a `from`. `workingDaysBetween(viernes, lunes)` es 1.
   */
  workingDaysBetween(from: IsoDate, to: IsoDate): number {
    const a = toEpochDay(from);
    const b = toEpochDay(to);
    this.ensure(Math.min(a, b), Math.max(a, b));
    return (this.prefix[b - this.origin] ?? 0) - (this.prefix[a - this.origin] ?? 0);
  }

  /** Cantidad de días hábiles en el intervalo cerrado `[from, to]`; 0 si `to < from`. */
  countWorkingDays(from: IsoDate, to: IsoDate): number {
    const a = toEpochDay(from);
    const b = toEpochDay(to);
    if (b < a) return 0;
    this.ensure(a, b);
    return this.workingDaysBetween(from, to) + (this.working[a - this.origin] ? 1 : 0);
  }

  /** Horas laborables entre dos fechas inclusive. */
  workingHoursBetween(from: IsoDate, to: IsoDate): number {
    return this.countWorkingDays(from, to) * this.definition.hoursPerDay;
  }

  // ---------------------------------------------------------------------------------------------

  private isWorkingEpoch(epoch: number): boolean {
    const weekday = (((epoch + 4) % 7) + 7) % 7;
    return this.weekdayWorking[weekday] === true && !this.holidayEpochs.has(epoch);
  }

  /** Ordinal del primer día hábil en o después de `epoch` (puede ser igual al total del rango). */
  private ordinalAtOrAfter(epoch: number): number {
    this.ensure(epoch, epoch);
    const idx = epoch - this.origin;
    const count = this.prefix[idx] ?? 0;
    return this.working[idx] ? count - 1 : count;
  }

  /** Ordinal del último día hábil en o antes de `epoch` (puede ser -1). */
  private ordinalAtOrBefore(epoch: number): number {
    this.ensure(epoch, epoch);
    return (this.prefix[epoch - this.origin] ?? 0) - 1;
  }

  /**
   * Epoch day del día hábil con el ordinal indicado. Si el ordinal cae fuera del rango indexado,
   * extiende el índice y recalcula a partir de la fecha de referencia.
   */
  private epochOfOrdinal(ordinal: number, reference: IsoDate): number {
    let target = ordinal;
    for (let attempt = 0; attempt < MAX_EXTENSIONS; attempt++) {
      const total = this.ordinalToEpoch.length;
      if (target >= 0 && target < total) return this.ordinalToEpoch[target] as number;
      // Al extender cambia el origen y, con él, los ordinales: se recalcula la distancia relativa.
      const refEpoch = toEpochDay(reference);
      const refOrdinal = this.ordinalAtOrAfter(refEpoch);
      const delta = target - refOrdinal;
      if (target >= total) {
        this.extend(0, this.estimateDays(target - total + 1));
      } else {
        this.extend(this.estimateDays(-target + 1), 0);
      }
      target = this.ordinalAtOrAfter(refEpoch) + delta;
    }
    throw new EngineError(
      "INVALID_CALENDAR",
      "El calendario no tiene suficientes días hábiles en el rango consultado",
    );
  }

  /** Días calendario necesarios para cubrir `workingDays` días hábiles, con holgura. */
  private estimateDays(workingDays: number): number {
    const perWeek = this.definition.workingDays.length;
    return Math.ceil((workingDays * 7) / perWeek) + this.holidayEpochs.size + PADDING_DAYS;
  }

  private extend(before: number, after: number): void {
    this.rebuild(this.origin - before, this.origin + this.size - 1 + after);
  }

  /** Garantiza que `[from, to]` está dentro del rango indexado. */
  private ensure(from: number, to: number): void {
    if (this.built && from >= this.origin && to < this.origin + this.size) return;
    const newOrigin = Math.min(this.built ? this.origin : from, from - PADDING_DAYS);
    const newEnd = Math.max(this.built ? this.origin + this.size - 1 : to, to + PADDING_DAYS);
    this.rebuild(newOrigin, newEnd);
  }

  private rebuild(origin: number, end: number): void {
    const size = end - origin + 1;
    const working = new Uint8Array(size);
    const prefix = new Int32Array(size);
    const ordinals: number[] = [];
    let count = 0;
    for (let i = 0; i < size; i++) {
      const epoch = origin + i;
      if (this.isWorkingEpoch(epoch)) {
        working[i] = 1;
        count++;
        ordinals.push(epoch);
      }
      prefix[i] = count;
    }
    this.origin = origin;
    this.size = size;
    this.working = working;
    this.prefix = prefix;
    this.ordinalToEpoch = Int32Array.from(ordinals);
    this.built = true;
  }
}

function validateDefinition(definition: CalendarDefinition): void {
  const days = definition.workingDays;
  if (days.length === 0) {
    throw new EngineError("INVALID_CALENDAR", "El calendario debe tener al menos un día laborable");
  }
  for (const day of days) {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new EngineError(
        "INVALID_CALENDAR",
        `Día de la semana inválido en el calendario: ${day} (se esperaba 0 a 6)`,
      );
    }
  }
  if (!(definition.hoursPerDay > 0) || !Number.isFinite(definition.hoursPerDay)) {
    throw new EngineError(
      "INVALID_CALENDAR",
      `Las horas por día deben ser mayores que 0 (se recibió ${definition.hoursPerDay})`,
    );
  }
}

/** Crea un calendario laboral a partir de su definición. */
export function createCalendar(definition: CalendarDefinition): WorkingCalendar {
  return new WorkingCalendar(definition);
}

/** Calendario lunes a viernes, 8 horas, sin feriados. Útil como valor por defecto y en tests. */
export const DEFAULT_CALENDAR_DEFINITION: CalendarDefinition = {
  workingDays: [1, 2, 3, 4, 5],
  hoursPerDay: 8,
  holidays: [],
};
