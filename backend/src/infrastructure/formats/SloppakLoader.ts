import AdmZip from "adm-zip";
import yaml from "js-yaml";
import fs from "node:fs";
import path from "node:path";
import type { Beat, Section, Song } from "../../domain/models/song.js";
import type { LyricWord } from "../../domain/models/song.js";
import { arrangementFromWireJson, parseLyricsXml, sortArrangementsByPriority } from "./ArrangementParser.js";
import { tuningName, tuningSortKey } from "./tunings.js";

export interface SloppakManifest {
  readonly title: string;
  readonly artist: string;
  readonly album?: string;
  readonly year?: number | string;
  readonly duration?: number;
  readonly arrangements: ReadonlyArray<{
    id: string;
    name: string;
    file: string;
    tuning?: number[];
    capo?: number;
  }>;
  readonly stems?: ReadonlyArray<{
    id: string;
    file: string;
    default?: boolean;
    label?: string;
  }>;
  readonly lyrics?: string;
}

export interface SloppakStem {
  readonly id: string;
  readonly file: string;
  readonly default: boolean;
}

export interface LoadedSloppak {
  readonly song: Song;
  readonly stems: readonly SloppakStem[];
  readonly sourceDir: string;
  readonly manifest: SloppakManifest;
}

export class SloppakLoader {
  static isSloppak(filePath: string): boolean {
    return filePath.endsWith(".sloppak");
  }

  static resolveDir(filePath: string, cacheDir: string): string {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return filePath;

    const outDir = path.join(cacheDir, path.basename(filePath));
    const stampFile = path.join(outDir, ".sloppak_stamp");

    let needsExtract = !fs.existsSync(path.join(outDir, "manifest.yaml"));
    if (!needsExtract && fs.existsSync(stampFile)) {
      try {
        const [stampMtime, stampSize] = JSON.parse(fs.readFileSync(stampFile, "utf8")) as [number, number];
        if (stampMtime !== stat.mtimeMs || stampSize !== stat.size) {
          needsExtract = true;
        }
      } catch {
        needsExtract = true;
      }
    }

    if (needsExtract) {
      if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
      fs.mkdirSync(outDir, { recursive: true });
      new AdmZip(filePath).extractAllTo(outDir, true);
      fs.writeFileSync(stampFile, JSON.stringify([stat.mtimeMs, stat.size]));
    }
    return outDir;
  }

  static readManifest(sourceDir: string): SloppakManifest {
    const raw = fs.readFileSync(path.join(sourceDir, "manifest.yaml"), "utf8");
    return yaml.load(raw) as SloppakManifest;
  }

  static load(filePath: string, cacheDir: string): LoadedSloppak {
    const sourceDir = SloppakLoader.resolveDir(filePath, cacheDir);
    const manifest = SloppakLoader.readManifest(sourceDir);

    let songBeats: Beat[] = [];
    let songSections: Section[] = [];
    const arrangements = (manifest.arrangements ?? []).flatMap((arrMeta) => {
      const arrFile = path.join(sourceDir, "arrangements", arrMeta.file);
      if (!fs.existsSync(arrFile)) return [];
      try {
        const raw = JSON.parse(fs.readFileSync(arrFile, "utf8")) as Record<string, unknown>;
        const arr = arrangementFromWireJson(raw);

        // Beats/sections can live on the arrangement JSON in the wire format.
        // Pull them onto the song from the first arrangement that has them.
        if (songBeats.length === 0) {
          const beatsRaw = raw["beats"] as unknown[] | undefined;
          if (beatsRaw) {
            songBeats = (beatsRaw as Record<string, unknown>[]).map((b) => ({
              time: (b.time as number) ?? 0,
              measure: (b.measure as number) ?? -1,
            } satisfies Beat));
          }
        }
        if (songSections.length === 0) {
          const sectionsRaw = raw["sections"] as unknown[] | undefined;
          if (sectionsRaw) {
            songSections = (sectionsRaw as Record<string, unknown>[]).map((s) => ({
              name: (s.name as string) ?? "",
              number: (s.number as number) ?? 0,
              startTime: ((s.time ?? s.start_time) as number) ?? 0,
            } satisfies Section));
          }
        }

        // Override with manifest-level metadata
        return [{
          ...arr,
          name: arrMeta.name,
          tuning: arrMeta.tuning ?? arr.tuning,
          capo: arrMeta.capo ?? arr.capo,
        }];
      } catch {
        return [];
      }
    });

    const lyrics = SloppakLoader.loadLyrics(manifest, sourceDir);

    const stems: SloppakStem[] = (manifest.stems ?? []).map((s) => ({
      id: s.id,
      file: s.file,
      default: s.default ?? false,
    }));

    const song: Song = {
      title: manifest.title ?? "",
      artist: manifest.artist ?? "",
      album: manifest.album ?? "",
      year: Number(manifest.year) || 0,
      songLength: manifest.duration ?? 0,
      offset: 0,
      beats: songBeats,
      sections: songSections,
      arrangements: sortArrangementsByPriority(arrangements),
      lyrics,
    };

    return { song, stems, sourceDir, manifest };
  }

  static extractMeta(filePath: string, cacheDir: string): Record<string, unknown> {
    try {
      const sourceDir = SloppakLoader.resolveDir(filePath, cacheDir);
      const manifest = SloppakLoader.readManifest(sourceDir);

      const tuning = manifest.arrangements?.[0]?.tuning ?? [0, 0, 0, 0, 0, 0];
      const name = tuningName(tuning);
      const sortKey = tuningSortKey(tuning);

      const lyricsPath = manifest.lyrics
        ? path.join(sourceDir, manifest.lyrics)
        : null;

      return {
        title: manifest.title ?? "",
        artist: manifest.artist ?? "",
        album: manifest.album ?? "",
        year: String(manifest.year ?? ""),
        duration: manifest.duration ?? 0,
        tuning: tuning.join(","),
        tuningName: name,
        tuningSortKey: sortKey,
        arrangements: (manifest.arrangements ?? []).map((a, idx) => ({
          index: idx,
          name: a.name,
          notes: 0,
        })),
        hasLyrics: lyricsPath ? fs.existsSync(lyricsPath) : false,
        format: "sloppak",
        stemCount: manifest.stems?.length ?? 0,
        stemIds: (manifest.stems ?? []).map((s) => s.id),
      };
    } catch {
      return { format: "sloppak" };
    }
  }

  private static loadLyrics(manifest: SloppakManifest, sourceDir: string): LyricWord[] {
    if (!manifest.lyrics) return [];
    const lyricsFile = path.join(sourceDir, manifest.lyrics);
    if (!fs.existsSync(lyricsFile)) return [];
    try {
      const raw = fs.readFileSync(lyricsFile, "utf8");
      if (lyricsFile.endsWith(".json")) {
        return JSON.parse(raw) as LyricWord[];
      }
      return parseLyricsXml(raw);
    } catch {
      return [];
    }
  }
}
