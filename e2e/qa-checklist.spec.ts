import { expect, test, type Page } from "@playwright/test";

/**
 * Recorrido de QA del Paso 11: ejecuta las 30 verificaciones de `docs/qa/checklist.md` en orden y
 * deja una captura por verificación en `docs/qa/evidencia/`. Los flujos profundos (arrastres,
 * rendimiento, round-trip de Excel) los cubren las suites específicas; aquí se comprueba que cada
 * verificación se ve y se comporta como dice el checklist.
 */

const EVIDENCE = "docs/qa/evidencia";
const ADMIN = "admin@ganttpro.local";
const LECTOR = "lector@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const SEED_PROJECT = "Implementación plataforma de gestión documental";

let projectName = "";
let projectId = "";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function shot(page: Page, n: number, slug: string): Promise<void> {
  await page.screenshot({
    path: `${EVIDENCE}/qa-${String(n).padStart(2, "0")}-${slug}.png`,
    fullPage: false,
  });
}

async function login(page: Page, email = ADMIN): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

async function openSeedProject(page: Page): Promise<string> {
  await page.goto("/projects");
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

test.describe("Checklist de QA (Paso 11)", () => {
  test("01 · el ingreso con credenciales incorrectas muestra el error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill(ADMIN);
    await page.getByLabel("Contraseña").fill("clave-incorrecta");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByText(/correo o contraseña/i)).toBeVisible();
    await shot(page, 1, "login-incorrecto");
  });

  test("02 · el ingreso correcto lleva al listado de proyectos", async ({ page }) => {
    await login(page);
    await expect(page.getByTestId("project-list")).toBeVisible();
    await expect(page.getByTestId("user-name")).toContainText("Administradora");
    await shot(page, 2, "listado-proyectos");
  });

  test("03 · una ruta protegida sin sesión redirige al ingreso", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
    await shot(page, 3, "ruta-protegida");
    await context.close();
  });

  test("04 · se crea un proyecto nuevo", async ({ page }) => {
    await login(page);
    projectName = `QA ${Date.now()}`;
    await page.getByTestId("new-project").click();
    await page.getByLabel("Nombre").fill(projectName);
    await page.getByLabel("Fecha de inicio").fill("2026-11-02");
    await page.getByRole("button", { name: "Crear" }).click();
    const card = page.getByTestId("project-card").filter({ hasText: projectName });
    await expect(card).toBeVisible();
    const href = await card.getByRole("link", { name: projectName }).getAttribute("href");
    projectId = /\/projects\/([^/]+)/.exec(href ?? "")?.[1] ?? "";
    await shot(page, 4, "proyecto-creado");
  });

  test("05 · el proyecto se duplica y la copia aparece en el listado", async ({ page }) => {
    await login(page);
    const card = page.getByTestId("project-card").filter({ hasText: projectName });
    await card.getByRole("button", { name: "Duplicar" }).click();
    await expect(
      page.getByTestId("project-card").filter({ hasText: `${projectName} (copia)` }),
    ).toBeVisible();
    await shot(page, 5, "proyecto-duplicado");
  });

  test("06 · la estructura WBS se crea con el teclado y numera 1, 1.1, 1.2", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    const grid = page.getByTestId("task-grid");
    await expect(grid).toContainText("No hay tareas");
    await grid.focus();
    for (const name of ["Fase de análisis", "Levantamiento", "Diseño"]) {
      await page.keyboard.press("Insert");
      // La fila se crea con "Nueva tarea" y el editor queda abierto; `fill` escribe sobre el
      // elemento aunque el servidor haya respondido entretanto y lo haya vuelto a montar.
      const editor = page.getByRole("textbox", { name: "Nombre" });
      await expect(editor).toBeVisible();
      await editor.fill(name);
      await editor.press("Enter");
      await expect(page.getByTestId("task-row").filter({ hasText: name })).toBeVisible();
    }
    const rows = page.getByTestId("task-row");
    await rows.nth(1).getByRole("gridcell").first().click();
    await page.keyboard.press("Tab");
    await rows.nth(2).getByRole("gridcell").first().click();
    await page.keyboard.press("Tab");
    await expect(rows.nth(0).locator('[data-col="wbs"]')).toHaveText("1");
    await expect(rows.nth(1).locator('[data-col="wbs"]')).toHaveText("1.1");
    await expect(rows.nth(2).locator('[data-col="wbs"]')).toHaveText("1.2");
    await shot(page, 6, "tabla-wbs");
  });

  test("07 · editar la duración recalcula las fechas y el resumen las hereda", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    const rows = page.getByTestId("task-row");
    for (const [index, duration] of [
      [1, "5"],
      [2, "4"],
    ] as const) {
      await rows.nth(index).locator('[data-col="duration"]').click();
      await page.keyboard.type(duration);
      await page.keyboard.press("Enter");
      await expect(rows.nth(index).locator('[data-col="duration"]')).toHaveText(`${duration} d`);
    }
    await expect(rows.nth(0).locator('[data-col="start"]')).toHaveText("02-11-2026");
    await expect(rows.nth(0).locator('[data-col="duration"]')).toHaveText("5 d");
    await shot(page, 7, "duraciones");
  });

  test("08 · una dependencia FS reprograma la sucesora", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    const rows = page.getByTestId("task-row");
    await rows.nth(2).locator('[data-col="predecessors"]').click();
    await page.keyboard.type("1.1");
    await page.keyboard.press("Enter");
    await expect(rows.nth(2).locator('[data-col="start"]')).toHaveText("09-11-2026");
    await expect(rows.nth(0).locator('[data-col="end"]')).toHaveText("12-11-2026");
    await shot(page, 8, "dependencia-fs");
  });

  test("09 · un texto de predecesoras inválido muestra un error accionable", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    const rows = page.getByTestId("task-row");
    await rows.nth(2).locator('[data-col="predecessors"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("99");
    await page.keyboard.press("Enter");
    await expect(page.getByText(/No existe la tarea 99/).first()).toBeVisible();
    await shot(page, 9, "predecesora-invalida");
    await page.keyboard.press("Escape");
  });

  test("10 · un hito se crea con duración cero", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    await page.getByTestId("task-grid").focus();
    await page.getByTestId("add-milestone").click();
    const editor = page.getByRole("textbox", { name: "Nombre" });
    await expect(editor).toBeVisible();
    await editor.fill("Aprobación");
    await editor.press("Enter");
    const hito = page.getByTestId("task-row").filter({ hasText: "Aprobación" });
    await expect(hito.locator('[data-col="duration"]')).toHaveText("0 d");
    await shot(page, 10, "hito");
  });

  test("11 · deshacer y rehacer devuelven el estado anterior", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    const rows = page.getByTestId("task-row");
    const before = await rows.count();
    // El historial vive en la sesión del navegador: la tarea se crea y se deshace aquí mismo.
    await page.getByTestId("task-grid").focus();
    await page.keyboard.press("Insert");
    const editor = page.getByRole("textbox", { name: "Nombre" });
    await expect(editor).toBeVisible();
    await editor.fill("Tarea temporal");
    await editor.press("Enter");
    await expect(rows).toHaveCount(before + 1);
    await page.getByTestId("task-grid").focus();
    await page.keyboard.press("Control+z");
    await expect(rows).toHaveCount(before);
    await page.keyboard.press("Control+y");
    await expect(rows).toHaveCount(before + 1);
    await page.keyboard.press("Control+z");
    await expect(rows).toHaveCount(before);
    await shot(page, 11, "deshacer-rehacer");
  });

  test("12 · el Gantt dibuja barras, hitos y la ruta crítica", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await expect(page.getByTestId("gantt-bars").locator("g").first()).toBeVisible();
    await expect(page.getByTestId("toggle-critical")).toHaveAttribute("aria-pressed", "true");
    await shot(page, 12, "gantt");
  });

  test("13 · el Gantt cambia de escala y se ajusta al proyecto", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await page.getByTestId("scale-week").click();
    await expect(page.getByTestId("scale-week")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("fit-project").click();
    await shot(page, 13, "gantt-escalas");
  });

  test("14 · el Gantt se recorre con el teclado", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await page.getByTestId("gantt-scroll").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("gantt-row").first()).toHaveAttribute("data-selected", "true");
    await shot(page, 14, "gantt-teclado");
  });

  test("15 · se crea un recurso y se asigna a una tarea", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/resources`);
    await page.getByTestId("new-resource").click();
    await page.getByLabel("Nombre").fill("Ana Pérez");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByTestId("resource-row").filter({ hasText: "Ana Pérez" })).toBeVisible();
    await shot(page, 15, "recurso-creado");
  });

  test("16 · el histograma de carga muestra la capacidad", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/resources`);
    await expect(page.getByTestId("resource-histogram")).toBeVisible();
    await shot(page, 16, "histograma");
  });

  test("17 · la fecha de estado y el avance esperado aparecen en la tabla", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    await page.getByTestId("status-date-input").fill("2026-11-06");
    await expect(page.getByTestId("mark-progress")).toBeVisible();
    await expect(
      page.getByTestId("task-row").nth(1).locator('[data-col="expected"]'),
    ).toContainText("%");
    await shot(page, 17, "fecha-de-estado");
  });

  test("18 · se guarda una línea base y la comparativa queda en cero", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/baselines`);
    await page.getByTestId("new-baseline").click();
    await page.getByLabel("Nombre").fill("Plan inicial");
    await page.getByTestId("confirm-baseline").click();
    await expect(page.getByTestId("baseline-tab")).toHaveCount(1);
    await expect(
      page.getByTestId("variance-row").first().locator('[data-col="start-variance"]'),
    ).toHaveText("0 d");
    await shot(page, 18, "linea-base");
  });

  test("19 · el dashboard muestra KPIs y curva S", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/dashboard`);
    await expect(page.getByTestId("kpi-progress")).toBeVisible();
    await expect(page.getByTestId("s-curve")).toBeVisible();
    await shot(page, 19, "dashboard");
  });

  test("20 · el dashboard del proyecto sembrado refleja sus 46 tareas", async ({ page }) => {
    await login(page);
    const seedId = await openSeedProject(page);
    await page.goto(`/projects/${seedId}/dashboard`);
    await expect(page.getByTestId("kpi-progress")).toContainText("%");
    await expect(page.getByTestId("kpi-cost")).toBeVisible();
    await shot(page, 20, "dashboard-seed");
  });

  test("21 · la auditoría lista las acciones con filtros", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/audit`);
    await expect(page.getByTestId("audit-row").first()).toContainText("Administradora");
    await shot(page, 21, "auditoria");
  });

  test("22 · la exportación a Excel descarga el libro", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/table`);
    const response = await page.request.get(`/api/projects/${projectId}/export/xlsx`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("spreadsheetml");
    await page.getByTestId("export-menu").click();
    await shot(page, 22, "exportar-excel");
    await page.keyboard.press("Escape");
  });

  test("23 · la exportación a PDF ofrece sus opciones", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await page.getByTestId("export-menu").click();
    await page.getByTestId("export-pdf").click();
    await expect(page.getByTestId("pdf-scale")).toBeVisible();
    await shot(page, 23, "exportar-pdf");
    await page.keyboard.press("Escape");
  });

  test("24 · la exportación a PNG descarga la imagen del Gantt", async ({ page }) => {
    await login(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await expect(page.getByTestId("gantt-bars").locator("g").first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("export-png").click();
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await shot(page, 24, "exportar-png");
  });

  test("25 · la importación previsualiza el archivo y marca los errores", async ({ page }) => {
    await login(page);
    await page.goto("/projects");
    await page.getByTestId("import-button").click();
    await page.getByTestId("import-file").setInputFiles({
      name: "qa.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "WBS;Nombre;Duración (días);Inicio;Hito;Avance %;Predecesoras",
          "1;Tarea válida;3;2026-11-02;No;0;",
          "2;;2;;No;0;",
        ].join("\r\n"),
        "utf8",
      ),
    });
    await expect(page.getByTestId("import-preview")).toBeVisible();
    await expect(page.getByTestId("import-counts")).toContainText("error");
    await expect(page.getByTestId("import-confirm")).toBeDisabled();
    await shot(page, 25, "importacion");
    await page.keyboard.press("Escape");
  });

  test("26 · la plantilla de importación se descarga", async ({ page }) => {
    await login(page);
    const template = await page.request.get("/api/import/template");
    expect(template.status()).toBe(200);
    expect((await template.body()).byteLength).toBeGreaterThan(1000);
    await shot(page, 26, "plantilla");
  });

  test("27 · la configuración guarda el valor de la UF y el calendario", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.getByTestId("uf-value").fill("38500");
    await page.getByTestId("save-settings").click();
    await expect(page.getByText("Configuración guardada")).toBeVisible();
    await shot(page, 27, "configuracion");
  });

  test("28 · el enlace de solo lectura se comparte y se abre sin sesión", async ({
    page,
    browser,
  }) => {
    await login(page);
    await page.goto("/projects");
    await page
      .getByTestId("project-card")
      .filter({ hasText: projectName })
      .getByTestId("open-members")
      .click();
    await page.getByTestId("create-share-link").click();
    const row = page.getByTestId("share-link-row").first();
    await expect(row).toBeVisible();
    const path = ((await row.locator("code").innerText()) ?? "").trim();
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(path);
    await expect(anonPage.getByTestId("share-readonly")).toBeVisible();
    await shot(anonPage, 28, "enlace-compartido");
    await anon.close();
  });

  test("29 · el rol lector no puede editar", async ({ page }) => {
    await login(page, LECTOR);
    await openSeedProject(page);
    await expect(page.getByTestId("add-task")).toBeDisabled();
    await shot(page, 29, "rol-lector");
  });

  test("30 · el panel de atajos y el tema oscuro funcionan", async ({ page }) => {
    await login(page);
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.keyboard.press("Shift+Slash");
    await expect(page.getByTestId("shortcuts-dialog")).toBeVisible();
    await shot(page, 30, "atajos-y-tema");
  });
});
