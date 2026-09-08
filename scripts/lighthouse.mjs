/**
 * Mide Lighthouse (Rendimiento y Accesibilidad) sobre la vista Gantt del proyecto sembrado.
 *
 * La página necesita sesión, así que primero inicia sesión con Playwright, toma la cookie de
 * Auth.js y se la pasa a Lighthouse como cabecera. Uso:
 *
 *   npm run build && npm run start   (en otra consola)
 *   npm run lighthouse
 *
 * Variables: E2E_BASE_URL (por defecto http://localhost:3000), SEED_PASSWORD.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const email = "admin@ganttpro.local";
const password = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const SEED_PROJECT = "Implementación plataforma de gestión documental";

/** Inicia sesión en la aplicación y devuelve la cabecera Cookie y la URL del Gantt sembrado. */
async function prepare() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/projects$/, { timeout: 60_000 });
  const href = await page
    .getByTestId("project-card")
    .filter({ hasText: SEED_PROJECT })
    .first()
    .getByRole("link", { name: SEED_PROJECT })
    .getAttribute("href");
  const projectId = /\/projects\/([^/]+)/.exec(href ?? "")?.[1];
  if (!projectId) throw new Error(`No se encontró el proyecto sembrado "${SEED_PROJECT}"`);
  const cookies = await context.cookies();
  await browser.close();
  return {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    url: `${baseUrl}/projects/${projectId}/gantt`,
  };
}

const { cookie, url } = await prepare();
const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
try {
  const result = await lighthouse(
    url,
    {
      port: chrome.port,
      output: ["json", "html"],
      logLevel: "error",
      onlyCategories: ["performance", "accessibility"],
      extraHeaders: { Cookie: cookie },
      formFactor: "desktop",
      screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1 },
      throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
    },
    undefined,
  );
  if (!result) throw new Error("Lighthouse no devolvió resultados");
  const performance = Math.round((result.lhr.categories.performance?.score ?? 0) * 100);
  const accessibility = Math.round((result.lhr.categories.accessibility?.score ?? 0) * 100);
  const [, html] = result.report;
  writeFileSync("docs/qa/lighthouse.html", html);
  console.info(`URL analizada: ${url}`);
  console.info(`Rendimiento:   ${performance}`);
  console.info(`Accesibilidad: ${accessibility}`);
  console.info("Informe completo: docs/qa/lighthouse.html");
  if (performance < 90 || accessibility < 90) {
    console.error("Alguna categoría quedó bajo 90.");
    process.exitCode = 1;
  }
} finally {
  await chrome.kill();
}
