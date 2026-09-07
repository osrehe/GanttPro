import { requireTaskAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { moveTaskSchema } from "@/lib/schemas";
import { moveTask } from "@/lib/services/tasks";

type Ctx = { params: Promise<{ id: string }> };

/** Indentar, desindentar, subir, bajar o mover; devuelve todas las tareas con su WBS nuevo (UC-07). */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireTaskAccess(id, "EDITOR");
  const input = await parseBody(request, moveTaskSchema);
  return ok(await moveTask(id, access.user.id, input));
});
