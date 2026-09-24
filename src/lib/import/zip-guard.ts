/**
 * Revisión previa de un archivo ZIP (un .xlsx lo es) antes de entregarlo a exceljs. Lee el
 * directorio central y rechaza archivos cuyo contenido descomprimido declarado sea desmedido
 * (bombas de descompresión) o que tengan demasiadas entradas. No descomprime nada.
 */

/** Tamaño descomprimido total admitido (100 MB: holgado para planes de miles de tareas). */
export const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
/** Entradas admitidas; un libro normal tiene unas decenas. */
export const MAX_ZIP_ENTRIES = 2000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_ENTRY_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
/** El comentario final del ZIP mide a lo más 65 535 bytes. */
const EOCD_MAX_SEARCH = EOCD_MIN_SIZE + 0xffff;
/** Valor de los campos de 32 bits cuando el tamaño real está en la extensión ZIP64. */
const ZIP64_MARKER = 0xffffffff;

export type ZipCheck =
  | { readonly ok: true; readonly entries: number; readonly uncompressedBytes: number }
  | { readonly ok: false; readonly reason: string };

export function inspectZip(bytes: Uint8Array): ZipCheck {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return { ok: false, reason: "El archivo no es un .xlsx válido" };

  const entries = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || directoryOffset === ZIP64_MARKER) {
    return { ok: false, reason: "El archivo Excel es demasiado grande para importarlo" };
  }
  if (entries > MAX_ZIP_ENTRIES) {
    return { ok: false, reason: "El archivo Excel tiene demasiadas partes internas" };
  }

  let offset = directoryOffset;
  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_ENTRY_SIGNATURE) {
      return { ok: false, reason: "El archivo no es un .xlsx válido" };
    }
    const uncompressed = view.getUint32(offset + 24, true);
    if (uncompressed === ZIP64_MARKER) {
      return { ok: false, reason: "El archivo Excel es demasiado grande para importarlo" };
    }
    total += uncompressed;
    if (total > MAX_UNCOMPRESSED_BYTES) {
      return { ok: false, reason: "El contenido del archivo Excel supera el máximo de 100 MB" };
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { ok: true, entries, uncompressedBytes: total };
}

/** Posición del registro de fin de directorio central, buscando desde el final; -1 si no está. */
function findEndOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - EOCD_MIN_SIZE;
  const first = Math.max(0, view.byteLength - EOCD_MAX_SEARCH);
  for (let i = last; i >= first; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}
