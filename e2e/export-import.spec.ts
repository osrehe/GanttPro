import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

/** exceljs declara `Buffer<ArrayBuffer>`; Playwright devuelve `Buffer<ArrayBufferLike>`. */
type ExcelBuffer = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

const ADMIN_EMAIL = "admin@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

function watchConsole(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource"))
      errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return () => errors;
}

const SEED_PROJECT = "Implementación plataforma de gestión documental";

/** Abre el proyecto sembrado (46 tareas) y devuelve su id. */
async function openSeedProject(page: Page): Promise<string> {
  await expect(page.getByTestId("project-list")).toBeVisible();
  const link = page
    .getByTestId("project-card")
    .filter({ hasText: SEED_PROJECT })
    .first()
    .getByRole("link", { name: SEED_PROJECT });
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(/\/table$/);
  return /\/projects\/([^/]+)/.exec(href ?? "")?.[1] ?? "";
}

const CSV = [
  "WBS;Nombre;Duración (días);Inicio;Hito;Avance %;Predecesoras;Recursos;Notas",
  "1;Fase de arranque;;;No;;;;Resumen",
  "1.1;Levantamiento;5;2026-11-02;No;40;;Ana Pérez;",
  "1.2;Diseño;4;;No;0;1.1FS+1d;Ana Pérez;Depende del levantamiento",
  "2;Aprobación;0;;Sí;0;1.2;;",
  "3;Construcción;6;;No;0;2SS;;",
].join("\r\n");

test.describe("Exportación e importación (UC-26, UC-28, UC-29)", () => {
  test("exporta el proyecto sembrado a Excel con las cinco hojas y datos consistentes", async ({
    page,
  }) => {
    await login(page);
    const projectId = await openSeedProject(page);
    const response = await page.request.get(`/api/projects/${projectId}/export/xlsx?gantt=week`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("spreadsheetml");
    expect(response.headers()["content-disposition"]).toContain(".xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await response.body()) as unknown as ExcelBuffer);
    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      "Tareas",
      "Gantt",
      "Recursos",
      "Dependencias",
      "Resumen",
    ]);
    const tasks = workbook.getWorksheet("Tareas")!;
    expect(tasks.rowCount).toBeGreaterThan(20);
    expect(tasks.getRow(1).getCell(1).value).toBe("WBS");
    expect(tasks.getRow(2).getCell(1).value).toBe("1");
    expect(tasks.getRow(2).getCell(4).value).toBeInstanceOf(Date);
    const summary = workbook.getWorksheet("Resumen")!;
    const labels = new Map<string, unknown>();
    summary.eachRow((row) => labels.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(labels.get("Tareas")).toBe(tasks.rowCount - 1);
    expect(labels.get("Generado por")).toBe("GanttPro");
  });

  test("descarga el PNG del Gantt visible desde la barra de herramientas", async ({ page }) => {
    const errors = watchConsole(page);
    await login(page);
    const projectId = await openSeedProject(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await expect(page.getByTestId("gantt-bars").locator("g").first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("export-png").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/-gantt\.png$/);
    const path = await file.path();
    expect(path).toBeTruthy();
    expect(errors(), `Errores de consola: ${errors().join("\n")}`).toEqual([]);
  });

  test("descarga la plantilla, importa un CSV como proyecto nuevo y programa las tareas", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page);

    // La plantilla se descarga desde la API y abre como libro Excel.
    const template = await page.request.get("/api/import/template");
    expect(template.status()).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await template.body()) as unknown as ExcelBuffer);
    expect(workbook.getWorksheet("Tareas")).toBeTruthy();

    const name = `E2E Importación ${Date.now()}`;
    await page.getByTestId("import-button").click();
    await page.getByTestId("import-file").setInputFiles({
      name: "plan.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`﻿${CSV}`, "utf8"),
    });
    await expect(page.getByTestId("import-preview")).toBeVisible();
    await expect(page.getByTestId("import-counts")).toContainText("5 tareas");
    await expect(page.getByTestId("import-counts")).toContainText("3 dependencias");
    await expect(page.getByTestId("import-counts")).toContainText("Sin errores");
    await expect(page.getByTestId("import-task-row")).toHaveCount(5);

    await page.getByTestId("import-mode-new").check();
    await page.getByTestId("import-name").fill(name);
    await page.getByTestId("import-confirm").click();

    await expect(page).toHaveURL(/\/table$/, { timeout: 30_000 });
    await expect(page.getByTestId("project-title")).toHaveText(name);
    const rows = page.getByTestId("task-row");
    await expect(rows).toHaveCount(5);
    // La jerarquía y las dependencias sobreviven: 1.2 empieza tras 1.1 más un día de desfase.
    await expect(rows.nth(0).locator('[data-col="wbs"]')).toHaveText("1");
    await expect(rows.nth(2).locator('[data-col="wbs"]')).toHaveText("1.2");
    await expect(rows.nth(1).locator('[data-col="start"]')).toHaveText("02-11-2026");
    await expect(rows.nth(1).locator('[data-col="end"]')).toHaveText("06-11-2026");
    // FS+1d desde el viernes 06-11: un día hábil de desfase y el siguiente hábil = martes 10-11.
    await expect(rows.nth(2).locator('[data-col="start"]')).toHaveText("10-11-2026");
    await expect(rows.nth(2).locator('[data-col="predecessors"]')).toHaveText("1.1FS+1d");
    await expect(rows.nth(1).locator('[data-col="progress"]')).toHaveText("40 %");

    expect(errors(), `Errores de consola: ${errors().join("\n")}`).toEqual([]);
  });

  test("un CSV con errores muestra el detalle por fila y no permite importar", async ({ page }) => {
    await login(page);
    await page.getByTestId("import-button").click();
    const broken = [
      "WBS;Nombre;Duración (días);Inicio;Hito;Avance %;Predecesoras",
      "1;Tarea válida;3;2026-11-02;No;0;",
      "2;;2;;No;0;",
      "3;Tarea con predecesora inexistente;2;;No;0;9",
    ].join("\r\n");
    await page.getByTestId("import-file").setInputFiles({
      name: "roto.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(broken, "utf8"),
    });
    await expect(page.getByTestId("import-preview")).toBeVisible();
    const issues = page.getByTestId("import-issue").filter({ has: page.locator("svg") });
    await expect(issues.first()).toBeVisible();
    await expect(page.getByTestId("import-counts")).toContainText("errores");
    await expect(page.getByTestId("import-confirm")).toBeDisabled();
  });
});
