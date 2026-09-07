"use client";

import { useEffect, useState } from "react";

/**
 * `true` después de la primera hidratación. Sirve para posponer los componentes de Radix que
 * generan identificadores con `useId`: si no existen en el HTML del servidor, no hay forma de que
 * el identificador del servidor y el del cliente discrepen al hidratar.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
