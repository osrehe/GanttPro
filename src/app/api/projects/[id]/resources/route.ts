import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { createResourceSchema } from "@/lib/schemas";
import { createResource, listAssignments, listResources } from "@/lib/services/resources";

type Ctx = { params: Promise<{ id: string }> };

/** Recursos del proyecto con sus asignaciones (UC-15). */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  const [resources, assignments] = await Promise.all([listResources(id), listAssignments(id)]);
  return ok({ resources, assignments });
});

export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "EDITOR");
  const input = await parseBody(request, createResourceSchema);
  return created(await createResource(id, access.user.id, input));
});
