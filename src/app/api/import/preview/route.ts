import { requireUser } from "@/lib/api/access";
import { ApiError, handle, ok, readBodyLimited } from "@/lib/api/response";
import { csvToPreview } from "@/lib/import/csv";
import { excelToPreview } from "@/lib/import/excel";
import { mspdiToPreview } from "@/lib/import/mspdi";
import type { ImportPreview } from "@/lib/import/types";
import { inspectZip } from "@/lib/import/zip-guard";

const MAX_BYTES = 10 * 1024 * 1024;
/** Margen para los encabezados del formulario multipart por sobre el tamaño del archivo. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

type Kind = "xlsx" | "csv" | "mspdi";

/** Detecta el tipo por extensión y, si no es concluyente, por el contenido. */
function detectKind(name: string, bytes: Uint8Array): Kind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "xlsx" || ext === "xlsm") return "xlsx";
  if (ext === "xml" || ext === "mspdi") return "mspdi";
  if (ext === "csv" || ext === "txt" || ext === "tsv") return "csv";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx"; // "PK": zip → xlsx
  const head = new TextDecoder().decode(bytes.slice(0, 200)).trim();
  if (head.startsWith("<?xml") || head.startsWith("<Project")) return "mspdi";
  if (ext === "xls") {
    throw new ApiError(
      "VALIDATION",
      "El formato .xls (Excel 97-2003) no es compatible: guarda el archivo como .xlsx",
    );
  }
  return "csv";
}

/**
 * Previsualización de importación: recibe `multipart/form-data` con el campo `file` (.xlsx, .csv o
 * MS Project .xml) y devuelve el plan interpretado con los problemas por fila (UC-28, UC-30).
 */
export const POST = handle(async (request) => {
  await requireUser();
  // El cuerpo se lee con tope antes de interpretarlo: `formData()` lo cargaría entero en memoria.
  const body = await readBodyLimited(request, MAX_BYTES + MULTIPART_OVERHEAD_BYTES).catch(() => {
    throw new ApiError("VALIDATION", "El archivo supera el máximo de 10 MB");
  });
  let form: FormData;
  try {
    form = await new Response(body as BodyInit, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new ApiError("VALIDATION", "Se esperaba un formulario multipart con el campo file");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("VALIDATION", "Adjunta un archivo en el campo file");
  }
  if (file.size === 0) throw new ApiError("VALIDATION", "El archivo está vacío");
  if (file.size > MAX_BYTES) {
    throw new ApiError("VALIDATION", "El archivo supera el máximo de 10 MB");
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const kind = detectKind(file.name, bytes);
  let preview: ImportPreview;
  if (kind === "xlsx") {
    const zip = inspectZip(bytes);
    if (!zip.ok) throw new ApiError("VALIDATION", zip.reason);
    try {
      preview = await excelToPreview(buffer);
    } catch {
      throw new ApiError("VALIDATION", "No se pudo leer el archivo Excel: ¿es un .xlsx válido?");
    }
  } else if (kind === "mspdi") {
    preview = mspdiToPreview(new TextDecoder("utf-8").decode(bytes));
  } else {
    preview = csvToPreview(decodeText(bytes));
  }
  return ok(preview);
});

/** CSV en UTF-8 (con o sin BOM) o, si no es UTF-8 válido, Latin-1 (Excel en Windows). */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
