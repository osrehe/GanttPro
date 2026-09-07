import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { addMemberSchema } from "@/lib/schemas";
import { addMember, listMembers } from "@/lib/services/members";

type Ctx = { params: Promise<{ id: string }> };

/** Miembros del proyecto y sus roles (UC-32). */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  return ok(await listMembers(id));
});

/** Agrega a un usuario existente por correo. Solo administradores. */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "ADMIN");
  const input = await parseBody(request, addMemberSchema);
  return created(await addMember(id, access.user.id, input));
});
