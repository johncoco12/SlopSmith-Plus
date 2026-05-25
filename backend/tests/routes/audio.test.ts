import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildTestApp } from "../helpers/build-app.js";
import type { FastifyInstance } from "fastify";

describe("GET /audio/:filename", () => {
  let app: FastifyInstance;
  let tmpDir: string;
  let audioFile: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slopsmith-audio-test-"));
    audioFile = path.join(tmpDir, "audio_test.mp3");
    fs.writeFileSync(audioFile, "fake mp3 content");

    // Override the audioCacheDir used by the audio route by patching the module
    // The audio route reads config.audioCacheDir at module load time, so we test
    // the route's traversal rejection logic (which doesn't depend on audioCacheDir)
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => {
    app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns 404 for a filename with path traversal", async () => {
    const res = await app.inject({ method: "GET", url: "/audio/../etc/passwd" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for a filename with backslash", async () => {
    const res = await app.inject({ method: "GET", url: "/audio/..\\secret" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for a non-existent file", async () => {
    const res = await app.inject({ method: "GET", url: "/audio/nonexistent.mp3" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /api/audio-local-path", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(() => app.close());

  it("returns 403 when electronMode is false", async () => {
    // config.electronMode is false in test environment
    const res = await app.inject({
      method: "GET",
      url: "/api/audio-local-path?url=/audio/song.mp3",
    });
    expect(res.statusCode).toBe(403);
  });
});
