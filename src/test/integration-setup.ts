/**
 * Setup de los tests de integración: apunta Prisma a la base de datos de test antes de que se
 * importe el cliente. Carga `.env` si existe (en CI las variables ya vienen en el entorno).
 */
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables del entorno.
}

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    "Falta DATABASE_URL_TEST: los tests de integración necesitan la base de datos ganttpro_test",
  );
}
process.env.DATABASE_URL = testUrl;
process.env.AUTH_SECRET ??= "secreto-de-pruebas-de-integracion";
process.env.AUTH_TRUST_HOST ??= "true";
