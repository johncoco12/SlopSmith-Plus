import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SettingsService } from "../../src/services/SettingsService.js";
import type { Config } from "../../src/config.js";

function makeTempConfig(): { config: Config; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slopsmith-test-"));
  const config = {
    settingsPath: path.join(dir, "config.json"),
  } as unknown as Config;
  return { config, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe("SettingsService", () => {
  let service: SettingsService;
  let cleanup: () => void;

  beforeEach(() => {
    const tmp = makeTempConfig();
    service = new SettingsService(tmp.config);
    cleanup = tmp.cleanup;
  });

  afterEach(() => cleanup());

  it("load() returns empty object when config file does not exist", () => {
    const settings = service.load();
    expect(settings).toEqual({});
  });

  it("save() persists a setting and load() returns it", () => {
    service.save({ dlcDir: "/music/dlc" });
    const loaded = service.load();
    expect(loaded.dlcDir).toBe("/music/dlc");
  });

  it("save() merges with existing settings", () => {
    service.save({ dlcDir: "/music/dlc" });
    service.save({ avOffsetMs: 50 });
    const loaded = service.load();
    expect(loaded.dlcDir).toBe("/music/dlc");
    expect(loaded.avOffsetMs).toBe(50);
  });

  it("save() clamps avOffsetMs to [-1000, 1000]", () => {
    service.save({ avOffsetMs: 5000 });
    expect(service.load().avOffsetMs).toBe(1000);

    service.save({ avOffsetMs: -9999 });
    expect(service.load().avOffsetMs).toBe(-1000);
  });

  it("asApiResponse() returns snake_case keys with defaults", () => {
    const response = service.asApiResponse();
    expect(response).toHaveProperty("psarc_platform");
    expect(response).toHaveProperty("default_arrangement");
    expect(response).toHaveProperty("master_difficulty");
    expect(response).toHaveProperty("av_offset_ms");
  });

  it("exportBundle() returns a valid bundle with schema field", () => {
    service.save({ dlcDir: "/test/dlc" });
    const bundle = service.exportBundle();
    expect(bundle.schema).toBe("slopsmith.settings.v1");
    expect(bundle).toHaveProperty("exported_at");
    expect(bundle).toHaveProperty("server_config");
  });

  it("importBundle() with wrong schema returns ok: false", () => {
    const result = service.importBundle({ schema: "unknown.v99" });
    expect(result.ok).toBe(false);
  });

  it("importBundle() restores server config", () => {
    const bundle = { schema: "slopsmith.settings.v1", server_config: { dlcDir: "/restored/dlc" } };
    const result = service.importBundle(bundle);
    expect(result.ok).toBe(true);
    expect(service.load().dlcDir).toBe("/restored/dlc");
  });
});
