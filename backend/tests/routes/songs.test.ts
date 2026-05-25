import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp } from "../helpers/build-app.js";
import { NotFoundError, PathTraversalError } from "../../src/domain/errors.js";
import type { FastifyInstance } from "fastify";

describe("GET /api/song/:filename", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      songs: {
        getMeta: async (filename) => ({
          filename,
          title: "Test Song",
          artist: "Artist",
          format: "psarc",
        }),
      },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 200 with song metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/api/song/song.psarc" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.filename).toBe("song.psarc");
    expect(body.title).toBe("Test Song");
  });

  it("handles path-containing filenames", async () => {
    const res = await app.inject({ method: "GET", url: "/api/song/Artist/song.psarc" });
    expect(res.statusCode).toBe(200);
    expect(res.json().filename).toBe("Artist/song.psarc");
  });

  it("propagates NotFoundError as 404", async () => {
    const app2 = buildTestApp({
      songs: { getMeta: async () => { throw new NotFoundError("Song"); } },
    });
    await app2.ready();
    const res = await app2.inject({ method: "GET", url: "/api/song/missing.psarc" });
    expect(res.statusCode).toBe(404);
    await app2.close();
  });
});

describe("GET /api/song/:filename/art", () => {
  it("returns 404 when art is null", async () => {
    const app = buildTestApp({ songs: { getAlbumArt: () => null } });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/song/song.psarc/art" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 200 with PNG content-type when art exists", async () => {
    const fakeArt = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const app = buildTestApp({ songs: { getAlbumArt: () => fakeArt } });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/song/song.psarc/art" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    await app.close();
  });
});

describe("POST /api/song/:filename/meta", () => {
  let savedFilename: string | null = null;
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp({
      songs: { saveAlbumArt: (filename) => { savedFilename = filename; } },
    });
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 204", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/song/song.psarc/meta",
      payload: { art: "base64data" },
    });
    expect(res.statusCode).toBe(204);
  });

  it("calls saveAlbumArt with the correct filename", async () => {
    savedFilename = null;
    await app.inject({
      method: "POST",
      url: "/api/song/Artist/song.psarc/meta",
      payload: { art: "abc123" },
    });
    expect(savedFilename).toBe("Artist/song.psarc");
  });

  it("returns 204 even when no art field is provided", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/song/song.psarc/meta",
      payload: {},
    });
    expect(res.statusCode).toBe(204);
  });
});

describe("DELETE /api/song/:filename", () => {
  it("returns 204 on successful delete", async () => {
    const app = buildTestApp({ songs: { deleteSong: async () => {} } });
    await app.ready();
    const res = await app.inject({ method: "DELETE", url: "/api/song/song.psarc" });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("propagates NotFoundError as 404", async () => {
    const app = buildTestApp({
      songs: { deleteSong: async () => { throw new NotFoundError("Song"); } },
    });
    await app.ready();
    const res = await app.inject({ method: "DELETE", url: "/api/song/missing.psarc" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("GET /api/sloppak/:filename/file/:relPath", () => {
  it("returns 404 when /file/ marker is absent", async () => {
    const app = buildTestApp({ songs: { getSloppakFile: () => "/tmp/x.ogg" } });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/sloppak/song.sloppak" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("propagates NotFoundError from getSloppakFile as 404", async () => {
    const app = buildTestApp({
      songs: { getSloppakFile: () => { throw new NotFoundError("file"); } },
    });
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/sloppak/song.sloppak/file/stems/missing.ogg",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("propagates PathTraversalError from getSloppakFile as 400", async () => {
    // The stub always throws — simulates service detecting traversal in relPath
    const app = buildTestApp({
      songs: { getSloppakFile: () => { throw new PathTraversalError(); } },
    });
    await app.ready();
    // Use an encoded slash (%2F) so Fastify doesn't normalize the traversal away
    const res = await app.inject({
      method: "GET",
      url: "/api/sloppak/song.sloppak/file/stems%2F..%2Fsecret.ogg",
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
