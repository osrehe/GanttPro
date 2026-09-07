import { requireTaskAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { createCommentSchema } from "@/lib/schemas";
import { createComment, listComments } from "@/lib/services/comments";

type Ctx = { params: Promise<{ id: string }> };

/** Comentarios de la tarea, del más antiguo al más reciente (UC-35). */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireTaskAccess(id, "VIEWER");
  return ok(await listComments(id));
});

/** Escribe un comentario con sus menciones. */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireTaskAccess(id, "EDITOR");
  const input = await parseBody(request, createCommentSchema);
  return created(await createComment(id, access.user.id, input));
});
