"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Group {
  readonly title: string;
  readonly items: ReadonlyArray<readonly [string, string]>;
}

/** Atajos de teclado documentados; el panel se abre con "?" desde cualquier parte. */
export const SHORTCUT_GROUPS: readonly Group[] = [
  {
    title: "General",
    items: [
      ["?", "Abrir y cerrar esta ayuda"],
      ["Ctrl + Z", "Deshacer"],
      ["Ctrl + Y  ·  Ctrl + Shift + Z", "Rehacer"],
      ["Esc", "Cerrar el panel o cancelar la edición"],
    ],
  },
  {
    title: "Tabla",
    items: [
      ["Flechas", "Mover el foco entre celdas"],
      ["Enter  ·  F2", "Editar la celda"],
      ["Insert", "Nueva tarea debajo"],
      ["Shift + Insert", "Nueva subtarea"],
      ["Supr", "Eliminar la tarea seleccionada"],
      ["Tab  ·  Shift + Tab", "Indentar y desindentar"],
      ["Alt + ↑  ·  Alt + ↓", "Subir y bajar la tarea"],
    ],
  },
  {
    title: "Gantt",
    items: [
      ["↑  ·  ↓", "Seleccionar la tarea anterior o siguiente"],
      ["Enter", "Abrir el detalle de la tarea"],
      ["Ctrl + →  ·  Ctrl + ←", "Mover la tarea un día hábil"],
      ["Ctrl + rueda", "Acercar y alejar"],
      ["Espacio", "Contraer o expandir un resumen"],
    ],
  },
] as const;

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="shortcuts-dialog">
        <DialogHeader>
          <DialogTitle>Atajos de teclado</DialogTitle>
          <DialogDescription>
            Toda la estructura del proyecto se puede crear y editar sin el ratón.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-3">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-2 text-sm font-semibold">{group.title}</h3>
              <dl className="grid gap-1.5">
                {group.items.map(([keys, description]) => (
                  <div key={keys} className="grid gap-0.5">
                    <dt>
                      <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                    </dt>
                    <dd className="text-muted-foreground text-xs">{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
