import { requireTaskAccess } from "@/lib/api/access";
import { created, handle, parseBody, routeParams } from "@/lib/api/response";
import { createAssignmentSchema } from "@/lib/schemas";
import { createAssignment } from "@/lib/services/resources";

type Ctx = { params: Promise<{ id: string }> };

/** Asigna un recurso a la tarea con un porcentaje de dedicación (UC-16). */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireTaskAccess(id, "EDITOR");
  const input = await parseBody(request, createAssignmentSchema);
  return created(await createAssignment(id, access.user.id, input));
});
