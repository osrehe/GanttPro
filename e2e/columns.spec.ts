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

async function createProjectWithTask(page: Page, name: string): Promise<void> {
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
  await page.keyboard.press("Insert");
  const editor = page.getByRole("textbox", { name: "Nombre" });
  await expect(editor).toBeVisible();
  await editor.fill("Tarea A");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("task-row").filter({ hasText: "Tarea A" })).toBeVisible();
}

async function widthOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Elemento sin caja");
  return box.width;
}

/** Arrastra el tirador `dx` píxeles con eventos de puntero reales. */
async function dragHandle(page: Page, handle: Locator, dx: number): Promise<void> {
  const box = await handle.boundingBox();
  if (!box) throw new Error("Tirador sin caja");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 10 });
  await page.mouse.up();
}

/** Anchos de columna redimensionables con el ratón en la Tabla y en el Gantt (UC-40). */
test.describe("anchos de columna", () => {
  test("la tabla redimensiona, recuerda y restablece una columna", async ({ page }) => {
    await login(page);
    await createProjectWithTask(page, `E2E Columnas ${Date.now()}`);

    const header = page.getByTestId("task-grid").locator("th").filter({ hasText: "Nombre" });
    const inicial = await widthOf(header);
    expect(inicial).toBeCloseTo(300, -1);

    const handle = page.getByRole("separator", { name: "Redimensionar columna Nombre" });
    await dragHandle(page, handle, 120);
    const ancho = await widthOf(header);
    expect(ancho).toBeGreaterThan(inicial + 100);

    // La celda sigue el ancho del encabezado: la columna completa cambia, no solo el título.
    const celda = page.getByTestId("task-row").first().locator('[data-col="name"]');
    expect(await widthOf(celda)).toBeCloseTo(ancho, 0);

    // El ancho se recuerda en el navegador.
    await page.reload();
    await expect(page.getByTestId("task-row").first()).toBeVisible();
    expect(await widthOf(header)).toBeCloseTo(ancho, 0);

    // Doble clic en el tirador devuelve el ancho por omisión.
    await handle.dblclick();
    expect(await widthOf(header)).toBeCloseTo(300, -1);
  });

  test("la tabla no deja encoger una columna bajo su mínimo", async ({ page }) => {
    await login(page);
    await createProjectWithTask(page, `E2E Columnas mín ${Date.now()}`);

    const header = page.getByTestId("task-grid").locator("th").filter({ hasText: "WBS" });
    const handle = page.getByRole("separator", { name: "Redimensionar columna WBS" });
    await dragHandle(page, handle, -400);
    expect(await widthOf(header)).toBeCloseTo(48, 0);
  });

  test("el panel del Gantt redimensiona sus columnas y crece con ellas", async ({ page }) => {
    await login(page);
    await createProjectWithTask(page, `E2E Columnas Gantt ${Date.now()}`);
    await page.getByRole("tab", { name: "Gantt" }).click();
    await expect(page).toHaveURL(/\/gantt$/);

    const pane = page.getByTestId("gantt-left-pane");
    await expect(pane).toBeVisible();
    const panelInicial = await widthOf(pane);
    expect(panelInicial).toBeCloseTo(440, -1);

    // Una columna del encabezado: el panel crece lo mismo que la columna.
    await dragHandle(
      page,
      page.getByRole("separator", { name: "Redimensionar columna Nombre" }),
      90,
    );
    const panelAncho = await widthOf(pane);
    expect(panelAncho).toBeGreaterThan(panelInicial + 70);
    expect(
      await widthOf(page.locator('[data-testid="gantt-row"] [data-col="name"]').first()),
    ).toBeGreaterThan(200);

    // El borde derecho del panel sigue funcionando como separador.
    await dragHandle(page, page.getByTestId("gantt-pane-resize"), 60);
    expect(await widthOf(pane)).toBeGreaterThan(panelAncho + 40);

    // Y el ancho también se recuerda aquí.
    const final = await widthOf(pane);
    await page.reload();
    await expect(pane).toBeVisible();
    expect(await widthOf(pane)).toBeCloseTo(final, 0);
  });
});
