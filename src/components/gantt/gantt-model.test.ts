import { createTimeAxis } from "@ganttpro/engine";
import { describe, expect, it } from "vitest";
import type { ProjectFullDto, TaskDto } from "@/lib/dto";
import { useProjectStore, visibleTasks } from "@/stores/project-store";
import { buildScene, ganttRows, inferDependencyType, projectRange } from "./gantt-model";

function task(
  id: string,
  wbsCode: string,
  parentId: string | null,
  orderIndex: number,
  extra: Partial<TaskDto> = {},
): TaskDto {
  return {
    id,
    projectId: "p",
    parentId,
    orderIndex,
    wbsCode,
    name: `Tarea ${wbsCode}`,
    description: null,
    anchorDate: "2026-09-07",
    startDate: "2026-09-07",
    endDate: "2026-09-11",
    durationDays: 5,
    effortHours: null,
    progressPct: 0,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    color: null,
    isMilestone: false,
    isSummary: false,
    isCritical: false,
    totalFloatDays: null,
    freeFloatDays: null,
    notes: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
    updatedById: null,
    ...extra,
  };
}

function fullProject(): ProjectFullDto {
  const tasks: TaskDto[] = [];
  let leaf = 0;
  for (let i = 1; i <= 4; i++) {
    tasks.push(task(`s${i}`, String(i), null, i - 1, { isSummary: true, anchorDate: null }));
    for (let j = 1; j <= 5; j++) {
      leaf++;
      tasks.push(task(`t${leaf}`, `${i}.${j}`, `s${i}`, j - 1, { anchorDate: "2026-09-07" }));
    }
  }
  return {
    project: {
      id: "p",
      name: "P",
      description: null,
      status: "ACTIVE",
      startDate: "2026-09-07",
      statusDate: null,
      progressWeighting: "DURATION",
      createdById: "u",
      archivedAt: null,
      createdAt: "2026-09-07T00:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    },
    role: "ADMIN",
    calendar: {
      id: "c",
      projectId: "p",
      name: "Cal",
      isBase: true,
      workingDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      holidays: [],
    },
    calendars: [],
    tasks,
    dependencies: [
      { id: "d1", projectId: "p", predecessorId: "t1", successorId: "t2", type: "FS", lagDays: 0 },
      { id: "d2", projectId: "p", predecessorId: "t6", successorId: "t12", type: "SS", lagDays: 1 },
    ],
    resources: [],
    assignments: [],
    members: [],
    baselines: [],
  };
}

/** Generador determinista para que el test sea reproducible. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("Consistencia tabla ↔ Gantt (UC-24)", () => {
  it("tras 50 operaciones aleatorias sobre el store, tabla y Gantt derivan exactamente las mismas filas", () => {
    const store = useProjectStore.getState();
    store.hydrate(fullProject());
    const random = rng(7);
    const axis = createTimeAxis({ scale: "day", from: "2026-08-31", to: "2026-12-31" });
    let created = 0;

    for (let i = 0; i < 50; i++) {
      const state = useProjectStore.getState();
      const leaves = state.tasks.filter((t) => !t.isSummary);
      const summaries = state.tasks.filter((t) => t.isSummary);
      const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)] as T;
      const op = Math.floor(random() * 6);
      switch (op) {
        case 0: {
          const t = pick(leaves);
          state.applyTasks([
            { ...t, startDate: "2026-09-14", endDate: "2026-09-18", anchorDate: "2026-09-14" },
          ]);
          break;
        }
        case 1: {
          const t = pick(leaves);
          state.applyTasks([
            { ...t, durationDays: t.durationDays + 1, progressPct: (t.progressPct + 25) % 101 },
          ]);
          break;
        }
        case 2:
          state.toggleCollapsed(pick(summaries).id);
          break;
        case 3: {
          const parent = pick(summaries);
          const siblings = state.tasks.filter((t) => t.parentId === parent.id);
          created++;
          state.applyTasks([
            task(
              `n${created}`,
              `${parent.wbsCode}.${siblings.length + 1}`,
              parent.id,
              siblings.length,
              {
                name: `Nueva ${created}`,
              },
            ),
          ]);
          break;
        }
        case 4: {
          if (leaves.length > 8) state.applyTasks([], [pick(leaves).id]);
          break;
        }
        default: {
          const t = pick(leaves);
          state.applyTasks([{ ...t, name: `${t.name}*` }]);
        }
      }

      const after = useProjectStore.getState();
      const tableRows = visibleTasks(after.tasks, after.collapsed);
      const gantt = ganttRows(after.tasks, after.collapsed);
      expect(gantt.map((t) => t.id)).toEqual(tableRows.map((t) => t.id));
      const scene = buildScene(gantt, after.dependencies, axis);
      expect(scene.bars.map((b) => b.taskId)).toEqual(tableRows.map((t) => t.id));
      // Cada barra refleja las mismas fechas que la fila de la tabla.
      for (const bar of scene.bars) {
        const row = after.tasksById.get(bar.taskId) as TaskDto;
        if (!row.isMilestone) expect(bar.x).toBe(axis.xOf(row.startDate));
      }
      // Ninguna flecha apunta a una fila oculta.
      const visibleIds = new Set(tableRows.map((t) => t.id));
      for (const arrow of scene.arrows) {
        expect(visibleIds.has(arrow.fromTaskId) && visibleIds.has(arrow.toTaskId)).toBe(true);
      }
    }
    useProjectStore.getState().reset();
  });

  it("projectRange y inferDependencyType", () => {
    expect(projectRange([], "2026-09-07")).toEqual({ from: "2026-08-31", to: "2026-11-06" });
    expect(
      projectRange(
        [task("a", "1", null, 0), task("b", "2", null, 1, { endDate: "2026-10-01" })],
        "2026-09-07",
      ),
    ).toEqual({
      from: "2026-08-31",
      to: "2026-10-15",
    });
    expect(inferDependencyType("end", "start")).toBe("FS");
    expect(inferDependencyType("start", "start")).toBe("SS");
    expect(inferDependencyType("end", "end")).toBe("FF");
    expect(inferDependencyType("start", "end")).toBe("SF");
  });
});
