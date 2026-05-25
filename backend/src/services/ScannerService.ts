import { glob } from "glob";
import pLimit from "p-limit";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import type { ScanStatus } from "../domain/models/library.js";
import type { ImportFormat } from "../domain/models/import.js";
import type { ImportService } from "./ImportService.js";
import { SloppakLoader } from "../infrastructure/formats/SloppakLoader.js";
import { LooseFolderReader } from "../infrastructure/formats/LooseFolderReader.js";
import type { Config } from "../config.js";

const SYSTEM_PROFILE_ID = 0;

function detectFormat(filePath: string): ImportFormat | null {
  if (SloppakLoader.isSloppak(filePath)) return "sloppak";
  if (LooseFolderReader.isLooseFolder(filePath)) return "loose";
  if (filePath.toLowerCase().endsWith(".psarc")) return "psarc";
  return null;
}

export class ScannerService {
  private status: ScanStatus = {
    running: false,
    stage: "idle" as const,
    total: 0,
    done: 0,
    current: "",
    isFirstScan: true,
  };

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly importService: ImportService,
    private readonly config: Config,
  ) {}

  getStatus(): ScanStatus {
    return this.status;
  }

  async scan(_full = false): Promise<void> {
    if (this.status.running) return;
    const dlcDir = this.config.dlcDir;
    if (!dlcDir) return;

    this.setStatus({ running: true, stage: "listing", total: 0, done: 0, current: "" });

    try {
      const platform = String(this.loadSettings().psarcPlatform ?? "both");
      const files = await this.discoverFiles(dlcDir, platform);

      this.setStatus({ total: files.length, stage: "scanning" });

      const limit = pLimit(4);
      await Promise.all(
        files.map((filePath) =>
          limit(async () => {
            this.setStatus({ current: path.basename(filePath) });
            await this.processFile(filePath, dlcDir).catch(() => undefined);
            this.setStatus({ done: this.status.done + 1 });
          })
        )
      );

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

  private async processFile(filePath: string, dlcDir: string): Promise<void> {
    const format = detectFormat(filePath);
    if (!format) return;

    const relPath = dlcDir ? path.relative(dlcDir, filePath) : filePath;

    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile() && format !== "loose") return;
    } catch {
      return;
    }

    this.importService.enqueue(relPath, SYSTEM_PROFILE_ID, format);
  }

  private async discoverFiles(dlcDir: string, platform: string): Promise<string[]> {
    const psarcPatterns =
      platform === "pc" ? ["**/*.psarc", "!**/*_Mac.psarc"] :
      platform === "mac" ? ["**/*_Mac.psarc"] :
      ["**/*.psarc"];

    const [psarcs, sloppaks] = await Promise.all([
      glob(psarcPatterns, { cwd: dlcDir, absolute: true }),
      glob("**/*.sloppak", { cwd: dlcDir, absolute: true }),
    ]);

    const looseFolders = fsSync
      .readdirSync(dlcDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dlcDir, e.name))
      .filter(LooseFolderReader.isLooseFolder);

    return [...new Set([...psarcs, ...sloppaks, ...looseFolders])];
  }

  private loadSettings(): Record<string, unknown> {
    try {
      return JSON.parse(fsSync.readFileSync(this.config.settingsPath, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}