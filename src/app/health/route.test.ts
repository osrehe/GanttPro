import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /health", () => {
  it("responde 200 con status ok", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", service: "ganttpro" });
    expect(typeof body.timestamp).toBe("string");
  });
});
