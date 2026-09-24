/**
 * Se ejecuta una vez al iniciar el servidor (no durante `next build`). En producción valida la
 * configuración sensible antes de atender peticiones y, si no es segura, termina el proceso: un
 * servidor que responde 500 a todo ocultaría el motivo detrás de una sonda de salud fallida.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { assertProductionConfig } = await import("@/lib/env-check");
  try {
    assertProductionConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
