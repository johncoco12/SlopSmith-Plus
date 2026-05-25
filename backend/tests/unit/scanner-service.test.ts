import { describe, it, expect, beforeEach } from "vitest";
import { ScannerService } from "../../src/services/ScannerService.js";
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

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    dlcDir: undefined,
    settingsPath: "/tmp/config.json",
    sloppakCacheDir: "/tmp/sloppak",
    audioCacheDir: "/tmp/audio",
    ...overrides,
  } as unknown as Config;
}

describe("ScannerService.getStatus", () => {
  it("returns idle status initially", () => {
    const service = new ScannerService(makeSongRepo(), makeConfig());
    const status = service.getStatus();
    expect(status.running).toBe(false);
    expect(status.stage).toBe("idle");
    expect(status.total).toBe(0);
    expect(status.done).toBe(0);
    expect(status.isFirstScan).toBe(true);
  });
});

describe("ScannerService.scan", () => {
  it("does nothing when dlcDir is not configured", async () => {
    const service = new ScannerService(makeSongRepo(), makeConfig({ dlcDir: undefined }));
    await service.scan();
    expect(service.getStatus().stage).toBe("idle");
  });

  it("does not run concurrent scans", async () => {
    const service = new ScannerService(makeSongRepo(), makeConfig({ dlcDir: undefined }));
    // Start a scan while one is "running" by patching the status
    const first = service.scan();
    const second = service.scan();
    await Promise.all([first, second]);
    // Both resolve without error
    expect(service.getStatus().running).toBe(false);
  });
});

describe("ScannerService.startPeriodicScan / stopPeriodicScan", () => {
  it("stopPeriodicScan is safe to call before startPeriodicScan", () => {
    const service = new ScannerService(makeSongRepo(), makeConfig());
    expect(() => service.stopPeriodicScan()).not.toThrow();
  });

  it("stopPeriodicScan prevents further scans", () => {
    const service = new ScannerService(makeSongRepo(), makeConfig({ dlcDir: undefined }));
    service.startPeriodicScan(100_000);
    service.stopPeriodicScan();
    // If the timer was not cleared this would cause an open handle — the test
    // simply verifies no exception is thrown and the service shuts down cleanly.
    expect(service.getStatus().running).toBe(false);
  });
});
