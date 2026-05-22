import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import pLimit from "p-limit";
import type { ISongRepository, ITrackRepository, ITrackDataRepository, IStemsRepository, IStemDataRepository } from "../domain/repositories.js";
import type { SongInput } from "../domain/repositories.js";
import type { ImportJob, ImportFormat, ImportResult } from "../domain/models/import.js";
import type { IStorageService } from "../domain/interfaces/services/IStorageService.js";
import type { Config } from "../config.js";
import { SloppakLoader } from "../infrastructure/formats/SloppakLoader.js";
import { LooseFolderReader } from "../infrastructure/formats/LooseFolderReader.js";
import { PsarcReader } from "../infrastructure/formats/PsarcReader.js";
import { tuningName, tuningSortKey } from "../infrastructure/formats/tunings.js";
import { extractCoverArt } from "../infrastructure/formats/CoverArtExtractor.js";
import { AudioConverterAsync } from "../infrastructure/audio/AudioConverterAsync.js";
import { findCachedAudioFile } from "../infrastructure/cache/ExtractionCache.js";

type MutableJob = {
  -readonly [K in keyof ImportJob]: ImportJob[K];
};

const MAX_CONCURRENT = 2;

export class ImportService {
  private queue = new Map<string, MutableJob>();
  private results = new Map<string, ImportResult>();
  private limiter = pLimit(MAX_CONCURRENT);
  private running = 0;

  constructor(
    private readonly songs: ISongRepository,
    private readonly tracks: ITrackRepository,
    private readonly trackData: ITrackDataRepository,
    private readonly stemsRepo: IStemsRepository,
    private readonly stemDataRepo: IStemDataRepository,
    private readonly storage: IStorageService,
    private readonly config: Config,
  ) {}

  enqueue(filename: string, profileId: number, format: ImportFormat): ImportJob {
    const id = randomUUID();
    const job: MutableJob = {
      id,
      profileId,
      filename,
      format,
      status: "queued",
      progress: 0,
      error: null,
      trackId: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };
    this.queue.set(id, job);
    this.limiter(() => this.processJob(job)).catch(() => undefined);
    return { ...job };
  }

  getStatus(jobId: string): ImportJob | null {
    const job = this.queue.get(jobId);
    return job ? { ...job } : null;
  }

  getAllJobs(): ImportJob[] {
    return [...this.queue.values()].map((j) => ({ ...j }));
  }

  getResult(jobId: string): ImportResult | null {
    return this.results.get(jobId) ?? null;
  }

  private async processJob(job: MutableJob): Promise<void> {
    this.running++;
    job.status = "processing";
    job.startedAt = Date.now();
    job.progress = 5;

    try {
      const dlcDir = this.config.dlcDir;
      if (!dlcDir) throw new Error("DLC_DIR not configured");

      const filePath = path.resolve(dlcDir, job.filename);
      if (!filePath.startsWith(path.resolve(dlcDir))) throw new Error("Path traversal detected");

      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error(`Not a file: ${job.filename}`);

      job.progress = 10;

      const meta = this.extractMeta(filePath, job.format);
      job.progress = 30;

      const trackId = `track_${job.id}`;
      const songInput = this.buildSongInput(job.filename, stat, meta);
      await this.songs.upsert(job.filename, songInput);
      job.progress = 50;

      const existing = await this.trackData.findByOriginalFilename(job.filename);
      if (existing) {
        job.trackId = String(existing.trackId);
        job.status = "completed";
        job.progress = 100;
        job.completedAt = Date.now();
        this.running--;
        return;
      }

      const track = await this.tracks.create({
        trackId,
        title: songInput.title || undefined,
        artist: songInput.artist || undefined,
        album: songInput.album || undefined,
        year: songInput.year || undefined,
        duration: songInput.duration || undefined,
        tuning: songInput.tuning || undefined,
        hasLyrics: songInput.hasLyrics || undefined,
        format: songInput.format as ImportFormat,
        tuningName: songInput.tuningName || undefined,
        tuningSortKey: songInput.tuningSortKey || undefined,
      });
      job.trackId = track.trackId;
      job.progress = 60;

      const arrangements = (meta.arrangements ?? []) as { index: number; name: string; notes: number }[];

      let coverImageStorageId: string | undefined;
      let audioFileStorageId: string | undefined;

      try {
        const artBuffer = extractCoverArt(filePath, job.format, this.config);
        if (artBuffer) {
          const artId = `cover_${trackId}`;
          await this.storage.store(artId, artBuffer);
          coverImageStorageId = artId;
        }
      } catch (err) { console.log(`Failed to extract/store cover art for ${job.filename}: ${err instanceof Error ? err.message : String(err)}`); }
      job.progress = 70;

      try {
        const audioPath = await this.extractAndConvertAudio(filePath, job.format, trackId);
        if (audioPath) {
          const audioId = `audio_${trackId}`;
          await this.storage.storeFromPath(audioId, audioPath);
          audioFileStorageId = audioId;
        }
      } catch (err) { console.log(`Failed to extract/store audio for ${job.filename}: ${err instanceof Error ? err.message : String(err)}`); }
      job.progress = 80;

      await this.trackData.create(track.id, job.filename, arrangements, coverImageStorageId, audioFileStorageId);
      job.progress = 85;

      const stemIds = (meta.stemIds ?? []) as string[];
      const stemCount = Number(meta.stemCount) || stemIds.length;

      if (stemCount > 0) {
        const stemsRecord = await this.stemsRepo.create(track.id);
        for (let i = 0; i < stemIds.length; i++) {
          await this.stemDataRepo.create(stemsRecord.id, i);
        }
      }
      job.progress = 95;

      const result: ImportResult = {
        jobId: job.id,
        trackId,
        title: songInput.title,
        artist: songInput.artist,
        duration: songInput.duration,
        format: job.format,
        stemCount,
        stemIds,
        coverArtStored: coverImageStorageId !== undefined,
        audioStored: audioFileStorageId !== undefined,
      };
      this.results.set(job.id, result);

      job.status = "completed";
      job.progress = 100;
      job.completedAt = Date.now();
    } catch (err) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = Date.now();
    } finally {
      this.running--;
    }
  }

  private extractMeta(filePath: string, format: ImportFormat): Record<string, unknown> {
    if (format === "sloppak" || SloppakLoader.isSloppak(filePath)) {
      return SloppakLoader.extractMeta(filePath, this.config.sloppakCacheDir);
    }
    if (format === "loose" || LooseFolderReader.isLooseFolder(filePath)) {
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

  private buildSongInput(filename: string, stat: fsSync.Stats, meta: Record<string, unknown>): SongInput {
    return {
      mtime: stat.mtimeMs / 1000,
      size: stat.size,
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
    };
  }

  private async extractAndConvertAudio(
    filePath: string,
    format: ImportFormat,
    trackId: string,
  ): Promise<string | null> {
    try {
      const outputBase = path.join(this.config.audioCacheDir, trackId);

      if (format === "sloppak") {
        const sourceDir = SloppakLoader.resolveDir(filePath, this.config.sloppakCacheDir);
        const manifest = SloppakLoader.readManifest(sourceDir);
        const fullStem = manifest.stems?.find((s) => s.default) ?? manifest.stems?.[0];
        if (fullStem) {
          const audioPath = path.join(sourceDir, fullStem.file);
          try { await fs.access(audioPath); return audioPath; } catch { /* fall through */ }
        }
        return null;
      }

      if (format === "loose") {
        const wems = LooseFolderReader.findWemFiles(filePath);
        if (wems.length === 0) return null;
        await fs.mkdir(this.config.audioCacheDir, { recursive: true });
        const converted = await AudioConverterAsync.convertWem(wems[0], outputBase);
        return converted;
      }

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "slopsmith-import-"));
      PsarcReader.unpack(filePath, tmpDir);
      const wems = LooseFolderReader.findWemFiles(tmpDir);
      if (wems.length === 0) return null;
      await fs.mkdir(this.config.audioCacheDir, { recursive: true });
      const converted = await AudioConverterAsync.convertWem(wems[0], outputBase);
      return converted;
    } catch {
      return null;
    }
  }
}