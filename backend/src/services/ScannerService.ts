import { glob } from "glob";
import pLimit from "p-limit";
import fs from "node:fs";
import path from "node:path";
import type { ISongRepository } from "../domain/repositories.js";
import type { ScanStatus, ScanStage } from "../domain/models/library.js";
import { SloppakLoader } from "../infrastructure/formats/SloppakLoader.js";
import { LooseFolderReader } from "../infrastructure/formats/LooseFolderReader.js";
import { PsarcReader } from "../infrastructure/formats/PsarcReader.js";
import { tuningName, tuningSortKey } from "../infrastructure/formats/tunings.js";
import type { Config } from "../config.js";

export class ScannerService {
  private status: ScanStatus = {
    running: false,
    stage: "idle",
    total: 0,
    done: 0,
    current: "",
    isFirstScan: true,
  };

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly songs: ISongRepository,
    private readonly config: Config,
  ) {}

  getStatus(): ScanStatus {
    return this.status;
  }

  async scan(full = false): Promise<void> {
    if (this.status.running) return;
    const dlcDir = this.config.dlcDir;
    if (!dlcDir) return;

    this.setStatus({ running: true, stage: "listing", total: 0, done: 0, current: "" });

    try {
      const platform = String(this.loadSettings().psarcPlatform ?? "both");
      const files = await this.discoverFiles(dlcDir, platform);

      this.setStatus({ total: files.length, stage: "scanning" });

      const limit = pLimit(8);
      await Promise.all(
        files.map((filePath) =>
          limit(async () => {
            this.setStatus({ current: path.basename(filePath) });
            await this.processFile(filePath).catch(() => undefined);
            this.setStatus({ done: this.status.done + 1 });
          })
        )
      );

      if (full) {
        await this.songs.deleteStale(new Set(files));
      } else {
        await this.songs.deleteStale(new Set(files));
      }

      this.setStatus({ stage: "complete", running: false, isFirstScan: false });
    } catch (err) {
      this.setStatus({ stage: "error", running: false, error: String(err) });
    }
  }

  startPeriodicScan(intervalMs = 5 * 60 * 1000): void {
    const run = () => {
      this.scan().catch(() => undefined).finally(() => {
        this.timer = setTimeout(run, intervalMs);
      });
    };
    run();
  }

  stopPeriodicScan(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private setStatus(patch: Partial<ScanStatus>): void {
    this.status = { ...this.status, ...patch };
  }

  private async processFile(filePath: string): Promise<void> {
    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs / 1000;
    const size = stat.size;

    const cached = await this.songs.findCached(filePath, mtime, size);
    if (cached) return;

    const meta = this.extractMeta(filePath);
    await this.songs.upsert(filePath, {
      mtime,
      size,
      title: String(meta.title ?? ""),
      artist: String(meta.artist ?? ""),
      album: String(meta.album ?? ""),
      year: String(meta.year ?? ""),
      duration: Number(meta.duration) || 0,
      tuning: String(meta.tuning ?? ""),
      tuningName: String(meta.tuningName ?? ""),
      tuningSortKey: Number(meta.tuningSortKey) || 0,
      arrangements: (meta.arrangements ?? []) as { index: number; name: string; notes: number }[],
      hasLyrics: Boolean(meta.hasLyrics),
      format: String(meta.format ?? "psarc"),
      stemCount: Number(meta.stemCount) || 0,
      stemIds: (meta.stemIds ?? []) as string[],
    });
  }

  private extractMeta(filePath: string): Record<string, unknown> {
    if (SloppakLoader.isSloppak(filePath)) {
      return SloppakLoader.extractMeta(filePath, this.config.sloppakCacheDir);
    }
    if (LooseFolderReader.isLooseFolder(filePath)) {
      return LooseFolderReader.extractMeta(filePath);
    }
    const meta = PsarcReader.extractQuickMeta(filePath);
    if (!meta.tuningName && meta.tuning) {
      const parts = String(meta.tuning).split(",").map(Number).filter((n) => !isNaN(n));
      if (parts.length >= 4) {
        meta.tuningName = tuningName(parts);
        meta.tuningSortKey = tuningSortKey(parts);
      }
    }
    return meta;
  }

  private async discoverFiles(dlcDir: string, platform: string): Promise<string[]> {
    const psarcPatterns =
      platform === "pc"  ? ["**/*.psarc", "!**/*_Mac.psarc"] :
      platform === "mac" ? ["**/*_Mac.psarc"] :
                           ["**/*.psarc"];

    const [psarcs, sloppaks] = await Promise.all([
      glob(psarcPatterns, { cwd: dlcDir, absolute: true }),
      glob("**/*.sloppak", { cwd: dlcDir, absolute: true }),
    ]);

    const looseFolders = fs
      .readdirSync(dlcDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dlcDir, e.name))
      .filter(LooseFolderReader.isLooseFolder);

    return [...new Set([...psarcs, ...sloppaks, ...looseFolders])];
  }

  private loadSettings(): Record<string, unknown> {
    try {
      return JSON.parse(fs.readFileSync(this.config.settingsPath, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
