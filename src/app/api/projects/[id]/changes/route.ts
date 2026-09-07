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
  const get = (key: string) => url.searchParams.get(key) ?? undefined;
  const query = changesQuerySchema.parse({
    since: get("since"),
    entityId: get("entityId"),
    userId: get("userId"),
    from: get("from"),
    to: get("to"),
    order: get("order"),
    limit: get("limit"),
  });
  return ok(await listChanges(id, query));
});
