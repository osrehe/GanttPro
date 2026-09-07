import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { createShareLinkSchema } from "@/lib/schemas";
import { createShareLink, listShareLinks } from "@/lib/services/share";

type Ctx = { params: Promise<{ id: string }> };

/** Enlaces de solo lectura del proyecto (UC-33). Solo administradores. */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "ADMIN");
  return ok(await listShareLinks(id));
});

export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "ADMIN");
  const input = await parseBody(request, createShareLinkSchema);
  return created(await createShareLink(id, access.user.id, input));
});
