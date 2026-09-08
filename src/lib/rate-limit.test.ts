import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientIp,
  DEVELOPMENT_LIMIT,
  LOGIN_RULE,
  resolveLimit,
  SlidingWindowRateLimiter,
  WRITE_RULE,
  type RateLimitRule,
} from "./rate-limit";

const RULE: RateLimitRule = { limit: 3, windowMs: 1000 };

describe("SlidingWindowRateLimiter", () => {
  it("permite hasta el límite y rechaza la siguiente petición de la ventana", () => {
    const limiter = new SlidingWindowRateLimiter();
    expect(limiter.check("ip", RULE, 0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.check("ip", RULE, 100)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("ip", RULE, 200)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("ip", RULE, 300)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("indica cuántos segundos faltan para volver a intentar", () => {
    const limiter = new SlidingWindowRateLimiter();
    for (const t of [0, 100, 200]) limiter.check("ip", RULE, t);
    // La marca más vieja (0) sale de la ventana en t = 1000; a los 300 ms faltan 700 ms → 1 s.
    expect(limiter.check("ip", RULE, 300).retryAfterSeconds).toBe(1);
    const largo: RateLimitRule = { limit: 1, windowMs: 10_000 };
    limiter.check("otra", largo, 0);
    expect(limiter.check("otra", largo, 1000).retryAfterSeconds).toBe(9);
  });

  it("libera cupo cuando la marca más vieja sale de la ventana", () => {
    const limiter = new SlidingWindowRateLimiter();
    for (const t of [0, 100, 200]) limiter.check("ip", RULE, t);
    expect(limiter.check("ip", RULE, 300).allowed).toBe(false);
    // En t = 1000 la marca de t = 0 cumplió la ventana completa y deja de contar: queda un espacio.
    expect(limiter.check("ip", RULE, 1000).allowed).toBe(true);
    // Ese espacio lo ocupa la petición anterior, así que la siguiente vuelve a rechazarse.
    expect(limiter.check("ip", RULE, 1001).allowed).toBe(false);
    // Cuando salen también las marcas de 100 y 200 hay cupo de nuevo.
    expect(limiter.check("ip", RULE, 1201).allowed).toBe(true);
  });

  it("cuenta cada clave por separado", () => {
    const limiter = new SlidingWindowRateLimiter();
    for (const t of [0, 100, 200]) limiter.check("ip-1", RULE, t);
    expect(limiter.check("ip-1", RULE, 300).allowed).toBe(false);
    expect(limiter.check("ip-2", RULE, 300).allowed).toBe(true);
    expect(limiter.size).toBe(2);
  });

  it("reinicia el contador cuando se le pide", () => {
    const limiter = new SlidingWindowRateLimiter();
    for (const t of [0, 100, 200]) limiter.check("ip", RULE, t);
    expect(limiter.check("ip", RULE, 300).allowed).toBe(false);
    limiter.reset();
    expect(limiter.size).toBe(0);
    expect(limiter.check("ip", RULE, 300).allowed).toBe(true);
  });

  it("las ventanas de la aplicación son de 5 minutos y de 1 minuto", () => {
    expect(LOGIN_RULE.windowMs).toBe(300_000);
    expect(WRITE_RULE.windowMs).toBe(60_000);
    // Fuera de producción los límites son altos para no estorbar al desarrollo ni a los e2e.
    expect(LOGIN_RULE.limit).toBe(DEVELOPMENT_LIMIT);
    expect(WRITE_RULE.limit).toBe(DEVELOPMENT_LIMIT);
  });
});

describe("resolveLimit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa el valor de la variable de entorno cuando es un entero positivo", () => {
    vi.stubEnv("RATE_LIMIT_LOGIN_MAX", "3");
    expect(resolveLimit("RATE_LIMIT_LOGIN_MAX", 10)).toBe(3);
  });

  it("ignora valores inválidos y cae en el valor por defecto del entorno", () => {
    for (const invalido of ["", "0", "-5", "muchos"]) {
      vi.stubEnv("RATE_LIMIT_LOGIN_MAX", invalido);
      expect(resolveLimit("RATE_LIMIT_LOGIN_MAX", 10)).toBe(DEVELOPMENT_LIMIT);
    }
  });

  it("en producción aplica el valor estricto y fuera de producción el amplio", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveLimit("RATE_LIMIT_LOGIN_MAX", 10)).toBe(10);
    vi.stubEnv("NODE_ENV", "test");
    expect(resolveLimit("RATE_LIMIT_LOGIN_MAX", 10)).toBe(DEVELOPMENT_LIMIT);
  });
});

describe("clientIp", () => {
  it("toma la primera dirección de X-Forwarded-For", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(clientIp(headers)).toBe("203.0.113.7");
  });

  it("usa X-Real-IP cuando no hay cabecera reenviada", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("sin cabeceras devuelve una clave fija (límite global, nunca permisivo)", () => {
    expect(clientIp(new Headers())).toBe("desconocida");
  });
});
