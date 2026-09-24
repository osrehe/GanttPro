/**
 * Comprobaciones de configuración al arrancar el servidor en producción (las invoca
 * `src/instrumentation.ts`). Fallar al inicio es preferible a funcionar con un secreto conocido.
 */

/** Valor de ejemplo de `.env.example`: firma sesiones que cualquiera podría forjar. */
export const EXAMPLE_AUTH_SECRET = "cambia-este-secreto-por-uno-largo-y-aleatorio";

/** Largo mínimo de `AUTH_SECRET` (32 caracteres, como genera `npx auth secret`). */
export const MIN_AUTH_SECRET_LENGTH = 32;

/** Problemas de configuración que impiden arrancar; vacío si todo está bien. */
export function productionConfigProblems(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const problems: string[] = [];
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (secret === "") {
    problems.push("Falta AUTH_SECRET.");
  } else if (secret === EXAMPLE_AUTH_SECRET) {
    problems.push("AUTH_SECRET conserva el valor de ejemplo de .env.example.");
  } else if (secret.length < MIN_AUTH_SECRET_LENGTH) {
    problems.push(`AUTH_SECRET debe tener al menos ${MIN_AUTH_SECRET_LENGTH} caracteres.`);
  }
  return problems;
}

/** Lanza un error con todos los problemas si la configuración de producción no es segura. */
export function assertProductionConfig(env: Readonly<Record<string, string | undefined>>): void {
  const problems = productionConfigProblems(env);
  if (problems.length === 0) return;
  throw new Error(
    `Configuración insegura, el servidor no arranca: ${problems.join(" ")} ` +
      "Genera un secreto con `npx auth secret` o `openssl rand -base64 32`.",
  );
}
