import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateMemberSchema } from "@/lib/schemas";
import { memberProjectId, removeMember, updateMemberRole } from "@/lib/services/members";

type Ctx = { params: Promise<{ id: string }> };

/** Cambia el rol de un miembro (UC-32). Solo administradores. */
export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await memberProjectId(id), "ADMIN");
  const input = await parseBody(request, updateMemberSchema);
  return ok(await updateMemberRole(id, access.user.id, input));
});

/** Quita a un miembro del proyecto. Solo administradores. */
export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await memberProjectId(id), "ADMIN");
  await removeMember(id, access.user.id);
  return ok({ deleted: true });
});
