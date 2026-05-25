import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SongService } from "../../src/services/SongService.js";
import { ConfigurationError, PathTraversalError, NotFoundError } from "../../src/domain/errors.js";
import type { ISongRepository } from "../../src/domain/repositories.js";
import type { Config } from "../../src/config.js";

function makeSongRepo(): ISongRepository {
  return {
    search: async () => ({ items: [], total: 0, page: 1, size: 50 }),
    artists: async () => ({ items: [], total: 0, page: 1, size: 20 }),
    stats: async () => ({ totalSongs: 0, totalArtists: 0, letters: {} }),
    tuningNames: async () => [],
    findByFilename: async () => null,
    findCached: async () => null,
    upsert: async () => {},
    delete: async () => {},
    deleteStale: async () => {},
  } as ISongRepository;
}

let tmpDir: string;

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    dlcDir: tmpDir,
    settingsPath: path.join(tmpDir, "config.json"),
    sloppakCacheDir: path.join(tmpDir, "sloppak"),
    audioCacheDir: path.join(tmpDir, "audio"),
    artCacheDir: path.join(tmpDir, "art"),
    ...overrides,
  } as unknown as Config;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slopsmith-songs-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── resolveDlcPath ───────────────────────────────────────────────────────────

describe("SongService.resolveDlcPath", () => {
  it("throws ConfigurationError when dlcDir is not set", () => {
    const service = new SongService(makeSongRepo(), makeConfig({ dlcDir: undefined }));
    expect(() => service.resolveDlcPath("song.psarc")).toThrow(ConfigurationError);
  });

  it("resolves a simple filename within dlcDir", () => {
    const service = new SongService(makeSongRepo(), makeConfig());
    const resolved = service.resolveDlcPath("song.psarc");
    expect(resolved).toBe(path.join(tmpDir, "song.psarc"));
  });

  it("throws PathTraversalError for ../ escape attempt", () => {
    const service = new SongService(makeSongRepo(), makeConfig());
    expect(() => service.resolveDlcPath("../../../etc/passwd")).toThrow(PathTraversalError);
  });

  it("resolves nested paths within dlcDir", () => {
    const service = new SongService(makeSongRepo(), makeConfig());
    const resolved = service.resolveDlcPath("Artist/Album/song.psarc");
    expect(resolved).toBe(path.join(tmpDir, "Artist", "Album", "song.psarc"));
  });
});

// ─── getAlbumArt ─────────────────────────────────────────────────────────────

describe("SongService.getAlbumArt", () => {
  it("returns null when no art exists and file is not a valid PSARC", () => {
    const songFile = path.join(tmpDir, "song.psarc");
    fs.writeFileSync(songFile, "not a real psarc");
    const service = new SongService(makeSongRepo(), makeConfig());
    const art = service.getAlbumArt("song.psarc");
    expect(art).toBeNull();
  });

  it("returns cached art when it was previously saved", () => {
    const artDir = path.join(tmpDir, "art");
    fs.mkdirSync(artDir, { recursive: true });
    const fakeArt = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    // The service escapes [^a-zA-Z0-9_.-] → '.' is kept, so "song.psarc" stays "song.psarc"
    fs.writeFileSync(path.join(artDir, "song.psarc.png"), fakeArt);

    const service = new SongService(makeSongRepo(), makeConfig({ artCacheDir: artDir }));
    const art = service.getAlbumArt("song.psarc");
    expect(art).not.toBeNull();
    expect(art!.slice(0, 4)).toEqual(fakeArt.slice(0, 4));
  });
});

// ─── saveAlbumArt ─────────────────────────────────────────────────────────────

describe("SongService.saveAlbumArt", () => {
  it("writes base64-decoded data to the art cache directory", () => {
    const artDir = path.join(tmpDir, "art");
    const service = new SongService(makeSongRepo(), makeConfig({ artCacheDir: artDir }));

    const data = Buffer.from("fake png bytes");
    service.saveAlbumArt("song.psarc", data.toString("base64"));

    const saved = fs.readdirSync(artDir);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/\.png$/);
    expect(fs.readFileSync(path.join(artDir, saved[0]))).toEqual(data);
  });

  it("creates the art cache directory if it does not exist", () => {
    const artDir = path.join(tmpDir, "art_new");
    const service = new SongService(makeSongRepo(), makeConfig({ artCacheDir: artDir }));
    expect(fs.existsSync(artDir)).toBe(false);
    service.saveAlbumArt("song.psarc", Buffer.from("x").toString("base64"));
    expect(fs.existsSync(artDir)).toBe(true);
  });
});

// ─── getSloppakFile ───────────────────────────────────────────────────────────

describe("SongService.getSloppakFile", () => {
  it("throws PathTraversalError for ../ in relPath", () => {
    const service = new SongService(makeSongRepo(), makeConfig());
    expect(() => service.getSloppakFile("song.sloppak", "../etc/passwd")).toThrow(PathTraversalError);
  });
});
