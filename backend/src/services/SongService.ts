import fs from "node:fs";
import path from "node:path";
import type { ISongRepository } from "../domain/repositories.js";
import type { SongMeta } from "../domain/models/library.js";
import type { Config } from "../config.js";
import { ConfigurationError, PathTraversalError, NotFoundError } from "../domain/errors.js";

export class SongService {
  constructor(
    private readonly songs: ISongRepository,
    private readonly config: Config,
  ) {}

  resolveDlcPath(filename: string): string {
    const dlcDir = this.config.dlcDir;
    if (!dlcDir) throw new ConfigurationError("DLC_DIR is not configured");
    const base = path.resolve(dlcDir);
    const resolved = path.resolve(base, filename);
    if (!resolved.startsWith(base + path.sep)) throw new PathTraversalError();
    return resolved;
  }

  private safeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9_.\-]/g, ".");
  }

  getAlbumArt(filename: string): Buffer | null {
    const artDir = this.config.artCacheDir;
    const artFile = path.join(artDir, this.safeFilename(filename) + ".png");
    try {
      return fs.readFileSync(artFile);
    } catch {
      return null;
    }
  }

  saveAlbumArt(filename: string, base64Data: string): void {
    const artDir = this.config.artCacheDir;
    fs.mkdirSync(artDir, { recursive: true });
    const artFile = path.join(artDir, this.safeFilename(filename) + ".png");
    fs.writeFileSync(artFile, Buffer.from(base64Data, "base64"));
  }

  getSloppakFile(filename: string, relPath: string): string {
    if (relPath.includes("..") || relPath.startsWith("/") || relPath.includes("\\")) {
      throw new PathTraversalError();
    }
    const cacheDir = this.config.sloppakCacheDir;
    const sloppakName = path.basename(filename, path.extname(filename));
    const sloppakDir = path.join(cacheDir, sloppakName);
    const resolved = path.resolve(sloppakDir, relPath);
    if (!resolved.startsWith(path.resolve(sloppakDir) + path.sep)) throw new PathTraversalError();
    if (!fs.existsSync(resolved)) throw new NotFoundError("file");
    return resolved;
  }

  async getMeta(filename: string): Promise<SongMeta> {
    const song = await this.songs.findByFilename(filename);
    if (!song) throw new NotFoundError("Song");
    return song;
  }

  getAudioUrl(filename?: string): { url: string | null; error: string | null } {
    if (!filename) return { url: null, error: null };
    return { url: `/audio/${this.safeFilename(filename)}.mp3`, error: null };
  }

  async deleteSong(filename: string): Promise<void> {
    await this.songs.delete(filename);
  }

  async extractSong(_filename: string): Promise<void> {
    // extraction delegated to ImportService
  }
}
