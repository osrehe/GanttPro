import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import type {
  AssignmentDto,
  BaselineDto,
  CommentDto,
  DependencyDto,
  MemberDto,
  ProjectDto,
  ProjectFullDto,
  ResourceDto,
  ShareLinkDto,
  TaskDto,
  TaskMutationResult,
} from "@/lib/dto";
import { POST as createProjectRoute } from "./projects/route";
import {
  GET as projectRoute,
  PATCH as patchProjectRoute,
  DELETE as deleteProjectRoute,
} from "./projects/[id]/route";
import { GET as fullRoute } from "./projects/[id]/full/route";
import { POST as createTaskRoute } from "./projects/[id]/tasks/route";
import { POST as bulkRoute } from "./projects/[id]/tasks/bulk/route";
import { POST as createDependencyRoute } from "./projects/[id]/dependencies/route";
import { POST as createResourceRoute } from "./projects/[id]/resources/route";
import { POST as createBaselineRoute } from "./projects/[id]/baselines/route";
import { GET as changesRoute } from "./projects/[id]/changes/route";
import { PATCH as patchCalendarRoute } from "./projects/[id]/calendar/route";
import { GET as membersRoute, POST as addMemberRoute } from "./projects/[id]/members/route";
import {
  GET as shareLinksRoute,
  POST as createShareLinkRoute,
} from "./projects/[id]/share-links/route";
import {
  GET as taskRoute,
  PATCH as patchTaskRoute,
  DELETE as deleteTaskRoute,
} from "./tasks/[id]/route";
import { POST as moveTaskRoute } from "./tasks/[id]/move/route";
import { POST as createAssignmentRoute } from "./tasks/[id]/assignments/route";
import { GET as commentsRoute, POST as createCommentRoute } from "./tasks/[id]/comments/route";
import {
  PATCH as patchDependencyRoute,
  DELETE as deleteDependencyRoute,
} from "./dependencies/[id]/route";
import { PATCH as patchResourceRoute, DELETE as deleteResourceRoute } from "./resources/[id]/route";
import {
  PATCH as patchAssignmentRoute,
  DELETE as deleteAssignmentRoute,
} from "./assignments/[id]/route";
import { GET as baselineRoute, DELETE as deleteBaselineRoute } from "./baselines/[id]/route";
import { PATCH as patchMemberRoute, DELETE as deleteMemberRoute } from "./members/[id]/route";
import { DELETE as revokeShareLinkRoute } from "./share-links/[id]/route";
import { PATCH as patchCommentRoute, DELETE as deleteCommentRoute } from "./comments/[id]/route";

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
): Promise<{ status: number; data: T; error: { code: string; message: string } }> {
  const request = new Request("http://localhost/api/test", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) } as never);
  const json = (await response.json()) as {
    data?: T;
    error?: { code: string; message: string };
  };
  return { status: response.status, data: json.data as T, error: json.error as never };
}

/** Usuarios propios de este archivo: los tests de integración comparten la base y no la truncan. */
let dueño: SessionUser;
let ajeno: SessionUser;
let lector: SessionUser;

/** Proyecto B, con una entidad de cada tipo, al que `ajeno` no pertenece. */
interface ProyectoAjeno {
  project: ProjectDto;
  task: TaskDto;
  otherTask: TaskDto;
  dependency: DependencyDto;
  resource: ResourceDto;
  assignment: AssignmentDto;
  baseline: BaselineDto;
  member: MemberDto;
  shareLink: ShareLinkDto;
  comment: CommentDto;
}

let ajeno_: ProyectoAjeno;
/** Proyecto propio de `ajeno`, para comprobar que sí puede operar donde corresponde. */
let proyectoDelAjeno: ProjectDto;

async function crearUsuario(email: string, name: string): Promise<SessionUser> {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash: "x" },
  });
  return { id: user.id, email: user.email, name: user.name };
}

beforeAll(async () => {
  dueño = await crearUsuario("sec-a@test.local", "Dueña Seguridad");
  ajeno = await crearUsuario("sec-b@test.local", "Ajeno Seguridad");
  lector = await crearUsuario("sec-lector@test.local", "Lector Seguridad");

  currentUser = dueño;
  const project = (
    await call<ProjectDto>(
      createProjectRoute,
      "POST",
      {},
      { name: `Seguridad B ${Date.now()}`, startDate: "2026-09-07" },
    )
  ).data;

  const task = (
    await call<TaskMutationResult>(
      createTaskRoute,
      "POST",
      { id: project.id },
      { name: "Tarea A", durationDays: 3 },
    )
  ).data.task as TaskDto;
  const otherTask = (
    await call<TaskMutationResult>(
      createTaskRoute,
      "POST",
      { id: project.id },
      { name: "Tarea B", durationDays: 2 },
    )
  ).data.task as TaskDto;

  const dependency = (
    await call<{ dependency: DependencyDto }>(
      createDependencyRoute,
      "POST",
      { id: project.id },
      { predecessorId: task.id, successorId: otherTask.id, type: "FS", lagDays: 0 },
    )
  ).data.dependency;

  const resource = (
    await call<ResourceDto>(
      createResourceRoute,
      "POST",
      { id: project.id },
      { name: "Recurso B", type: "PERSON", rate: 1, rateCurrency: "UF" },
    )
  ).data;

  const assignment = (
    await call<AssignmentDto>(
      createAssignmentRoute,
      "POST",
      { id: task.id },
      { resourceId: resource.id, allocationPct: 50 },
    )
  ).data;

  const baseline = (
    await call<BaselineDto>(createBaselineRoute, "POST", { id: project.id }, { name: "Base B" })
  ).data;

  const memberRes = await call<MemberDto>(
    addMemberRoute,
    "POST",
    { id: project.id },
    { email: lector.email, role: "VIEWER" },
  );
  expect(memberRes.status, JSON.stringify(memberRes.error)).toBe(201);

  const shareLink = (await call<ShareLinkDto>(createShareLinkRoute, "POST", { id: project.id }, {}))
    .data;

  const comment = (
    await call<CommentDto>(createCommentRoute, "POST", { id: task.id }, { body: "Comentario B" })
  ).data;

  ajeno_ = {
    project,
    task,
    otherTask,
    dependency,
    resource,
    assignment,
    baseline,
    member: memberRes.data,
    shareLink,
    comment,
  };

  currentUser = ajeno;
  proyectoDelAjeno = (
    await call<ProjectDto>(
      createProjectRoute,
      "POST",
      {},
      { name: `Seguridad A ${Date.now()}`, startDate: "2026-09-07" },
    )
  ).data;
});

beforeEach(() => {
  currentUser = ajeno;
});

/** Toda respuesta negada: 403 o 404, nunca 200 y nunca 500. */
function esperarDenegado(res: { status: number; data: unknown; error: { code: string } }): void {
  expect([403, 404], `status ${res.status} con code ${res.error?.code}`).toContain(res.status);
  expect(["FORBIDDEN", "NOT_FOUND"]).toContain(res.error.code);
  expect(res.data).toBeUndefined();
}

describe("Autorización cruzada entre proyectos", () => {
  it("no puede leer el proyecto ajeno por ninguna de sus rutas de lectura", async () => {
    esperarDenegado(await call(projectRoute, "GET", { id: ajeno_.project.id }));
    esperarDenegado(await call(fullRoute, "GET", { id: ajeno_.project.id }));
    esperarDenegado(await call(changesRoute, "GET", { id: ajeno_.project.id }));
    esperarDenegado(await call(membersRoute, "GET", { id: ajeno_.project.id }));
    esperarDenegado(await call(shareLinksRoute, "GET", { id: ajeno_.project.id }));
    esperarDenegado(await call(taskRoute, "GET", { id: ajeno_.task.id }));
    esperarDenegado(await call(commentsRoute, "GET", { id: ajeno_.task.id }));
    esperarDenegado(await call(baselineRoute, "GET", { id: ajeno_.baseline.id }));
  });

  it("no puede escribir en el proyecto ajeno por ninguna de sus rutas de mutación", async () => {
    esperarDenegado(
      await call(patchProjectRoute, "PATCH", { id: ajeno_.project.id }, { name: "Secuestrado" }),
    );
    esperarDenegado(await call(deleteProjectRoute, "DELETE", { id: ajeno_.project.id }));
    esperarDenegado(
      await call(createTaskRoute, "POST", { id: ajeno_.project.id }, { name: "Intrusa" }),
    );
    esperarDenegado(
      await call(
        bulkRoute,
        "POST",
        { id: ajeno_.project.id },
        { updates: [{ id: ajeno_.task.id, name: "Intrusa" }] },
      ),
    );
    esperarDenegado(
      await call(patchCalendarRoute, "PATCH", { id: ajeno_.project.id }, { hoursPerDay: 4 }),
    );
    esperarDenegado(
      await call(
        createDependencyRoute,
        "POST",
        { id: ajeno_.project.id },
        { predecessorId: ajeno_.otherTask.id, successorId: ajeno_.task.id },
      ),
    );
    esperarDenegado(
      await call(createResourceRoute, "POST", { id: ajeno_.project.id }, { name: "Intruso" }),
    );
    esperarDenegado(
      await call(createBaselineRoute, "POST", { id: ajeno_.project.id }, { name: "Intrusa" }),
    );
    esperarDenegado(
      await call(
        addMemberRoute,
        "POST",
        { id: ajeno_.project.id },
        { email: ajeno.email, role: "ADMIN" },
      ),
    );
    esperarDenegado(await call(createShareLinkRoute, "POST", { id: ajeno_.project.id }, {}));
  });

  it("no puede tocar entidades ajenas direccionadas por su propio id", async () => {
    esperarDenegado(
      await call(patchTaskRoute, "PATCH", { id: ajeno_.task.id }, { name: "Secuestrada" }),
    );
    esperarDenegado(await call(deleteTaskRoute, "DELETE", { id: ajeno_.task.id }));
    esperarDenegado(await call(moveTaskRoute, "POST", { id: ajeno_.task.id }, { action: "down" }));
    esperarDenegado(
      await call(
        createAssignmentRoute,
        "POST",
        { id: ajeno_.task.id },
        { resourceId: ajeno_.resource.id },
      ),
    );
    esperarDenegado(
      await call(createCommentRoute, "POST", { id: ajeno_.task.id }, { body: "Intruso" }),
    );
    esperarDenegado(
      await call(patchDependencyRoute, "PATCH", { id: ajeno_.dependency.id }, { lagDays: 5 }),
    );
    esperarDenegado(await call(deleteDependencyRoute, "DELETE", { id: ajeno_.dependency.id }));
    esperarDenegado(
      await call(patchResourceRoute, "PATCH", { id: ajeno_.resource.id }, { name: "Intruso" }),
    );
    esperarDenegado(await call(deleteResourceRoute, "DELETE", { id: ajeno_.resource.id }));
    esperarDenegado(
      await call(
        patchAssignmentRoute,
        "PATCH",
        { id: ajeno_.assignment.id },
        { allocationPct: 10 },
      ),
    );
    esperarDenegado(await call(deleteAssignmentRoute, "DELETE", { id: ajeno_.assignment.id }));
    esperarDenegado(await call(deleteBaselineRoute, "DELETE", { id: ajeno_.baseline.id }));
    esperarDenegado(
      await call(patchMemberRoute, "PATCH", { id: ajeno_.member.id }, { role: "ADMIN" }),
    );
    esperarDenegado(await call(deleteMemberRoute, "DELETE", { id: ajeno_.member.id }));
    esperarDenegado(await call(revokeShareLinkRoute, "DELETE", { id: ajeno_.shareLink.id }));
    esperarDenegado(
      await call(patchCommentRoute, "PATCH", { id: ajeno_.comment.id }, { body: "Intruso" }),
    );
    esperarDenegado(await call(deleteCommentRoute, "DELETE", { id: ajeno_.comment.id }));
  });

  it("un id inventado o mal formado responde 404 o 422, nunca 500", async () => {
    for (const id of ["no-existe", "../../etc/passwd", "1' OR '1'='1", "%00", "x".repeat(300)]) {
      const lectura = await call(taskRoute, "GET", { id });
      expect(lectura.status, `GET tarea ${id}`).toBeLessThan(500);
      expect([403, 404, 422]).toContain(lectura.status);

      const escritura = await call(patchTaskRoute, "PATCH", { id }, { name: "x" });
      expect(escritura.status, `PATCH tarea ${id}`).toBeLessThan(500);
      expect([403, 404, 422]).toContain(escritura.status);

      const proyecto = await call(fullRoute, "GET", { id });
      expect(proyecto.status, `GET proyecto ${id}`).toBeLessThan(500);
      expect([403, 404, 422]).toContain(proyecto.status);
    }
  });

  it("sin sesión, cualquier ruta responde 401 sin filtrar datos", async () => {
    currentUser = null;
    for (const res of [
      await call(fullRoute, "GET", { id: ajeno_.project.id }),
      await call(taskRoute, "GET", { id: ajeno_.task.id }),
      await call(patchTaskRoute, "PATCH", { id: ajeno_.task.id }, { name: "x" }),
      await call(commentsRoute, "GET", { id: ajeno_.task.id }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.error.code).toBe("UNAUTHORIZED");
      expect(res.data).toBeUndefined();
    }
  });
});

describe("Roles y proyectos archivados", () => {
  it("un lector puede leer pero no escribir en el proyecto donde es miembro", async () => {
    currentUser = lector;
    const lectura = await call<ProjectFullDto>(fullRoute, "GET", { id: ajeno_.project.id });
    expect(lectura.status).toBe(200);
    expect(lectura.data.tasks.length).toBeGreaterThan(0);

    for (const res of [
      await call(createTaskRoute, "POST", { id: ajeno_.project.id }, { name: "Del lector" }),
      await call(patchTaskRoute, "PATCH", { id: ajeno_.task.id }, { name: "Del lector" }),
      await call(createResourceRoute, "POST", { id: ajeno_.project.id }, { name: "Del lector" }),
      await call(createCommentRoute, "POST", { id: ajeno_.task.id }, { body: "Del lector" }),
      await call(createBaselineRoute, "POST", { id: ajeno_.project.id }, { name: "Del lector" }),
      await call(createShareLinkRoute, "POST", { id: ajeno_.project.id }, {}),
      await call(
        addMemberRoute,
        "POST",
        { id: ajeno_.project.id },
        { email: ajeno.email, role: "VIEWER" },
      ),
    ]) {
      expect(res.status, JSON.stringify(res.error)).toBe(403);
      expect(res.error.code).toBe("FORBIDDEN");
    }
  });

  it("un proyecto archivado admite lectura pero rechaza las mutaciones", async () => {
    currentUser = ajeno;
    const archivado = await call<ProjectDto>(
      patchProjectRoute,
      "PATCH",
      { id: proyectoDelAjeno.id },
      { status: "ARCHIVED" },
    );
    expect(archivado.status, JSON.stringify(archivado.error)).toBe(200);
    expect(archivado.data.status).toBe("ARCHIVED");

    const lectura = await call<ProjectFullDto>(fullRoute, "GET", { id: proyectoDelAjeno.id });
    expect(lectura.status).toBe(200);

    const escritura = await call(
      createTaskRoute,
      "POST",
      { id: proyectoDelAjeno.id },
      { name: "En proyecto archivado" },
    );
    expect(escritura.status).toBe(422);
    expect(escritura.error.code).toBe("VALIDATION");
    expect(escritura.error.message).toContain("archivado");

    // Restaurarlo vuelve a permitir escribir.
    const restaurado = await call<ProjectDto>(
      patchProjectRoute,
      "PATCH",
      { id: proyectoDelAjeno.id },
      { status: "ACTIVE" },
    );
    expect(restaurado.status).toBe(200);
    const creada = await call(
      createTaskRoute,
      "POST",
      { id: proyectoDelAjeno.id },
      { name: "Tras restaurar" },
    );
    expect(creada.status).toBe(201);
  });
});
