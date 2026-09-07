import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const SEED_PROJECT = "Implementación plataforma de gestión documental";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

/** Tarjeta del proyecto sembrado en la lista de proyectos. */
function seedCard(page: Page) {
  return page.getByTestId("project-card").filter({ hasText: SEED_PROJECT }).first();
}

async function openSeedProject(page: Page): Promise<string> {
  const link = seedCard(page).getByRole("link", { name: SEED_PROJECT });
  const href = (await link.getAttribute("href")) ?? "";
  // Navegación directa: en desarrollo la primera compilación de la vista puede tardar.
  await page.goto(href);
  await expect(page.getByTestId("task-grid")).toBeVisible({ timeout: 30_000 });
  return /\/projects\/([^/]+)/.exec(href)?.[1] ?? "";
}

test.describe("Roles por proyecto y enlaces de solo lectura (UC-32, UC-33)", () => {
  // En desarrollo cada vista se compila a demanda: login, diálogo, vista pública y recarga.
  test.describe.configure({ timeout: 150_000 });

  test("el lector no puede editar ni en la interfaz ni por la API", async ({ page }) => {
    await login(page, "lector@ganttpro.local");

    // En la tarjeta del proyecto no hay acciones de administración ni de edición.
    await expect(seedCard(page).getByTestId("open-members")).toBeDisabled();
    await expect(seedCard(page).getByTestId("edit-project")).toBeDisabled();

    const projectId = await openSeedProject(page);

    // La barra de la tabla está deshabilitada para el rol lector.
    await expect(page.getByTestId("add-task")).toBeDisabled();
    await expect(page.getByTestId("delete-task")).toBeDisabled();
    await expect(page.getByTestId("indent")).toBeDisabled();

    // Y la API responde 403 aunque se llame directamente.
    const created = await page.request.post(`/api/projects/${projectId}/tasks`, {
      data: { name: "Tarea del lector" },
    });
    expect(created.status()).toBe(403);
    const body = (await created.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");

    const shared = await page.request.post(`/api/projects/${projectId}/share-links`, { data: {} });
    expect(shared.status()).toBe(403);
  });

  test("el administrador comparte un enlace de solo lectura y luego lo revoca", async ({
    page,
    browser,
  }) => {
    await page.context().grantPermissions(["clipboard-write"]);
    await login(page, "admin@ganttpro.local");

    await seedCard(page).getByTestId("open-members").click();
    const dialog = page.getByTestId("members-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("member-row")).toHaveCount(3);

    // La ruta se toma de la respuesta de la API para no confundirla con enlaces de otras corridas.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/share-links") && r.request().method() === "POST",
      ),
      dialog.getByTestId("create-share-link").click(),
    ]);
    const path = ((await response.json()) as { data: { path: string } }).data.path;
    expect(path).toMatch(/^\/share\/[0-9a-f]{32}$/);

    const row = dialog.getByTestId("share-link-row").filter({ hasText: path });
    await expect(row).toBeVisible();
    await row.getByTestId("copy-share-link").click();

    // El enlace funciona en un contexto nuevo, sin sesión.
    const anonymous = await browser.newContext();
    const guest = await anonymous.newPage();
    await guest.goto(path);
    await expect(guest.getByTestId("share-view")).toBeVisible();
    await expect(guest.getByTestId("share-readonly")).toHaveText("Solo lectura");
    await expect(guest.getByTestId("share-project-name")).toHaveText(SEED_PROJECT);
    await expect(guest.getByTestId("share-row").first()).toBeVisible();
    // Sin controles de edición ni navegación de la aplicación.
    await expect(guest.getByTestId("add-task")).toHaveCount(0);
    await expect(guest.getByTestId("import-button")).toHaveCount(0);

    // Al revocarlo, la misma dirección deja de servir para cualquiera que la abra después.
    await row.getByTestId("revoke-share-link").click();
    // "revocado" solo aparece cuando la lista se recarga con el enlace ya revocado en la base.
    await expect(row).toContainText("revocado");

    const html = await guest.request.get(path);
    expect(html.status()).toBe(200);
    expect(await html.text()).toContain("El enlace no está disponible");

    const afterRevoke = await browser.newContext();
    const stranger = await afterRevoke.newPage();
    await stranger.goto(path);
    await expect(stranger.getByTestId("share-unavailable")).toBeVisible();
    await expect(stranger.getByTestId("share-view")).toHaveCount(0);
    await afterRevoke.close();

    await anonymous.close();
  });

  test("una dirección inventada muestra el aviso de enlace no disponible", async ({ browser }) => {
    const anonymous = await browser.newContext();
    const guest = await anonymous.newPage();
    await guest.goto(`/share/${"a".repeat(32)}`);
    await expect(guest.getByTestId("share-unavailable")).toBeVisible();
    await anonymous.close();
  });
});
