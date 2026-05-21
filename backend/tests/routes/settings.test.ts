import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import type { FastifyInstance } from "fastify";

describe("GET /api/settings", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with settings shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("psarc_platform");
    expect(body).toHaveProperty("default_arrangement");
    expect(body).toHaveProperty("master_difficulty");
    expect(body).toHaveProperty("av_offset_ms");
  });
});

describe("POST /api/settings", () => {
  let app: FastifyInstance;
  let savedPatch: Record<string, unknown> = {};

  beforeAll(async () => {
    app = buildTestApp({
      settings: {
        save: (patch) => {
          savedPatch = patch as Record<string, unknown>;
          return {};
        },
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with updated settings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings",
      payload: { psarc_platform: "pc", av_offset_ms: 20 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("psarc_platform");
  });

  it("passes correct fields to save()", async () => {
    await app.inject({
      method: "POST",
      url: "/api/settings",
      payload: { psarc_platform: "mac" },
    });
    expect(savedPatch).toHaveProperty("psarcPlatform", "mac");
  });

  it("rejects invalid psarc_platform with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings",
      payload: { psarc_platform: "windows" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects av_offset_ms out of range with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings",
      payload: { av_offset_ms: 9999 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects master_difficulty > 100 with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings",
      payload: { master_difficulty: 101 },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/settings/export", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns a JSON bundle with Content-Disposition header", async () => {
    const res = await app.inject({ method: "GET", url: "/api/settings/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    const body = res.json();
    expect(body).toHaveProperty("schema");
  });
});

describe("POST /api/settings/import", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns ok: true for valid bundle", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings/import",
      payload: { schema: "slopsmith.settings.v1", server_config: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("returns 400 for non-object body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/settings/import",
      payload: "not an object",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
  });
});
