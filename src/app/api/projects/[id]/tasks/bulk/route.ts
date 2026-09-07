import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { bulkTaskUpdateSchema } from "@/lib/schemas";
import { bulkUpdateTasks } from "@/lib/services/tasks";

type Ctx = { params: Promise<{ id: string }> };

/** Actualización masiva en una transacción con una sola reprogramación (undo/redo, avance masivo). */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "EDITOR");
  const input = await parseBody(request, bulkTaskUpdateSchema);
  return ok(await bulkUpdateTasks(id, access.user.id, input));
});
