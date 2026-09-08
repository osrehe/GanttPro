/**
 * Limitador de peticiones por ventana deslizante, en memoria del proceso (ADR-012).
 *
 * No usa dependencias ni APIs de Node: corre en el runtime edge, donde vive el middleware. Guarda
 * las marcas de tiempo de cada clave y descarta las que salieron de la ventana.
 *
 * **Alcance:** es suficiente para un despliegue de un solo proceso (el caso de v1: un contenedor
 * Node detrás de un proxy). Con varias instancias cada una llevaría su propia cuenta y el límite
 * real se multiplicaría; en ese escenario hay que mover el contador a Redis (ver ADR-012).
 */

export interface RateLimitRule {
  /** Peticiones permitidas dentro de la ventana. */
  readonly limit: number;
  /** Tamaño de la ventana en milisegundos. */
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Peticiones que aún caben en la ventana. */
  readonly remaining: number;
  /** Segundos que faltan para que se libere un espacio (0 si todavía hay cupo). */
  readonly retryAfterSeconds: number;
}

/** Cada cuántas comprobaciones se limpian las claves que ya no tienen marcas vigentes. */
const CLEANUP_EVERY = 500;

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private checks = 0;

  /**
   * Registra una petición de `key` y dice si se permite. `now` se inyecta para poder probar los
   * bordes de la ventana sin relojes falsos.
   */
  check(key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitResult {
    const windowStart = now - rule.windowMs;
    const previous = this.hits.get(key);
    const current = previous === undefined ? [] : previous.filter((t) => t > windowStart);

    if (current.length >= rule.limit) {
      this.hits.set(key, current);
      const oldest = current[0] as number;
      const retryAfterMs = Math.max(0, oldest + rule.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      };
    }

    current.push(now);
    this.hits.set(key, current);
    this.maybeCleanup(now);
    return { allowed: true, remaining: rule.limit - current.length, retryAfterSeconds: 0 };
  }

  /** Vacía el contador (solo lo usan los tests). */
  reset(): void {
    this.hits.clear();
    this.checks = 0;
  }

  /** Claves con marcas vigentes (solo lo usan los tests). */
  get size(): number {
    return this.hits.size;
  }

  /**
   * Cada cierto número de comprobaciones descarta las claves cuya última marca es más vieja que la
   * ventana más larga que usamos. Sin esto, un ataque con IPs distintas haría crecer el mapa.
   */
  private maybeCleanup(now: number): void {
    this.checks += 1;
    if (this.checks % CLEANUP_EVERY !== 0) return;
    const horizon = now - LONGEST_WINDOW_MS;
    for (const [key, marks] of this.hits) {
      const last = marks[marks.length - 1];
      if (last === undefined || last <= horizon) this.hits.delete(key);
    }
  }
}

/**
 * Límite efectivo de una regla. Solo aprieta en producción: en desarrollo y en las pruebas de
 * extremo a extremo se inicia sesión decenas de veces desde la misma IP en pocos minutos, así que
 * el valor por defecto fuera de producción es deliberadamente alto. Se puede fijar en cualquier
 * entorno con la variable indicada (útil para probar el propio límite).
 */
export function resolveLimit(variable: string, productionDefault: number): number {
  const raw = process.env[variable];
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return process.env.NODE_ENV === "production" ? productionDefault : DEVELOPMENT_LIMIT;
}

/** Techo fuera de producción: nunca se alcanza en un uso normal ni en la suite de pruebas. */
export const DEVELOPMENT_LIMIT = 1000;

/**
 * Intentos de inicio de sesión: frena la prueba de contraseñas por fuerza bruta.
 * Configurable con `RATE_LIMIT_LOGIN_MAX` (por defecto 10 cada 5 minutos en producción).
 */
export const LOGIN_RULE: RateLimitRule = {
  limit: resolveLimit("RATE_LIMIT_LOGIN_MAX", 10),
  windowMs: 5 * 60_000,
};

/**
 * Escrituras de la API: techo amplio, pensado contra bucles y guiones, no contra el uso normal.
 * Configurable con `RATE_LIMIT_API_MAX` (por defecto 120 por minuto en producción).
 */
export const WRITE_RULE: RateLimitRule = {
  limit: resolveLimit("RATE_LIMIT_API_MAX", 120),
  windowMs: 60_000,
};

const LONGEST_WINDOW_MS = Math.max(LOGIN_RULE.windowMs, WRITE_RULE.windowMs);

/** Instancia compartida por el middleware. */
export const rateLimiter = new SlidingWindowRateLimiter();

/**
 * IP de la petición. Detrás de un proxy hay que reenviar `X-Forwarded-For`; si no llega, todas las
 * peticiones comparten la misma clave y el límite pasa a ser global (conservador, nunca permisivo).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "desconocida";
}
