import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateAssignmentSchema } from "@/lib/schemas";
import { assignmentProjectId, deleteAssignment, updateAssignment } from "@/lib/services/resources";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await assignmentProjectId(id), "EDITOR");
  const input = await parseBody(request, updateAssignmentSchema);
  return ok(await updateAssignment(id, access.user.id, input));
});

export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await assignmentProjectId(id), "EDITOR");
  await deleteAssignment(id, access.user.id);
  return ok({ deleted: true });
});
