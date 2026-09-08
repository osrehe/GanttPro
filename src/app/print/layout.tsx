import type { ReactNode } from "react";

/**
 * Layout de las rutas de impresión (`/print/*`): sin sidebar ni header; fondo blanco y tipografía
 * apta para PDF. Las reglas `@page` las fija cada página según las opciones elegidas.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="print-root"
      style={{
        background: "#fff",
        color: "#111827",
        fontFamily: "Plus Jakarta Sans, Segoe UI, Arial, sans-serif",
        margin: 0,
      }}
    >
      {children}
    </div>
  );
}
