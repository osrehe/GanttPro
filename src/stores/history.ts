/**
 * Historial de comandos para deshacer/rehacer (ADR-008, UC-25).
 *
 * Cada comando sabe ejecutarse y deshacerse contra la API. Como rehacer una creación produce ids
 * nuevos en el servidor, el contexto mantiene un mapa de alias `idOriginal → idActual` y los
 * comandos resuelven todos los ids a través de él antes de llamar a la API.
 */

export interface CommandContext {
  /** Id vigente para un id capturado al crear el comando (sigue la cadena de alias). */
  resolve(id: string): string;
  /** Registra que `oldId` ahora vive como `newId` (tras rehacer una creación). */
  alias(oldId: string, newId: string): void;
}

export interface Command {
  readonly label: string;
  execute(ctx: CommandContext): Promise<void>;
  undo(ctx: CommandContext): Promise<void>;
}

export interface HistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly busy: boolean;
  readonly size: number;
}

type Listener = (snapshot: HistorySnapshot) => void;

export class CommandHistory implements CommandContext {
  private past: Command[] = [];
  private future: Command[] = [];
  private readonly aliases = new Map<string, string>();
  private readonly listeners = new Set<Listener>();
  private busy = false;

  constructor(private readonly limit = 100) {}

  resolve(id: string): string {
    let current = id;
    const seen = new Set<string>();
    while (this.aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = this.aliases.get(current) as string;
    }
    return current;
  }

  alias(oldId: string, newId: string): void {
    if (oldId !== newId) this.aliases.set(oldId, newId);
  }

  /** Ejecuta un comando nuevo; descarta lo que hubiera para rehacer. */
  async run(command: Command): Promise<void> {
    await this.guard(async () => {
      await command.execute(this);
      this.past.push(command);
      if (this.past.length > this.limit) this.past.shift();
      this.future = [];
    });
  }

  async undo(): Promise<boolean> {
    const command = this.past[this.past.length - 1];
    if (!command) return false;
    await this.guard(async () => {
      await command.undo(this);
      this.past.pop();
      this.future.push(command);
    });
    return true;
  }

  async redo(): Promise<boolean> {
    const command = this.future[this.future.length - 1];
    if (!command) return false;
    await this.guard(async () => {
      await command.execute(this);
      this.future.pop();
      this.past.push(command);
    });
    return true;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.aliases.clear();
    this.notify();
  }

  snapshot(): HistorySnapshot {
    const undoLabel = this.past[this.past.length - 1]?.label ?? null;
    const redoLabel = this.future[this.future.length - 1]?.label ?? null;
    return {
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      undoLabel,
      redoLabel,
      busy: this.busy,
      size: this.past.length,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async guard(fn: () => Promise<void>): Promise<void> {
    if (this.busy) throw new Error("Hay una operación en curso; espera a que termine");
    this.busy = true;
    this.notify();
    try {
      await fn();
    } finally {
      this.busy = false;
      this.notify();
    }
  }

  private notify(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

/** Comando compuesto: ejecuta sus partes en orden y las deshace en orden inverso. */
export class CompositeCommand implements Command {
  constructor(
    readonly label: string,
    private readonly parts: readonly Command[],
  ) {}

  async execute(ctx: CommandContext): Promise<void> {
    for (const part of this.parts) await part.execute(ctx);
  }

  async undo(ctx: CommandContext): Promise<void> {
    for (let i = this.parts.length - 1; i >= 0; i--) await (this.parts[i] as Command).undo(ctx);
  }
}
