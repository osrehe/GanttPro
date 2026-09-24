import { describe, expect, it } from "vitest";
import { isAllowedPrintRequest } from "./print-requests";

const ORIGIN = "http://127.0.0.1:3000";

describe("isAllowedPrintRequest", () => {
  it("permite el propio origen y los recursos incrustados", () => {
    expect(isAllowedPrintRequest(`${ORIGIN}/_next/static/app.js`, ORIGIN)).toBe(true);
    expect(isAllowedPrintRequest("data:image/png;base64,AAAA", ORIGIN)).toBe(true);
    expect(isAllowedPrintRequest("blob:http://127.0.0.1:3000/uuid", ORIGIN)).toBe(true);
  });

  it("bloquea otros hosts, puertos y esquemas", () => {
    expect(isAllowedPrintRequest("http://169.254.169.254/latest/meta-data", ORIGIN)).toBe(false);
    expect(isAllowedPrintRequest("http://127.0.0.1:5432/", ORIGIN)).toBe(false);
    expect(isAllowedPrintRequest("https://atacante.example/x.png", ORIGIN)).toBe(false);
    expect(isAllowedPrintRequest("file:///etc/passwd", ORIGIN)).toBe(false);
    expect(isAllowedPrintRequest("no es una url", ORIGIN)).toBe(false);
  });

  it("permite solo la URL externa exacta que se autoriza (el logo)", () => {
    const logo = "https://mi-empresa.cl/logo.png";
    expect(isAllowedPrintRequest(logo, ORIGIN, [logo])).toBe(true);
    expect(isAllowedPrintRequest("https://mi-empresa.cl/otra.png", ORIGIN, [logo])).toBe(false);
  });
});
