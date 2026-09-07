import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

/** Recoge errores de consola y de página para exigir una consola limpia (UC-23). */
function watchConsole(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // El navegador registra las respuestas 4xx esperadas (p. ej. el 422 de un ciclo) como
    // "Failed to load resource"; no son errores de la aplicación.
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) {
      errors.push(msg.text());
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return () => errors;
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.getByTestId("new-project").click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Fecha de inicio").fill("2026-09-07");
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(page.getByTestId("project-card").filter({ hasText: name })).toBeVisible();
  await page
    .getByTestId("project-card")
    .filter({ hasText: name })
    .getByRole("link", { name })
    .click();
  await expect(page).toHaveURL(/\/table$/);
  await expect(page.getByTestId("project-title")).toHaveText(name);
}

/** Crea una tarea con Insert y escribe su nombre (edición inline del nombre al crear). */
async function addTaskByKeyboard(page: Page, name: string, expectedRows: number): Promise<void> {
  await page.keyboard.press("Insert");
  const editor = page.getByRole("textbox", { name: "Nombre" });
  await expect(editor).toBeVisible();
  await page.keyboard.type(name);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row")).toHaveCount(expectedRows);
  await expect(page.getByTestId("task-row").filter({ hasText: name })).toBeVisible();
}

test.describe("Vista Tabla (UC-05, UC-07, UC-09, UC-23)", () => {
  test("crear proyecto → 3 tareas por teclado → indentar 2 → WBS 1, 1.1, 1.2 con rollup y consola limpia", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page);
    const name = `E2E Tabla ${Date.now()}`;
    await createProject(page, name);

    const grid = page.getByTestId("task-grid");
    await expect(grid).toContainText("No hay tareas");
    await grid.focus();

    await addTaskByKeyboard(page, "Tarea A", 1);
    await addTaskByKeyboard(page, "Tarea B", 2);
    await addTaskByKeyboard(page, "Tarea C", 3);

    const rows = page.getByTestId("task-row");
    await expect(rows.nth(0)).toHaveAttribute("data-wbs", "1");
    await expect(rows.nth(1)).toHaveAttribute("data-wbs", "2");
    await expect(rows.nth(2)).toHaveAttribute("data-wbs", "3");

    // Indentar B con Tab: A pasa a ser resumen.
    await rows.nth(1).getByRole("gridcell").first().click();
    await page.keyboard.press("Tab");
    await expect(rows.nth(1)).toHaveAttribute("data-wbs", "1.1");
    await expect(rows.nth(2)).toHaveAttribute("data-wbs", "2");

    // Indentar C: queda como 1.2.
    await rows.nth(2).getByRole("gridcell").first().click();
    await page.keyboard.press("Tab");
    await expect(rows.nth(0)).toHaveAttribute("data-wbs", "1");
    await expect(rows.nth(1)).toHaveAttribute("data-wbs", "1.1");
    await expect(rows.nth(2)).toHaveAttribute("data-wbs", "1.2");
    await expect(rows.nth(0).getByRole("button", { name: "Colapsar" })).toBeVisible();

    // Cambiar la duración de 1.2 a 3 días escribiendo sobre la celda: el resumen 1 debe extender su fin.
    await rows.nth(2).locator('[data-col="duration"]').click();
    await page.keyboard.type("3");
    await page.keyboard.press("Enter");
    await expect(rows.nth(2).locator('[data-col="duration"]')).toHaveText("3 d");
    await expect(rows.nth(2).locator('[data-col="end"]')).toHaveText("09-09-2026");
    await expect(rows.nth(0).locator('[data-col="start"]')).toHaveText("07-09-2026");
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("09-09-2026");
    await expect(rows.nth(0).locator('[data-col="duration"]')).toHaveText("3 d");
    await expect(rows.nth(1).locator('[data-col="end"]')).toHaveText("07-09-2026");

    // Deshacer con Ctrl+Z restaura la duración y el rollup.
    await grid.focus();
    await page.keyboard.press("Control+z");
    await expect(rows.nth(2).locator('[data-col="duration"]')).toHaveText("1 d");
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("07-09-2026");
    await page.keyboard.press("Control+y");
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("09-09-2026");

    // Las predecesoras se editan como texto: "1.1" crea una dependencia FS y mueve 1.2.
    await rows.nth(2).locator('[data-col="predecessors"]').click();
    await page.keyboard.type("1.1");
    await page.keyboard.press("Enter");
    await expect(rows.nth(2).locator('[data-col="predecessors"]')).toHaveText("1.1");
    await expect(rows.nth(2).locator('[data-col="start"]')).toHaveText("08-09-2026");
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("10-09-2026");

    // Un ciclo se rechaza con el mensaje del engine.
    await rows.nth(1).locator('[data-col="predecessors"]').click();
    await page.keyboard.type("1.2");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/crearía un ciclo/)).toBeVisible();
    await expect(rows.nth(1).locator('[data-col="predecessors"]')).toHaveText("");

    // El panel de detalle abre con Espacio.
    await rows.nth(2).getByRole("gridcell").first().click();
    await page.keyboard.press(" ");
    await expect(page.getByTestId("task-sheet")).toBeVisible();
    await expect(page.getByTestId("task-sheet")).toContainText("1.2 · Tarea C");
    await page.keyboard.press("Escape");

    expect(errors(), `Errores de consola: ${errors().join("\n")}`).toEqual([]);
  });

  test("la página de recursos crea un recurso y aparece en el panel de la tarea", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page);
    const name = `E2E Recursos ${Date.now()}`;
    await createProject(page, name);
    await page.getByRole("tab", { name: "Recursos" }).click();
    await expect(page).toHaveURL(/\/resources$/);
    await page.getByTestId("new-resource").click();
    await page.getByLabel("Nombre").fill("Ana Analista");
    await page.getByLabel("Tarifa por hora").fill("1.5");
    await page.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByTestId("resource-row")).toHaveCount(1);
    await expect(page.getByTestId("resource-row").first()).toContainText("Ana Analista");
    expect(errors()).toEqual([]);
  });
});
