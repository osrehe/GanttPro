import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, routeParams } from "@/lib/api/response";
import { getProjectFull } from "@/lib/services/projects";

type Ctx = { params: Promise<{ id: string }> };

/** Proyecto completo (calendario, tareas, dependencias, recursos, asignaciones, miembros, baselines). */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "VIEWER");
  return ok(await getProjectFull(id, access.role));
});
