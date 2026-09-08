import { Prisma } from "@prisma/client";
import { isEngineError } from "@ganttpro/engine";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth";

/** Códigos de error de la API (ADR-009). `RATE_LIMITED` lo emite el middleware (ADR-012). */
export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CYCLE"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  VALIDATION: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CYCLE: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Error de la API con código, mensaje en español y detalles estructurados. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

export interface ApiOkBody<T> {
  readonly data: T;
}

/** Respuesta correcta: `{ data }`. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiOkBody<T>> {
  return NextResponse.json({ data }, init);
}

/** Respuesta 201 con `{ data }`. */
export function created<T>(data: T): NextResponse<ApiOkBody<T>> {
  return NextResponse.json({ data }, { status: 201 });
}

/** Respuesta de error: `{ error: { code, message, details } }` con el status del código. */
export function fail(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: details ? { code, message, details } : { code, message } },
    { status: STATUS_BY_CODE[code] },
  );
}

/** Traduce cualquier excepción a una respuesta de error de la API. */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) return fail(error.code, error.message, error.details);
  if (error instanceof UnauthorizedError) return fail("UNAUTHORIZED", error.message);
  if (error instanceof ZodError) {
    return fail("VALIDATION", "Datos inválidos", {
      issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (isEngineError(error)) {
    if (error.code === "CYCLE") return fail("CYCLE", error.message, { ...error.details });
    if (error.code === "NOT_FOUND") return fail("NOT_FOUND", error.message, { ...error.details });
    return fail("VALIDATION", error.message, { ...error.details });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return fail("CONFLICT", "Ya existe un registro con esos datos", {
        target: error.meta?.target,
      });
    }
    if (error.code === "P2025") return fail("NOT_FOUND", "El registro no existe");
  }
  if (error instanceof SyntaxError)
    return fail("VALIDATION", "El cuerpo de la petición no es JSON válido");
  console.error("Error no controlado en la API:", error);
  return fail("INTERNAL", "Error interno del servidor");
}

type Handler<Ctx> = (request: Request, context: Ctx) => Promise<Response>;

/** Envuelve un Route Handler para traducir excepciones a la envolvente de error. */
export function handle<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** Lee y valida el cuerpo JSON de la petición con un esquema Zod. */
export async function parseBody<T>(
  request: Request,
  schema: { parse: (v: unknown) => T },
): Promise<T> {
  const text = await request.text();
  const json: unknown = text.trim() === "" ? {} : JSON.parse(text);
  return schema.parse(json);
}

/** Resuelve los parámetros de ruta (en Next 15 llegan como promesa). */
export async function routeParams<P extends Record<string, string>>(context: {
  params: Promise<P> | P;
}): Promise<P> {
  return await context.params;
}
