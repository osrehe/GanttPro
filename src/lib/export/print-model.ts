import type { IsoDate, TimeScale } from "@ganttpro/engine";
import { z } from "zod";

/**
 * Modelo puro de la impresión PDF (UC-27): opciones, tamaño de página en píxeles y paginación.
 * Lo comparten el diálogo de exportación (cliente), la ruta `/print/gantt` y el generador PDF.
 */

export type PaperSize = "A4" | "A3" | "Letter";
export type Orientation = "landscape" | "portrait";
export type PrintColumn =
  "wbs" | "name" | "start" | "end" | "duration" | "progress" | "resources" | "predecessors";

export interface PdfOptions {
  orientation: Orientation;
  size: PaperSize;
  scale: TimeScale;
  /** Primer día visible; nulo = rango del proyecto. */
  from: IsoDate | null;
  /** Último día visible; nulo = rango del proyecto. */
  to: IsoDate | null;
  columns: PrintColumn[];
  critical: boolean;
  baselineId: string | null;
  legend: boolean;
  logo: boolean;
  title: string | null;
}

export const PRINT_COLUMNS: readonly PrintColumn[] = [
  "wbs",
  "name",
  "start",
  "end",
  "duration",
  "progress",
  "resources",
  "predecessors",
];

export const PDF_DEFAULT_OPTIONS: PdfOptions = {
  orientation: "landscape",
  size: "A4",
  scale: "week",
  from: null,
  to: null,
  columns: ["wbs", "name", "start", "end", "duration"],
  critical: true,
  baselineId: null,
  legend: true,
  logo: true,
  title: null,
};

export const PRINT_COLUMN_LABELS: Readonly<Record<PrintColumn, string>> = {
  wbs: "WBS",
  name: "Nombre",
  start: "Inicio",
  end: "Fin",
  duration: "Duración",
  progress: "Avance",
  resources: "Recursos",
  predecessors: "Predecesoras",
};

/** Ancho de cada columna de la tabla impresa, en píxeles CSS (96 dpi). */
export const PRINT_COLUMN_WIDTHS: Readonly<Record<PrintColumn, number>> = {
  wbs: 44,
  name: 180,
  start: 72,
  end: 72,
  duration: 52,
  progress: 50,
  resources: 110,
  predecessors: 84,
};

export const PAPER_SIZES: readonly PaperSize[] = ["A4", "A3", "Letter"];
export const PAPER_LABELS: Readonly<Record<PaperSize, string>> = {
  A4: "A4",
  A3: "A3",
  Letter: "Carta",
};

// ------------------------------------------------------------------ Opciones

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const flag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    if (typeof v === "boolean") return v;
    const s = v.trim().toLowerCase();
    if (["1", "true", "si", "sí", "yes"].includes(s)) return true;
    if (["0", "false", "no"].includes(s)) return false;
    ctx.addIssue({ code: "custom", message: `"${v}" no es un valor booleano` });
    return z.NEVER;
  });
const optionalIso = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === "") return null;
    if (!ISO_RE.test(v.trim())) {
      ctx.addIssue({ code: "custom", message: `"${v}" no es una fecha YYYY-MM-DD` });
      return z.NEVER;
    }
    return v.trim();
  });
const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? null : v.trim().slice(0, max)));

/** Esquema de las opciones tal como llegan por query string (todo texto). Rellena los valores por defecto. */
export const pdfOptionsSchema = z
  .object({
    orientation: z.enum(["landscape", "portrait"]).optional(),
    size: z.enum(["A4", "A3", "Letter"]).optional(),
    scale: z.enum(["day", "week", "month", "quarter"]).optional(),
    from: optionalIso,
    to: optionalIso,
    columns: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        const raw = Array.isArray(v) ? v : v.split(",");
        const cols = raw.map((c) => c.trim()).filter((c) => c !== "");
        if (cols.length === 0) return undefined;
        const invalid = cols.filter((c) => !PRINT_COLUMNS.includes(c as PrintColumn));
        if (invalid.length > 0) {
          ctx.addIssue({ code: "custom", message: `Columnas desconocidas: ${invalid.join(", ")}` });
          return z.NEVER;
        }
        return [...new Set(cols)] as PrintColumn[];
      }),
    critical: flag,
    baselineId: optionalText(64),
    legend: flag,
    logo: flag,
    title: optionalText(120),
  })
  .transform((v, ctx): PdfOptions => {
    const options: PdfOptions = {
      orientation: v.orientation ?? PDF_DEFAULT_OPTIONS.orientation,
      size: v.size ?? PDF_DEFAULT_OPTIONS.size,
      scale: v.scale ?? PDF_DEFAULT_OPTIONS.scale,
      from: v.from,
      to: v.to,
      columns: v.columns ?? [...PDF_DEFAULT_OPTIONS.columns],
      critical: v.critical ?? PDF_DEFAULT_OPTIONS.critical,
      baselineId: v.baselineId,
      legend: v.legend ?? PDF_DEFAULT_OPTIONS.legend,
      logo: v.logo ?? PDF_DEFAULT_OPTIONS.logo,
      title: v.title,
    };
    if (options.from && options.to && options.from > options.to) {
      ctx.addIssue({ code: "custom", message: "La fecha 'desde' es posterior a 'hasta'" });
      return z.NEVER;
    }
    return options;
  });

/** Parsea las opciones desde `URLSearchParams` o un objeto plano de `searchParams`. */
export function parsePdfOptions(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): PdfOptions {
  const flat: Record<string, string | undefined> = {};
  if (params instanceof URLSearchParams) {
    for (const [key, value] of params.entries()) flat[key] = value;
  } else {
    for (const [key, value] of Object.entries(params)) {
      flat[key] = Array.isArray(value) ? value.join(",") : value;
    }
  }
  return pdfOptionsSchema.parse(flat);
}

/** Serializa las opciones para la query string (inverso de `parsePdfOptions`). */
export function pdfOptionsToQuery(options: PdfOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set("orientation", options.orientation);
  params.set("size", options.size);
  params.set("scale", options.scale);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  params.set("columns", options.columns.join(","));
  params.set("critical", options.critical ? "1" : "0");
  if (options.baselineId) params.set("baselineId", options.baselineId);
  params.set("legend", options.legend ? "1" : "0");
  params.set("logo", options.logo ? "1" : "0");
  if (options.title) params.set("title", options.title);
  return params;
}

// ------------------------------------------------------------------ Papel

const MM_PER_INCH = 25.4;
const DPI = 96;
export const PAGE_MARGIN_MM = 10;
/** Altura reservada a la cabecera de la página (título, subtítulo) en píxeles. */
export const PRINT_HEADER_PX = 48;
/** Altura reservada al pie (proyecto, leyenda, "Página X de Y") en píxeles. */
export const PRINT_FOOTER_PX = 30;

const PAPER_MM: Readonly<Record<PaperSize, { w: number; h: number }>> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
};

export function mmToPx(mm: number): number {
  return (mm / MM_PER_INCH) * DPI;
}

/** Dimensiones de la hoja en milímetros según orientación. */
export function paperMm(
  size: PaperSize,
  orientation: Orientation,
): { width: number; height: number } {
  const p = PAPER_MM[size];
  return orientation === "landscape" ? { width: p.h, height: p.w } : { width: p.w, height: p.h };
}

/**
 * Área útil de la página en píxeles (96 dpi): hoja menos márgenes de 10 mm por lado y menos la
 * cabecera y el pie que dibuja cada página.
 */
export function paperPx(
  size: PaperSize,
  orientation: Orientation,
): { width: number; height: number } {
  const mm = paperMm(size, orientation);
  return {
    width: Math.floor(mmToPx(mm.width - 2 * PAGE_MARGIN_MM)),
    height: Math.floor(mmToPx(mm.height - 2 * PAGE_MARGIN_MM)) - PRINT_HEADER_PX - PRINT_FOOTER_PX,
  };
}

// ------------------------------------------------------------------ Paginación

export interface PrintPage {
  readonly index: number;
  /** Primera fila (inclusive). */
  readonly rowStart: number;
  /** Última fila (exclusive). */
  readonly rowEnd: number;
  /** Tramo del eje de tiempo en píxeles. */
  readonly xFrom: number;
  readonly xTo: number;
}

export interface PaginateInput {
  rowCount: number;
  rowHeight: number;
  headerHeight: number;
  axisWidth: number;
  leftWidth: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Divide el Gantt en páginas: bandas de filas que caben en `pageHeight` (descontando la cabecera de
 * la línea de tiempo) × tramos del eje que caben en `pageWidth - leftWidth`. Se ordena banda por
 * banda y, dentro de cada banda, de izquierda a derecha; la tabla WBS se repite en cada página.
 */
export function paginate(input: PaginateInput): PrintPage[] {
  const rowsPerPage = Math.max(
    1,
    Math.floor((input.pageHeight - input.headerHeight) / input.rowHeight),
  );
  const sliceWidth = Math.max(40, input.pageWidth - input.leftWidth);
  const rowCount = Math.max(1, input.rowCount);
  const axisWidth = Math.max(1, input.axisWidth);
  const bands = Math.ceil(rowCount / rowsPerPage);
  const slices = Math.ceil(axisWidth / sliceWidth);
  const pages: PrintPage[] = [];
  for (let b = 0; b < bands; b++) {
    const rowStart = b * rowsPerPage;
    const rowEnd = Math.min(rowCount, rowStart + rowsPerPage);
    for (let s = 0; s < slices; s++) {
      const xFrom = s * sliceWidth;
      const xTo = Math.min(axisWidth, xFrom + sliceWidth);
      pages.push({ index: pages.length, rowStart, rowEnd, xFrom, xTo });
    }
  }
  return pages;
}

/** Ancho de la tabla impresa para las columnas elegidas. */
export function printTableWidth(columns: readonly PrintColumn[]): number {
  return columns.reduce((sum, c) => sum + PRINT_COLUMN_WIDTHS[c], 0);
}
