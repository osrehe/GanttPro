import { describe, expect, it } from "vitest";
import type { AuditLogDto } from "@/lib/dto";
import { summarizeChanges } from "./changes-summary";

function change(userId: string, userName: string, summary: string): AuditLogDto {
  return {
    id: `log-${userId}-${summary}`,
    projectId: "p1",
    userId,
    userName,
    entityType: "Task",
    entityId: "t1",
    action: "UPDATE",
    before: null,
    after: null,
    summary,
    operationId: null,
    createdAt: "2026-09-07T12:00:00.000Z",
  };
}

const ME = "u-yo";

describe("Resumen de cambios para el aviso de colaboración (UC-34)", () => {
  it("ignora los cambios propios", () => {
    const result = summarizeChanges(
      [change(ME, "Yo Mismo", "editó la tarea 1.1"), change(ME, "Yo Mismo", "creó la tarea 2")],
      ME,
    );
    expect(result).toEqual({ message: null, count: 0, authors: [] });
  });

  it("sin cambios no hay aviso", () => {
    expect(summarizeChanges([], ME).message).toBeNull();
  });

  it("un cambio ajeno se describe completo", () => {
    const result = summarizeChanges(
      [change("u-ana", "Ana Pérez", 'editó la tarea 1.2 "Diseño"')],
      ME,
    );
    expect(result.message).toBe('Ana Pérez editó la tarea 1.2 "Diseño"');
    expect(result.count).toBe(1);
    expect(result.authors).toEqual(["Ana Pérez"]);
  });

  it("hasta tres cambios se listan uno a uno", () => {
    const result = summarizeChanges(
      [
        change("u-ana", "Ana Pérez", "editó la tarea 1.1"),
        change("u-ana", "Ana Pérez", "editó la tarea 1.2"),
        change("u-luis", "Luis Soto", "creó la tarea 3"),
      ],
      ME,
    );
    expect(result.message).toBe(
      "Ana Pérez editó la tarea 1.1 · Ana Pérez editó la tarea 1.2 · Luis Soto creó la tarea 3",
    );
    expect(result.count).toBe(3);
    expect(result.authors).toEqual(["Ana Pérez", "Luis Soto"]);
  });

  it("más de tres cambios de una sola persona usan el singular del verbo", () => {
    const result = summarizeChanges(
      Array.from({ length: 5 }, (_, i) => change("u-ana", "Ana Pérez", `editó la tarea ${i}`)),
      ME,
    );
    expect(result.message).toBe("Ana Pérez hizo 5 cambios");
    expect(result.count).toBe(5);
  });

  it("más de tres cambios de dos personas dicen 'y 1 persona más'", () => {
    const changes = [
      ...Array.from({ length: 3 }, (_, i) => change("u-ana", "Ana Pérez", `editó la tarea ${i}`)),
      ...Array.from({ length: 2 }, (_, i) => change("u-luis", "Luis Soto", `creó la tarea ${i}`)),
    ];
    expect(summarizeChanges(changes, ME).message).toBe(
      "Ana Pérez y 1 persona más hicieron 5 cambios",
    );
  });

  it("más de tres cambios de tres personas dicen 'y 2 personas más'", () => {
    const changes = [
      ...Array.from({ length: 5 }, (_, i) => change("u-ana", "Ana Pérez", `editó la tarea ${i}`)),
      change("u-luis", "Luis Soto", "creó la tarea 9"),
      change("u-eva", "Eva Díaz", "eliminó la tarea 8"),
      change(ME, "Yo Mismo", "no debe contarse"),
    ];
    const result = summarizeChanges(changes, ME);
    expect(result.message).toBe("Ana Pérez y 2 personas más hicieron 7 cambios");
    expect(result.count).toBe(7);
    expect(result.authors).toEqual(["Ana Pérez", "Luis Soto", "Eva Díaz"]);
  });

  it("sin usuario de sesión considera ajenos todos los cambios", () => {
    expect(summarizeChanges([change("u-ana", "Ana Pérez", "editó la tarea 1")], null).count).toBe(
      1,
    );
  });
});
