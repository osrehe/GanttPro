import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// La sesión se simula igual que en api.integration.test.ts.
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
import type { MemberDto, ProjectDto, ShareLinkDto, TaskDto, TaskMutationResult } from "@/lib/dto";
import { resolveShareToken } from "@/lib/services/share";
import { POST as createProjectRoute } from "./projects/route";
import {
  DELETE as deleteProjectRoute,
  GET as getProjectRoute,
  PATCH as patchProjectRoute,
} from "./projects/[id]/route";
import { POST as addMemberRoute } from "./projects/[id]/members/route";
import { POST as createTaskRoute } from "./projects/[id]/tasks/route";
import { POST as createResourceRoute } from "./projects/[id]/resources/route";
import { POST as createDependencyRoute } from "./projects/[id]/dependencies/route";
import { POST as createShareLinkRoute } from "./projects/[id]/share-links/route";

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

async function user(email: string, name: string): Promise<SessionUser> {
  const row = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash: "x" },
  });
  return { id: row.id, email: row.email, name: row.name };
}

interface DeleteResult {
  deleted: true;
  projectName: string;
  taskCount: number;
  dependencyCount: number;
  resourceCount: number;
}

let admin: SessionUser;
let editor: SessionUser;

/** Proyecto con dos tareas encadenadas, un recurso y un enlace de solo lectura. */
async function projectWithContent(name: string): Promise<{
  project: ProjectDto;
  tasks: TaskDto[];
  shareLink: ShareLinkDto;
}> {
  currentUser = admin;
  const created = await call<ProjectDto>(
    createProjectRoute,
    "POST",
    {},
    { name, startDate: "2026-09-07" },
  );
  expect(created.status).toBe(201);
  const project = created.data;
  const tasks: TaskDto[] = [];
  for (const taskName of ["Analizar", "Construir"]) {
    const res = await call<TaskMutationResult>(
      createTaskRoute,
      "POST",
      { id: project.id },
      { name: taskName, durationDays: 3 },
    );
    expect(res.status).toBe(201);
    tasks.push(res.data.task as TaskDto);
  }
  const dependency = await call(
    createDependencyRoute,
    "POST",
    { id: project.id },
    { predecessorId: tasks[0]?.id, successorId: tasks[1]?.id, type: "FS", lagDays: 0 },
  );
  expect(dependency.status).toBe(201);
  const resource = await call(
    createResourceRoute,
    "POST",
    { id: project.id },
    { name: "Ana Pérez", rate: 2 },
  );
  expect(resource.status).toBe(201);
  const link = await call<ShareLinkDto>(createShareLinkRoute, "POST", { id: project.id }, {});
  expect(link.status).toBe(201);
  const member = await call<MemberDto>(
    addMemberRoute,
    "POST",
    { id: project.id },
    { email: editor.email, role: "EDITOR" },
  );
  expect(member.status).toBe(201);
  return { project, tasks, shareLink: link.data };
}

beforeAll(async () => {
  admin = await user("admin-borrado@test.local", "Admin Borrado");
  editor = await user("editor-borrado@test.local", "Editor Borrado");
});

beforeEach(() => {
  currentUser = admin;
});

describe("Eliminar un proyecto (UC-39)", () => {
  it("borra el proyecto con todo su contenido y deja el registro con los conteos", async () => {
    const { project, tasks, shareLink } = await projectWithContent(`Borrar ${Date.now()}`);

    const res = await call<DeleteResult>(deleteProjectRoute, "DELETE", { id: project.id });
    expect(res.status, JSON.stringify(res.error)).toBe(200);
    expect(res.data).toMatchObject({
      deleted: true,
      projectName: project.name,
      taskCount: 2,
      dependencyCount: 1,
      resourceCount: 1,
    });

    // El proyecto y todo lo suyo desaparecieron.
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.dependency.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.resource.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.assignment.count({ where: { taskId: tasks[0]?.id } })).toBe(0);

    // El enlace de solo lectura deja de resolver.
    expect(await resolveShareToken(shareLink.token)).toBeNull();

    // Queda la huella de quién lo borró y cuánto contenía.
    const registro = await prisma.projectDeletion.findFirst({ where: { projectId: project.id } });
    expect(registro).toMatchObject({
      projectName: project.name,
      deletedById: admin.id,
      taskCount: 2,
      dependencyCount: 1,
      resourceCount: 1,
    });
  });

  it("después de borrarlo, leerlo responde 403 porque ya no hay membresía", async () => {
    const { project } = await projectWithContent(`Borrar y leer ${Date.now()}`);
    expect((await call(deleteProjectRoute, "DELETE", { id: project.id })).status).toBe(200);
    const res = await call(getProjectRoute, "GET", { id: project.id });
    expect(res.status).toBe(403);
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("un editor no puede eliminarlo y el proyecto sigue existiendo", async () => {
    const { project } = await projectWithContent(`Borrar sin permiso ${Date.now()}`);
    currentUser = editor;
    const res = await call(deleteProjectRoute, "DELETE", { id: project.id });
    expect(res.status).toBe(403);
    expect(res.error.code).toBe("FORBIDDEN");
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull();
    expect(await prisma.projectDeletion.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("un proyecto archivado también se puede eliminar", async () => {
    const { project } = await projectWithContent(`Borrar archivado ${Date.now()}`);
    const archived = await call<ProjectDto>(
      patchProjectRoute,
      "PATCH",
      { id: project.id },
      { status: "ARCHIVED" },
    );
    expect(archived.status).toBe(200);
    const res = await call<DeleteResult>(deleteProjectRoute, "DELETE", { id: project.id });
    expect(res.status, JSON.stringify(res.error)).toBe(200);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
  });

  it("un proyecto inexistente responde 403 sin revelar si existió", async () => {
    const res = await call(deleteProjectRoute, "DELETE", { id: "proyecto-inventado" });
    expect(res.status).toBe(403);
    expect(res.error.code).toBe("FORBIDDEN");
  });
});
