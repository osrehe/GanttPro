import { requireTaskAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { patchTaskSchema } from "@/lib/schemas";
import { deleteTask, getTask, patchTask } from "@/lib/services/tasks";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireTaskAccess(id, "VIEWER");
  return ok(await getTask(id));
});

/** Edita una tarea y devuelve `{ task, affected }` con todas las reprogramadas (UC-06, UC-11). */
export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireTaskAccess(id, "EDITOR");
  const input = await parseBody(request, patchTaskSchema);
  return ok(await patchTask(id, access.user.id, input));
});

/** Elimina la tarea y su subárbol; devuelve `{ deletedIds, affected }` (UC-08). */
export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireTaskAccess(id, "EDITOR");
  return ok(await deleteTask(id, access.user.id));
});
