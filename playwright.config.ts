import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Pruebas end-to-end. Localmente reutiliza `npm run dev` si ya está corriendo; en CI levanta el
 * build de producción. Requiere la base de datos sembrada (`npm run db:seed`).
 */
export default defineConfig({
  testDir: "./e2e",
  // El test de rendimiento y el recorrido de QA se ejecutan aparte (npm run test:e2e:perf y
  // npm run test:e2e:qa): compiten por CPU y el segundo escribe capturas de evidencia.
  testIgnore: [
    ...(process.env.E2E_PERF ? [] : [/.perf.spec.ts$/]),
    ...(process.env.E2E_QA ? [] : [/qa-checklist.spec.ts$/]),
  ],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Pocos workers: el servidor de desarrollo compila bajo demanda y se satura con más.
  workers: 2,
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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      // Firefox cubre los flujos principales; los arrastres finos y las descargas se verifican en
      // Chromium, que es el navegador de referencia del proyecto.
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      // Los arrastres del Gantt dependen de eventos de puntero que Firefox entrega distinto; se
      // verifican en Chromium, que es el navegador de referencia.
      testMatch: ["**/auth.spec.ts", "**/table.spec.ts"],
    },
  ],
  webServer: {
    command: isCI ? "npm run start" : "npm run dev",
    url: `${baseURL}/health`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
