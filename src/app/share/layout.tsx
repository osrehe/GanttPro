import type { ReactNode } from "react";

/** Envoltura mínima de las vistas públicas: sin sidebar, sin sesión y sin acciones de edición. */
export default function ShareLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
