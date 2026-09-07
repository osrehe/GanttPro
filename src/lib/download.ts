import { ApiClientError } from "./api-client";
import type { ApiErrorBody } from "./api/response";

/** Dispara la descarga de un blob en el navegador con el nombre indicado. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Se libera después para que el navegador alcance a iniciar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Nombre de archivo del encabezado Content-Disposition (`filename*` UTF-8 o `filename`). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // Cae al nombre simple.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

/**
 * Descarga un archivo generado por la API. Si la API responde con la envolvente de error, lanza
 * `ApiClientError` para mostrar el mensaje en español.
 */
export async function downloadFromApi(url: string, fallbackName: string): Promise<string> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiClientError(
      response.status,
      json?.error ?? { code: "INTERNAL", message: `Error ${response.status} al descargar` },
    );
  }
  const blob = await response.blob();
  const filename = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    fallbackName,
  );
  downloadBlob(blob, filename);
  return filename;
}
