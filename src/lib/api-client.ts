import type { ApiErrorBody, ApiErrorCode } from "@/lib/api/response";
import type {
  AssignmentDto,
  AuditLogDto,
  BaselineDto,
  CalendarDto,
  DependencyDto,
  ProjectDto,
  ProjectFullDto,
  ProjectSummaryDto,
  ResourceDto,
  TaskDto,
  TaskMutationResult,
} from "@/lib/dto";
import type { ImportRequestInput } from "@/lib/import/schema";
import type { ImportPreview, ImportResult } from "@/lib/import/types";
import type { SettingsDto } from "@/lib/services/settings";
import type {
  BulkTaskUpdateInput,
  ChangesQuery,
  CreateAssignmentInput,
  CreateBaselineInput,
  CreateDependencyInput,
  CreateProjectInput,
  CreateResourceInput,
  CreateTaskInput,
  MoveTaskInput,
  PatchTaskInput,
  UpdateAssignmentInput,
  UpdateCalendarInput,
  UpdateDependencyInput,
  UpdateProjectInput,
  UpdateResourceInput,
  UpdateSettingsInput,
} from "@/lib/schemas";

/** Error lanzado por el cliente cuando la API responde con la envolvente de error. */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(status: number, body: ApiErrorBody["error"]) {
    super(body.message);
    this.name = "ApiClientError";
    this.code = body.code;
    this.status = status;
    this.details = body.details;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const response = await fetch(url, {
    method,
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = (await response.json().catch(() => null)) as { data?: T } | ApiErrorBody | null;
  if (!response.ok) {
    const error =
      json && "error" in json
        ? json.error
        : { code: "INTERNAL" as const, message: `Error ${response.status} al llamar a ${url}` };
    throw new ApiClientError(response.status, error);
  }
  return (json as { data: T }).data;
}

const get = <T>(url: string) => request<T>("GET", url);
const post = <T>(url: string, body?: unknown) => request<T>("POST", url, body);
const patch = <T>(url: string, body: unknown) => request<T>("PATCH", url, body);
const del = <T>(url: string) => request<T>("DELETE", url);

/** Cliente tipado de la API de GanttPro. Todas las funciones devuelven el contenido de `data`. */
export const api = {
  projects: {
    list: () => get<ProjectSummaryDto[]>("/api/projects"),
    create: (input: CreateProjectInput) => post<ProjectDto>("/api/projects", input),
    get: (id: string) => get<ProjectDto & { role: string }>(`/api/projects/${id}`),
    full: (id: string) => get<ProjectFullDto>(`/api/projects/${id}/full`),
    update: (id: string, input: UpdateProjectInput) =>
      patch<ProjectDto>(`/api/projects/${id}`, input),
    remove: (id: string) => del<{ deleted: true }>(`/api/projects/${id}`),
    duplicate: (id: string) => post<ProjectDto>(`/api/projects/${id}/duplicate`),
    calendar: (id: string) => get<CalendarDto>(`/api/projects/${id}/calendar`),
    updateCalendar: (id: string, input: UpdateCalendarInput) =>
      patch<{ calendar: CalendarDto; affected: TaskDto[] }>(`/api/projects/${id}/calendar`, input),
    changes: (id: string, query: ChangesQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      }
      const qs = params.toString();
      return get<{ changes: AuditLogDto[]; cursor: string }>(
        `/api/projects/${id}/changes${qs ? `?${qs}` : ""}`,
      );
    },
  },
  tasks: {
    list: (projectId: string) => get<TaskDto[]>(`/api/projects/${projectId}/tasks`),
    create: (projectId: string, input: CreateTaskInput) =>
      post<TaskMutationResult>(`/api/projects/${projectId}/tasks`, input),
    get: (id: string) => get<TaskDto>(`/api/tasks/${id}`),
    patch: (id: string, input: PatchTaskInput) =>
      patch<TaskMutationResult>(`/api/tasks/${id}`, input),
    remove: (id: string) => del<TaskMutationResult>(`/api/tasks/${id}`),
    move: (id: string, input: MoveTaskInput) =>
      post<{ task: TaskDto; tasks: TaskDto[]; affected: TaskDto[] }>(
        `/api/tasks/${id}/move`,
        input,
      ),
    bulk: (projectId: string, input: BulkTaskUpdateInput) =>
      post<{ affected: TaskDto[]; operationId: string }>(
        `/api/projects/${projectId}/tasks/bulk`,
        input,
      ),
  },
  dependencies: {
    list: (projectId: string) => get<DependencyDto[]>(`/api/projects/${projectId}/dependencies`),
    create: (projectId: string, input: CreateDependencyInput) =>
      post<{ dependency: DependencyDto; affected: TaskDto[] }>(
        `/api/projects/${projectId}/dependencies`,
        input,
      ),
    update: (id: string, input: UpdateDependencyInput) =>
      patch<{ dependency: DependencyDto; affected: TaskDto[] }>(`/api/dependencies/${id}`, input),
    remove: (id: string) => del<{ affected: TaskDto[] }>(`/api/dependencies/${id}`),
  },
  resources: {
    list: (projectId: string) =>
      get<{ resources: ResourceDto[]; assignments: AssignmentDto[] }>(
        `/api/projects/${projectId}/resources`,
      ),
    create: (projectId: string, input: CreateResourceInput) =>
      post<ResourceDto>(`/api/projects/${projectId}/resources`, input),
    update: (id: string, input: UpdateResourceInput) =>
      patch<ResourceDto>(`/api/resources/${id}`, input),
    remove: (id: string) => del<{ deleted: true }>(`/api/resources/${id}`),
  },
  assignments: {
    create: (taskId: string, input: CreateAssignmentInput) =>
      post<AssignmentDto>(`/api/tasks/${taskId}/assignments`, input),
    update: (id: string, input: UpdateAssignmentInput) =>
      patch<AssignmentDto>(`/api/assignments/${id}`, input),
    remove: (id: string) => del<{ deleted: true }>(`/api/assignments/${id}`),
  },
  settings: {
    get: () => get<SettingsDto>("/api/settings"),
    update: (input: UpdateSettingsInput) => patch<SettingsDto>("/api/settings", input),
  },
  export: {
    /** Descarga directa (GET) del libro Excel; `gantt` controla la granularidad de la hoja Gantt. */
    xlsxUrl: (projectId: string, gantt: "day" | "week" = "day") =>
      `/api/projects/${projectId}/export/xlsx?gantt=${gantt}`,
    /** Descarga directa (GET) del PDF con las opciones serializadas por `pdfOptionsToQuery`. */
    pdfUrl: (projectId: string, query: URLSearchParams) =>
      `/api/projects/${projectId}/export/pdf?${query.toString()}`,
  },
  import: {
    templateUrl: "/api/import/template",
    preview: (file: File) => {
      const form = new FormData();
      form.append("file", file, file.name);
      return post<ImportPreview>("/api/import/preview", form);
    },
    run: (input: ImportRequestInput) => post<ImportResult>("/api/import", input),
  },
  baselines: {
    list: (projectId: string) => get<BaselineDto[]>(`/api/projects/${projectId}/baselines`),
    create: (projectId: string, input: CreateBaselineInput = {}) =>
      post<BaselineDto>(`/api/projects/${projectId}/baselines`, input),
    get: (id: string) =>
      get<{ baseline: BaselineDto; tasks: unknown[]; variance: unknown[] }>(`/api/baselines/${id}`),
    remove: (id: string) => del<{ deleted: true }>(`/api/baselines/${id}`),
  },
};

export type Api = typeof api;
