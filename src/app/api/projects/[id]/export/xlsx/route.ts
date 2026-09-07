import { requireProjectAccess } from "@/lib/api/access";
import { handle, routeParams } from "@/lib/api/response";
import { buildProjectWorkbook, exportFileName } from "@/lib/export/excel";
import { getProjectFull } from "@/lib/services/projects";
import { getSettings } from "@/lib/services/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Exporta el proyecto a Excel (UC-26). `?gantt=day|week` controla la hoja Gantt. */
export const GET = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "VIEWER");
  const gantt = new URL(request.url).searchParams.get("gantt") === "week" ? "week" : "day";
  const [full, settings] = await Promise.all([getProjectFull(id, access.role), getSettings()]);
  const workbook = await buildProjectWorkbook(full, {
    gantt,
    display: { currency: settings.displayCurrency, ufValue: settings.ufValue },
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = exportFileName(full.project.name, "plan", "xlsx");
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
});
