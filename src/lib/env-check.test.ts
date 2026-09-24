import { describe, expect, it } from "vitest";
import { assertProductionConfig, EXAMPLE_AUTH_SECRET, productionConfigProblems } from "./env-check";

describe("productionConfigProblems", () => {
  it("acepta un secreto largo y propio", () => {
    expect(productionConfigProblems({ AUTH_SECRET: "x".repeat(32) })).toEqual([]);
  });

  it("rechaza el secreto de ejemplo, uno corto o ninguno", () => {
    expect(productionConfigProblems({ AUTH_SECRET: EXAMPLE_AUTH_SECRET })[0]).toContain("ejemplo");
    expect(productionConfigProblems({ AUTH_SECRET: "corto" })[0]).toContain("32");
    expect(productionConfigProblems({})[0]).toContain("Falta");
    expect(productionConfigProblems({ AUTH_SECRET: "   " })[0]).toContain("Falta");
  });

  it("assertProductionConfig lanza con el detalle y la forma de generar uno", () => {
    expect(() => assertProductionConfig({ AUTH_SECRET: EXAMPLE_AUTH_SECRET })).toThrow(
      /no arranca.*npx auth secret/,
    );
    expect(() => assertProductionConfig({ AUTH_SECRET: "y".repeat(40) })).not.toThrow();
  });
});
