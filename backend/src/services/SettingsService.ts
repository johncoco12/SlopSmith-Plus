import fs from "node:fs";
import path from "node:path";
import type { Settings } from "../domain/models/library.js";
import type { Config } from "../config.js";

const BUNDLE_SCHEMA = "slopsmith.settings.v1";

export class SettingsService {
  constructor(private readonly config: Config) {}

  load(): Settings {
    try {
      return JSON.parse(fs.readFileSync(this.config.settingsPath, "utf8")) as Settings;
    } catch {
      return {};
    }
  }

  save(patch: Partial<Settings>): Settings {
    const current = this.load();
    const updated: Settings = { ...current };

    if ("dlcDir" in patch && patch.dlcDir !== undefined)
      (updated as Record<string, unknown>).dlcDir = patch.dlcDir;
    if ("psarcPlatform" in patch && patch.psarcPlatform !== undefined)
      (updated as Record<string, unknown>).psarcPlatform = patch.psarcPlatform;
    if ("defaultArrangement" in patch && patch.defaultArrangement !== undefined)
      (updated as Record<string, unknown>).defaultArrangement = patch.defaultArrangement;
    if ("masterDifficulty" in patch && patch.masterDifficulty !== undefined)
      (updated as Record<string, unknown>).masterDifficulty = patch.masterDifficulty;
    if ("avOffsetMs" in patch && patch.avOffsetMs !== undefined)
      (updated as Record<string, unknown>).avOffsetMs = Math.max(-1000, Math.min(1000, patch.avOffsetMs));
    if ("demucsServerUrl" in patch && patch.demucsServerUrl !== undefined)
      (updated as Record<string, unknown>).demucsServerUrl = patch.demucsServerUrl;

    fs.mkdirSync(path.dirname(this.config.settingsPath), { recursive: true });
    fs.writeFileSync(this.config.settingsPath, JSON.stringify(updated, null, 2));
    return updated;
  }

  exportBundle(): Record<string, unknown> {
    const serverConfig = this.load();
    return {
      schema: BUNDLE_SCHEMA,
      exported_at: new Date().toISOString(),
      server_config: serverConfig,
      plugin_server_configs: {},
    };
  }

  importBundle(bundle: Record<string, unknown>): { ok: boolean; warnings?: string[] } {
    if (bundle.schema !== BUNDLE_SCHEMA) {
      return { ok: false };
    }
    const serverConfig = bundle.server_config as Partial<Settings> | undefined;
    if (serverConfig && typeof serverConfig === "object") {
      this.save(serverConfig);
    }
    return { ok: true, warnings: [] };
  }

  asApiResponse(): Record<string, unknown> {
    const s = this.load();
    return {
      dlc_dir: s.dlcDir ?? this.config.dlcDir ?? "",
      psarc_platform: s.psarcPlatform ?? "both",
      default_arrangement: s.defaultArrangement ?? "Lead",
      master_difficulty: s.masterDifficulty ?? 100,
      av_offset_ms: s.avOffsetMs ?? 0,
      demucs_server_url: s.demucsServerUrl ?? "",
    };
  }
}
