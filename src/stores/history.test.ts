import { describe, expect, it } from "vitest";
import { CommandHistory, CompositeCommand, type Command, type CommandContext } from "./history";

/** Comando de prueba que suma/resta a un contador compartido. */
function inc(state: { value: number }, amount: number, label = `+${amount}`): Command {
  return {
    label,
    async execute() {
      state.value += amount;
    },
    async undo() {
      state.value -= amount;
    },
  };
}

/** Simula "crear": cada ejecución produce un id nuevo y registra el alias. */
function create(state: { ids: string[] }, originalId: string, counter: { next: number }): Command {
  return {
    label: "crear",
    async execute(ctx: CommandContext) {
      const newId = `srv-${counter.next++}`;
      state.ids.push(newId);
      ctx.alias(originalId, newId);
    },
    async undo(ctx: CommandContext) {
      const current = ctx.resolve(originalId);
      state.ids = state.ids.filter((id) => id !== current);
    },
  };
}

describe("CommandHistory (UC-25)", () => {
  it("deshace y rehace 20 operaciones consecutivas en orden", async () => {
    const history = new CommandHistory();
    const state = { value: 0 };
    for (let i = 1; i <= 20; i++) await history.run(inc(state, i));
    expect(state.value).toBe(210);
    expect(history.snapshot()).toMatchObject({
      canUndo: true,
      canRedo: false,
      size: 20,
      undoLabel: "+20",
    });

    for (let i = 20; i >= 1; i--) {
      expect(await history.undo()).toBe(true);
      expect(state.value).toBe(((i - 1) * i) / 2);
    }
    expect(await history.undo()).toBe(false);
    expect(history.snapshot()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: "+1" });

    for (let i = 1; i <= 20; i++) {
      expect(await history.redo()).toBe(true);
      expect(state.value).toBe((i * (i + 1)) / 2);
    }
    expect(await history.redo()).toBe(false);
    expect(state.value).toBe(210);
  });

  it("un comando nuevo tras deshacer descarta la pila de rehacer", async () => {
    const history = new CommandHistory();
    const state = { value: 0 };
    await history.run(inc(state, 1));
    await history.run(inc(state, 2));
    await history.undo();
    await history.run(inc(state, 10));
    expect(state.value).toBe(11);
    expect(history.snapshot().canRedo).toBe(false);
    await history.undo();
    await history.undo();
    expect(state.value).toBe(0);
  });

  it("resuelve ids a través de los alias al rehacer una creación", async () => {
    const history = new CommandHistory();
    const state = { ids: [] as string[] };
    const counter = { next: 1 };
    const cmd = create(state, "tmp-1", counter);
    await history.run(cmd);
    expect(state.ids).toEqual(["srv-1"]);
    await history.undo();
    expect(state.ids).toEqual([]);
    await history.redo();
    expect(state.ids).toEqual(["srv-2"]);
    expect(history.resolve("tmp-1")).toBe("srv-2");
    // Un comando posterior que referencie el id original sigue funcionando.
    const rename: Command = {
      label: "usar",
      async execute(ctx) {
        expect(ctx.resolve("tmp-1")).toBe("srv-2");
      },
      async undo() {},
    };
    await history.run(rename);
    await history.undo();
    await history.undo();
    expect(state.ids).toEqual([]);
  });

  it("respeta el límite de historial", async () => {
    const history = new CommandHistory(3);
    const state = { value: 0 };
    for (let i = 1; i <= 5; i++) await history.run(inc(state, 1));
    expect(history.snapshot().size).toBe(3);
    while (await history.undo()) {
      /* vaciar */
    }
    expect(state.value).toBe(2);
  });

  it("un comando compuesto se deshace en orden inverso y un fallo no corrompe el historial", async () => {
    const history = new CommandHistory();
    const order: string[] = [];
    const part = (name: string): Command => ({
      label: name,
      async execute() {
        order.push(`do:${name}`);
      },
      async undo() {
        order.push(`undo:${name}`);
      },
    });
    await history.run(new CompositeCommand("compuesto", [part("a"), part("b")]));
    await history.undo();
    expect(order).toEqual(["do:a", "do:b", "undo:b", "undo:a"]);

    const failing: Command = {
      label: "falla",
      async execute() {
        throw new Error("boom");
      },
      async undo() {},
    };
    await expect(history.run(failing)).rejects.toThrow("boom");
    expect(history.snapshot()).toMatchObject({ busy: false, canUndo: false, canRedo: true });
  });

  it("notifica a los suscriptores y limpia", async () => {
    const history = new CommandHistory();
    const seen: boolean[] = [];
    const unsubscribe = history.subscribe((s) => seen.push(s.busy));
    await history.run(inc({ value: 0 }, 1));
    expect(seen).toEqual([true, false]);
    unsubscribe();
    history.clear();
    expect(history.snapshot()).toMatchObject({ canUndo: false, canRedo: false, size: 0 });
  });
});
