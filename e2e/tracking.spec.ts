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

function watchConsole(page: Page): () => string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource"))
      errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return () => errors;
}

/** Proyecto con A (5 d) y B (3 d, FS de A) creado desde la interfaz. */
async function createProjectAB(page: Page, name: string): Promise<void> {
  await page.getByTestId("new-project").click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Fecha de inicio").fill("2026-09-07");
  await page.getByRole("button", { name: "Crear" }).click();
  await page
    .getByTestId("project-card")
    .filter({ hasText: name })
    .getByRole("link", { name })
    .click();
  await expect(page).toHaveURL(/\/table$/);
  const grid = page.getByTestId("task-grid");
  await expect(grid).toContainText("No hay tareas");
  await grid.focus();
  for (const [taskName, duration] of [
    ["Tarea A", "5"],
    ["Tarea B", "3"],
  ] as const) {
    await page.keyboard.press("Insert");
    await expect(page.getByRole("textbox", { name: "Nombre" })).toBeVisible();
    await page.keyboard.type(taskName);
    await page.keyboard.press("Enter");
    const row = page.getByTestId("task-row").filter({ hasText: taskName });
    await expect(row).toBeVisible();
    await row.locator('[data-col="duration"]').click();
    await page.keyboard.type(duration);
    await page.keyboard.press("Enter");
    await expect(row.locator('[data-col="duration"]')).toHaveText(`${duration} d`);
  }
  const rowB = page.getByTestId("task-row").nth(1);
  await rowB.locator('[data-col="predecessors"]').click();
  await page.keyboard.type("1");
  await page.keyboard.press("Enter");
  await expect(rowB.locator('[data-col="start"]')).toHaveText("14-09-2026");
}

test.describe("Seguimiento, líneas base, dashboard y auditoría (UC-19, UC-21, UC-22, UC-36)", () => {
  // Recorrido largo: crea el proyecto, guarda la línea base y pasa por cinco vistas. Con el
  // servidor de desarrollo compilando bajo demanda no cabe en el minuto que trae por defecto.
  test.describe.configure({ timeout: 150_000 });

  test("guardar baseline → mover 2 tareas → la tabla comparativa muestra +3/+3", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page);
    const name = `E2E Seguimiento ${Date.now()}`;
    await createProjectAB(page, name);

    // Guardar la línea base "Plan inicial".
    await page.getByRole("tab", { name: "Líneas base" }).click();
    await expect(page).toHaveURL(/\/baselines$/);
    await page.getByTestId("new-baseline").click();
    await page.getByLabel("Nombre").fill("Plan inicial");
    await page.getByTestId("confirm-baseline").click();
    await expect(page.getByTestId("baseline-tab")).toHaveCount(1);
    const rows = page.getByTestId("variance-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('[data-col="start-variance"]')).toHaveText("0 d");

    // Mover A al 10-09 desde la tabla: B se reprograma (17-09 – 22-09).
    await page.getByRole("tab", { name: "Tabla" }).click();
    const rowA = page.getByTestId("task-row").nth(0);
    await rowA.locator('[data-col="start"]').dblclick();
    const startEditor = page.getByRole("textbox", { name: "Inicio" });
    await expect(startEditor).toBeVisible();
    await startEditor.fill("2026-09-10");
    await page.keyboard.press("Enter");
    await expect(rowA.locator('[data-col="start"]')).toHaveText("10-09-2026");
    await expect(page.getByTestId("task-row").nth(1).locator('[data-col="end"]')).toHaveText(
      "22-09-2026",
    );

    // Avance de A al 40 % para la variación de avance.
    await rowA.locator('[data-col="progress"]').click();
    await page.keyboard.type("40");
    await page.keyboard.press("Enter");
    await expect(rowA.locator('[data-col="progress"]')).toHaveText("40 %");

    // Comparativa: A y B con +3 días hábiles de inicio y fin; A con +40 % de avance.
    await page.getByRole("tab", { name: "Líneas base" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('[data-col="start-variance"]')).toHaveText("+3 d");
    await expect(rows.nth(0).locator('[data-col="end-variance"]')).toHaveText("+3 d");
    await expect(rows.nth(0).locator('[data-col="progress-variance"]')).toHaveText("+40 %");
    await expect(rows.nth(1).locator('[data-col="start-variance"]')).toHaveText("+3 d");
    await expect(rows.nth(1).locator('[data-col="end-variance"]')).toHaveText("+3 d");

    // Dashboard: fecha de estado 15-09-2026 → A esperada 100 % (atrasada), B 0 %.
    await page.getByRole("tab", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByTestId("status-date").fill("2026-09-15");
    await expect(page.getByTestId("kpi-late")).toContainText("1");
    await expect(page.getByTestId("kpi-progress")).toContainText("25 %"); // (5×40 + 3×0) / 8
    await expect(page.getByTestId("kpi-end")).toContainText("22-09-2026");
    await expect(page.getByTestId("s-curve")).toBeVisible();

    // Tabla: A (10-09 – 16-09) lleva 4 de 5 días al 15-09 → esperado 80 %; "Avance a fecha" la sube a 80 %.
    await page.getByRole("tab", { name: "Tabla" }).click();
    await expect(rowA.locator('[data-col="expected"]')).toHaveText("80 %");
    await expect(rowA.getByTestId("late-indicator")).toBeVisible();
    await rowA.getByRole("gridcell").first().click(); // aplica sobre la tarea seleccionada
    await page.getByTestId("mark-progress").click();
    await expect(rowA.locator('[data-col="progress"]')).toHaveText("80 %");
    await expect(rowA.getByTestId("late-indicator")).toHaveCount(0);
    await page.getByTestId("task-grid").focus();
    await page.keyboard.press("Control+z");
    await expect(rowA.locator('[data-col="progress"]')).toHaveText("40 %");

    // Auditoría: el historial muestra las acciones del administrador.
    await page.getByRole("tab", { name: "Auditoría" }).click();
    await expect(page).toHaveURL(/\/audit$/);
    const audit = page.getByTestId("audit-row");
    await expect(audit.first()).toContainText("Administradora GanttPro");
    await expect(page.getByTestId("audit-table")).toContainText("guardó la línea base");

    expect(errors(), `Errores de consola: ${errors().join("\n")}`).toEqual([]);
  });
});
