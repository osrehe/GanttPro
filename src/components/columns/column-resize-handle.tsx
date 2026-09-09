"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Etiqueta de la columna que se redimensiona, para el nombre accesible. */
  label: string;
  onPointerDown(event: ReactPointerEvent): void;
  onDoubleClick(): void;
  /** Alto del tirador; por omisión ocupa el alto del encabezado. */
  className?: string;
  testId?: string;
}

/**
 * Tirador del borde derecho de una columna: arrastrar cambia el ancho, doble clic lo restablece.
 * Es un `separator` sin foco de teclado, igual que el separador del panel del Gantt: el ancho es
 * una preferencia visual y hacerlo tabulable metería once paradas dentro de la grilla.
 */
export function ColumnResizeHandle({
  label,
  onPointerDown,
  onDoubleClick,
  className,
  testId,
}: Props) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Redimensionar columna ${label}`}
      title={`Arrastra para cambiar el ancho de «${label}»; doble clic lo restablece`}
      data-testid={testId ?? "column-resize-handle"}
      data-column-resize={label}
      className={cn(
        "hover:bg-primary/50 active:bg-primary/70 absolute top-0 right-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none",
        className,
      )}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDoubleClick();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
