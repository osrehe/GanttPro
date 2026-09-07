import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Pruebas end-to-end. Localmente reutiliza `npm run dev` si ya está corriendo; en CI levanta el
 * build de producción. Requiere la base de datos sembrada (`npm run db:seed`).
 */
export default defineConfig({
  testDir: "./e2e",
  // El test de rendimiento se ejecuta aparte (npm run test:e2e:perf) para que no compita por CPU.
  testIgnore: process.env.E2E_PERF ? undefined : /.perf.spec.ts$/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Local: pocos workers para no saturar el servidor de desarrollo (compila bajo demanda).
  workers: isCI ? 2 : 3,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    locale: "es-CL",
    timezoneId: "America/Santiago",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: isCI ? "npm run start" : "npm run dev",
    url: `${baseURL}/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
