import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { createDependencySchema } from "@/lib/schemas";
import { createDependency, listDependencies } from "@/lib/services/dependencies";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  return ok(await listDependencies(id));
});

/** Crea una dependencia; un ciclo responde 422 CYCLE con `details.cycle` (UC-10). */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "EDITOR");
  const input = await parseBody(request, createDependencySchema);
  return created(await createDependency(id, access.user.id, input));
});
