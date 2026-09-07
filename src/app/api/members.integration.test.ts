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
import type { MemberDto, ProjectDto, TaskDto, TaskMutationResult } from "@/lib/dto";
import type { ImportedPlan } from "@/lib/import/types";
import { POST as importRoute } from "./import/route";
import { PATCH as patchMemberRoute, DELETE as deleteMemberRoute } from "./members/[id]/route";
import { POST as createProjectRoute } from "./projects/route";
import { PATCH as patchProjectRoute, DELETE as deleteProjectRoute } from "./projects/[id]/route";
import { GET as changesRoute } from "./projects/[id]/changes/route";
import { GET as fullRoute } from "./projects/[id]/full/route";
import { GET as listMembersRoute, POST as addMemberRoute } from "./projects/[id]/members/route";
import { POST as createBaselineRoute } from "./projects/[id]/baselines/route";
import { POST as createDependencyRoute } from "./projects/[id]/dependencies/route";
import { POST as createResourceRoute } from "./projects/[id]/resources/route";
import { POST as createShareLinkRoute } from "./projects/[id]/share-links/route";
import { POST as createTaskRoute } from "./projects/[id]/tasks/route";
import { POST as bulkRoute } from "./projects/[id]/tasks/bulk/route";
import { PATCH as patchTaskRoute } from "./tasks/[id]/route";

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
): Promise<{
  status: number;
  data: T;
  error: { code: string; message: string; details?: Record<string, unknown> };
}> {
  const request = new Request("http://localhost/api/test", {
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

async function user(email: string, name: string): Promise<SessionUser> {
  const row = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, passwordHash: "x" },
  });
  return { id: row.id, email: row.email, name: row.name };
}

let admin: SessionUser;
let editor: SessionUser;
let viewer: SessionUser;
let outsider: SessionUser;
let project: ProjectDto;
let task: TaskDto;

const PLAN: ImportedPlan = {
  source: "csv",
  projectName: null,
  startDate: null,
  resources: [],
  tasks: [
    {
      row: 2,
      wbs: "1",
      level: 1,
      name: "Importada",
      durationDays: 2,
      startDate: null,
      isMilestone: false,
      progressPct: 0,
      predecessors: "",
      resources: [],
      notes: null,
    },
  ],
};

beforeAll(async () => {
  admin = await user("admin-roles@test.local", "Admin Roles");
  editor = await user("editor-roles@test.local", "Editor Roles");
  viewer = await user("lector-roles@test.local", "Lector Roles");
  outsider = await user("ajeno-roles@test.local", "Ajeno Roles");

  currentUser = admin;
  const created = await call<ProjectDto>(
    createProjectRoute,
    "POST",
    {},
    { name: `Roles ${Date.now()}`, startDate: "2026-09-07" },
  );
  expect(created.status).toBe(201);
  project = created.data;

  const createdTask = await call<TaskMutationResult>(
    createTaskRoute,
    "POST",
    { id: project.id },
    { name: "Tarea base", durationDays: 3 },
  );
  expect(createdTask.status).toBe(201);
  task = createdTask.data.task as TaskDto;
});

beforeEach(() => {
  currentUser = admin;
});

describe("Miembros del proyecto (UC-32)", () => {
  it("el administrador agrega un editor y un lector", async () => {
    const asEditor = await call<MemberDto>(
      addMemberRoute,
      "POST",
      { id: project.id },
      { email: editor.email, role: "EDITOR" },
    );
    expect(asEditor.status, JSON.stringify(asEditor.error)).toBe(201);
    expect(asEditor.data.role).toBe("EDITOR");
    expect(asEditor.data.name).toBe("Editor Roles");

    const asViewer = await call<MemberDto>(
      addMemberRoute,
      "POST",
      { id: project.id },
      { email: viewer.email, role: "VIEWER" },
    );
    expect(asViewer.status).toBe(201);

    const list = await call<MemberDto[]>(listMembersRoute, "GET", { id: project.id });
    expect(list.status).toBe(200);
    expect(list.data.map((m) => m.email).sort()).toEqual(
      [admin.email, editor.email, viewer.email].sort(),
    );
  });

  it("agregar un correo desconocido responde 404 y repetir un miembro 409", async () => {
    const unknown = await call(
      addMemberRoute,
      "POST",
      { id: project.id },
      { email: "nadie@test.local", role: "EDITOR" },
    );
    expect(unknown.status).toBe(404);
    expect(unknown.error.code).toBe("NOT_FOUND");

    const repeated = await call(
      addMemberRoute,
      "POST",
      { id: project.id },
      { email: editor.email, role: "EDITOR" },
    );
    expect(repeated.status).toBe(409);
    expect(repeated.error.code).toBe("CONFLICT");
  });

  it("el último administrador no se puede degradar ni quitar", async () => {
    const list = await call<MemberDto[]>(listMembersRoute, "GET", { id: project.id });
    const adminMember = list.data.find((m) => m.userId === admin.id) as MemberDto;

    const demote = await call(
      patchMemberRoute,
      "PATCH",
      { id: adminMember.id },
      { role: "EDITOR" },
    );
    expect(demote.status).toBe(422);
    expect(demote.error.message).toContain("al menos un administrador");

    const removed = await call(deleteMemberRoute, "DELETE", { id: adminMember.id });
    expect(removed.status).toBe(422);

    // Con un segundo administrador sí se puede degradar al primero y volver a dejarlo como estaba.
    const editorMember = list.data.find((m) => m.userId === editor.id) as MemberDto;
    const promote = await call<MemberDto>(
      patchMemberRoute,
      "PATCH",
      { id: editorMember.id },
      { role: "ADMIN" },
    );
    expect(promote.status).toBe(200);
    const demoteAgain = await call<MemberDto>(
      patchMemberRoute,
      "PATCH",
      { id: adminMember.id },
      { role: "ADMIN" },
    );
    expect(demoteAgain.status).toBe(200);
    const back = await call<MemberDto>(
      patchMemberRoute,
      "PATCH",
      { id: editorMember.id },
      { role: "EDITOR" },
    );
    expect(back.status).toBe(200);
    expect(back.data.role).toBe("EDITOR");
  });

  it("quitar a un miembro lo deja sin acceso", async () => {
    currentUser = admin;
    const added = await call<MemberDto>(
      addMemberRoute,
      "POST",
      { id: project.id },
      { email: outsider.email, role: "VIEWER" },
    );
    expect(added.status).toBe(201);
    currentUser = outsider;
    expect((await call(fullRoute, "GET", { id: project.id })).status).toBe(200);

    currentUser = admin;
    const removed = await call(deleteMemberRoute, "DELETE", { id: added.data.id });
    expect(removed.status).toBe(200);

    currentUser = outsider;
    expect((await call(fullRoute, "GET", { id: project.id })).status).toBe(403);
  });
});

describe("El rol lector es de solo lectura (UC-32)", () => {
  beforeEach(() => {
    currentUser = viewer;
  });

  it("lee el proyecto y su historial", async () => {
    expect((await call(fullRoute, "GET", { id: project.id })).status).toBe(200);
    expect((await call(changesRoute, "GET", { id: project.id })).status).toBe(200);
  });

  it("recibe 403 en todas las rutas que modifican", async () => {
    const mutations: Array<[string, Promise<{ status: number }>]> = [
      ["crear tarea", call(createTaskRoute, "POST", { id: project.id }, { name: "No" })],
      ["editar tarea", call(patchTaskRoute, "PATCH", { id: task.id }, { name: "No" })],
      [
        "bulk",
        call(
          bulkRoute,
          "POST",
          { id: project.id },
          { updates: [{ id: task.id, progressPct: 50 }] },
        ),
      ],
      [
        "crear dependencia",
        call(
          createDependencyRoute,
          "POST",
          { id: project.id },
          { predecessorId: task.id, successorId: task.id },
        ),
      ],
      ["crear recurso", call(createResourceRoute, "POST", { id: project.id }, { name: "No" })],
      ["crear línea base", call(createBaselineRoute, "POST", { id: project.id }, {})],
      [
        "importar",
        call(
          importRoute,
          "POST",
          {},
          { plan: PLAN, target: { mode: "append", projectId: project.id } },
        ),
      ],
      [
        "agregar miembro",
        call(addMemberRoute, "POST", { id: project.id }, { email: admin.email, role: "EDITOR" }),
      ],
      ["crear enlace", call(createShareLinkRoute, "POST", { id: project.id }, {})],
      ["archivar", call(patchProjectRoute, "PATCH", { id: project.id }, { status: "ARCHIVED" })],
      ["eliminar proyecto", call(deleteProjectRoute, "DELETE", { id: project.id })],
    ];
    for (const [label, pending] of mutations) {
      const res = await pending;
      expect(res.status, `${label} debería responder 403`).toBe(403);
    }
  });
});

describe("El rol editor no administra el proyecto (UC-32)", () => {
  beforeEach(() => {
    currentUser = editor;
  });

  it("puede editar tareas", async () => {
    const res = await call<TaskMutationResult>(
      patchTaskRoute,
      "PATCH",
      { id: task.id },
      { progressPct: 25 },
    );
    expect(res.status, JSON.stringify(res.error)).toBe(200);
  });

  it("recibe 403 al gestionar miembros, enlaces, archivar o eliminar", async () => {
    expect(
      (
        await call(
          addMemberRoute,
          "POST",
          { id: project.id },
          { email: outsider.email, role: "VIEWER" },
        )
      ).status,
    ).toBe(403);
    expect((await call(createShareLinkRoute, "POST", { id: project.id }, {})).status).toBe(403);
    expect(
      (await call(patchProjectRoute, "PATCH", { id: project.id }, { status: "ARCHIVED" })).status,
    ).toBe(403);
    expect((await call(deleteProjectRoute, "DELETE", { id: project.id })).status).toBe(403);
  });
});
