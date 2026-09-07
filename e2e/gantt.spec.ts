import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function createProjectWithTasks(page: Page, name: string): Promise<void> {
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
    await expect(page.getByTestId("task-row").filter({ hasText: taskName })).toBeVisible();
    const row = page.getByTestId("task-row").filter({ hasText: taskName });
    await row.locator('[data-col="duration"]').click();
    await page.keyboard.type(duration);
    await page.keyboard.press("Enter");
    await expect(row.locator('[data-col="duration"]')).toHaveText(`${duration} d`);
  }
}

async function center(locator: Locator): Promise<{ x: number; y: number; width: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Elemento sin caja");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width };
}

test.describe("Vista Gantt (UC-24, UC-12, UC-10)", () => {
  test("crear dependencia arrastrando conectores y mover una barra 3 días hábiles", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await login(page);
    await createProjectWithTasks(page, `E2E Gantt ${Date.now()}`);

    await page.getByRole("tab", { name: "Gantt" }).click();
    await expect(page).toHaveURL(/\/gantt$/);
    await expect(page.getByTestId("gantt-svg")).toBeVisible();
    const rows = page.getByTestId("gantt-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("11-09-2026");
    await expect(rows.nth(1).locator('[data-col="start"]')).toHaveText("07-09-2026");

    const idA = (await rows.nth(0).getAttribute("data-task-id")) as string;
    const idB = (await rows.nth(1).getAttribute("data-task-id")) as string;
    const barA = page.locator(
      `[data-testid="gantt-bars"] g[data-task-id="${idA}"] rect[data-handle="move"]`,
    );
    const barB = page.locator(
      `[data-testid="gantt-bars"] g[data-task-id="${idB}"] rect[data-handle="move"]`,
    );

    // 1. Dependencia FS arrastrando desde el conector de fin de A hasta el conector de inicio de B.
    const a = await center(barA);
    await page.mouse.move(a.x, a.y); // muestra los conectores
    const endConnector = page.locator(`circle[data-connector="end"][data-task-id="${idA}"]`);
    const startConnectorB = page.locator(`circle[data-connector="start"][data-task-id="${idB}"]`);
    const from = await center(endConnector);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const bBox = await center(barB);
    await page.mouse.move(bBox.x - bBox.width / 2 + 4, bBox.y, { steps: 8 });
    const to = await center(startConnectorB);
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();

    await expect(page.getByTestId("gantt-arrow")).toHaveCount(1);
    await expect(rows.nth(1).locator('[data-col="predecessors"]')).toHaveText("1");
    await expect(rows.nth(1).locator('[data-col="start"]')).toHaveText("14-09-2026");
    await expect(rows.nth(1).locator('[data-col="end"]')).toHaveText("16-09-2026");

    // 2. Mover A tres días hábiles a la derecha (escala día: 40 px por día → 3 días = 120 px).
    const before = await center(barA);
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + 60, before.y, { steps: 5 });
    await page.mouse.move(before.x + 120, before.y, { steps: 5 });
    await page.mouse.up();

    await expect(rows.nth(0).locator('[data-col="start"]')).toHaveText("10-09-2026");
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("16-09-2026");
    await expect(rows.nth(1).locator('[data-col="start"]')).toHaveText("17-09-2026");
    await expect(rows.nth(1).locator('[data-col="end"]')).toHaveText("22-09-2026");

    // 3. Deshacer vuelve a las fechas previas; la flecha sigue existiendo.
    await page.keyboard.press("Control+z");
    await expect(rows.nth(0).locator('[data-col="start"]')).toHaveText("07-09-2026");
    await expect(rows.nth(1).locator('[data-col="start"]')).toHaveText("14-09-2026");
    await expect(page.getByTestId("gantt-arrow")).toHaveCount(1);

    // 4. Clic en la flecha abre el popover y permite cambiar el tipo a SS.
    // La flecha es una polilínea: el centro de su caja puede no tocar el trazo, así que se dispara el clic directamente.
    await page.locator('[data-testid="gantt-arrow"] path').first().dispatchEvent("click");
    await expect(page.getByTestId("dependency-popover")).toBeVisible();
    await page.getByTestId("dependency-popover").getByLabel("Tipo").click();
    await page.getByRole("option", { name: "SS" }).click();
    await page.getByTestId("dependency-popover").getByRole("button", { name: "Guardar" }).click();
    await expect(rows.nth(1).locator('[data-col="predecessors"]')).toHaveText("1SS");
    await expect(rows.nth(1).locator('[data-col="start"]')).toHaveText("07-09-2026");

    // 5. El zoom y las escalas cambian el ancho de la línea de tiempo sin errores.
    const widthDay = Number(await page.getByTestId("gantt-svg").getAttribute("width"));
    await page.getByTestId("scale-week").click();
    const widthWeek = Number(await page.getByTestId("gantt-svg").getAttribute("width"));
    expect(widthWeek).toBeLessThan(widthDay);
    await page.getByTestId("fit-project").click();
    await expect(page.getByTestId("gantt-header")).toBeVisible();

    expect(errors(), `Errores de consola: ${errors().join("\n")}`).toEqual([]);
  });
});
