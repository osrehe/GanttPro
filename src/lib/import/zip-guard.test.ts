import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { inspectZip, MAX_UNCOMPRESSED_BYTES } from "./zip-guard";

async function sampleXlsx(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Tareas").addRow(["Nombre", "Duración"]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Reescribe el tamaño descomprimido declarado de la primera entrada del directorio central. */
function withDeclaredSize(bytes: Uint8Array, size: number): Uint8Array {
  const copy = bytes.slice();
  const view = new DataView(copy.buffer);
  for (let i = 0; i < copy.length - 4; i += 1) {
    if (view.getUint32(i, true) === 0x02014b50) {
      view.setUint32(i + 24, size, true);
      return copy;
    }
  }
  throw new Error("sin directorio central");
}

describe("inspectZip", () => {
  it("acepta un .xlsx normal", async () => {
    const result = inspectZip(await sampleXlsx());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries).toBeGreaterThan(3);
  });

  it("rechaza un archivo cuyo contenido descomprimido declarado es desmedido", async () => {
    const bomb = withDeclaredSize(await sampleXlsx(), MAX_UNCOMPRESSED_BYTES + 1);
    const result = inspectZip(bomb);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("100 MB") as string });
  });

  it("rechaza entradas ZIP64 y archivos que no son ZIP", async () => {
    expect(inspectZip(withDeclaredSize(await sampleXlsx(), 0xffffffff)).ok).toBe(false);
    expect(inspectZip(new TextEncoder().encode("Nombre;Duración\nA;3")).ok).toBe(false);
    expect(inspectZip(new Uint8Array(0)).ok).toBe(false);
  });
});
