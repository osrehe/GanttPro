import { requireUser } from "@/lib/api/access";
import { handle } from "@/lib/api/response";
import { buildImportTemplate } from "@/lib/import/template";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Plantilla Excel de importación con filas de ejemplo e instrucciones (UC-28). */
export const GET = handle(async () => {
  await requireUser();
  const workbook = await buildImportTemplate();
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": 'attachment; filename="plantilla-importacion-ganttpro.xlsx"',
      "Cache-Control": "no-store",
    },
  });
});
