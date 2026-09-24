import puppeteer from "puppeteer";
import { ApiError } from "@/lib/api/response";
import { pdfOptionsToQuery, type PdfOptions } from "./print-model";
import { isAllowedPrintRequest } from "./print-requests";
import { newPrintToken } from "./print-token";

export interface RenderPdfInput {
  /** URL base que el propio servidor puede alcanzar (p. ej. http://localhost:3000). */
  readonly baseUrl: string;
  readonly projectId: string;
  readonly userId: string;
  readonly options: PdfOptions;
  /** URLs externas que la página puede cargar además de su propio origen (el logo). */
  readonly allowedExternalUrls?: readonly string[];
}

const NAVIGATION_TIMEOUT_MS = 60_000;

/**
 * Navegadores simultáneos como máximo (`PDF_MAX_CONCURRENCY`, por defecto 2). Cada exportación
 * lanza un Chromium completo; sin tope, varias peticiones a la vez agotan la memoria del servidor.
 */
export function pdfMaxConcurrency(): number {
  const parsed = Number.parseInt(process.env.PDF_MAX_CONCURRENCY ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2;
}

let activeRenders = 0;

/**
 * Genera el PDF del Gantt (UC-27): abre `/print/gantt` con un token firmado en un Chromium sin
 * cabeza (Puppeteer) e imprime respetando el `@page` de la propia página (`preferCSSPageSize`).
 * Los márgenes los dibuja la página, por eso aquí van en 0.
 */
export async function renderProjectPdf(input: RenderPdfInput): Promise<Uint8Array> {
  if (activeRenders >= pdfMaxConcurrency()) {
    throw new ApiError(
      "RATE_LIMITED",
      "Se están generando otros PDF en este momento. Vuelve a intentarlo en unos segundos.",
      { retryAfterSeconds: 10 },
    );
  }
  activeRenders += 1;
  try {
    return await renderWithBrowser(input);
  } finally {
    activeRenders -= 1;
  }
}

async function renderWithBrowser(input: RenderPdfInput): Promise<Uint8Array> {
  const token = await newPrintToken(input.projectId, input.userId);
  const query = pdfOptionsToQuery(input.options);
  query.set("projectId", input.projectId);
  query.set("token", token);
  const url = `${input.baseUrl.replace(/\/$/, "")}/print/gantt?${query.toString()}`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    });
    const page = await browser.newPage();
    const printOrigin = new URL(url).origin;
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (isAllowedPrintRequest(request.url(), printOrigin, input.allowedExternalUrls)) {
        void request.continue();
      } else {
        void request.abort("blockedbyclient");
      }
    });
    const response = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    if (!response || !response.ok()) {
      throw new Error(`La página de impresión respondió ${response?.status() ?? "sin respuesta"}`);
    }
    const hasDocument = await page.$('[data-testid="print-document"]');
    if (!hasDocument) {
      const detail = await page
        .$eval('[data-testid="print-error"]', (el) => el.textContent ?? "")
        .catch(() => "");
      throw new Error(detail || "La página de impresión no generó el documento");
    }
    await page.emulateMediaType("print");
    const pdf = await page.pdf({
      format: input.options.size,
      landscape: input.options.orientation === "landscape",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    return pdf;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    // La URL no va en el detalle: lleva el token de impresión y la respuesta llega al cliente.
    throw new ApiError("INTERNAL", "No se pudo generar el PDF", { cause: message });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
