/**
 * Seed de demostración: usuarios, proyecto realista con calendario chileno 2026, tareas en tres
 * niveles programadas con el engine, recursos, asignaciones y una entrada de auditoría.
 *
 * Ejecutar con `npm run db:seed` (Prisma carga .env). Es idempotente: borra y recrea el proyecto
 * de demostración y actualiza los usuarios de ejemplo.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import {
  applyCriticalPath,
  createCalendar,
  expectedProgressAt,
  renumber,
  scheduleProject,
  type EngineDependency,
  type EngineTask,
} from "@ganttpro/engine";
import { chileanHolidays } from "../src/lib/holidays";
import {
  ASSIGNMENTS,
  DEPENDENCIES,
  PROJECT,
  RESOURCES,
  TASKS,
  USERS,
  type SeedTaskDef,
} from "./seed-data";

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "GanttPro2026!";

interface FlatTask extends EngineTask {
  name: string;
  effortHours: number | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  notes: string | null;
  code: string;
}

function toDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Aplana la definición jerárquica en tareas del engine con ids generados. */
function flatten(defs: readonly SeedTaskDef[], parentId: string | null, out: FlatTask[]): void {
  defs.forEach((def, index) => {
    const id = randomUUID();
    const isLeaf = !def.children || def.children.length === 0;
    out.push({
      id,
      code: def.code,
      parentId,
      orderIndex: index,
      wbsCode: def.code,
      name: def.name,
      anchorDate: isLeaf ? PROJECT.startDate : null,
      startDate: PROJECT.startDate,
      endDate: PROJECT.startDate,
      durationDays: def.duration ?? 0,
      effortHours: def.effortHours ?? null,
      progressPct: 0,
      isMilestone: (def.duration ?? 1) === 0 && isLeaf,
      isSummary: !isLeaf,
      priority: def.priority ?? "MEDIUM",
      notes: def.notes ?? null,
    });
    if (def.children) flatten(def.children, id, out);
  });
}

/** Avance realista a la fecha de estado: la mayoría al día, algunas tareas atrasadas. */
function seededProgress(expected: number, code: string): number {
  if (expected === 0) return 0;
  if (expected === 100) return code.endsWith("3") ? 90 : 100; // algunas casi listas
  const factor = code.startsWith("2.2") ? 0.6 : 0.95; // el diseño técnico va atrasado
  return Math.max(0, Math.min(100, Math.round(expected * factor)));
}

async function main(): Promise<void> {
  console.info("Sembrando datos de demostración…");
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // Usuarios de ejemplo (upsert).
  const users = new Map<string, { id: string }>();
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: { email: u.email, name: u.name, passwordHash },
    });
    users.set(u.key, user);
  }
  const admin = users.get("admin") as { id: string };

  // Proyecto de demostración: se recrea desde cero.
  await prisma.project.deleteMany({ where: { name: PROJECT.name } });

  const holidays = chileanHolidays(2026);
  const calendar = createCalendar({
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 8,
    holidays: holidays.map((h) => h.date),
  });

  // Programación con el engine.
  const flat: FlatTask[] = [];
  flatten(TASKS, null, flat);
  const byCode = new Map(flat.map((t) => [t.code, t]));
  const deps: EngineDependency[] = DEPENDENCIES.map((d, i) => {
    const from = byCode.get(d.from);
    const to = byCode.get(d.to);
    if (!from || !to) throw new Error(`Dependencia inválida en el seed: ${d.from} → ${d.to}`);
    return {
      id: `seed-dep-${i}`,
      predecessorId: from.id,
      successorId: to.id,
      type: d.type ?? "FS",
      lagDays: d.lag ?? 0,
    };
  });
  const scheduled = scheduleProject(renumber(flat), deps, calendar, {
    progressWeighting: "DURATION",
  }).tasks;
  const withProgress = scheduled.map((t) =>
    t.isSummary
      ? t
      : {
          ...t,
          progressPct: seededProgress(expectedProgressAt(t, PROJECT.statusDate, calendar), t.code),
        },
  );
  const rolled = scheduleProject(withProgress, deps, calendar).tasks;
  const final = applyCriticalPath(rolled, deps, calendar);

  const project = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        name: PROJECT.name,
        description: PROJECT.description,
        startDate: toDbDate(PROJECT.startDate),
        statusDate: toDbDate(PROJECT.statusDate),
        createdById: admin.id,
        members: {
          create: USERS.map((u) => ({
            userId: (users.get(u.key) as { id: string }).id,
            role: u.role,
          })),
        },
        calendars: {
          create: {
            name: "Calendario Chile 2026",
            isBase: true,
            workingDays: [1, 2, 3, 4, 5],
            hoursPerDay: 8,
            holidays: { create: holidays.map((h) => ({ date: toDbDate(h.date), name: h.name })) },
          },
        },
      },
    });

    const taskRows: Prisma.TaskCreateManyInput[] = final.map((t) => ({
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
      priority: t.priority,
      isMilestone: t.isMilestone,
      isSummary: t.isSummary,
      isCritical: t.isCritical,
      totalFloatDays: t.totalFloatDays,
      freeFloatDays: t.freeFloatDays,
      notes: t.notes,
      updatedById: admin.id,
    }));
    await tx.task.createMany({ data: taskRows });

    await tx.dependency.createMany({
      data: deps.map((d) => ({
        projectId: project.id,
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        type: d.type,
        lagDays: d.lagDays,
      })),
    });

    const resourceIds = new Map<string, string>();
    for (const r of RESOURCES) {
      const created = await tx.resource.create({
        data: {
          projectId: project.id,
          name: r.name,
          type: r.type,
          email: r.email ?? null,
          rate: r.rate,
          rateCurrency: "UF",
          capacityHoursPerDay: r.capacity,
          color: r.color,
        },
      });
      resourceIds.set(r.key, created.id);
    }
    await tx.assignment.createMany({
      data: ASSIGNMENTS.map((a) => ({
        taskId: (byCode.get(a.task) as FlatTask).id,
        resourceId: resourceIds.get(a.resource) as string,
        allocationPct: a.pct,
      })),
    });

    await tx.setting.upsert({
      where: { key: "ufValue" },
      update: {},
      create: { key: "ufValue", value: 39000, updatedById: admin.id },
    });
    await tx.setting.upsert({
      where: { key: "displayCurrency" },
      update: {},
      create: { key: "displayCurrency", value: "UF", updatedById: admin.id },
    });

    await tx.auditLog.create({
      data: {
        projectId: project.id,
        userId: admin.id,
        entityType: "Project",
        entityId: project.id,
        action: "IMPORT",
        after: { name: PROJECT.name, tasks: final.length, dependencies: deps.length },
        summary: `creó el proyecto "${PROJECT.name}" desde el seed de demostración`,
      },
    });
    return project;
  });

  const leaves = final.filter((t) => !t.isSummary).length;
  const end = final.reduce<string>(
    (max, t) => (t.endDate > max ? t.endDate : max),
    PROJECT.startDate,
  );
  console.info(
    `Listo: proyecto "${project.name}" con ${final.length} tareas (${leaves} hojas), ` +
      `${deps.length} dependencias, ${RESOURCES.length} recursos, ${ASSIGNMENTS.length} asignaciones. ` +
      `Fin planificado: ${end}.`,
  );
  console.info(`Usuarios: ${USERS.map((u) => u.email).join(", ")} · contraseña: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("Error en el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
