import { isInstanceAdmin, requireInstanceAdmin, requireUser } from "@/lib/api/access";
import { handle, ok, parseBody } from "@/lib/api/response";
import { updateSettingsSchema } from "@/lib/schemas";
import { getSettings, updateSettings } from "@/lib/services/settings";

/**
 * Configuración global: valor UF, moneda de visualización, formato de fecha, logo (UC-37).
 * Todos la leen (`canEdit` dice si la persona puede cambiarla); solo quien administra la
 * instalación la modifica, porque afecta a los costos y documentos de todos los proyectos.
 */
export const GET = handle(async () => {
  const user = await requireUser();
  const [settings, canEdit] = await Promise.all([getSettings(), isInstanceAdmin(user.id)]);
  return ok({ ...settings, canEdit });
});

export const PATCH = handle(async (request) => {
  const user = await requireInstanceAdmin();
  const input = await parseBody(request, updateSettingsSchema);
  return ok({ ...(await updateSettings(user.id, input)), canEdit: true });
});
