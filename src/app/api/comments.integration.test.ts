import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import type { AuditLogDto, CommentDto, ProjectDto, TaskDto, TaskMutationResult } from "@/lib/dto";
import { POST as createProjectRoute } from "./projects/route";
import { GET as changesRoute } from "./projects/[id]/changes/route";
import { POST as createTaskRoute } from "./projects/[id]/tasks/route";
import { GET as listCommentsRoute, POST as createCommentRoute } from "./tasks/[id]/comments/route";
import { DELETE as deleteCommentRoute, PATCH as patchCommentRoute } from "./comments/[id]/route";

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

/** Usuarios propios de este archivo: no se truncan tablas, así no chocan con otros tests. */
async function ensureUser(email: string, name: string): Promise<SessionUser> {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash: "x" },
  });
  return { id: user.id, email: user.email, name: user.name };
}

let author: SessionUser;
let editor: SessionUser;
let outsider: SessionUser;
let project: ProjectDto;
let task: TaskDto;

beforeAll(async () => {
  author = await ensureUser("autor-comentarios@test.local", "Autora Comentarios");
  editor = await ensureUser("otro-comentarios@test.local", "Otro Editor");
  outsider = await ensureUser("ajeno-comentarios@test.local", "Ajeno Comentarios");

  currentUser = author;
  const created = await call<ProjectDto>(
    createProjectRoute,
    "POST",
    {},
    { name: `Comentarios ${Date.now()}`, startDate: "2026-09-07" },
  );
  expect(created.status).toBe(201);
  project = created.data;
  // La autora es ADMIN por crear el proyecto; el otro usuario entra como EDITOR.
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: editor.id, role: "EDITOR" },
  });

  const taskRes = await call<TaskMutationResult>(
    createTaskRoute,
    "POST",
    { id: project.id },
    { name: "Redactar informe", durationDays: 3 },
  );
  expect(taskRes.status).toBe(201);
  task = taskRes.data.task as TaskDto;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: project.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  currentUser = author;
});

async function newComment(body: string, mentionIds?: string[]) {
  return call<CommentDto>(
    createCommentRoute,
    "POST",
    { id: task.id },
    mentionIds ? { body, mentionIds } : { body },
  );
}

describe("Comentarios por tarea con menciones (UC-35)", () => {
  it("crea un comentario, descarta las menciones que no son del proyecto y lo lista", async () => {
    const res = await newComment(`Revisar con @${editor.name}`, [
      editor.id,
      outsider.id,
      "no-existe",
    ]);
    expect(res.status, JSON.stringify(res.error)).toBe(201);
    expect(res.data.authorName).toBe(author.name);
    // Solo el editor es miembro: el ajeno y el id inventado se descartan en silencio.
    expect(res.data.mentions).toEqual([{ id: editor.id, name: editor.name }]);

    const list = await call<CommentDto[]>(listCommentsRoute, "GET", { id: task.id });
    expect(list.status).toBe(200);
    expect(list.data.map((c) => c.body)).toContain(`Revisar con @${editor.name}`);
  });

  it("rechaza un comentario vacío con 422 VALIDATION", async () => {
    const res = await newComment("   ");
    expect(res.status).toBe(422);
    expect(res.error.code).toBe("VALIDATION");
  });

  it("el autor edita su comentario y otro usuario recibe 403", async () => {
    const created = await newComment("Texto original");
    expect(created.status).toBe(201);

    const edited = await call<CommentDto>(
      patchCommentRoute,
      "PATCH",
      { id: created.data.id },
      { body: "Texto corregido" },
    );
    expect(edited.status, JSON.stringify(edited.error)).toBe(200);
    expect(edited.data.body).toBe("Texto corregido");

    currentUser = editor;
    const forbidden = await call(
      patchCommentRoute,
      "PATCH",
      { id: created.data.id },
      { body: "No debería poder" },
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.error.code).toBe("FORBIDDEN");
  });

  it("un administrador del proyecto elimina el comentario de otra persona", async () => {
    currentUser = editor;
    const created = await newComment("Comentario del editor");
    expect(created.status).toBe(201);

    currentUser = author; // ADMIN del proyecto
    const deleted = await call<{ deleted: true }>(deleteCommentRoute, "DELETE", {
      id: created.data.id,
    });
    expect(deleted.status, JSON.stringify(deleted.error)).toBe(200);

    const list = await call<CommentDto[]>(listCommentsRoute, "GET", { id: task.id });
    expect(list.data.map((c) => c.id)).not.toContain(created.data.id);
  });

  it("un lector puede leer pero no comentar (403)", async () => {
    const reader = await ensureUser("lector-comentarios@test.local", "Lector Comentarios");
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: reader.id } },
      update: { role: "VIEWER" },
      create: { projectId: project.id, userId: reader.id, role: "VIEWER" },
    });
    currentUser = reader;

    const list = await call<CommentDto[]>(listCommentsRoute, "GET", { id: task.id });
    expect(list.status).toBe(200);

    const res = await newComment("Un lector no comenta");
    expect(res.status).toBe(403);
    expect(res.error.code).toBe("FORBIDDEN");
  });

  it("quien no es miembro del proyecto no ve ni escribe comentarios (403)", async () => {
    currentUser = outsider;
    const list = await call(listCommentsRoute, "GET", { id: task.id });
    expect(list.status).toBe(403);
    const res = await newComment("Intruso");
    expect(res.status).toBe(403);
  });

  it("los comentarios aparecen en el feed de cambios del proyecto", async () => {
    const since = new Date().toISOString();
    const created = await newComment("Comentario auditado");
    expect(created.status).toBe(201);

    const feed = await call<{ changes: AuditLogDto[]; cursor: string }>(
      changesRoute,
      "GET",
      { id: project.id },
      undefined,
      `?since=${encodeURIComponent(since)}`,
    );
    expect(feed.status).toBe(200);
    const entry = feed.data.changes.find((c) => c.entityId === created.data.id);
    expect(entry).toBeDefined();
    expect(entry?.entityType).toBe("Comment");
    expect(entry?.action).toBe("CREATE");
    expect(entry?.summary).toContain("comentó en la tarea");
    expect(entry?.userName).toBe(author.name);
  });

  it("editar y borrar también quedan registrados con su resumen", async () => {
    const created = await newComment("Se editará y borrará");
    const since = new Date().toISOString();
    await call(patchCommentRoute, "PATCH", { id: created.data.id }, { body: "Editado" });
    await call(deleteCommentRoute, "DELETE", { id: created.data.id });

    const feed = await call<{ changes: AuditLogDto[]; cursor: string }>(
      changesRoute,
      "GET",
      { id: project.id },
      undefined,
      `?since=${encodeURIComponent(since)}`,
    );
    const summaries = feed.data.changes
      .filter((c) => c.entityId === created.data.id)
      .map((c) => c.summary);
    expect(summaries.some((s) => s.startsWith("editó su comentario"))).toBe(true);
    expect(summaries.some((s) => s.startsWith("eliminó un comentario"))).toBe(true);
  });
});
