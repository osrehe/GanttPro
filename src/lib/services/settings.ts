import { prisma } from "@/lib/db";
import type { UpdateSettingsInput } from "@/lib/schemas";

/** Configuración global (UC-37). Claves v1 con sus valores por defecto. */
export interface SettingsDto {
  ufValue: number | null;
  ufValueDate: string | null;
  displayCurrency: "UF" | "CLP";
  dateFormat: "dd-mm-yyyy" | "yyyy-mm-dd";
  logoUrl: string | null;
}

const DEFAULTS: SettingsDto = {
  ufValue: null,
  ufValueDate: null,
  displayCurrency: "UF",
  dateFormat: "dd-mm-yyyy",
  logoUrl: null,
};

export async function getSettings(): Promise<SettingsDto> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0
      ? v
      : typeof v === "string" && Number(v) > 0
        ? Number(v)
        : null;
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const currency = map.get("displayCurrency");
  const dateFormat = map.get("dateFormat");
  return {
    ufValue: num(map.get("ufValue")),
    ufValueDate: str(map.get("ufValueDate")),
    displayCurrency: currency === "CLP" ? "CLP" : DEFAULTS.displayCurrency,
    dateFormat: dateFormat === "yyyy-mm-dd" ? "yyyy-mm-dd" : DEFAULTS.dateFormat,
    logoUrl: str(map.get("logoUrl")),
  };
}

export async function updateSettings(
  userId: string,
  input: UpdateSettingsInput,
): Promise<SettingsDto> {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as Array<
    [string, unknown]
  >;
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: value === null ? "" : (value as string | number), updatedById: userId },
        create: {
          key,
          value: value === null ? "" : (value as string | number),
          updatedById: userId,
        },
      }),
    ),
  );
  return getSettings();
}
