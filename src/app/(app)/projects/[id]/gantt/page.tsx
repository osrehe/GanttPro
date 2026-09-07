import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gantt · GanttPro" };

/** La vista Gantt interactiva se construye en el Paso 7 sobre el modelo de layout del engine. */
export default function GanttPage() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="rounded-lg border border-dashed p-10 text-center">
        <h2 className="text-lg font-semibold">Vista Gantt</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Disponible en el Paso 7. Mientras tanto, usa la vista Tabla para planificar.
        </p>
      </div>
    </div>
  );
}
