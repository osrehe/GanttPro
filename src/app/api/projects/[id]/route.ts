import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateProjectSchema } from "@/lib/schemas";
import { deleteProject, getProject, updateProject } from "@/lib/services/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "VIEWER");
  return ok({ ...(await getProject(id)), role: access.role });
});

/** Edita el proyecto. Archivar/restaurar se hace con `status`. Solo ADMIN puede archivar. */
export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const input = await parseBody(request, updateProjectSchema);
  const access = await requireProjectAccess(id, input.status !== undefined ? "ADMIN" : "EDITOR", {
    allowArchived: input.status !== undefined,
  });
  return ok(await updateProject(id, access.user.id, input));
});

export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "ADMIN");
  await deleteProject(id);
  return ok({ deleted: true });
});
