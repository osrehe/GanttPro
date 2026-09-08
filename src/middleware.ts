import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { clientIp, LOGIN_RULE, rateLimiter, WRITE_RULE } from "@/lib/rate-limit";

/**
 * Protege páginas y API: sin sesión, las páginas redirigen a /login y la API responde 401.
 * Usa solo `auth.config.ts` (sin Prisma) porque corre en el runtime edge.
 *
 * Antes de comprobar la sesión se aplica el límite de peticiones (ADR-012): los intentos de inicio
 * de sesión y las escrituras de la API tienen un techo por dirección IP.
 */
type EdgeMiddleware = (
  request: NextRequest,
  event: NextFetchEvent,
) => Response | undefined | null | Promise<Response | undefined | null>;

// `auth` está sobrecargado (servidor, envoltorio de handler y middleware); aquí se usa como
// middleware, que es la forma documentada por Auth.js, y se fija esa firma.
const authMiddleware = NextAuth(authConfig).auth as unknown as EdgeMiddleware;

const LOGIN_PATH = "/api/auth/callback/credentials";
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** Respuesta 429 con la envolvente de error de la API (no se importa `response.ts`: usa Prisma). */
function tooManyRequests(message: string, retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message, details: { retryAfterSeconds } } },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

/** Devuelve la respuesta de rechazo si la petición supera su límite; `null` si puede seguir. */
function enforceRateLimit(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const ip = clientIp(request.headers);

  if (pathname === LOGIN_PATH && method === "POST") {
    const result = rateLimiter.check(`login:${ip}`, LOGIN_RULE);
    if (!result.allowed) {
      return tooManyRequests(
        "Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.",
        result.retryAfterSeconds,
      );
    }
    return null;
  }

  // Solo se limitan las escrituras de la API: las lecturas y las páginas quedan fuera.
  if (pathname.startsWith("/api/") && WRITE_METHODS.has(method)) {
    const result = rateLimiter.check(`api:${ip}`, WRITE_RULE);
    if (!result.allowed) {
      return tooManyRequests(
        "Demasiadas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.",
        result.retryAfterSeconds,
      );
    }
  }
  return null;
}

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
): Response | undefined | null | Promise<Response | undefined | null> {
  // `/health` es la sonda del contenedor: nunca se limita ni exige sesión.
  if (request.nextUrl.pathname === "/health") return NextResponse.next();
  const limited = enforceRateLimit(request);
  if (limited) return limited;
  return authMiddleware(request, event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|ico|webp)$).*)"],
};
