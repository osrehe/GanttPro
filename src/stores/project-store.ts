import type { ProjectRole } from "@prisma/client";
import { toast } from "sonner";
import { create } from "zustand";
import { ApiClientError } from "@/lib/api-client";
import type {
  AssignmentDto,
  BaselineDto,
  CalendarDto,
  DependencyDto,
  MemberDto,
  ProjectDto,
  ProjectFullDto,
  ResourceDto,
  TaskDto,
  TaskMutationResult,
} from "@/lib/dto";
import { CommandHistory, type Command, type HistorySnapshot } from "./history";

/** Duración del resaltado de filas afectadas (UC-11). */
export const HIGHLIGHT_MS = 1000;

export interface ProjectStore {
  // Datos del proyecto cargado
  projectId: string | null;
  role: ProjectRole | null;
  project: ProjectDto | null;
  calendar: CalendarDto | null;
  calendars: CalendarDto[];
  tasks: TaskDto[];
  tasksById: Map<string, TaskDto>;
  dependencies: DependencyDto[];
  resources: ResourceDto[];
  assignments: AssignmentDto[];
  members: MemberDto[];
  baselines: BaselineDto[];
  loaded: boolean;
  /** Usuario de la sesión: distingue los cambios propios de los ajenos en el polling (UC-34). */
  currentUserId: string | null;

  // Estado de la interfaz
  selectedTaskId: string | null;
  detailTaskId: string | null;
  collapsed: Record<string, true>;
  highlighted: Record<string, number>;
  history: CommandHistory;
  historyState: HistorySnapshot;
  busy: boolean;

  // Carga y aplicación de resultados
  hydrate(full: ProjectFullDto): void;
  reset(): void;
  applyTasks(affected: readonly TaskDto[], deletedIds?: readonly string[]): void;
  applyTaskResult(result: TaskMutationResult): void;
  replaceTasks(all: readonly TaskDto[]): void;
  applyDependency(dependency: DependencyDto): void;
  removeDependency(id: string): void;
  applyResource(resource: ResourceDto): void;
  removeResource(id: string): void;
  applyAssignment(assignment: AssignmentDto): void;
  removeAssignment(id: string): void;
  setBaselines(baselines: BaselineDto[]): void;
  setProject(project: ProjectDto): void;
  setCurrentUserId(userId: string | null): void;

  // Interfaz
  select(taskId: string | null): void;
  openDetail(taskId: string | null): void;
  toggleCollapsed(taskId: string): void;
  setAllCollapsed(collapsed: boolean): void;
  highlight(ids: readonly string[]): void;
  clearHighlight(ids: readonly string[]): void;

  // Comandos
  run(command: Command): Promise<boolean>;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

/** Orden de visualización: por código WBS numérico (1, 1.1, 1.2, 2…). */
export function sortByWbs<T extends { wbsCode: string }>(tasks: readonly T[]): T[] {
  const key = (code: string): number[] => code.split(".").map(Number);
  return [...tasks].sort((a, b) => {
    const ka = key(a.wbsCode);
    const kb = key(b.wbsCode);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const diff = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  });
}

function indexTasks(tasks: readonly TaskDto[]): Map<string, TaskDto> {
  return new Map(tasks.map((t) => [t.id, t]));
}

/** Traduce un error de la API a un mensaje para el usuario. */
export function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado";
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const history = new CommandHistory();
  history.subscribe((historyState) => set({ historyState, busy: historyState.busy }));

  return {
    projectId: null,
    role: null,
    project: null,
    calendar: null,
    calendars: [],
    tasks: [],
    tasksById: new Map(),
    dependencies: [],
    resources: [],
    assignments: [],
    members: [],
    baselines: [],
    loaded: false,
    currentUserId: null,
    selectedTaskId: null,
    detailTaskId: null,
    collapsed: {},
    highlighted: {},
    history,
    historyState: history.snapshot(),
    busy: false,

    hydrate(full) {
      const sameProject = get().projectId === full.project.id;
      if (!sameProject) history.clear();
      const tasks = sortByWbs(full.tasks);
      set({
        projectId: full.project.id,
        role: full.role,
        project: full.project,
        calendar: full.calendar,
        calendars: full.calendars,
        tasks,
        tasksById: indexTasks(tasks),
        dependencies: full.dependencies,
        resources: full.resources,
        assignments: full.assignments,
        members: full.members,
        baselines: full.baselines,
        loaded: true,
        selectedTaskId: sameProject ? get().selectedTaskId : null,
        detailTaskId: sameProject ? get().detailTaskId : null,
        collapsed: sameProject ? get().collapsed : {},
        highlighted: {},
      });
    },

    reset() {
      history.clear();
      set({
        projectId: null,
        role: null,
        project: null,
        calendar: null,
        calendars: [],
        tasks: [],
        tasksById: new Map(),
        dependencies: [],
        resources: [],
        assignments: [],
        members: [],
        baselines: [],
        loaded: false,
        selectedTaskId: null,
        detailTaskId: null,
        collapsed: {},
        highlighted: {},
      });
    },

    applyTasks(affected, deletedIds = []) {
      const removed = new Set(deletedIds);
      const map = new Map(get().tasksById);
      for (const id of removed) map.delete(id);
      for (const t of affected) if (!removed.has(t.id)) map.set(t.id, t);
      // Las dependencias y asignaciones de tareas eliminadas desaparecen en cascada.
      const dependencies =
        removed.size === 0
          ? get().dependencies
          : get().dependencies.filter(
              (d) => !removed.has(d.predecessorId) && !removed.has(d.successorId),
            );
      const assignments =
        removed.size === 0
          ? get().assignments
          : get().assignments.filter((a) => !removed.has(a.taskId));
      const tasks = sortByWbs([...map.values()]);
      const selected = get().selectedTaskId;
      const detail = get().detailTaskId;
      set({
        tasks,
        tasksById: map,
        dependencies,
        assignments,
        selectedTaskId: selected && removed.has(selected) ? null : selected,
        detailTaskId: detail && removed.has(detail) ? null : detail,
      });
    },

    applyTaskResult(result) {
      const affected = result.task ? [result.task, ...result.affected] : result.affected;
      get().applyTasks(affected, result.deletedIds ?? []);
      get().highlight(result.affected.map((t) => t.id));
    },

    replaceTasks(all) {
      const tasks = sortByWbs(all);
      set({ tasks, tasksById: indexTasks(tasks) });
    },

    applyDependency(dependency) {
      const rest = get().dependencies.filter((d) => d.id !== dependency.id);
      set({ dependencies: [...rest, dependency] });
    },

    removeDependency(id) {
      set({ dependencies: get().dependencies.filter((d) => d.id !== id) });
    },

    applyResource(resource) {
      const rest = get().resources.filter((r) => r.id !== resource.id);
      set({ resources: [...rest, resource].sort((a, b) => a.name.localeCompare(b.name, "es")) });
    },

    removeResource(id) {
      set({
        resources: get().resources.filter((r) => r.id !== id),
        assignments: get().assignments.filter((a) => a.resourceId !== id),
      });
    },

    applyAssignment(assignment) {
      const rest = get().assignments.filter((a) => a.id !== assignment.id);
      set({ assignments: [...rest, assignment] });
    },

    removeAssignment(id) {
      set({ assignments: get().assignments.filter((a) => a.id !== id) });
    },

    setBaselines(baselines) {
      set({ baselines });
    },

    setProject(project) {
      set({ project });
    },

    setCurrentUserId(userId) {
      if (get().currentUserId !== userId) set({ currentUserId: userId });
    },

    select(taskId) {
      set({ selectedTaskId: taskId });
    },

    openDetail(taskId) {
      set({ detailTaskId: taskId, selectedTaskId: taskId ?? get().selectedTaskId });
    },

    toggleCollapsed(taskId) {
      const collapsed = { ...get().collapsed };
      if (collapsed[taskId]) delete collapsed[taskId];
      else collapsed[taskId] = true;
      set({ collapsed });
    },

    setAllCollapsed(value) {
      if (!value) {
        set({ collapsed: {} });
        return;
      }
      const collapsed: Record<string, true> = {};
      for (const t of get().tasks) if (t.isSummary) collapsed[t.id] = true;
      set({ collapsed });
    },

    highlight(ids) {
      if (ids.length === 0) return;
      const stamp = Date.now();
      const highlighted = { ...get().highlighted };
      for (const id of ids) highlighted[id] = stamp;
      set({ highlighted });
      setTimeout(
        () => get().clearHighlight(ids.filter((id) => get().highlighted[id] === stamp)),
        HIGHLIGHT_MS,
      );
    },

    clearHighlight(ids) {
      if (ids.length === 0) return;
      const highlighted = { ...get().highlighted };
      for (const id of ids) delete highlighted[id];
      set({ highlighted });
    },

    async run(command) {
      try {
        await history.run(command);
        return true;
      } catch (error) {
        toast.error(describeError(error));
        return false;
      }
    },

    async undo() {
      try {
        const done = await history.undo();
        if (done) toast.message(`Deshecho: ${get().historyState.redoLabel ?? ""}`.trim());
      } catch (error) {
        toast.error(describeError(error));
      }
    },

    async redo() {
      try {
        const done = await history.redo();
        if (done) toast.message(`Rehecho: ${get().historyState.undoLabel ?? ""}`.trim());
      } catch (error) {
        toast.error(describeError(error));
      }
    },
  };
});

/** Filas visibles en orden WBS, ocultando los descendientes de resúmenes colapsados. */
export function visibleTasks(
  tasks: readonly TaskDto[],
  collapsed: Record<string, true>,
): TaskDto[] {
  const hiddenParents = new Set<string>();
  const result: TaskDto[] = [];
  for (const t of tasks) {
    if (t.parentId && hiddenParents.has(t.parentId)) {
      hiddenParents.add(t.id);
      continue;
    }
    result.push(t);
    if (collapsed[t.id]) hiddenParents.add(t.id);
  }
  return result;
}

/** Profundidad (0 = raíz) a partir del código WBS. */
export function depthOf(task: TaskDto): number {
  return task.wbsCode.split(".").length - 1;
}
