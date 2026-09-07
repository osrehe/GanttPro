import { requireProjectAccess } from "@/lib/api/access";
import { handle, routeParams } from "@/lib/api/response";
import { renderProjectPdf } from "@/lib/export/pdf";
import { parsePdfOptions } from "@/lib/export/print-model";
import { getProject } from "@/lib/services/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** PDF del Gantt (UC-27): `?orientation&size&scale&from&to&columns&critical&baselineId&legend&logo&title`. */
export const GET = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "VIEWER");
  const url = new URL(request.url);
  const options = parsePdfOptions(url.searchParams);
  const [project, pdf] = await Promise.all([
    getProject(id),
    renderProjectPdf({
      baseUrl: printBaseUrl(),
      projectId: id,
      userId: access.user.id,
      options,
    }),
  ]);
  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(project.name)}-gantt.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});

/**
 * URL con la que el servidor abre su propia página de impresión. **No** se deriva de la petición:
 * `Host` y `X-Forwarded-Host` los controla quien llama, y usarlos permitiría que Puppeteer
 * navegara a un host ajeno llevándose el token de impresión (SSRF y fuga del token). Se usa
 * `PRINT_BASE_URL` si está configurada y, si no, la interfaz de loopback del propio proceso.
 */
function printBaseUrl(): string {
  const configured = process.env.PRINT_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

function slug(text: string): string {
  const base = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "proyecto";
}
