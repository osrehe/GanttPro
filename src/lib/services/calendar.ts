import type { Prisma } from "@prisma/client";
import { createCalendar, type WorkingCalendar } from "@ganttpro/engine";
import { ApiError } from "@/lib/api/response";
import { fromDbDate, toDbDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { toCalendarDto, type CalendarDto } from "@/lib/dto";
import type { UpdateCalendarInput } from "@/lib/schemas";

type Db = Prisma.TransactionClient | typeof prisma;

/** Calendario base del proyecto como `WorkingCalendar` del engine. */
export async function loadProjectCalendar(db: Db, projectId: string): Promise<WorkingCalendar> {
  const row = await db.calendar.findFirst({
    where: { projectId, isBase: true },
    include: { holidays: true },
  });
  if (!row) {
    throw new ApiError("NOT_FOUND", "El proyecto no tiene calendario base", { projectId });
  }
  return createCalendar({
    workingDays: row.workingDays,
    hoursPerDay: Number(row.hoursPerDay),
    holidays: row.holidays.map((h) => fromDbDate(h.date)),
  });
}

/** Calendario base del proyecto como DTO. */
export async function getProjectCalendar(projectId: string): Promise<CalendarDto> {
  const row = await prisma.calendar.findFirst({
    where: { projectId, isBase: true },
    include: { holidays: true },
  });
  if (!row) throw new ApiError("NOT_FOUND", "El proyecto no tiene calendario base", { projectId });
  return toCalendarDto(row);
}

/** Todos los calendarios del proyecto (base y de recursos). */
export async function listProjectCalendars(projectId: string): Promise<CalendarDto[]> {
  const rows = await prisma.calendar.findMany({
    where: { projectId },
    include: { holidays: true },
    orderBy: [{ isBase: "desc" }, { name: "asc" }],
  });
  return rows.map(toCalendarDto);
}

/**
 * Actualiza el calendario base dentro de una transacción. Si se envía `holidays`, reemplaza la lista
 * completa. Devuelve el DTO nuevo y el previo (para auditoría). El llamador debe reprogramar después.
 */
export async function updateBaseCalendar(
  tx: Prisma.TransactionClient,
  projectId: string,
  input: UpdateCalendarInput,
): Promise<{ before: CalendarDto; after: CalendarDto }> {
  const current = await tx.calendar.findFirst({
    where: { projectId, isBase: true },
    include: { holidays: true },
  });
  if (!current)
    throw new ApiError("NOT_FOUND", "El proyecto no tiene calendario base", { projectId });
  const before = toCalendarDto(current);

  await tx.calendar.update({
    where: { id: current.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.workingDays !== undefined ? { workingDays: input.workingDays } : {}),
      ...(input.hoursPerDay !== undefined ? { hoursPerDay: input.hoursPerDay } : {}),
    },
  });
  if (input.holidays !== undefined) {
    await tx.holiday.deleteMany({ where: { calendarId: current.id } });
    const unique = new Map(input.holidays.map((h) => [h.date, h.name]));
    if (unique.size > 0) {
      await tx.holiday.createMany({
        data: [...unique.entries()].map(([date, name]) => ({
          calendarId: current.id,
          date: toDbDate(date),
          name,
        })),
      });
    }
  }
  const updated = await tx.calendar.findUniqueOrThrow({
    where: { id: current.id },
    include: { holidays: true },
  });
  return { before, after: toCalendarDto(updated) };
}
