import { expect, test, type Page } from "@playwright/test";

const ADMIN = "admin@ganttpro.local";
const EDITOR = "editor@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";

async function login(page: Page, email = ADMIN): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL(/\/(projects)?$/, { timeout: 30_000 });
  await page.goto("/projects");
  await expect(page.getByTestId("project-list")).toBeVisible({ timeout: 30_000 });
}

/** Tarjeta del proyecto por nombre exacto (la copia duplicada tiene un nombre parecido). */
function card(page: Page, name: string) {
  return page
    .getByTestId("project-card")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

async function createProject(page: Page, name: string): Promise<string> {
  await page.getByTestId("new-project").click();
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Fecha de inicio").fill("2026-11-02");
  await page.getByRole("button", { name: "Crear" }).click();
  await expect(card(page, name)).toBeVisible();
  const href = await card(page, name).getByRole("link", { name, exact: true }).getAttribute("href");
  return /\/projects\/([^/]+)/.exec(href ?? "")?.[1] ?? "";
}

test.describe("Eliminar un proyecto (UC-39)", () => {
  test("el administrador escribe el nombre, el proyecto desaparece y su enlace deja de servir", async ({
    page,
    browser,
  }) => {
    await login(page);
    const name = `E2E Borrado ${Date.now()}`;
    const projectId = await createProject(page, name);

    // Un enlace de solo lectura activo antes de borrar.
    await card(page, name).getByTestId("open-members").click();
    await page.getByTestId("create-share-link").click();
    const shareRow = page.getByTestId("share-link-row").first();
    await expect(shareRow).toBeVisible();
    const sharePath = ((await shareRow.locator("code").innerText()) ?? "").trim();
    await page.keyboard.press("Escape");

    // El diálogo explica lo que se pierde y exige el nombre exacto.
    await card(page, name).getByTestId("delete-project").click();
    await expect(page.getByTestId("delete-project-dialog")).toBeVisible();
    await expect(page.getByTestId("confirm-delete-project")).toBeDisabled();
    await page.getByTestId("confirm-project-name").fill(`${name} y algo más`);
    await expect(page.getByTestId("confirm-delete-project")).toBeDisabled();
    await page.getByTestId("confirm-project-name").fill(name);
    await expect(page.getByTestId("confirm-delete-project")).toBeEnabled();
    await page.getByTestId("confirm-delete-project").click();

    await expect(card(page, name)).toHaveCount(0);
    await expect(page.getByText(/Se eliminó/)).toBeVisible();

    // La API ya no da acceso al proyecto y el enlace compartido no resuelve.
    const respuesta = await page.request.get(`/api/projects/${projectId}`);
    expect(respuesta.status()).toBe(403);
    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await anonPage.goto(sharePath);
    await expect(anonPage.getByTestId("share-unavailable")).toBeVisible();
    await anon.close();
  });

  test("un editor no ve habilitado el botón de eliminar ni la API se lo permite", async ({
    page,
    browser,
  }) => {
    // El administrador crea el proyecto y suma al editor.
    await login(page);
    const name = `E2E Borrado ajeno ${Date.now()}`;
    const projectId = await createProject(page, name);
    await card(page, name).getByTestId("open-members").click();
    await page.getByTestId("add-member-email").fill(EDITOR);
    await page.getByTestId("add-member-submit").click();
    await expect(page.getByTestId("member-row").filter({ hasText: EDITOR })).toBeVisible();
    await page.keyboard.press("Escape");

    const contexto = await browser.newContext();
    const editorPage = await contexto.newPage();
    await login(editorPage, EDITOR);
    await expect(card(editorPage, name).getByTestId("delete-project")).toBeDisabled();
    const respuesta = await editorPage.request.delete(`/api/projects/${projectId}`);
    expect(respuesta.status()).toBe(403);
    await contexto.close();

    // Sigue existiendo para el administrador.
    await page.reload();
    await expect(card(page, name)).toBeVisible();
    await card(page, name).getByTestId("delete-project").click();
    await page.getByTestId("confirm-project-name").fill(name);
    await page.getByTestId("confirm-delete-project").click();
    await expect(card(page, name)).toHaveCount(0);
  });
});
