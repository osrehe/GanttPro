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
import type { MemberDto, ProjectDto, ShareLinkDto } from "@/lib/dto";
import { resolveShareToken } from "@/lib/services/share";
import { POST as createProjectRoute } from "./projects/route";
import { POST as addMemberRoute } from "./projects/[id]/members/route";
import {
  GET as listShareLinksRoute,
  POST as createShareLinkRoute,
} from "./projects/[id]/share-links/route";
import { DELETE as revokeShareLinkRoute } from "./share-links/[id]/route";

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
  error: { code: string; message: string };
}> {
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

let admin: SessionUser;
let editor: SessionUser;
let project: ProjectDto;

beforeAll(async () => {
  admin = await user("admin-share@test.local", "Admin Share");
  editor = await user("editor-share@test.local", "Editor Share");
  currentUser = admin;
  const created = await call<ProjectDto>(
    createProjectRoute,
    "POST",
    {},
    { name: `Compartir ${Date.now()}`, startDate: "2026-09-07" },
  );
  expect(created.status).toBe(201);
  project = created.data;
  const member = await call<MemberDto>(
    addMemberRoute,
    "POST",
    { id: project.id },
    { email: editor.email, role: "EDITOR" },
  );
  expect(member.status).toBe(201);
});

beforeEach(() => {
  currentUser = admin;
});

describe("Enlaces de solo lectura (UC-33)", () => {
  it("crea un enlace, lo resuelve y al revocarlo deja de servir", async () => {
    const created = await call<ShareLinkDto>(createShareLinkRoute, "POST", { id: project.id }, {});
    expect(created.status, JSON.stringify(created.error)).toBe(201);
    expect(created.data.token).toMatch(/^[0-9a-f]{32}$/);
    expect(created.data.path).toBe(`/share/${created.data.token}`);
    expect(created.data.isActive).toBe(true);
    expect(created.data.expiresAt).toBeNull();

    const resolved = await resolveShareToken(created.data.token);
    expect(resolved?.projectId).toBe(project.id);

    const list = await call<ShareLinkDto[]>(listShareLinksRoute, "GET", { id: project.id });
    expect(list.status).toBe(200);
    expect(list.data.some((l) => l.id === created.data.id)).toBe(true);

    const revoked = await call(revokeShareLinkRoute, "DELETE", { id: created.data.id });
    expect(revoked.status).toBe(200);
    expect(await resolveShareToken(created.data.token)).toBeNull();
  });

  it("un enlace vencido no se resuelve y conserva su fecha", async () => {
    const created = await call<ShareLinkDto>(
      createShareLinkRoute,
      "POST",
      { id: project.id },
      { expiresAt: "2020-01-31" },
    );
    expect(created.status).toBe(201);
    expect(created.data.expiresAt).toBe("2020-01-31");
    expect(created.data.isActive).toBe(false);
    expect(await resolveShareToken(created.data.token)).toBeNull();
  });

  it("un token inexistente no resuelve", async () => {
    expect(await resolveShareToken("0".repeat(32))).toBeNull();
  });

  it("un editor no puede listar ni crear enlaces", async () => {
    currentUser = editor;
    expect((await call(listShareLinksRoute, "GET", { id: project.id })).status).toBe(403);
    expect((await call(createShareLinkRoute, "POST", { id: project.id }, {})).status).toBe(403);
  });
});
