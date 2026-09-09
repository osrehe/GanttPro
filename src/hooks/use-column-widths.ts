"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from "react";
import {
  clampColumnWidth,
  columnVarName,
  columnVarStyle,
  columnWidthsStorageKey,
  defaultColumnWidths,
  parseColumnWidths,
  serializeColumnWidths,
  totalColumnWidth,
  totalWidthExpression,
  type ColumnSpec,
  type ColumnWidths,
} from "@/lib/column-widths";

export interface ColumnResizer<K extends string> {
  /** Anchos vigentes en píxeles. Durante el arrastre solo cambia al soltar el puntero. */
  readonly widths: ColumnWidths<K>;
  /** Suma de los anchos (para cálculos que no pueden ser una expresión CSS). */
  readonly total: number;
  /** Variables CSS a poner en el elemento anfitrión. */
  readonly varStyle: Record<string, string>;
  /** Elemento que lleva las variables; el arrastre las escribe aquí. */
  readonly hostRef: MutableRefObject<HTMLElement | null>;
  /** Expresión CSS con la suma de anchos, más un margen opcional en píxeles. */
  totalExpression(extraPx?: number): string;
  /** Comienza a arrastrar el borde derecho de `key`. */
  startResize(key: K, event: ReactPointerEvent): void;
  /** Devuelve una columna a su ancho por omisión (doble clic en el tirador). */
  resetColumn(key: K): void;
  readonly resizing: boolean;
}

/**
 * Anchos de columna redimensionables con el ratón y recordados por navegador (UC-40).
 *
 * `view` identifica la vista en `localStorage`. Durante el arrastre no se toca el estado de React:
 * se escribe la variable CSS en el elemento anfitrión y recién al soltar se guarda el ancho, para
 * que arrastrar sea fluido incluso con la tabla virtualizada.
 */
export function useColumnWidths<K extends string>(
  view: string,
  specs: readonly ColumnSpec<K>[],
): ColumnResizer<K> {
  const prefix = view;
  const [widths, setWidths] = useState<ColumnWidths<K>>(() => defaultColumnWidths(specs));
  const [resizing, setResizing] = useState(false);
  const hostRef = useRef<HTMLElement | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const specsRef = useRef(specs);
  specsRef.current = specs;

  // La lectura va en un efecto y no en el estado inicial: en el servidor no hay `localStorage` y
  // sembrar el estado con lo guardado desataría un aviso de hidratación.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(columnWidthsStorageKey(view));
      if (stored) setWidths(parseColumnWidths(stored, specsRef.current));
    } catch {
      // Navegador sin almacenamiento (modo privado o permisos): se usan los anchos por omisión.
    }
  }, [view]);

  const persist = useCallback(
    (next: ColumnWidths<K>) => {
      try {
        window.localStorage.setItem(columnWidthsStorageKey(view), serializeColumnWidths(next));
      } catch {
        // Sin almacenamiento el ancho vive solo mientras dure la sesión.
      }
    },
    [view],
  );

  const commit = useCallback(
    (next: ColumnWidths<K>) => {
      setWidths(next);
      persist(next);
    },
    [persist],
  );

  const startResize = useCallback(
    (key: K, event: ReactPointerEvent) => {
      const spec = specsRef.current.find((s) => s.key === key);
      if (!spec || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = widthsRef.current[key];
      let last = startWidth;
      setResizing(true);
      const previousCursor = document.body.style.cursor;
      const previousSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (e: PointerEvent) => {
        last = clampColumnWidth(spec, startWidth + e.clientX - startX);
        hostRef.current?.style.setProperty(columnVarName(prefix, key), `${last}px`);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelect;
        setResizing(false);
        if (last !== widthsRef.current[key]) commit({ ...widthsRef.current, [key]: last });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [commit, prefix],
  );

  const resetColumn = useCallback(
    (key: K) => {
      const spec = specsRef.current.find((s) => s.key === key);
      if (!spec) return;
      hostRef.current?.style.setProperty(columnVarName(prefix, key), `${spec.defaultWidth}px`);
      commit({ ...widthsRef.current, [key]: spec.defaultWidth });
    },
    [commit, prefix],
  );

  const varStyle = useMemo(() => columnVarStyle(prefix, widths, specs), [prefix, widths, specs]);
  const total = useMemo(() => totalColumnWidth(widths, specs), [widths, specs]);
  const totalExpression = useCallback(
    (extraPx = 0) => totalWidthExpression(prefix, specs, extraPx),
    [prefix, specs],
  );

  return { widths, total, varStyle, hostRef, totalExpression, startResize, resetColumn, resizing };
}
