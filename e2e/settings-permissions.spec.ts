import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

test.describe("Configuración global según quién administra la instalación", () => {
  test("quien no la administra ve las preferencias en solo lectura", async ({ page }) => {
    await login(page, "editor@ganttpro.local");
    await page.goto("/settings");
    await expect(page.getByTestId("settings-read-only")).toBeVisible();
    await expect(page.getByTestId("uf-value")).toBeDisabled();
    await expect(page.getByTestId("logo-url")).toBeDisabled();
    await expect(page.getByTestId("save-settings")).toHaveCount(0);
  });

  test("quien la administra puede guardarlas", async ({ page }) => {
    await login(page, "admin@ganttpro.local");
    await page.goto("/settings");
    await expect(page.getByTestId("save-settings")).toBeEnabled();
    await expect(page.getByTestId("settings-read-only")).toHaveCount(0);
  });
});
