import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";

test.describe("Autenticación (UC-31)", () => {
  test("una ruta protegida redirige a /login con callbackUrl", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await expect(page.getByRole("heading", { name: "GanttPro" })).toBeVisible();
  });

  test("/health es público", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  test("la API sin sesión responde 401 con el código UNAUTHORIZED", async ({ request }) => {
    const response = await request.get("/api/projects");
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  test("credenciales incorrectas muestran un error y no crean sesión", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill(ADMIN_EMAIL);
    await page.getByLabel("Contraseña").fill("clave-incorrecta");
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page.getByTestId("login-error")).toHaveText("Correo o contraseña incorrectos");
    await expect(page).toHaveURL(/\/login/);
  });

  test("credenciales correctas inician sesión, muestran el nombre y permiten cerrar sesión", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill(ADMIN_EMAIL);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
    await expect(page.getByTestId("user-name")).toHaveText("Administradora GanttPro");

    // Con sesión, /login redirige a la aplicación.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login/);
  });
});
