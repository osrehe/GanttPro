import { requireProjectAccess } from "@/lib/api/access";
import { withAudit } from "@/lib/audit";
import { handle, ok, parseBody, routeParams } from "@/lib/api/response";
import { updateCalendarSchema } from "@/lib/schemas";
import { getProjectCalendar, updateBaseCalendar } from "@/lib/services/calendar";
import { rescheduleProject } from "@/lib/services/scheduling";

type Ctx = { params: Promise<{ id: string }> };

/** Calendario base del proyecto (UC-04). */
export const GET = handle<Ctx>(async (_request, context) => {
  const { id } = await routeParams(context);
  await requireProjectAccess(id, "VIEWER");
  return ok(await getProjectCalendar(id));
});

/** Edita días laborables, horas por día y feriados del calendario base; reprograma el proyecto. */
export const PATCH = handle<Ctx>(async (request, context) => {
  const { id } = await routeParams(context);
  const access = await requireProjectAccess(id, "EDITOR");
  const input = await parseBody(request, updateCalendarSchema);
  const result = await withAudit(async (tx) => {
    const { before, after } = await updateBaseCalendar(tx, id, input);
    const { affected } = await rescheduleProject(tx, id);
    return {
      result: { calendar: after, affected },
      audit: [
        {
          projectId: id,
          userId: access.user.id,
          entityType: "Calendar" as const,
          entityId: after.id,
          action: "UPDATE" as const,
          before,
          after,
          summary: `editó el calendario laboral "${after.name}"`,
        },
      ],
    };
  });
  return ok(result);
});
