import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const ADMIN = { email: "admin@ganttpro.local", name: "Administradora GanttPro" };
const EDITOR = { email: "editor@ganttpro.local", name: "Editor de ejemplo" };
const SEED_PROJECT = "Implementación plataforma de gestión documental";

/** El criterio de aceptación exige ver el cambio ajeno en menos de 3 s (UC-34). */
const PROPAGATION_MS = 3000;

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

/** Abre el proyecto sembrado (admin, editor y lector ya son miembros) y devuelve su id. */
async function openSeedProject(page: Page): Promise<string> {
  await expect(page.getByTestId("project-list")).toBeVisible();
  const link = page
    .getByTestId("project-card")
    .filter({ hasText: SEED_PROJECT })
    .first()
    .getByRole("link", { name: SEED_PROJECT });
  const href = await link.getAttribute("href");
  await link.click();
  await expect(page).toHaveURL(/\/table$/, { timeout: 30_000 });
  await expect(page.getByTestId("task-row").first()).toBeVisible();
  return /\/projects\/([^/]+)/.exec(href ?? "")?.[1] ?? "";
}

// En serie: ambos tests comparten los contextos de `beforeAll`. El tiempo extra es para el
// servidor de desarrollo, que compila cada ruta la primera vez que se visita.
test.describe.configure({ mode: "serial", timeout: 180_000 });

/** La tabla solo dibuja las filas visibles: para ver la última hay que bajar el scroll. */
async function scrollAlFinal(page: Page): Promise<void> {
  await page.getByTestId("task-grid").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
}

test.describe("Colaboración simultánea y comentarios (UC-34, UC-35)", () => {
  let adminContext: BrowserContext;
  let editorContext: BrowserContext;
  let adminPage: Page;
  let editorPage: Page;
  let projectId = "";
  let taskId = "";

  test.beforeAll(async ({ browser }) => {
    // El servidor de desarrollo compila cada ruta la primera vez: el hook necesita margen.
    test.setTimeout(180_000);
    adminContext = await browser.newContext();
    editorContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    editorPage = await editorContext.newPage();
    await Promise.all([login(adminPage, ADMIN.email), login(editorPage, EDITOR.email)]);
    projectId = await openSeedProject(adminPage);
  });

  test.afterAll(async () => {
    // La tarea de prueba se elimina para no ensuciar el proyecto sembrado.
    if (taskId) await adminPage.request.delete(`/api/tasks/${taskId}`);
    await adminContext.close();
    await editorContext.close();
  });

  test("el cambio de una persona llega a la otra en menos de 3 s con aviso, y los comentarios también", async () => {
    const original = `Tarea colaborativa ${Date.now()}`;

    // La administradora crea una tarea al final del proyecto.
    const created = await adminPage.request.post(`/api/projects/${projectId}/tasks`, {
      data: { name: original, durationDays: 2 },
    });
    expect(created.status()).toBe(201);
    const body = (await created.json()) as { data: { task: { id: string } } };
    taskId = body.data.task.id;

    // El editor abre el mismo proyecto: el polling debe traerle la tarea nueva.
    await editorPage.goto(`/projects/${projectId}/table`);
    await editorPage.getByTestId("task-row").first().waitFor();
    await scrollAlFinal(editorPage);
    const editorRow = editorPage.getByTestId("task-row").filter({ hasText: original });
    await expect(editorRow).toHaveCount(1, { timeout: 30_000 });

    // La administradora renombra la tarea desde su propia sesión.
    await adminPage.reload();
    await adminPage.getByTestId("task-row").first().waitFor();
    await scrollAlFinal(adminPage);
    const adminRow = adminPage.getByTestId("task-row").filter({ hasText: original });
    await expect(adminRow).toHaveCount(1, { timeout: 30_000 });
    const renamed = `${original} (renombrada)`;
    await adminRow.locator('[data-col="name"]').click();
    await adminPage.keyboard.press("F2");
    await adminPage.keyboard.press("Control+a");
    await adminPage.keyboard.type(renamed);
    await adminPage.keyboard.press("Enter");
    await expect(adminPage.getByTestId("task-row").filter({ hasText: renamed })).toHaveCount(1);

    // (a) El editor ve el nombre nuevo sin recargar, y recibe el aviso de quién lo cambió.
    const t0 = Date.now();
    await expect(
      editorPage.getByTestId("task-row").filter({ hasText: renamed }).locator('[data-col="name"]'),
    ).toHaveText(renamed, { timeout: PROPAGATION_MS });
    // Se registra el tiempo real: el margen sobre los 3 s del criterio es ajustado (~2,5 s medidos).
    console.log("[colab] propagación del cambio:", Date.now() - t0, "ms");
    await expect(editorPage.getByText(ADMIN.name).first()).toBeVisible({ timeout: PROPAGATION_MS });

    // (b) Un comentario del editor aparece en el panel de la administradora en menos de 3 s.
    const editorRowRenamed = editorPage.getByTestId("task-row").filter({ hasText: renamed });
    await editorRowRenamed.getByRole("gridcell").first().click();
    await editorPage.keyboard.press(" ");
    await expect(editorPage.getByTestId("task-sheet")).toBeVisible();
    await editorPage.getByRole("tab", { name: "Comentarios" }).click();
    await expect(editorPage.getByTestId("comments-panel")).toBeVisible();

    const adminRowRenamed = adminPage.getByTestId("task-row").filter({ hasText: renamed });
    await adminRowRenamed.getByRole("gridcell").first().click();
    await adminPage.keyboard.press(" ");
    await expect(adminPage.getByTestId("task-sheet")).toBeVisible();
    await adminPage.getByRole("tab", { name: "Comentarios" }).click();
    await expect(adminPage.getByTestId("comments-panel")).toBeVisible();

    const comment = `Revisemos esto con @${ADMIN.name}`;
    await editorPage.getByTestId("comment-input").fill(comment);
    await editorPage.getByTestId("comment-submit").click();
    await expect(editorPage.getByTestId("comment-row").filter({ hasText: comment })).toHaveCount(
      1,
      {
        timeout: 10_000,
      },
    );

    await expect(
      adminPage.getByTestId("comment-row").filter({ hasText: comment }).getByTestId("comment-body"),
    ).toContainText(comment, { timeout: PROPAGATION_MS });
    await expect(adminPage.getByTestId("comment-row").filter({ hasText: comment })).toContainText(
      EDITOR.name,
    );
  });

  test("el autocompletado de @menciones ofrece a los miembros del proyecto", async () => {
    await editorPage.getByRole("tab", { name: "Comentarios" }).click();
    const input = editorPage.getByTestId("comment-input");
    await input.fill("");
    await input.type("Hola @Admin");
    const option = editorPage.getByTestId("mention-option").first();
    await expect(option).toBeVisible();
    await expect(option).toContainText(ADMIN.name);
    await option.click();
    await expect(input).toHaveValue(`Hola @${ADMIN.name} `);
    await input.fill("");
  });
});
