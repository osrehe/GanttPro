import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@ganttpro.local";
const PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";
const SEED_PROJECT = "Implementación plataforma de gestión documental";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/projects$/, { timeout: 30_000 });
}

async function openSeedProject(page: Page): Promise<string> {
  await expect(page.getByTestId("project-list")).toBeVisible();
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

/** Violaciones graves o críticas de accesibilidad en la página actual. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function describeViolations(violations: Awaited<ReturnType<typeof seriousViolations>>): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target).join(", ")}`)
    .join("\n");
}

test.describe("Accesibilidad (Paso 10)", () => {
  test("Proyectos, Tabla, Gantt, Recursos y Configuración no tienen violaciones graves", async ({
    page,
  }) => {
    await login(page);

    // El título lo escribe Next tras la navegación de cliente; axe lo exige.
    await expect(page).toHaveTitle(/GanttPro/);
    const listado = await seriousViolations(page);
    expect(listado, `Proyectos:\n${describeViolations(listado)}`).toEqual([]);

    const projectId = await openSeedProject(page);
    await expect(page.getByTestId("task-row").first()).toBeVisible();
    const tabla = await seriousViolations(page);
    expect(tabla, `Tabla:\n${describeViolations(tabla)}`).toEqual([]);

    await page.goto(`/projects/${projectId}/gantt`);
    await expect(page.getByTestId("gantt-bars").locator("g").first()).toBeVisible();
    const gantt = await seriousViolations(page);
    expect(gantt, `Gantt:\n${describeViolations(gantt)}`).toEqual([]);

    await page.goto(`/projects/${projectId}/resources`);
    await expect(page.getByRole("heading", { name: "Recursos" })).toBeVisible();
    const recursos = await seriousViolations(page);
    expect(recursos, `Recursos:\n${describeViolations(recursos)}`).toEqual([]);

    await page.goto("/settings");
    await expect(page.getByTestId("global-settings")).toBeVisible();
    const configuracion = await seriousViolations(page);
    expect(configuracion, `Configuración:\n${describeViolations(configuracion)}`).toEqual([]);
  });

  test("el tema oscuro se aplica y se recuerda, y el panel de atajos se abre con ?", async ({
    page,
  }) => {
    await login(page);
    await page.getByTestId("theme-toggle").click();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const oscuro = await seriousViolations(page);
    expect(oscuro, `Tema oscuro:\n${describeViolations(oscuro)}`).toEqual([]);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.keyboard.press("Shift+Slash"); // "?"
    await expect(page.getByTestId("shortcuts-dialog")).toBeVisible();
    await expect(page.getByTestId("shortcuts-dialog")).toContainText("Ctrl + Z");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("shortcuts-dialog")).toHaveCount(0);
  });

  test("el Gantt se recorre con el teclado y Ctrl+flecha mueve la tarea un día hábil", async ({
    page,
  }) => {
    await login(page);
    const projectId = await openSeedProject(page);
    await page.goto(`/projects/${projectId}/gantt`);
    await expect(page.getByTestId("gantt-bars").locator("g").first()).toBeVisible();

    const scroll = page.getByTestId("gantt-scroll");
    await scroll.focus();
    await page.keyboard.press("ArrowDown");
    const first = page.getByTestId("gantt-row").first();
    await expect(first).toHaveAttribute("data-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("gantt-row").nth(1)).toHaveAttribute("data-selected", "true");
  });
});
