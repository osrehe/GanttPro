import { readFileSync } from "node:fs";
import path from "node:path";
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
import type { ProjectFullDto } from "@/lib/dto";
import { mspdiToPreview } from "@/lib/import/mspdi";
import type { ImportedPlan, ImportPreview, ImportResult } from "@/lib/import/types";
import { POST as importRoute } from "./import/route";
import { POST as previewRoute } from "./import/preview/route";
import { GET as templateRoute } from "./import/template/route";
import { GET as fullRoute } from "./projects/[id]/full/route";

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

let importer: SessionUser;

const PLAN: ImportedPlan = {
  source: "csv",
  projectName: "Plan importado",
  startDate: "2026-09-07",
  resources: [
    { name: "Ana Pérez", type: "PERSON", rate: 2, rateCurrency: "UF", capacityHoursPerDay: 8 },
  ],
  tasks: [
    {
      row: 2,
      wbs: "1",
      level: 1,
      name: "Fase 1",
      durationDays: 1,
      startDate: null,
      isMilestone: false,
      progressPct: 0,
      predecessors: "",
      resources: [],
      notes: null,
    },
    {
      row: 3,
      wbs: "1.1",
      level: 2,
      name: "Análisis",
      durationDays: 5,
      startDate: null,
      isMilestone: false,
      progressPct: 20,
      predecessors: "",
      resources: ["Ana Pérez"],
      notes: "Primera tarea",
    },
    {
      row: 4,
      wbs: "1.2",
      level: 2,
      name: "Diseño",
      durationDays: 3,
      startDate: null,
      isMilestone: false,
      progressPct: 0,
      predecessors: "1.1",
      resources: [],
      notes: null,
    },
    {
      row: 5,
      wbs: "2",
      level: 1,
      name: "Construcción",
      durationDays: 4,
      startDate: null,
      isMilestone: false,
      progressPct: 0,
      predecessors: "1.1SS+2d; 1.2",
      resources: [],
      notes: null,
    },
    {
      row: 6,
      wbs: "3",
      level: 1,
      name: "Entrega",
      durationDays: 0,
      startDate: null,
      isMilestone: true,
      progressPct: 0,
      predecessors: "2",
      resources: [],
      notes: null,
    },
  ],
};

beforeAll(async () => {
  const u = await prisma.user.upsert({
    where: { email: "importador@test.local" },
    update: {},
    create: { email: "importador@test.local", name: "Importadora Test", passwordHash: "x" },
  });
  importer = { id: u.id, email: u.email, name: u.name };
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(() => {
  currentUser = importer;
});

describe("Importación (UC-28, UC-29, UC-30)", () => {
  let projectId: string;

  it("sin sesión responde 401", async () => {
    currentUser = null;
    const res = await call(
      importRoute,
      "POST",
      {},
      { plan: PLAN, target: { mode: "new", name: "X" } },
    );
    expect(res.status).toBe(401);
  });

  it("crea un proyecto nuevo con jerarquía, dependencias, recurso y asignación, y lo reprograma", async () => {
    const res = await call<ImportResult>(
      importRoute,
      "POST",
      {},
      { plan: PLAN, target: { mode: "new", name: "Importado", startDate: "2026-09-07" } },
    );
    expect(res.status, JSON.stringify(res.error)).toBe(201);
    expect(res.data.created).toEqual({ tasks: 5, dependencies: 4, resources: 1, assignments: 1 });
    projectId = res.data.projectId;

    const full = await call<ProjectFullDto>(fullRoute, "GET", { id: projectId });
    expect(full.status).toBe(200);
    expect(full.data.role).toBe("ADMIN");
    expect(full.data.tasks.map((t) => [t.wbsCode, t.name, t.isSummary, t.isMilestone])).toEqual([
      ["1", "Fase 1", true, false],
      ["1.1", "Análisis", false, false],
      ["1.2", "Diseño", false, false],
      ["2", "Construcción", false, false],
      ["3", "Entrega", false, true],
    ]);
    const byCode = new Map(full.data.tasks.map((t) => [t.wbsCode, t]));
    // Análisis 07-09 → 11-09; Diseño FS → 14-09 → 16-09; Construcción max(SS+2d = 09-09, FS 17-09) → 17-09
    // y, saltando el feriado del 18-09, termina el 23-09; el hito Entrega cae el 24-09.
    expect(byCode.get("1.1")).toMatchObject({
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      progressPct: 20,
    });
    expect(byCode.get("1.2")).toMatchObject({ startDate: "2026-09-14", endDate: "2026-09-16" });
    expect(byCode.get("2")).toMatchObject({ startDate: "2026-09-17", endDate: "2026-09-23" });
    expect(byCode.get("3")).toMatchObject({ startDate: "2026-09-24", endDate: "2026-09-24" });
    expect(byCode.get("1")).toMatchObject({ startDate: "2026-09-07", endDate: "2026-09-16" });
    expect(byCode.get("1.1")?.notes).toBe("Primera tarea");
    expect(full.data.dependencies).toHaveLength(4);
    const ss = full.data.dependencies.find((d) => d.type === "SS");
    expect(ss).toMatchObject({
      predecessorId: byCode.get("1.1")?.id,
      successorId: byCode.get("2")?.id,
      lagDays: 2,
    });
    expect(full.data.resources.map((r) => r.name)).toEqual(["Ana Pérez"]);
    expect(full.data.assignments).toHaveLength(1);
    expect(full.data.assignments[0]?.taskId).toBe(byCode.get("1.1")?.id);
    expect(full.data.calendar.isBase).toBe(true);

    const audit = await prisma.auditLog.findFirst({ where: { projectId, action: "IMPORT" } });
    expect(audit?.summary).toBe("importó 5 tareas, 4 dependencias y 1 recursos desde CSV");
  });

  it("rechaza con 422 un plan con una predecesora inexistente y detalla los problemas", async () => {
    const broken: ImportedPlan = {
      ...PLAN,
      tasks: PLAN.tasks.map((t) => (t.wbs === "3" ? { ...t, predecessors: "9" } : t)),
    };
    const res = await call(
      importRoute,
      "POST",
      {},
      { plan: broken, target: { mode: "new", name: "Roto" } },
    );
    expect(res.status).toBe(422);
    expect(res.error.code).toBe("VALIDATION");
    expect(res.error.details?.issues).toEqual([
      expect.objectContaining({
        row: 6,
        message: "No existe la tarea 9 indicada como predecesora",
      }),
    ]);
  });

  it("importa el fixture de MS Project sin perder dependencias", async () => {
    const xml = readFileSync(
      path.resolve(__dirname, "../../../fixtures/msproject-sample.xml"),
      "utf8",
    );
    const linkCount = (xml.match(/<PredecessorLink>/g) ?? []).length;
    const preview = mspdiToPreview(xml);
    expect(preview.counts.errors).toBe(0);
    const res = await call<ImportResult>(
      importRoute,
      "POST",
      {},
      { plan: preview.plan, target: { mode: "new", name: preview.plan.projectName ?? "ERP" } },
    );
    expect(res.status, JSON.stringify(res.error)).toBe(201);
    expect(res.data.created.dependencies).toBe(linkCount);
    expect(res.data.created.tasks).toBe(16);
    expect(res.data.created.resources).toBe(3);
    expect(res.data.created.assignments).toBe(9);

    const full = await call<ProjectFullDto>(fullRoute, "GET", { id: res.data.projectId });
    expect(full.data.dependencies).toHaveLength(linkCount);
    expect(full.data.project.startDate).toBe("2026-10-05");
    const byCode = new Map(full.data.tasks.map((t) => [t.wbsCode, t]));
    expect(byCode.get("2")?.isSummary).toBe(true);
    expect(byCode.get("6")?.isMilestone).toBe(true);
    // El hito inicial (05-10) empuja 2.1 al 06-10; el feriado del 12-10 desplaza la cadena:
    // 2.1 termina el 13-10, 2.2 el 20-10, 3.1 arranca el 21-10 y 3.2 (SS+2d) el 23-10.
    expect(byCode.get("3.1")?.startDate).toBe("2026-10-21");
    expect(byCode.get("3.2")?.startDate).toBe("2026-10-23");
  });

  it("en modo append agrega las tareas al final y reutiliza el recurso por nombre", async () => {
    const extra: ImportedPlan = {
      source: "xlsx",
      projectName: null,
      startDate: null,
      resources: [],
      tasks: [
        {
          row: 2,
          wbs: "1",
          level: 1,
          name: "Cierre",
          durationDays: 2,
          startDate: "2026-10-01",
          isMilestone: false,
          progressPct: 0,
          predecessors: "",
          resources: ["ana pérez", "Beto"],
          notes: null,
        },
      ],
    };
    const res = await call<ImportResult>(
      importRoute,
      "POST",
      {},
      { plan: extra, target: { mode: "append", projectId } },
    );
    expect(res.status, JSON.stringify(res.error)).toBe(201);
    expect(res.data.created).toEqual({ tasks: 1, dependencies: 0, resources: 1, assignments: 2 });
    const full = await call<ProjectFullDto>(fullRoute, "GET", { id: projectId });
    expect(full.data.tasks.map((t) => t.wbsCode)).toEqual(["1", "1.1", "1.2", "2", "3", "4"]);
    const closing = full.data.tasks.find((t) => t.wbsCode === "4");
    expect(closing).toMatchObject({
      name: "Cierre",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
    });
    expect(full.data.resources.map((r) => r.name).sort()).toEqual(["Ana Pérez", "Beto"]);
    expect(full.data.assignments.filter((a) => a.taskId === closing?.id)).toHaveLength(2);
  });

  it("en modo replace sustituye todas las tareas sin residuos y conserva los recursos", async () => {
    const replacement: ImportedPlan = {
      source: "csv",
      projectName: null,
      startDate: null,
      resources: [],
      tasks: [
        {
          row: 2,
          wbs: "1",
          level: 1,
          name: "Nuevo plan A",
          durationDays: 3,
          startDate: null,
          isMilestone: false,
          progressPct: 0,
          predecessors: "",
          resources: ["Ana Pérez"],
          notes: null,
        },
        {
          row: 3,
          wbs: "2",
          level: 1,
          name: "Nuevo plan B",
          durationDays: 2,
          startDate: null,
          isMilestone: false,
          progressPct: 0,
          predecessors: "1",
          resources: [],
          notes: null,
        },
      ],
    };
    const res = await call<ImportResult>(
      importRoute,
      "POST",
      {},
      { plan: replacement, target: { mode: "replace", projectId } },
    );
    expect(res.status, JSON.stringify(res.error)).toBe(201);
    expect(res.data.created).toEqual({ tasks: 2, dependencies: 1, resources: 0, assignments: 1 });
    const full = await call<ProjectFullDto>(fullRoute, "GET", { id: projectId });
    expect(full.data.tasks.map((t) => [t.wbsCode, t.name])).toEqual([
      ["1", "Nuevo plan A"],
      ["2", "Nuevo plan B"],
    ]);
    expect(full.data.dependencies).toHaveLength(1);
    expect(full.data.assignments).toHaveLength(1);
    expect(full.data.resources.map((r) => r.name).sort()).toEqual(["Ana Pérez", "Beto"]);
    expect(await prisma.task.count({ where: { projectId } })).toBe(2);
    const audit = await prisma.auditLog.findFirst({
      where: { projectId, action: "IMPORT" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.summary).toContain("reemplazó el plan");
  });

  it("un usuario sin acceso no puede agregar a un proyecto ajeno", async () => {
    const other = await prisma.user.upsert({
      where: { email: "ajeno-import@test.local" },
      update: {},
      create: { email: "ajeno-import@test.local", name: "Ajeno", passwordHash: "x" },
    });
    currentUser = { id: other.id, email: other.email, name: other.name };
    const res = await call(
      importRoute,
      "POST",
      {},
      { plan: PLAN, target: { mode: "append", projectId } },
    );
    expect(res.status).toBe(403);
    const replace = await call(
      importRoute,
      "POST",
      {},
      { plan: PLAN, target: { mode: "replace", projectId } },
    );
    expect(replace.status).toBe(403);
  });

  it("la previsualización acepta un CSV multipart y la plantilla se descarga", async () => {
    const csv = "WBS;Nombre;Duración (días)\n1;Tarea única;3\n";
    const form = new FormData();
    form.set("file", new File([csv], "plan.csv", { type: "text/csv" }));
    const response = await previewRoute(
      new Request("http://localhost/api/import/preview", { method: "POST", body: form }),
      {} as never,
    );
    expect(response.status).toBe(200);
    const preview = ((await response.json()) as { data: ImportPreview }).data;
    expect(preview.plan.tasks.map((t) => t.name)).toEqual(["Tarea única"]);

    const xmlForm = new FormData();
    xmlForm.set(
      "file",
      new File(
        [readFileSync(path.resolve(__dirname, "../../../fixtures/msproject-sample.xml"))],
        "erp.xml",
      ),
    );
    const xmlResponse = await previewRoute(
      new Request("http://localhost/api/import/preview", { method: "POST", body: xmlForm }),
      {} as never,
    );
    expect(((await xmlResponse.json()) as { data: ImportPreview }).data.plan.source).toBe("mspdi");

    const bad = await previewRoute(
      new Request("http://localhost/api/import/preview", { method: "POST", body: new FormData() }),
      {} as never,
    );
    expect(bad.status).toBe(422);

    const template = await templateRoute(
      new Request("http://localhost/api/import/template"),
      {} as never,
    );
    expect(template.status).toBe(200);
    expect(template.headers.get("Content-Disposition")).toContain(
      "plantilla-importacion-ganttpro.xlsx",
    );
    const bytes = new Uint8Array(await template.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // "PK": zip
    expect(bytes.length).toBeGreaterThan(5000);
  });
});
