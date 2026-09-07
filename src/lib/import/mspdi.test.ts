import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePredecessors } from "@/lib/predecessors";
import { linkLagDays, mspdiToPreview, parseMspdiDurationHours } from "./mspdi";

const FIXTURE = path.resolve(__dirname, "../../../fixtures/msproject-sample.xml");

describe("mspdi: utilidades", () => {
  it("convierte duraciones ISO 8601 y desfases en décimas de minuto", () => {
    expect(parseMspdiDurationHours("PT40H0M0S")).toBe(40);
    expect(parseMspdiDurationHours("PT4H30M0S")).toBe(4.5);
    expect(parseMspdiDurationHours("PT0H0M0S")).toBe(0);
    expect(parseMspdiDurationHours("raro")).toBe(0);
    expect(linkLagDays(9600, 480)).toBe(2);
    expect(linkLagDays(-4800, 480)).toBe(-1);
    expect(linkLagDays(0, 480)).toBe(0);
  });
});

describe("mspdiToPreview con fixtures/msproject-sample.xml", () => {
  const xml = readFileSync(FIXTURE, "utf8");
  const linkCount = (xml.match(/<PredecessorLink>/g) ?? []).length;
  const preview = mspdiToPreview(xml);

  it("importa el proyecto sin errores con nombre, inicio, tareas y niveles", () => {
    expect(preview.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(preview.plan.source).toBe("mspdi");
    expect(preview.plan.projectName).toBe("Implementación ERP");
    expect(preview.plan.startDate).toBe("2026-10-05");
    expect(preview.plan.tasks).toHaveLength(16);
    expect(preview.plan.tasks.map((t) => t.wbs)).toEqual([
      "1",
      "2",
      "2.1",
      "2.2",
      "3",
      "3.1",
      "3.2",
      "3.3",
      "4",
      "4.1",
      "4.2",
      "4.3",
      "5",
      "5.1",
      "5.2",
      "6",
    ]);
    expect(preview.plan.tasks.map((t) => t.level)).toEqual([
      1, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 1,
    ]);
  });

  it("conserva todos los vínculos de predecesoras con su tipo y desfase", () => {
    expect(linkCount).toBe(13);
    expect(preview.counts.dependencies).toBe(linkCount);
    const byWbs = new Map(preview.plan.tasks.map((t) => [t.wbs, t]));
    expect(parsePredecessors(byWbs.get("2.1")?.predecessors ?? "")).toEqual([
      { wbsCode: "1", type: "FS", lagDays: 0 },
    ]);
    expect(parsePredecessors(byWbs.get("3.2")?.predecessors ?? "")).toEqual([
      { wbsCode: "3.1", type: "SS", lagDays: 2 },
    ]);
    expect(parsePredecessors(byWbs.get("4.3")?.predecessors ?? "")).toEqual([
      { wbsCode: "4.2", type: "FF", lagDays: 5 },
    ]);
    expect(parsePredecessors(byWbs.get("4.1")?.predecessors ?? "")).toEqual([
      { wbsCode: "3.2", type: "FS", lagDays: 0 },
      { wbsCode: "3.3", type: "FS", lagDays: 0 },
    ]);
    expect(parsePredecessors(byWbs.get("6")?.predecessors ?? "")).toEqual([
      { wbsCode: "5.2", type: "FS", lagDays: 1 },
    ]);
  });

  it("traduce duraciones, hitos, avance, notas y fechas de inicio", () => {
    const byWbs = new Map(preview.plan.tasks.map((t) => [t.wbs, t]));
    expect(byWbs.get("1")).toMatchObject({
      isMilestone: true,
      durationDays: 0,
      progressPct: 100,
      startDate: "2026-10-05",
      notes: "Kick-off con el comité directivo.",
    });
    expect(byWbs.get("2.1")).toMatchObject({ durationDays: 5, progressPct: 60, startDate: null });
    // 4.3 tiene ConstraintType 4 (no empezar antes de) → se importa como fecha de inicio.
    expect(byWbs.get("4.3")?.startDate).toBe("2026-11-23");
    expect(preview.issues.map((i) => i.message)).toContain(
      "1 tarea con restricción de fecha importada como fecha de inicio",
    );
    expect(byWbs.get("3.2")?.durationDays).toBe(10);
    expect(byWbs.get("5.2")?.durationDays).toBe(3);
    expect(byWbs.get("6")).toMatchObject({ isMilestone: true, durationDays: 0 });
    // Los resúmenes no llevan hito, avance ni asignaciones.
    expect(byWbs.get("2")).toMatchObject({ isMilestone: false, progressPct: 0, resources: [] });
  });

  it("importa recursos y asignaciones", () => {
    expect(preview.plan.resources.map((r) => r.name)).toEqual([
      "Jefa de proyecto",
      "Consultor funcional",
      "Desarrollador senior",
    ]);
    expect(preview.plan.resources[0]).toMatchObject({
      type: "PERSON",
      rate: 45000,
      rateCurrency: "CLP",
      capacityHoursPerDay: 8,
    });
    expect(preview.counts.assignments).toBe(9);
    const byWbs = new Map(preview.plan.tasks.map((t) => [t.wbs, t]));
    expect(byWbs.get("2.1")?.resources).toEqual(["Consultor funcional"]);
    expect(byWbs.get("5.1")?.resources).toEqual(["Jefa de proyecto"]);
  });

  it("descarta con aviso los vínculos hacia o desde tareas resumen", () => {
    const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Resumen</Name>
      <Tasks>
        <Task><UID>1</UID><Name>Fase</Name><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Summary>1</Summary></Task>
        <Task><UID>2</UID><Name>A</Name><OutlineNumber>1.1</OutlineNumber><OutlineLevel>2</OutlineLevel><Duration>PT8H0M0S</Duration></Task>
        <Task><UID>3</UID><Name>B</Name><OutlineNumber>2</OutlineNumber><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration>
          <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type></PredecessorLink>
          <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink>
        </Task>
        <Task><UID>4</UID><Name>Fase 3</Name><OutlineNumber>3</OutlineNumber><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
          <PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type></PredecessorLink>
        </Task>
        <Task><UID>5</UID><Name>C</Name><OutlineNumber>3.1</OutlineNumber><OutlineLevel>2</OutlineLevel><Duration>PT8H0M0S</Duration></Task>
      </Tasks></Project>`;
    const result = mspdiToPreview(xml);
    expect(result.counts.errors).toBe(0);
    expect(result.counts.dependencies).toBe(1);
    expect(result.plan.tasks.find((t) => t.wbs === "2")?.predecessors).toBe("1.1");
    expect(result.issues).toContainEqual({
      row: null,
      column: "Predecesoras",
      severity: "warning",
      message: "2 dependencias descartadas: las tareas resumen no admiten dependencias",
    });
  });

  it("rechaza XML que no es MS Project", () => {
    expect(mspdiToPreview("<otro/>").issues[0]?.message).toContain("MS Project");
    expect(mspdiToPreview("no es xml <").counts.errors).toBe(1);
  });

  it("acepta un proyecto con una sola tarea y un solo vínculo (elementos no repetidos)", () => {
    const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Name>Mini</Name>
      <Tasks>
        <Task><UID>1</UID><Name>A</Name><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Duration>PT16H0M0S</Duration></Task>
        <Task><UID>2</UID><Name>B</Name><OutlineNumber>2</OutlineNumber><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration>
          <PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>0</LinkLag></PredecessorLink>
        </Task>
      </Tasks></Project>`;
    const mini = mspdiToPreview(xml);
    expect(mini.counts).toMatchObject({ tasks: 2, dependencies: 1, errors: 0 });
    expect(mini.plan.tasks[1]?.predecessors).toBe("1");
  });
});
