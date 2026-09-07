import type { Metadata } from "next";

export const metadata: Metadata = { title: "Configuración · GanttPro" };

/** Calendario laboral, feriados, valor UF y formato se configuran en el Paso 10. */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="text-2xl font-semibold tracking-tight">Configuración</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        La configuración de calendario laboral, feriados de Chile por año, valor UF, formato de
        fechas y moneda de visualización estará disponible en el Paso 10.
      </p>
    </div>
  );
}
