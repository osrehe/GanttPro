import { requireProjectAccess } from "@/lib/api/access";
import { handle, ok, routeParams } from "@/lib/api/response";
import { changesQuerySchema } from "@/lib/schemas";
import { listChanges } from "@/lib/services/changes";

type Ctx = { params: Promise<{ id: string }> };

/** Feed de cambios desde `since` (ISO 8601) para colaboración y auditoría (UC-34, UC-36). */
export const GET = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  const url = new URL(request.url);
  const query = changesQuerySchema.parse({
    since: url.searchParams.get("since") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  return ok(await listChanges(id, query));
});
