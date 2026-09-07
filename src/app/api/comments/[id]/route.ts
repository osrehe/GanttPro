import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateCommentSchema } from "@/lib/schemas";
import { commentProjectId, deleteComment, updateComment } from "@/lib/services/comments";

type Ctx = { params: Promise<{ id: string }> };

/** Edita un comentario propio (UC-35). */
export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await commentProjectId(id), "EDITOR");
  const input = await parseBody(request, updateCommentSchema);
  return ok(await updateComment(id, access.user.id, input));
});

/** Elimina un comentario: su autor o un administrador del proyecto. */
export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await commentProjectId(id), "EDITOR");
  await deleteComment(id, access.user.id, access.role === "ADMIN");
  return ok({ deleted: true });
});
