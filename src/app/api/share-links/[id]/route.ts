import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, routeParams } from "@/lib/api/response";
import { revokeShareLink, shareLinkProjectId } from "@/lib/services/share";

type Ctx = { params: Promise<{ id: string }> };

/** Revoca un enlace de solo lectura (UC-33). Solo administradores. */
export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await shareLinkProjectId(id), "ADMIN");
  await revokeShareLink(id, access.user.id);
  return ok({ revoked: true });
});
