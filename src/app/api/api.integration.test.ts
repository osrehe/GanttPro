import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// La sesión se simula: los handlers obtienen el usuario de `getSessionUser`.
vi.mock("@/lib/auth", () => {
  class UnauthorizedError extends Error {
    readonly code = "UNAUTHORIZED";
    constructor() {
      super("Debes iniciar sesión");
      this.name = "UnauthorizedError";
    }
  }
  return { getSessionUser: vi.fn(), UnauthorizedError, hashPassword: async (p: string) => p };
});

import { getSessionUser, UnauthorizedError, type SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ProjectDto, ProjectFullDto, TaskDto, TaskMutationResult } from "@/lib/dto";
import { POST as createProjectRoute } from "./projects/route";
import { GET as fullRoute } from "./projects/[id]/full/route";
import { POST as createTaskRoute } from "./projects/[id]/tasks/route";
import { POST as bulkRoute } from "./projects/[id]/tasks/bulk/route";
import { POST as createDependencyRoute } from "./projects/[id]/dependencies/route";
import { GET as changesRoute } from "./projects/[id]/changes/route";
import { POST as createBaselineRoute } from "./projects/[id]/baselines/route";
import { POST as createResourceRoute } from "./projects/[id]/resources/route";
import { PATCH as patchTaskRoute, DELETE as deleteTaskRoute } from "./tasks/[id]/route";
import { POST as moveTaskRoute } from "./tasks/[id]/move/route";
import { POST as createAssignmentRoute } from "./tasks/[id]/assignments/route";
import { DELETE as deleteDependencyRoute } from "./dependencies/[id]/route";

let currentUser: SessionUser | null = null;
vi.mocked(getSessionUser).mockImplementation(async () => {
  if (!currentUser) throw new UnauthorizedError();
  return currentUser;
});

type Handler = (request: Request, context: never) => Promise<Response>;

async function call<T = unknown>(
  handler: Handler,
  method: string,
  params: Record<string, string> = {},
  body?: unknown,
  query = "",
): Promise<{
  status: number;
  data: T;
  error: { code: string; message: string; details?: Record<string, unknown> };
}> {
  const request = new Request(`http://localhost/api/test${query}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) } as never);
  const json = (await response.json()) as {
    data?: T;
    error?: { code: string; message: string; details?: Record<string, unknown> };
  };
  return { status: response.status, data: json.data as T, error: json.error as never };
}

let admin: SessionUser;
let outsider: SessionUser;

async function newProject(name: string): Promise<ProjectDto> {
  const res = await call<ProjectDto>(
    createProjectRoute,
    "POST",
    {},
    { name, startDate: "2026-09-07" },
  );
  expect(res.status).toBe(201);
  return res.data;
}

async function newTask(
  projectId: string,
  name: string,
  extra: Record<string, unknown> = {},
): Promise<TaskDto> {
  const res = await call<TaskMutationResult>(
    createTaskRoute,
    "POST",
    { id: projectId },
    { name, ...extra },
  );
  expect(res.status, JSON.stringify(res.error)).toBe(201);
  return res.data.task as TaskDto;
}

function span(t: TaskDto): string {
  return `${t.startDate} – ${t.endDate}`;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "User", "Project", "Setting" RESTART IDENTITY CASCADE`);
  const a = await prisma.user.create({
    data: { email: "admin@test.local", name: "Admin Test", passwordHash: "x" },
  });
  const o = await prisma.user.create({
    data: { email: "ajeno@test.local", name: "Usuario Ajeno", passwordHash: "x" },
  });
  admin = { id: a.id, email: a.email, name: a.name };
  outsider = { id: o.id, email: o.email, name: o.name };
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  currentUser = admin;
});

describe("Autorización", () => {
  it("sin sesión responde 401 UNAUTHORIZED", async () => {
    currentUser = null;
    const res = await call(createProjectRoute, "POST", {}, { name: "X", startDate: "2026-09-07" });
    expect(res.status).toBe(401);
    expect(res.error.code).toBe("UNAUTHORIZED");
  });

  it("un usuario sin membresía recibe 403 FORBIDDEN en lectura y escritura", async () => {
    const project = await newProject("Proyecto privado");
    currentUser = outsider;
    const read = await call(fullRoute, "GET", { id: project.id });
    expect(read.status).toBe(403);
    expect(read.error.code).toBe("FORBIDDEN");
    const write = await call(createTaskRoute, "POST", { id: project.id }, { name: "Intrusa" });
    expect(write.status).toBe(403);
  });

  it("un cuerpo inválido responde 422 VALIDATION con los campos", async () => {
    const res = await call(createProjectRoute, "POST", {}, { name: "", startDate: "07-09-2026" });
    expect(res.status).toBe(422);
    expect(res.error.code).toBe("VALIDATION");
    expect(res.error.details?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "startDate" })]),
    );
  });
});

describe("Proyecto completo", () => {
  it("crea el calendario base con los feriados de Chile del año de inicio", async () => {
    const project = await newProject("Con calendario");
    const res = await call<ProjectFullDto>(fullRoute, "GET", { id: project.id });
    expect(res.status).toBe(200);
    expect(res.data.role).toBe("ADMIN");
    expect(res.data.calendar.isBase).toBe(true);
    expect(res.data.calendar.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(res.data.calendar.holidays.map((h) => h.date)).toContain("2026-09-18");
    expect(res.data.tasks).toEqual([]);
    expect(res.data.members.map((m) => m.email)).toEqual(["admin@test.local"]);
  });
});

describe("Tareas, dependencias y reprogramación (UC-10, UC-11, UC-13)", () => {
  it("crear tarea → crear dependencia → mover predecesora → la sucesora se mueve", async () => {
    const project = await newProject("Reprogramación");
    const a = await newTask(project.id, "A", { durationDays: 5 });
    const b = await newTask(project.id, "B", { durationDays: 3 });
    expect([a.wbsCode, b.wbsCode]).toEqual(["1", "2"]);
    expect(span(a)).toBe("2026-09-07 – 2026-09-11");
    expect(span(b)).toBe("2026-09-07 – 2026-09-09");

    const dep = await call<{ dependency: { id: string; type: string }; affected: TaskDto[] }>(
      createDependencyRoute,
      "POST",
      { id: project.id },
      { predecessorId: a.id, successorId: b.id },
    );
    expect(dep.status).toBe(201);
    expect(dep.data.dependency.type).toBe("FS");
    const bAfterDep = dep.data.affected.find((t) => t.id === b.id) as TaskDto;
    expect(span(bAfterDep)).toBe("2026-09-14 – 2026-09-16");

    const moved = await call<TaskMutationResult>(
      patchTaskRoute,
      "PATCH",
      { id: a.id },
      { anchorDate: "2026-09-10" },
    );
    expect(moved.status).toBe(200);
    expect(span(moved.data.task as TaskDto)).toBe("2026-09-10 – 2026-09-16");
    const bMoved = moved.data.affected.find((t) => t.id === b.id) as TaskDto;
    expect(span(bMoved)).toBe("2026-09-17 – 2026-09-22");

    // Quitar la dependencia devuelve a B a su ancla (UC-13).
    const removed = await call<{ affected: TaskDto[] }>(deleteDependencyRoute, "DELETE", {
      id: dep.data.dependency.id,
    });
    expect(removed.status).toBe(200);
    const bReleased = removed.data.affected.find((t) => t.id === b.id) as TaskDto;
    expect(span(bReleased)).toBe("2026-09-07 – 2026-09-09");

    // Editar la fecha de fin ajusta la duración en días hábiles.
    const longer = await call<TaskMutationResult>(
      patchTaskRoute,
      "PATCH",
      { id: b.id },
      { endDate: "2026-09-15" },
    );
    expect(longer.status).toBe(200);
    expect(longer.data.task?.durationDays).toBe(7);
  });

  it("un ciclo responde 422 CYCLE con los códigos WBS y no cambia nada", async () => {
    const project = await newProject("Ciclo");
    const a = await newTask(project.id, "A");
    const b = await newTask(project.id, "B");
    const c = await newTask(project.id, "C");
    for (const [p, s] of [
      [a, b],
      [b, c],
    ]) {
      const res = await call(
        createDependencyRoute,
        "POST",
        { id: project.id },
        { predecessorId: p!.id, successorId: s!.id },
      );
      expect(res.status).toBe(201);
    }
    const cycle = await call(
      createDependencyRoute,
      "POST",
      { id: project.id },
      { predecessorId: c.id, successorId: a.id },
    );
    expect(cycle.status).toBe(422);
    expect(cycle.error.code).toBe("CYCLE");
    expect(cycle.error.details?.cycle).toEqual(["1", "2", "3", "1"]);
    expect(cycle.error.message).toBe("La dependencia crearía un ciclo: 1 → 2 → 3 → 1");
    expect(await prisma.dependency.count({ where: { projectId: project.id } })).toBe(2);

    const duplicate = await call(
      createDependencyRoute,
      "POST",
      { id: project.id },
      { predecessorId: a.id, successorId: b.id },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.error.code).toBe("CONFLICT");
  });

  it("rechaza dependencias hacia una tarea resumen", async () => {
    const project = await newProject("Resumen");
    const parent = await newTask(project.id, "Padre");
    await newTask(project.id, "Hija", { parentId: parent.id });
    const other = await newTask(project.id, "Otra");
    const res = await call(
      createDependencyRoute,
      "POST",
      { id: project.id },
      { predecessorId: parent.id, successorId: other.id },
    );
    expect(res.status).toBe(422);
    expect(res.error.message).toContain("resumen");
  });
});

describe("WBS: indentar, desindentar, mover y eliminar (UC-07, UC-08)", () => {
  it("reindentar reasigna los códigos WBS de todo el proyecto", async () => {
    const project = await newProject("WBS");
    const x = await newTask(project.id, "X");
    const y = await newTask(project.id, "Y");
    const z = await newTask(project.id, "Z");

    const indentY = await call<{ tasks: TaskDto[] }>(
      moveTaskRoute,
      "POST",
      { id: y.id },
      { action: "indent" },
    );
    expect(indentY.status).toBe(200);
    expect(codes(indentY.data.tasks)).toEqual({ X: "1", Y: "1.1", Z: "2" });
    expect(indentY.data.tasks.find((t) => t.id === x.id)?.isSummary).toBe(true);

    const indentZ = await call<{ tasks: TaskDto[] }>(
      moveTaskRoute,
      "POST",
      { id: z.id },
      { action: "indent" },
    );
    expect(codes(indentZ.data.tasks)).toEqual({ X: "1", Y: "1.1", Z: "1.2" });

    const outdentY = await call<{ tasks: TaskDto[] }>(
      moveTaskRoute,
      "POST",
      { id: y.id },
      { action: "outdent" },
    );
    expect(codes(outdentY.data.tasks)).toEqual({ X: "1", Y: "2", Z: "2.1" });
    const xLeaf = outdentY.data.tasks.find((t) => t.id === x.id) as TaskDto;
    expect(xLeaf.isSummary).toBe(false);
    expect(xLeaf.anchorDate).toBe("2026-09-07");

    const invalid = await call(
      moveTaskRoute,
      "POST",
      { id: y.id },
      { action: "move", parentId: z.id, index: 0 },
    );
    expect(invalid.status).toBe(422);
    expect(invalid.error.message).toBe(
      "Una tarea no puede moverse dentro de sus propias subtareas",
    );

    const first = await call(moveTaskRoute, "POST", { id: x.id }, { action: "indent" });
    expect(first.status).toBe(422);

    // Eliminar Y elimina también a Z y renumera.
    const del = await call<TaskMutationResult>(deleteTaskRoute, "DELETE", { id: y.id });
    expect(del.status).toBe(200);
    expect(del.data.deletedIds?.sort()).toEqual([y.id, z.id].sort());
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("no permite convertir en resumen a una hoja con dependencias", async () => {
    const project = await newProject("Guardas");
    const a = await newTask(project.id, "A");
    const b = await newTask(project.id, "B");
    await call(
      createDependencyRoute,
      "POST",
      { id: project.id },
      { predecessorId: a.id, successorId: b.id },
    );
    const res = await call(moveTaskRoute, "POST", { id: b.id }, { action: "indent" });
    expect(res.status).toBe(422);
    expect(res.error.message).toContain("dependencias");
    const child = await call(
      createTaskRoute,
      "POST",
      { id: project.id },
      { name: "Hija de A", parentId: a.id },
    );
    expect(child.status).toBe(422);
  });
});

describe("Bulk, auditoría y feed de cambios (UC-21, UC-25, UC-36)", () => {
  it("aplica varias actualizaciones con un operationId y las expone en /changes", async () => {
    const project = await newProject("Bulk");
    const a = await newTask(project.id, "A", { durationDays: 2 });
    const b = await newTask(project.id, "B", { durationDays: 2 });
    const before = await call<{ cursor: string; changes: unknown[] }>(changesRoute, "GET", {
      id: project.id,
    });
    expect(before.status).toBe(200);
    expect(before.data.changes.length).toBeGreaterThanOrEqual(3);

    const bulk = await call<{ affected: TaskDto[]; operationId: string }>(
      bulkRoute,
      "POST",
      { id: project.id },
      {
        operationId: "op-1",
        summary: "marcó avance",
        updates: [
          { id: a.id, progressPct: 100 },
          { id: b.id, progressPct: 50 },
        ],
      },
    );
    expect(bulk.status).toBe(200);
    expect(bulk.data.operationId).toBe("op-1");
    const statuses = Object.fromEntries(
      bulk.data.affected.map((t) => [t.name, [t.progressPct, t.status]]),
    );
    expect(statuses).toEqual({ A: [100, "DONE"], B: [50, "IN_PROGRESS"] });

    const after = await call<{
      cursor: string;
      changes: Array<{ operationId: string | null; userName: string; summary: string }>;
    }>(
      changesRoute,
      "GET",
      { id: project.id },
      undefined,
      `?since=${encodeURIComponent(before.data.cursor)}`,
    );
    expect(after.data.changes).toHaveLength(2);
    expect(after.data.changes.every((c) => c.operationId === "op-1")).toBe(true);
    expect(after.data.changes[0]?.userName).toBe("Admin Test");
    expect(after.data.changes[0]?.summary).toBe("marcó avance");
  });
});

describe("Recursos, asignaciones y líneas base (UC-15, UC-16, UC-19)", () => {
  it("asigna recursos solo a hojas y evita duplicados", async () => {
    const project = await newProject("Recursos");
    const parent = await newTask(project.id, "Padre");
    const leaf = await newTask(project.id, "Hija", { parentId: parent.id, durationDays: 5 });
    const resource = await call<{ id: string }>(
      createResourceRoute,
      "POST",
      { id: project.id },
      { name: "Ana", rate: 1.5 },
    );
    expect(resource.status).toBe(201);
    const ok = await call(
      createAssignmentRoute,
      "POST",
      { id: leaf.id },
      { resourceId: resource.data.id, allocationPct: 50 },
    );
    expect(ok.status).toBe(201);
    const dup = await call(
      createAssignmentRoute,
      "POST",
      { id: leaf.id },
      { resourceId: resource.data.id },
    );
    expect(dup.status).toBe(409);
    const onSummary = await call(
      createAssignmentRoute,
      "POST",
      { id: parent.id },
      { resourceId: resource.data.id },
    );
    expect(onSummary.status).toBe(422);
  });

  it("guarda hasta 5 líneas base con la fotografía de las tareas", async () => {
    const project = await newProject("Baselines");
    await newTask(project.id, "A", { durationDays: 3 });
    for (let i = 1; i <= 5; i++) {
      const res = await call<{ taskCount: number; name: string }>(
        createBaselineRoute,
        "POST",
        { id: project.id },
        { name: `LB ${i}` },
      );
      expect(res.status).toBe(201);
      expect(res.data.taskCount).toBe(1);
    }
    const sixth = await call(createBaselineRoute, "POST", { id: project.id }, {});
    expect(sixth.status).toBe(422);
    expect(sixth.error.message).toBe("Máximo 5 líneas base; elimina una para continuar");
  });
});

function codes(tasks: TaskDto[]): Record<string, string> {
  return Object.fromEntries(tasks.map((t) => [t.name, t.wbsCode]));
}
