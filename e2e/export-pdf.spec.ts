import { expect, request, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

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

/** Id del proyecto de demostración a partir del enlace de su tarjeta. */
async function seededProjectId(page: Page): Promise<string> {
  const link = page
    .getByTestId("project-card")
    .filter({ hasText: SEED_PROJECT })
    .getByRole("link", { name: SEED_PROJECT });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const match = /\/projects\/([^/]+)/.exec(href ?? "");
  expect(match, `href inesperado: ${href}`).not.toBeNull();
  return match?.[1] as string;
}

async function parsePdf(buffer: Buffer): Promise<{ total: number; text: string }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { total: result.total, text: result.text };
  } finally {
    await parser.destroy();
  }
}

test.describe("Exportación a PDF (UC-27)", () => {
  test.setTimeout(120_000);

  test("genera un PDF paginado con la tabla WBS y 'Página X de Y'", async ({ page }) => {
    await login(page);
    const id = await seededProjectId(page);

    const started = Date.now();
    const res = await page.request.get(
      `/api/projects/${id}/export/pdf?scale=week&columns=wbs,name,start,end`,
    );
    const elapsed = Date.now() - started;
    expect(res.status(), await res.text().catch(() => "")).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect(res.headers()["content-disposition"]).toContain(".pdf");

    const buffer = await res.body();
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    const pdf = await parsePdf(buffer);
    console.log(`PDF: ${pdf.total} páginas, ${buffer.length} bytes, ${elapsed} ms`);
    expect(pdf.total).toBeGreaterThanOrEqual(2);
    expect(pdf.text).toContain("1.1");
    expect(pdf.text).toContain("Página 1 de");
    expect(pdf.text).toContain(`Página ${pdf.total} de ${pdf.total}`);
    expect(pdf.text).toContain(SEED_PROJECT);
  });

  test("acepta orientación vertical, tamaño A3 y escala mensual", async ({ page }) => {
    await login(page);
    const id = await seededProjectId(page);
    const res = await page.request.get(
      `/api/projects/${id}/export/pdf?orientation=portrait&size=A3&scale=month&columns=wbs,name,duration,progress,predecessors&legend=0`,
    );
    expect(res.status(), await res.text().catch(() => "")).toBe(200);
    const pdf = await parsePdf(await res.body());
    expect(pdf.total).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Predecesoras");
  });

  test("rechaza opciones inválidas con 422 y sin sesión responde 401", async ({ page }) => {
    await login(page);
    const id = await seededProjectId(page);
    const invalid = await page.request.get(`/api/projects/${id}/export/pdf?columns=wbs,color`);
    expect(invalid.status()).toBe(422);

    const anonymous = await request.newContext({ baseURL: page.url() });
    const res = await anonymous.get(`/api/projects/${id}/export/pdf`);
    expect(res.status()).toBe(401);
    await anonymous.dispose();
  });
});
