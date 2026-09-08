/**
 * Genera las capturas de la documentación en `docs/capturas/` a partir del proyecto de
 * demostración que crea `npm run db:seed` (46 tareas, 6 recursos).
 *
 * No sustituye a la evidencia de QA (`docs/qa/evidencia/`), que registra la ejecución del
 * checklist: estas son las imágenes que ilustran el README.
 *
 * Uso:
 *   npm run dev            (en otra consola; también sirve `npm run start`)
 *   npm run capturas
 *
 * Variables: E2E_BASE_URL (por defecto http://localhost:3000), SEED_PASSWORD.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const password = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const PROYECTO = "Implementación plataforma de gestión documental";
const DESTINO = "docs/capturas";

await mkdir(DESTINO, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 860 } });
const page = await context.newPage();

/** Espera a que las fuentes estén listas para que la captura no salga con la de reserva. */
async function capturar(nombre) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DESTINO}/${nombre}.png` });
  console.info(`  ${DESTINO}/${nombre}.png`);
}

await page.goto("/login");
await page.getByLabel("Correo").fill("admin@ganttpro.local");
await page.getByLabel("Contraseña").fill(password);
await page.getByRole("button", { name: "Ingresar" }).click();
await page.waitForURL(/\/(projects)?$/, { timeout: 60_000 });
await page.goto("/projects");
await page.getByTestId("project-list").waitFor();
await capturar("proyectos");

const href = await page
  .getByTestId("project-card")
  .filter({ hasText: PROYECTO })
  .first()
  .getByRole("link", { name: PROYECTO })
  .getAttribute("href");
const id = /\/projects\/([^/]+)/.exec(href ?? "")?.[1];
if (!id)
  throw new Error(`No se encontró el proyecto sembrado "${PROYECTO}"; corre npm run db:seed`);

await page.goto(`/projects/${id}/table`);
await page.getByTestId("task-row").first().waitFor();
await capturar("tabla-wbs");

await page.goto(`/projects/${id}/gantt`);
await page.getByTestId("gantt-bars").locator("g").first().waitFor();
// Sin el resaltado de ruta crítica se ven los colores del plan, no todo en rojo.
await page.getByTestId("toggle-critical").click();
await page.getByTestId("fit-project").click();
await page.getByTestId("scale-week").click();
await capturar("gantt");

await page.goto(`/projects/${id}/dashboard`);
await page.getByTestId("s-curve").waitFor();
await page.waitForTimeout(1200);
await capturar("dashboard");

await page.goto(`/projects/${id}/resources`);
await page.getByTestId("resource-histogram").waitFor();
await page.waitForTimeout(1200);
await capturar("recursos");

await page.goto("/settings");
await page.getByTestId("global-settings").waitFor();
await capturar("configuracion");

// Una vista en tema oscuro para mostrar los dos temas.
await page.goto(`/projects/${id}/gantt`);
await page.getByTestId("gantt-bars").locator("g").first().waitFor();
await page.getByTestId("theme-toggle").click();
await page.getByTestId("theme-dark").click();
await page.waitForTimeout(600);
await capturar("gantt-oscuro");

await browser.close();
console.info("Capturas actualizadas.");
