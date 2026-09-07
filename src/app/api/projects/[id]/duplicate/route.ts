import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, routeParams } from "@/lib/api/response";
import { duplicateProject } from "@/lib/services/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Duplica el proyecto (UC-02). El usuario queda como ADMIN de la copia. */
export const POST = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "VIEWER");
  return created(await duplicateProject(id, access.user.id));
});
