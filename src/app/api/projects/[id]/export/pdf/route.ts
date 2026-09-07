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
      baseUrl: resolveBaseUrl(request, url),
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

/** URL que el servidor usa para abrir su propia página de impresión. */
function resolveBaseUrl(request: Request, url: URL): string {
  if (process.env.PRINT_BASE_URL) return process.env.PRINT_BASE_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    return `${proto}://${forwardedHost}`;
  }
  return url.origin;
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
