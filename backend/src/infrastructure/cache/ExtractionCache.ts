import { LRUCache } from "lru-cache";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Song } from "../../domain/models/song.js";

export interface CachedExtraction {
  readonly song: Song;
  readonly extractedDir: string;
  readonly format: "psarc" | "sloppak" | "loose";
  readonly stems: ReadonlyArray<{ id: string; file: string; default: boolean }>;
}

const FIVE_MINUTES = 5 * 60 * 1000;

export class ExtractionCache {
  private readonly lru = new LRUCache<string, CachedExtraction>({
    max: 10,
    ttl: FIVE_MINUTES,
    dispose: (entry) => {
      // Only clean up temp dirs created for PSARCs (sloppak uses its own persistent cache)
      if (entry.format === "psarc") {
        fs.rmSync(entry.extractedDir, { recursive: true, force: true });
      }
    },
  });

  get(key: string): CachedExtraction | undefined {
    return this.lru.get(key);
  }

  set(key: string, value: CachedExtraction): void {
    this.lru.set(key, value);
  }

  delete(key: string): void {
    this.lru.delete(key);
  }

  clear(): void {
    this.lru.clear();
  }
}

// ─── Audio file cache helpers ─────────────────────────────────────────────

const AUDIO_EXTS = [".mp3", ".ogg", ".wav"] as const;

export function findCachedAudioFile(outputBase: string): string | null {
  for (const ext of AUDIO_EXTS) {
    const p = outputBase + ext;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function buildAudioOutputBase(audioCacheDir: string, filename: string, wemPath?: string): string {
  fs.mkdirSync(audioCacheDir, { recursive: true });
  const stem = path.basename(filename)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
  const hash = wemPath ? buildFileHash(wemPath) : "";
  return path.join(audioCacheDir, `audio_${stem}${hash ? `_${hash}` : ""}`);
}

function buildFileHash(filePath: string): string {
  try {
    const stat = fs.statSync(filePath);
    return crypto
      .createHash("md5")
      .update(`${filePath}:${stat.mtimeMs}:${stat.size}`)
      .digest("hex")
      .slice(0, 8);
  } catch {
    return "";
  }
}

export function evictOldAudioFiles(audioCacheDir: string, keep = 100): void {
  try {
    if (!fs.existsSync(audioCacheDir)) return;
    const files = fs.readdirSync(audioCacheDir).map((f) => {
      const full = path.join(audioCacheDir, f);
      return { path: full, mtime: fs.statSync(full).mtimeMs };
    });
    files.sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(keep)) {
      fs.unlinkSync(f.path);
    }
  } catch {
    // best-effort
  }
}
