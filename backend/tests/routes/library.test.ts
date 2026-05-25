import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import type { FastifyInstance } from "fastify";

describe("GET /api/library", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      library: {
        search: async (q) => ({
          items: [
            {
              filename: "song.psarc",
              title: "Test Song",
              artist: "Test Artist",
              album: "Album",
              year: "2020",
              duration: 180,
              tuning: "0,0,0,0,0,0",
              tuningName: "E Standard",
              tuningSortKey: 0,
              arrangements: [],
              hasLyrics: false,
              format: "psarc" as const,
              stemCount: 0,
              stemIds: [],
              mtime: 0,
            },
          ],
          total: 1,
          page: q.page,
          size: q.size,
        }),
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with songs array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("songs");
    expect(body).toHaveProperty("total", 1);
    expect(body).toHaveProperty("page", 1);
    expect(body).toHaveProperty("size", 50);
  });

  it("passes page and size query params to service", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library?page=2&size=10" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(2);
    expect(body.size).toBe(10);
  });

  it("rejects size > 200 with 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library?size=999" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects page < 1 with 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library?page=0" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid sort value with 400", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library?sort=random" });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/library/artists", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with artists array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library/artists" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveProperty("artists");
  });
});

describe("GET /api/library/stats", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      library: {
        stats: async () => ({
          totalSongs: 42,
          totalArtists: 7,
          letters: { A: 3, B: 5 },
        }),
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns correct stats shape", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library/stats" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalSongs).toBe(42);
    expect(body.totalArtists).toBe(7);
    expect(body.letters).toEqual({ A: 3, B: 5 });
  });
});

describe("GET /api/library/tuning-names", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      library: {
        tuningNames: async () => [
          { name: "E Standard", count: 10 },
          { name: "Drop D", count: 3 },
        ],
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns array of tuning names", async () => {
    const res = await app.inject({ method: "GET", url: "/api/library/tuning-names" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toBe("E Standard");
  });
});

describe("GET /api/scan-status", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns scanner status", async () => {
    const res = await app.inject({ method: "GET", url: "/api/scan-status" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("running", false);
    expect(body).toHaveProperty("stage");
  });
});

describe("POST /api/rescan", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 202", async () => {
    const res = await app.inject({ method: "POST", url: "/api/rescan" });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toHaveProperty("ok", true);
  });
});
