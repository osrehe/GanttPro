import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateResourceSchema } from "@/lib/schemas";
import { deleteResource, resourceProjectId, updateResource } from "@/lib/services/resources";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await resourceProjectId(id), "EDITOR");
  const input = await parseBody(request, updateResourceSchema);
  return ok(await updateResource(id, access.user.id, input));
});

export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await resourceProjectId(id), "EDITOR");
  await deleteResource(id, access.user.id);
  return ok({ deleted: true });
});
