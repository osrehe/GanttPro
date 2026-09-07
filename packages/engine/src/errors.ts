/** Códigos de error que emite el engine. La API los traduce a códigos HTTP y de respuesta. */
export type EngineErrorCode =
  "CYCLE" | "INVALID_DEPENDENCY" | "INVALID_MOVE" | "INVALID_CALENDAR" | "NOT_FOUND";

/**
 * Error de dominio del engine. El mensaje está en español y listo para mostrarse; `details`
 * transporta datos estructurados (por ejemplo, el ciclo detectado).
 */
export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: EngineErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.details = details;
  }
}

/** Indica si un valor es un `EngineError`, útil en la capa de API. */
export function isEngineError(error: unknown): error is EngineError {
  return error instanceof EngineError;
}
