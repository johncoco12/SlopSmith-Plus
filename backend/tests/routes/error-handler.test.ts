import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { errorHandler } from "../../src/api/middleware/errorHandler.js";
import { NotFoundError, ValidationError, DemoModeError } from "../../src/domain/errors.js";
import type { FastifyInstance } from "fastify";

describe("errorHandler middleware", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(errorHandler);

    app.get("/not-found", async () => { throw new NotFoundError("Song"); });
    app.get("/validation", async () => { throw new ValidationError("bad field"); });
    app.get("/demo", async () => { throw new DemoModeError(); });
    app.get("/unknown", async () => { throw new Error("unhandled boom"); });

    await app.ready();
  });

  afterAll(() => app.close());

  it("maps NotFoundError to 404", async () => {
    const res = await app.inject({ method: "GET", url: "/not-found" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain("Song");
  });

  it("maps ValidationError to 400", async () => {
    const res = await app.inject({ method: "GET", url: "/validation" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("bad field");
  });

  it("maps DemoModeError to 403", async () => {
    const res = await app.inject({ method: "GET", url: "/demo" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/demo/i);
  });

  it("maps unknown errors to 500 with generic message", async () => {
    const res = await app.inject({ method: "GET", url: "/unknown" });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("Internal server error");
  });
});
