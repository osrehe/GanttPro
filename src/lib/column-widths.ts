/**
 * Anchos de columna redimensionables con el ratón (vista Tabla y panel del Gantt).
 *
 * La lógica pura vive aquí para poder probarla sin DOM. El arrastre y la persistencia están en
 * `src/hooks/use-column-widths.ts`. Los anchos viajan al CSS como variables (`--col-name`), de modo
 * que el arrastre solo escribe una propiedad en el elemento anfitrión y no vuelve a renderizar
 * React en cada movimiento del puntero, igual que el arrastre de barras del Gantt.
 */

export interface ColumnSpec<K extends string = string> {
  readonly key: K;
  readonly defaultWidth: number;
  readonly minWidth: number;
}

export type ColumnWidths<K extends string> = Readonly<Record<K, number>>;

/** Tope superior común: más allá la columna deja de ser útil y rompe el desplazamiento lateral. */
export const MAX_COLUMN_WIDTH = 900;

/** Prefijo de las claves de `localStorage`; el sufijo identifica la vista. */
export const COLUMN_WIDTHS_STORAGE_PREFIX = "ganttpro:column-widths";

export function columnWidthsStorageKey(view: string): string {
  return `${COLUMN_WIDTHS_STORAGE_PREFIX}:${view}`;
}

export function defaultColumnWidths<K extends string>(
  specs: readonly ColumnSpec<K>[],
): ColumnWidths<K> {
  const widths = {} as Record<K, number>;
  for (const spec of specs) widths[spec.key] = spec.defaultWidth;
  return widths;
}

/** Encierra el ancho entre el mínimo de la columna y `MAX_COLUMN_WIDTH`, redondeado a enteros. */
export function clampColumnWidth<K extends string>(spec: ColumnSpec<K>, width: number): number {
  if (!Number.isFinite(width)) return spec.defaultWidth;
  return Math.round(Math.max(spec.minWidth, Math.min(MAX_COLUMN_WIDTH, width)));
}

/**
 * Devuelve los anchos con `key` ajustada. Si el valor no cambia devuelve el mismo objeto, para que
 * React no vuelva a renderizar cuando el puntero se mueve dentro del mismo píxel.
 */
export function withColumnWidth<K extends string>(
  widths: ColumnWidths<K>,
  specs: readonly ColumnSpec<K>[],
  key: K,
  width: number,
): ColumnWidths<K> {
  const spec = specs.find((s) => s.key === key);
  if (!spec) return widths;
  const next = clampColumnWidth(spec, width);
  if (widths[key] === next) return widths;
  return { ...widths, [key]: next };
}

/** Lee lo guardado en `localStorage`: ignora claves desconocidas y valores inválidos. */
export function parseColumnWidths<K extends string>(
  raw: string | null,
  specs: readonly ColumnSpec<K>[],
): ColumnWidths<K> {
  const widths = { ...defaultColumnWidths(specs) } as Record<K, number>;
  if (!raw) return widths;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return widths;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return widths;
  const record = parsed as Record<string, unknown>;
  for (const spec of specs) {
    const value = record[spec.key];
    if (typeof value === "number" && Number.isFinite(value)) {
      widths[spec.key] = clampColumnWidth(spec, value);
    }
  }
  return widths;
}

export function serializeColumnWidths<K extends string>(widths: ColumnWidths<K>): string {
  return JSON.stringify(widths);
}

/** Nombre de la variable CSS de una columna (`--tabla-name`). */
export function columnVarName(prefix: string, key: string): string {
  return `--${prefix}-${key}`;
}

/** Referencia a la variable CSS de una columna, para usar en `style` (`var(--tabla-name)`). */
export function columnVar(prefix: string, key: string): string {
  return `var(${columnVarName(prefix, key)})`;
}

/** Objeto `style` con una variable CSS por columna, en píxeles. */
export function columnVarStyle<K extends string>(
  prefix: string,
  widths: ColumnWidths<K>,
  specs: readonly ColumnSpec<K>[],
): Record<string, string> {
  const style: Record<string, string> = {};
  for (const spec of specs) {
    style[columnVarName(prefix, spec.key)] = `${widths[spec.key]}px`;
  }
  return style;
}

/**
 * Expresión CSS con la suma de todas las columnas (más `extraPx`). Se usa como ancho del contenedor
 * para que siga al arrastre sin pasar por React.
 */
export function totalWidthExpression<K extends string>(
  prefix: string,
  specs: readonly ColumnSpec<K>[],
  extraPx = 0,
): string {
  const terms = specs.map((s) => columnVar(prefix, s.key));
  if (extraPx !== 0) terms.push(`${extraPx}px`);
  return `calc(${terms.join(" + ")})`;
}

/** Suma numérica de los anchos: la necesitan el ajuste de escala y la exportación PNG. */
export function totalColumnWidth<K extends string>(
  widths: ColumnWidths<K>,
  specs: readonly ColumnSpec<K>[],
): number {
  return specs.reduce((sum, spec) => sum + widths[spec.key], 0);
}
