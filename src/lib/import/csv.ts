import { mapHeaders } from "./columns";
import { rowsToPlan, type RawRow } from "./rows";
import type { ImportPreview } from "./types";

/** Resultado del parser CSV: encabezados y filas de texto. */
export interface CsvTable {
  header: string[];
  rows: string[][];
  delimiter: string;
}

const DELIMITERS = [";", ",", "\t"] as const;

/** Elige el delimitador que más columnas produce en la primera línea (fuera de comillas). */
function detectDelimiter(firstLine: string): string {
  let best: string = ";";
  let bestCount = -1;
  for (const d of DELIMITERS) {
    const count = splitLine(firstLine, d).length;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Parser CSV sin dependencias: detecta `;`, `,` o tabulador, respeta comillas (con `""` como
 * escape y saltos de línea dentro del campo), CRLF y BOM UTF-8.
 */
export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^\uFEFF/, "");
  // Divide en registros respetando comillas.
  const records: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i] as string;
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      records.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current !== "") records.push(current);
  const nonEmpty = records.filter((r) => r.trim() !== "");
  const first = nonEmpty[0];
  if (first === undefined) return { header: [], rows: [], delimiter: ";" };
  const delimiter = detectDelimiter(first);
  const header = splitLine(first, delimiter).map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => splitLine(r, delimiter).map((c) => c.trim()));
  return { header, rows, delimiter };
}

/** CSV → previsualización de importación. */
export function csvToPreview(text: string): ImportPreview {
  const table = parseCsv(text);
  const columns = mapHeaders(table.header);
  const rawRows: RawRow[] = table.rows.map((cells, i) => {
    const row: RawRow = { row: i + 2, cells: {} };
    for (const [index, key] of columns) row.cells[key] = cells[index] ?? "";
    return row;
  });
  const preview = rowsToPlan(rawRows, "csv");
  if (![...columns.values()].includes("name")) {
    preview.issues.unshift({
      row: 1,
      column: "Nombre",
      severity: "error",
      message: `No se encontró la columna "Nombre" en los encabezados (${table.header.join(", ") || "vacíos"})`,
    });
    preview.counts.errors++;
  }
  return preview;
}
