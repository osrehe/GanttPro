import { describe, expect, it, vi } from "vitest";

// `response.ts` importa Auth.js, que solo carga dentro de Next: aquí basta con su clase de error.
vi.mock("@/lib/auth", () => ({ UnauthorizedError: class extends Error {} }));

import { ApiError, readBodyLimited } from "./response";

function streamOf(chunks: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size));
      controller.close();
    },
  });
}

describe("readBodyLimited", () => {
  it("devuelve el cuerpo completo cuando cabe", async () => {
    const body = await readBodyLimited(
      new Request("http://x", { method: "POST", body: "hola" }),
      10,
    );
    expect(new TextDecoder().decode(body)).toBe("hola");
  });

  it("rechaza por Content-Length sin leer el cuerpo", async () => {
    const request = new Request("http://x", {
      method: "POST",
      headers: { "Content-Length": "1000" },
      body: "hola",
    });
    await expect(readBodyLimited(request, 10)).rejects.toBeInstanceOf(ApiError);
  });

  it("corta la lectura cuando un cuerpo sin Content-Length pasa el tope", async () => {
    const request = new Request("http://x", {
      method: "POST",
      body: streamOf([6, 6, 6]),
      duplex: "half",
    } as RequestInit);
    await expect(readBodyLimited(request, 10)).rejects.toThrow(/máximo/);
  });
});
