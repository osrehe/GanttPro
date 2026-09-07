"use client";

import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";

/** Indica si el foco está en un control de edición de texto. */
export function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Atajos globales: "?" abre la ayuda, Ctrl+Z deshace y Ctrl+Y / Ctrl+Shift+Z rehacen. Ninguno actúa
 * mientras el foco está en un campo de texto.
 */
export function useShortcuts(onHelp?: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isEditingTarget(event.target)) return;
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        onHelp?.();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const { undo, redo, projectId } = useProjectStore.getState();
      if (!projectId) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        void undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onHelp]);
}
