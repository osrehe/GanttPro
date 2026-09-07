import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateDependencySchema } from "@/lib/schemas";
import {
  deleteDependency,
  dependencyProjectId,
  updateDependency,
} from "@/lib/services/dependencies";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await dependencyProjectId(id), "EDITOR");
  const input = await parseBody(request, updateDependencySchema);
  return ok(await updateDependency(id, access.user.id, input));
});

export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await dependencyProjectId(id), "EDITOR");
  return ok(await deleteDependency(id, access.user.id));
});
