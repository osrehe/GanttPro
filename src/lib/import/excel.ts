import ExcelJS from "exceljs";
import { mapHeaders, matchColumn } from "./columns";
import { parseDateCell, rowsToPlan, type CellValue, type RawRow } from "./rows";
import type { ImportedResource, ImportPreview } from "./types";

/** Valor plano de una celda exceljs (fórmulas → resultado, texto enriquecido → texto). */
export function cellValue(cell: ExcelJS.Cell): CellValue {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) {
      const r = v.result;
      if (r instanceof Date || typeof r === "string" || typeof r === "number") return r;
      return null;
    }
    if ("text" in v) return typeof v.text === "string" ? v.text : String(v.text ?? "");
    if ("error" in v) return null;
  }
  return String(v);
}

function rowValues(row: ExcelJS.Row): CellValue[] {
  const out: CellValue[] = [];
  const count = row.cellCount;
  for (let c = 1; c <= count; c++) out.push(cellValue(row.getCell(c)));
  return out;
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  const limit = Math.min(sheet.rowCount, 20);
  for (let r = 1; r <= limit; r++) {
    const values = rowValues(sheet.getRow(r));
    const matches = values.filter((v) => typeof v === "string" && matchColumn(v) !== null).length;
    if (matches >= 2) return r;
  }
  return null;
}

function readResources(sheet: ExcelJS.Worksheet | undefined): ImportedResource[] {
  if (!sheet) return [];
  const out: ImportedResource[] = [];
  const headerRow = 1;
  const headers = rowValues(sheet.getRow(headerRow)).map((v) => String(v ?? "").toLowerCase());
  const col = (names: string[]): number => {
    const i = headers.findIndex((h) => names.some((n) => h.startsWith(n)));
    return i + 1; // 0 = no encontrada
  };
  const nameCol = col(["nombre"]) || 1;
  const typeCol = col(["tipo"]);
  const rateCol = col(["tarifa"]);
  const currencyCol = col(["moneda"]);
  const capacityCol = col(["capacidad"]);
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const name = String(cellValue(row.getCell(nameCol)) ?? "").trim();
    if (name === "") continue;
    const typeText = typeCol ? String(cellValue(row.getCell(typeCol)) ?? "").toLowerCase() : "";
    const type =
      typeText.startsWith("equipo") || typeText.startsWith("team")
        ? "TEAM"
        : typeText.startsWith("material")
          ? "MATERIAL"
          : "PERSON";
    const rate = rateCol ? Number(cellValue(row.getCell(rateCol)) ?? 0) : 0;
    const currencyText = currencyCol
      ? String(cellValue(row.getCell(currencyCol)) ?? "UF").toUpperCase()
      : "UF";
    const capacity = capacityCol ? Number(cellValue(row.getCell(capacityCol)) ?? 8) : 8;
    out.push({
      name,
      type,
      rate: Number.isFinite(rate) && rate >= 0 ? rate : 0,
      rateCurrency: currencyText.startsWith("CLP") ? "CLP" : "UF",
      capacityHoursPerDay:
        Number.isFinite(capacity) && capacity > 0 && capacity <= 24 ? capacity : 8,
    });
  }
  return out;
}

function readSummary(sheet: ExcelJS.Worksheet | undefined): {
  projectName: string | null;
  startDate: string | null;
} {
  let projectName: string | null = null;
  let startDate: string | null = null;
  if (!sheet) return { projectName, startDate };
  for (let r = 1; r <= Math.min(sheet.rowCount, 30); r++) {
    const label = String(cellValue(sheet.getRow(r).getCell(1)) ?? "")
      .trim()
      .toLowerCase();
    const value = cellValue(sheet.getRow(r).getCell(2));
    if (label === "proyecto" && value !== null && value !== undefined && projectName === null) {
      projectName = String(value).trim() || null;
    }
    if ((label === "inicio" || label === "fecha de inicio") && startDate === null) {
      startDate = parseDateCell(value);
    }
  }
  return { projectName, startDate };
}

/**
 * Excel → previsualización. Lee la hoja "Tareas" (o la primera), detecta la fila de encabezados,
 * y opcionalmente las hojas "Recursos" y "Resumen" (Proyecto / Inicio).
 */
export async function excelToPreview(buffer: ArrayBuffer | Buffer): Promise<ImportPreview> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const tasksSheet = workbook.getWorksheet("Tareas") ?? workbook.worksheets[0];
  if (!tasksSheet) {
    return emptyPreview("El archivo no tiene hojas de cálculo");
  }
  const headerRow = findHeaderRow(tasksSheet);
  if (headerRow === null) {
    return emptyPreview(
      'No se encontró la fila de encabezados: se esperaban columnas como "WBS", "Nombre", "Duración (días)"',
    );
  }
  const headers = rowValues(tasksSheet.getRow(headerRow)).map((v) => String(v ?? ""));
  const columns = mapHeaders(headers);
  const rawRows: RawRow[] = [];
  for (let r = headerRow + 1; r <= tasksSheet.rowCount; r++) {
    const values = rowValues(tasksSheet.getRow(r));
    const row: RawRow = { row: r, cells: {} };
    for (const [index, key] of columns) row.cells[key] = values[index] ?? null;
    rawRows.push(row);
  }
  const summary = readSummary(workbook.getWorksheet("Resumen"));
  const preview = rowsToPlan(rawRows, "xlsx", {
    projectName: summary.projectName,
    startDate: summary.startDate,
    resources: readResources(workbook.getWorksheet("Recursos")),
  });
  if (![...columns.values()].includes("name")) {
    preview.issues.unshift({
      row: headerRow,
      column: "Nombre",
      severity: "error",
      message: 'No se encontró la columna "Nombre" en los encabezados',
    });
    preview.counts.errors++;
  }
  return preview;
}

function emptyPreview(message: string): ImportPreview {
  return {
    plan: { source: "xlsx", projectName: null, startDate: null, tasks: [], resources: [] },
    issues: [{ row: null, column: null, severity: "error", message }],
    counts: { tasks: 0, dependencies: 0, resources: 0, assignments: 0, errors: 1, warnings: 0 },
  };
}
