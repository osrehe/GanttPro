import { requireProjectAccess, requireUser } from "@/lib/api/access";
import { created, handle, parseBody } from "@/lib/api/response";
import { importRequestSchema } from "@/lib/import/schema";
import { importPlan } from "@/lib/import/service";

/**
 * Importa un plan previsualizado. Modo `new` crea un proyecto para el usuario (ADMIN); modos
 * `append` (agregar al final) y `replace` (sustituir el plan) exigen ser al menos EDITOR.
 */
export const POST = handle(async (request) => {
  const user = await requireUser();
  const input = await parseBody(request, importRequestSchema);
  if (input.target.mode !== "new") {
    await requireProjectAccess(input.target.projectId, "EDITOR");
  }
  return created(await importPlan(user.id, input));
});
