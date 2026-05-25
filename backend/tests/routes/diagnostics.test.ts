import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import type { FastifyInstance } from "fastify";

describe("GET /api/diagnostics/hardware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with hardware info fields", async () => {
    const res = await app.inject({ method: "GET", url: "/api/diagnostics/hardware" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("platform");
    expect(body).toHaveProperty("arch");
    expect(body).toHaveProperty("node_version");
    expect(body).toHaveProperty("cpus");
    expect(body).toHaveProperty("total_memory_mb");
  });

  it("returns numeric CPU count", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/diagnostics/hardware" })).json();
    expect(typeof body.cpus).toBe("number");
    expect(body.cpus).toBeGreaterThan(0);
  });
});
