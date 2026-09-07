import { requireUser } from "@/lib/api/access";
import { handle, ok, parseBody } from "@/lib/api/response";
import { updateSettingsSchema } from "@/lib/schemas";
import { getSettings, updateSettings } from "@/lib/services/settings";

/** Configuración global: valor UF, moneda de visualización, formato de fecha, logo (UC-37). */
export const GET = handle(async () => {
  await requireUser();
  return ok(await getSettings());
});

export const PATCH = handle(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, updateSettingsSchema);
  return ok(await updateSettings(user.id, input));
});
