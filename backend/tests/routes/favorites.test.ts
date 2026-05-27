import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import type { FastifyInstance } from "fastify";

describe("POST /api/favorites/toggle", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      library: {
        toggleFavorite: async (trackId: string) => trackId === "fav_track",
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with favorite state", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/favorites/toggle",
      payload: { trackId: "fav_track", profileId: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.trackId).toBe("fav_track");
    expect(body.favorite).toBe(true);
  });

  it("returns favorite: false when service returns false", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/favorites/toggle",
      payload: { trackId: "other_track", profileId: 1 },
    });
    expect(res.json().favorite).toBe(false);
  });

  it("returns 400 when trackId is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/favorites/toggle",
      payload: { profileId: 1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when profileId is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/favorites/toggle",
      payload: { trackId: "fav_track" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/tracks/:trackId/loops", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      trackSvc: {
        getLoops: async () => [
          { id: 1, profileId: 1, trackId: 1, name: "Intro", startTime: 0, endTime: 10, createdAt: new Date() },
        ],
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns loops for a given track and profile", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/tracks/track_abc/loops?profileId=1",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.loops).toHaveLength(1);
    expect(body.loops[0].name).toBe("Intro");
  });

  it("returns 400 when profileId query param is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tracks/track_abc/loops" });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/tracks/:trackId/loops", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("creates a loop and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tracks/track_abc/loops",
      payload: { start_time: 5.0, end_time: 15.0 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.startTime).toBe(5.0);
    expect(body.endTime).toBe(15.0);
  });

  it("accepts an optional name", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tracks/track_abc/loops",
      payload: { name: "Chorus", start_time: 30, end_time: 60 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tracks/track_abc/loops",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /api/loops/:id", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 204 on successful delete", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/loops/1" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/loops/abc" });
    expect(res.statusCode).toBe(400);
  });
});
