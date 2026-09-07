import { requireProjectAccess } from "@/lib/api/access";
import { created, handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { createBaselineSchema } from "@/lib/schemas";
import { createBaseline, listBaselines } from "@/lib/services/baselines";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  return ok(await listBaselines(id));
});

/** Guarda una línea base (máximo 5). Solo ADMIN (UC-19). */
export const POST = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "ADMIN");
  const input = await parseBody(request, createBaselineSchema);
  return created(await createBaseline(id, access.user.id, input));
});
