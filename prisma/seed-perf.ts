/**
 * Seed de rendimiento: un proyecto con 1.000 tareas hoja (10 fases × 10 paquetes × 10 tareas),
 * 110 resúmenes y ≈1.500 dependencias, para las pruebas de rendimiento del Gantt (UC-24).
 * Requiere que el seed de demostración haya creado el usuario administrador (`npm run db:seed`).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  applyCriticalPath,
  createCalendar,
  renumber,
  scheduleProject,
  type EngineDependency,
  type EngineTask,
} from "@ganttpro/engine";
import { chileanHolidays } from "../src/lib/holidays";

const prisma = new PrismaClient();
const PROJECT_NAME = "Proyecto de rendimiento (1.000 tareas)";
const START = "2026-09-07";

function toDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

interface NamedTask extends EngineTask {
  name: string;
}

function build(): { tasks: NamedTask[]; deps: EngineDependency[] } {
  const tasks: NamedTask[] = [];
  const leaves: string[] = [];
  const base = (
    id: string,
    name: string,
    parentId: string | null,
    orderIndex: number,
  ): NamedTask => ({
    id,
    name,
    parentId,
    orderIndex,
    wbsCode: "",
    anchorDate: null,
    startDate: START,
    endDate: START,
    durationDays: 0,
    effortHours: null,
    progressPct: 0,
    isMilestone: false,
    isSummary: true,
  });
  for (let f = 0; f < 10; f++) {
    const phaseId = randomUUID();
    tasks.push(base(phaseId, `Fase ${f + 1}`, null, f));
    for (let p = 0; p < 10; p++) {
      const pkgId = randomUUID();
      tasks.push(base(pkgId, `Paquete ${f + 1}.${p + 1}`, phaseId, p));
      for (let l = 0; l < 10; l++) {
        const id = randomUUID();
        tasks.push({
          ...base(id, `Tarea ${f + 1}.${p + 1}.${l + 1}`, pkgId, l),
          anchorDate: START,
          durationDays: 1 + ((f + p + l) % 5),
          effortHours: 8 * (1 + (l % 3)),
          progressPct: f < 3 ? 100 : f === 3 ? (l * 13) % 101 : 0,
          isSummary: false,
        });
        leaves.push(id);
      }
    }
  }
  const deps: EngineDependency[] = [];
  const add = (a: string, b: string, type: EngineDependency["type"] = "FS", lagDays = 0): void => {
    deps.push({ id: `perf-${deps.length}`, predecessorId: a, successorId: b, type, lagDays });
  };
  for (let i = 1; i < leaves.length; i++) add(leaves[i - 1] as string, leaves[i] as string);
  let seed = 4242;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed;
  };
  const types: EngineDependency["type"][] = ["FS", "SS", "FF", "SF"];
  const seen = new Set(deps.map((d) => `${d.predecessorId}>${d.successorId}`));
  while (deps.length < 1500) {
    const a = next() % leaves.length;
    const b = next() % leaves.length;
    if (a === b) continue;
    const [from, to] = a < b ? [a, b] : [b, a];
    const key = `${leaves[from]}>${leaves[to]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    add(
      leaves[from] as string,
      leaves[to] as string,
      types[next() % 4] as EngineDependency["type"],
      (next() % 5) - 2,
    );
  }
  return { tasks: renumber(tasks), deps };
}

async function main(): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { email: "admin@ganttpro.local" } });
  if (!admin)
    throw new Error("Ejecuta primero `npm run db:seed` para crear el usuario administrador");

  await prisma.project.deleteMany({ where: { name: PROJECT_NAME } });
  const holidays = chileanHolidays(2026);
  const calendar = createCalendar({
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 8,
    holidays: holidays.map((h) => h.date),
  });
  const { tasks, deps } = build();
  const started = performance.now();
  const scheduled = applyCriticalPath(scheduleProject(tasks, deps, calendar).tasks, deps, calendar);
  console.info(
    `Engine: ${tasks.length} tareas programadas en ${(performance.now() - started).toFixed(1)} ms`,
  );

  await prisma.$transaction(
    async (tx) => {
      const project = await tx.project.create({
        data: {
          name: PROJECT_NAME,
          description: "Proyecto sintético para medir el rendimiento del Gantt con 1.000 tareas.",
          startDate: toDbDate(START),
          createdById: admin.id,
          members: { create: { userId: admin.id, role: "ADMIN" } },
          calendars: {
            create: {
              name: "Calendario Chile 2026",
              isBase: true,
              holidays: { create: holidays.map((h) => ({ date: toDbDate(h.date), name: h.name })) },
            },
          },
        },
      });
      const rows: Prisma.TaskCreateManyInput[] = scheduled.map((t) => ({
        id: t.id,
        projectId: project.id,
        parentId: t.parentId,
        orderIndex: t.orderIndex,
        wbsCode: t.wbsCode,
        name: t.name,
        anchorDate: t.anchorDate ? toDbDate(t.anchorDate) : null,
        startDate: toDbDate(t.startDate),
        endDate: toDbDate(t.endDate),
        durationDays: t.durationDays,
        effortHours: t.effortHours,
        progressPct: t.progressPct,
        status: t.progressPct >= 100 ? "DONE" : t.progressPct > 0 ? "IN_PROGRESS" : "NOT_STARTED",
        isMilestone: t.isMilestone,
        isSummary: t.isSummary,
        isCritical: t.isCritical,
        totalFloatDays: t.totalFloatDays,
        freeFloatDays: t.freeFloatDays,
        updatedById: admin.id,
      }));
      await tx.task.createMany({ data: rows });
      await tx.dependency.createMany({
        data: deps.map((d) => ({
          projectId: project.id,
          predecessorId: d.predecessorId,
          successorId: d.successorId,
          type: d.type,
          lagDays: d.lagDays,
        })),
      });
      await tx.auditLog.create({
        data: {
          projectId: project.id,
          userId: admin.id,
          entityType: "Project",
          entityId: project.id,
          action: "IMPORT",
          summary: `creó el proyecto "${PROJECT_NAME}" desde el seed de rendimiento`,
        },
      });
    },
    { timeout: 60_000 },
  );
  console.info(
    `Listo: "${PROJECT_NAME}" con ${scheduled.length} tareas y ${deps.length} dependencias.`,
  );
}

main()
  .catch((error) => {
    console.error("Error en el seed de rendimiento:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
