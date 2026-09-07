import type { IsoDate } from "@ganttpro/engine";
import { prisma } from "./db";

/** Valor de la UF vigente para los cálculos de costo. */
export interface UfQuote {
  readonly value: number;
  /** Fecha a la que corresponde el valor (`YYYY-MM-DD`) o nula si no se conoce. */
  readonly date: IsoDate | null;
  readonly source: "manual" | "mindicador";
}

/**
 * Adaptador del valor UF (UC-38). En v1 solo existe el proveedor manual, que lee lo ingresado en
 * Configuración (`Setting.ufValue`). El proveedor de mindicador.cl queda preparado como extensión
 * v2 y no se usa en producción.
 */
export interface UfProvider {
  getQuote(): Promise<UfQuote | null>;
}

/** Lee `Setting.ufValue` y `Setting.ufValueDate`. */
export class ManualUfProvider implements UfProvider {
  async getQuote(): Promise<UfQuote | null> {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ["ufValue", "ufValueDate"] } },
    });
    const value = rows.find((r) => r.key === "ufValue")?.value;
    const date = rows.find((r) => r.key === "ufValueDate")?.value;
    const numeric =
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return { value: numeric, date: typeof date === "string" ? date : null, source: "manual" };
  }
}

/**
 * Consulta https://mindicador.cl/api/uf. Preparado para la v2: la interfaz y el parseo están
 * definidos, pero no se registra como proveedor activo (sin llamadas externas en v1, ADR-004).
 */
export class MindicadorUfProvider implements UfProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getQuote(): Promise<UfQuote | null> {
    const response = await this.fetchImpl("https://mindicador.cl/api/uf");
    if (!response.ok) return null;
    const json = (await response.json()) as { serie?: Array<{ fecha: string; valor: number }> };
    const latest = json.serie?.[0];
    if (!latest || !Number.isFinite(latest.valor)) return null;
    return { value: latest.valor, date: latest.fecha.slice(0, 10), source: "mindicador" };
  }
}

/** Proveedor activo en v1. */
export const ufProvider: UfProvider = new ManualUfProvider();
