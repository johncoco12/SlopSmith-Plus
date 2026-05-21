import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ISongRepository } from "../domain/repositories.js";
import type { Song } from "../domain/models/song.js";
import { NotFoundError, ConfigurationError, PathTraversalError } from "../domain/errors.js";
import { PsarcReader } from "../infrastructure/formats/PsarcReader.js";
import { SloppakLoader } from "../infrastructure/formats/SloppakLoader.js";
import { LooseFolderReader } from "../infrastructure/formats/LooseFolderReader.js";
import { loadSongFromDirectory } from "../infrastructure/formats/ArrangementParser.js";
import { AudioConverter } from "../infrastructure/audio/AudioConverter.js";
import {
  ExtractionCache,
  findCachedAudioFile,
  buildAudioOutputBase,
  evictOldAudioFiles,
} from "../infrastructure/cache/ExtractionCache.js";
import { tuningName, tuningSortKey } from "../infrastructure/formats/tunings.js";
import type { Config } from "../config.js";

export interface ExtractedSong {
  readonly song: Song;
  readonly extractedDir: string;
  readonly format: "psarc" | "sloppak" | "loose";
  readonly stems: ReadonlyArray<{ id: string; file: string; default: boolean }>;
}

export interface AudioResult {
  readonly url: string | null;
  readonly error: string | null;
}

export class SongService {
  private readonly cache = new ExtractionCache();

  constructor(
    private readonly songs: ISongRepository,
    private readonly config: Config,
  ) {}

  resolveDlcPath(filename: string): string {
    const dlcDir = this.config.dlcDir;
    if (!dlcDir) throw new ConfigurationError("DLC_DIR not set");
    const full = path.resolve(dlcDir, filename);
    if (!full.startsWith(path.resolve(dlcDir))) throw new PathTraversalError();
    return full;
  }

  async getMeta(filename: string): Promise<Record<string, unknown>> {
    const filePath = this.resolveDlcPath(filename);
    const stat = fs.statSync(filePath);

    // Try DB cache first
    const cached = await this.songs.findCached(filename, stat.mtimeMs / 1000, stat.size);
    if (cached) return cached as unknown as Record<string, unknown>;

    // Extract fresh
    return this.extractAndCacheMeta(filename, filePath, stat);
  }

  async extractSong(filename: string): Promise<ExtractedSong> {
    const cached = this.cache.get(filename);
    if (cached) return cached;

    const filePath = this.resolveDlcPath(filename);

    if (SloppakLoader.isSloppak(filePath)) {
      const loaded = SloppakLoader.load(filePath, this.config.sloppakCacheDir);
      const entry = { song: loaded.song, extractedDir: loaded.sourceDir, format: "sloppak" as const, stems: loaded.stems };
      this.cache.set(filename, entry);
      return entry;
    }

    if (LooseFolderReader.isLooseFolder(filePath)) {
      const song = await loadSongFromDirectory(filePath);
      const entry = { song, extractedDir: filePath, format: "loose" as const, stems: [] };
      this.cache.set(filename, entry);
      return entry;
    }

    // PSARC — extract to temp dir
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "slopsmith-"));
    PsarcReader.unpack(filePath, tmpDir);
    const song = await loadSongFromDirectory(tmpDir);
    const entry = { song, extractedDir: tmpDir, format: "psarc" as const, stems: [] };
    this.cache.set(filename, entry);
    return entry;
  }

  getAudioUrl(filename: string, filePath: string, extractedDir: string, stems: ExtractedSong["stems"]): AudioResult {
    if (SloppakLoader.isSloppak(filePath)) {
      return { url: `/api/sloppak/${encodeURIComponent(filename)}/file/stems/full.ogg`, error: null };
    }

    const outputBase = buildAudioOutputBase(this.config.audioCacheDir, filename);
    const cached = findCachedAudioFile(outputBase);
    if (cached) {
      return { url: `/audio/${path.basename(cached)}`, error: null };
    }

    try {
      evictOldAudioFiles(this.config.audioCacheDir);
      const wems = LooseFolderReader.findWemFiles(extractedDir);
      if (wems.length === 0) return { url: null, error: "No WEM audio files found" };

      const outputPath = AudioConverter.convertWem(wems[0], outputBase);
      return { url: `/audio/${path.basename(outputPath)}`, error: null };
    } catch (err) {
      return { url: null, error: String(err) };
    }
  }

  getAlbumArt(filename: string): Buffer | null {
    const escaped = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const artPath = path.join(this.config.artCacheDir, `${escaped}.png`);

    if (fs.existsSync(artPath)) return fs.readFileSync(artPath);

    try {
      const filePath = this.resolveDlcPath(filename);
      const entries = PsarcReader.read(filePath, ["**/*.png", "**/*.jpg"]);
      for (const [name, data] of entries) {
        if (name.includes("album") || name.includes("cover") || name.includes("256")) {
          fs.mkdirSync(this.config.artCacheDir, { recursive: true });
          fs.writeFileSync(artPath, data);
          return data;
        }
      }
    } catch {
      // no art found
    }
    return null;
  }

  saveAlbumArt(filename: string, base64Data: string): void {
    const escaped = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const artPath = path.join(this.config.artCacheDir, `${escaped}.png`);
    fs.mkdirSync(this.config.artCacheDir, { recursive: true });
    fs.writeFileSync(artPath, Buffer.from(base64Data, "base64"));
  }

  async deleteSong(filename: string): Promise<void> {
    const filePath = this.resolveDlcPath(filename);
    fs.rmSync(filePath, { recursive: true, force: true });
    await this.songs.delete(filename);
    this.cache.delete(filename);
  }

  getSloppakFile(filename: string, relPath: string): string {
    if (relPath.includes("..")) throw new PathTraversalError();
    const filePath = this.resolveDlcPath(filename);
    const sourceDir = SloppakLoader.resolveDir(filePath, this.config.sloppakCacheDir);
    const target = path.join(sourceDir, relPath);
    if (!target.startsWith(sourceDir)) throw new PathTraversalError();
    if (!fs.existsSync(target)) throw new NotFoundError(relPath);
    return target;
  }

  private async extractAndCacheMeta(
    filename: string,
    filePath: string,
    stat: fs.Stats,
  ): Promise<Record<string, unknown>> {
    let meta: Record<string, unknown>;

    if (SloppakLoader.isSloppak(filePath)) {
      meta = SloppakLoader.extractMeta(filePath, this.config.sloppakCacheDir);
    } else if (LooseFolderReader.isLooseFolder(filePath)) {
      meta = LooseFolderReader.extractMeta(filePath);
    } else {
      meta = PsarcReader.extractQuickMeta(filePath);
      if (!meta.tuningName && meta.tuning) {
        const parts = String(meta.tuning).split(",").map(Number).filter((n) => !isNaN(n));
        if (parts.length >= 4) {
          meta.tuningName = tuningName(parts);
          meta.tuningSortKey = tuningSortKey(parts);
        }
      }
    }

    const mtime = stat.mtimeMs / 1000;
    await this.songs.upsert(filename, {
      mtime,
      size: stat.size,
      title: String(meta.title ?? ""),
      artist: String(meta.artist ?? ""),
      album: String(meta.album ?? ""),
      year: String(meta.year ?? ""),
      duration: Number(meta.duration) || 0,
      tuning: String(meta.tuning ?? ""),
      tuningName: String(meta.tuningName ?? ""),
      tuningSortKey: Number(meta.tuningSortKey) || 0,
      arrangements: (meta.arrangements as { index: number; name: string; notes: number }[]) ?? [],
      hasLyrics: Boolean(meta.hasLyrics),
      format: String(meta.format ?? "psarc"),
      stemCount: Number(meta.stemCount) || 0,
      stemIds: (meta.stemIds as string[]) ?? [],
    });

    return { ...meta, filename, mtime };
  }
}

