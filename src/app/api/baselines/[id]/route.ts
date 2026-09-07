import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, routeParams } from "@/lib/api/response";
import { baselineProjectId, deleteBaseline, getBaselineDetail } from "@/lib/services/baselines";

type Ctx = { params: Promise<{ id: string }> };

/** Fotografía y tabla comparativa contra el plan actual. */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(await baselineProjectId(id), "VIEWER");
  return ok(await getBaselineDetail(id));
});

export const DELETE = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(await baselineProjectId(id), "ADMIN");
  await deleteBaseline(id, access.user.id);
  return ok({ deleted: true });
});
