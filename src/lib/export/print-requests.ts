/**
 * ¿Puede la página de impresión pedir esta URL? Solo su propio origen, recursos incrustados y las
 * URLs permitidas de forma explícita. Así Chromium no sirve para alcanzar otros hosts de la red
 * interna aunque el contenido de la página cambie.
 */
export function isAllowedPrintRequest(
  requestUrl: string,
  printOrigin: string,
  allowedExternalUrls: readonly string[] = [],
): boolean {
  if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:")) return true;
  if (allowedExternalUrls.includes(requestUrl)) return true;
  try {
    return new URL(requestUrl).origin === printOrigin;
  } catch {
    return false;
  }
}
