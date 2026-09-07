import { compareWithBaseline, takeBaseline, type VarianceRow } from "@ganttpro/engine";
import { ApiError } from "@/lib/api/response";
import { withAudit, type AuditEntry } from "@/lib/audit";
import { formatDateCl, todayIso, toDbDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import {
  toBaselineDto,
  toBaselineTaskDto,
  type BaselineDto,
  type BaselineTaskDto,
} from "@/lib/dto";
import type { CreateBaselineInput } from "@/lib/schemas";
import { loadProjectCalendar } from "./calendar";
import { toEngineTask } from "./scheduling";

export const MAX_BASELINES = 5;

export async function listBaselines(projectId: string): Promise<BaselineDto[]> {
  const rows = await prisma.baseline.findMany({
    where: { projectId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toBaselineDto);
}

/** Guarda una línea base fotografiando todas las tareas (UC-19). Máximo 5 por proyecto. */
export async function createBaseline(
  projectId: string,
  userId: string,
  input: CreateBaselineInput,
): Promise<BaselineDto> {
  return withAudit(async (tx) => {
    const count = await tx.baseline.count({ where: { projectId } });
    if (count >= MAX_BASELINES) {
      throw new ApiError(
        "VALIDATION",
        `Máximo ${MAX_BASELINES} líneas base; elimina una para continuar`,
        {
          max: MAX_BASELINES,
        },
      );
    }
    const name = input.name ?? `Línea base ${count + 1} — ${formatDateCl(todayIso())}`;
    const duplicate = await tx.baseline.findUnique({
      where: { projectId_name: { projectId, name } },
    });
    if (duplicate)
      throw new ApiError("CONFLICT", `Ya existe una línea base llamada "${name}"`, { name });
    const tasks = await tx.task.findMany({ where: { projectId } });
    const snapshots = takeBaseline(tasks.map((t) => ({ ...toEngineTask(t), wbsCode: t.wbsCode })));
    const nameById = new Map(tasks.map((t) => [t.id, t.name]));
    const created = await tx.baseline.create({
      data: {
        projectId,
        name,
        createdById: userId,
        tasks: {
          create: snapshots.map((s) => ({
            taskId: s.taskId,
            wbsCode: s.wbsCode,
            name: nameById.get(s.taskId) ?? "",
            startDate: toDbDate(s.startDate),
            endDate: toDbDate(s.endDate),
            durationDays: s.durationDays,
            progressPct: s.progressPct,
          })),
        },
      },
      include: { _count: { select: { tasks: true } } },
    });
    const dto = toBaselineDto(created);
    const audit: AuditEntry[] = [
      {
        projectId,
        userId,
        entityType: "Baseline",
        entityId: created.id,
        action: "CREATE",
        after: dto,
        summary: `guardó la línea base "${name}" (${snapshots.length} tareas)`,
      },
    ];
    return { result: dto, audit };
  });
}

export interface BaselineDetailDto {
  baseline: BaselineDto;
  tasks: BaselineTaskDto[];
  variance: VarianceRow[];
}

/** Línea base con su fotografía y la tabla comparativa contra el plan actual. */
export async function getBaselineDetail(baselineId: string): Promise<BaselineDetailDto> {
  const row = await prisma.baseline.findUnique({
    where: { id: baselineId },
    include: { tasks: true, _count: { select: { tasks: true } } },
  });
  if (!row) throw new ApiError("NOT_FOUND", "La línea base no existe", { baselineId });
  const [current, calendar] = await Promise.all([
    prisma.task.findMany({ where: { projectId: row.projectId } }),
    loadProjectCalendar(prisma, row.projectId),
  ]);
  const snapshots = row.tasks.map((t) => ({
    taskId: t.taskId,
    wbsCode: t.wbsCode,
    startDate: toBaselineTaskDto(t).startDate,
    endDate: toBaselineTaskDto(t).endDate,
    durationDays: t.durationDays,
    progressPct: t.progressPct,
  }));
  const variance = compareWithBaseline(
    current.map((t) => ({ ...toEngineTask(t), wbsCode: t.wbsCode })),
    snapshots,
    calendar,
  );
  return { baseline: toBaselineDto(row), tasks: row.tasks.map(toBaselineTaskDto), variance };
}

export async function deleteBaseline(baselineId: string, userId: string): Promise<void> {
  await withAudit(async (tx) => {
    const row = await tx.baseline.findUnique({ where: { id: baselineId } });
    if (!row) throw new ApiError("NOT_FOUND", "La línea base no existe", { baselineId });
    await tx.baseline.delete({ where: { id: baselineId } });
    const audit: AuditEntry[] = [
      {
        projectId: row.projectId,
        userId,
        entityType: "Baseline",
        entityId: baselineId,
        action: "DELETE",
        before: toBaselineDto(row),
        summary: `eliminó la línea base "${row.name}"`,
      },
    ];
    return { result: undefined, audit };
  });
}

export async function baselineProjectId(baselineId: string): Promise<string> {
  const row = await prisma.baseline.findUnique({
    where: { id: baselineId },
    select: { projectId: true },
  });
  if (!row) throw new ApiError("NOT_FOUND", "La línea base no existe", { baselineId });
  return row.projectId;
}
