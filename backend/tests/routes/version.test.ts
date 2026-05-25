import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import type { FastifyInstance } from "fastify";

describe("GET /api/version", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/version" });
    expect(res.statusCode).toBe(200);
  });

  it("returns version, source_url, and license_url", async () => {
    const res = await app.inject({ method: "GET", url: "/api/version" });
    const body = res.json();
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("source_url");
    expect(body).toHaveProperty("license_url");
  });

  it("source_url is a valid http(s) URL", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/version" })).json();
    expect(body.source_url).toMatch(/^https?:\/\//);
  });

  it("license_url is a valid http(s) URL", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/version" })).json();
    expect(body.license_url).toMatch(/^https?:\/\//);
  });
});
