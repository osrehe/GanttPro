import { describe, expect, it } from "vitest";
import { LOGO_URL_MAX_LENGTH, logoUrlSchema } from "./index";

describe("logoUrlSchema", () => {
  it("acepta https y PNG, JPEG, GIF o WebP incrustados", () => {
    for (const value of [
      "https://mi-empresa.cl/logo.png",
      "data:image/png;base64,iVBORw0KGgo=",
      "data:image/jpeg;base64,/9j/4AAQ",
      "data:image/webp;base64,UklGRg==",
    ]) {
      expect(logoUrlSchema.safeParse(value).success, value).toBe(true);
    }
  });

  it("rechaza otros esquemas, SVG y valores desmedidos", () => {
    for (const value of [
      "http://mi-empresa.cl/logo.png",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:text/html;base64,PGgxPg==",
      `data:image/png;base64,${"A".repeat(LOGO_URL_MAX_LENGTH)}`,
    ]) {
      expect(logoUrlSchema.safeParse(value).success, value.slice(0, 40)).toBe(false);
    }
  });
});
