import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { createTaskSchema } from "@/lib/schemas";
import { createTask, listTasks } from "@/lib/services/tasks";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  return ok(await listTasks(id));
});

/** Crea una tarea, subtarea o hito (UC-05). Devuelve `{ task, affected }`. */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "EDITOR");
  const input = await parseBody(request, createTaskSchema);
  return created(await createTask(id, access.user.id, input));
});
