import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// El middleware envuelve a Auth.js; aquí solo interesa el límite de peticiones, así que la parte de
// sesión se sustituye por un paso directo.
vi.mock("next-auth", () => ({
  default: () => ({ auth: () => NextResponse.next() }),
}));

/** Carga el middleware con las variables de entorno ya fijadas (los límites se leen al importar). */
async function loadMiddleware(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const [{ default: middleware }, { rateLimiter }] = await Promise.all([
    import("./middleware"),
    import("./lib/rate-limit"),
  ]);
  rateLimiter.reset();
  return middleware;
}

type Middleware = Awaited<ReturnType<typeof loadMiddleware>>;

async function post(middleware: Middleware, path: string, ip = "203.0.113.5") {
  const { NextRequest } = await import("next/server");
  const request = new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
  return (await middleware(request, {} as never)) as Response;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Middleware: límite de peticiones (ADR-012)", () => {
  it("rechaza con 429 y la envolvente de error al superar el límite de escrituras", async () => {
    const middleware = await loadMiddleware({ RATE_LIMIT_API_MAX: "2" });
    expect((await post(middleware, "/api/projects")).status).not.toBe(429);
    expect((await post(middleware, "/api/projects")).status).not.toBe(429);

    const bloqueada = await post(middleware, "/api/projects");
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.headers.get("Retry-After")).toBeTruthy();
    const body = (await bloqueada.json()) as {
      error: { code: string; message: string; details: { retryAfterSeconds: number } };
    };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("Demasiadas peticiones");
    expect(body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("cuenta por dirección IP: otra IP conserva su cupo", async () => {
    const middleware = await loadMiddleware({ RATE_LIMIT_API_MAX: "1" });
    expect((await post(middleware, "/api/projects", "203.0.113.1")).status).not.toBe(429);
    expect((await post(middleware, "/api/projects", "203.0.113.1")).status).toBe(429);
    expect((await post(middleware, "/api/projects", "203.0.113.2")).status).not.toBe(429);
  });

  it("los intentos de inicio de sesión tienen su propio contador", async () => {
    const middleware = await loadMiddleware({
      RATE_LIMIT_LOGIN_MAX: "1",
      RATE_LIMIT_API_MAX: "50",
    });
    const login = "/api/auth/callback/credentials";
    expect((await post(middleware, login)).status).not.toBe(429);

    const bloqueado = await post(middleware, login);
    expect(bloqueado.status).toBe(429);
    const body = (await bloqueado.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("intentos de inicio de sesión");

    // El contador de escrituras es independiente y sigue con cupo.
    expect((await post(middleware, "/api/projects")).status).not.toBe(429);
  });

  it("no limita las lecturas ni la sonda de salud", async () => {
    const middleware = await loadMiddleware({ RATE_LIMIT_API_MAX: "1" });
    const { NextRequest } = await import("next/server");
    for (let i = 0; i < 5; i++) {
      const lectura = new NextRequest("http://localhost/api/projects", {
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      expect(((await middleware(lectura, {} as never)) as Response).status).not.toBe(429);
    }
    for (let i = 0; i < 5; i++) {
      const salud = new NextRequest("http://localhost/health", {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
      });
      expect(((await middleware(salud, {} as never)) as Response).status).not.toBe(429);
    }
  });
});
