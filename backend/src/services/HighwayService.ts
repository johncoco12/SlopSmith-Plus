import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PsarcReader } from "../infrastructure/formats/PsarcReader.js";
import { SloppakLoader } from "../infrastructure/formats/SloppakLoader.js";
import { LooseFolderReader } from "../infrastructure/formats/LooseFolderReader.js";
import {
  parseArrangementXml,
  parseSongRoot,
  parseLyricsXml,
  arrangementDisplayName,
  arrangementFromWireJson,
  extractArrNameFromXml,
  convertSngToXml,
} from "../infrastructure/formats/ArrangementParser.js";
import {
  toWireNote,
  toWireChord,
  toWireAnchor,
  toWireHandShape,
  toWireChordTemplate,
  toWirePhrase,
  arrangementStringCount,
} from "../domain/models/song.js";
import type { Beat, Section, Arrangement, ChordTemplate } from "../domain/models/song.js";
import type { ArrangementData } from "../domain/models/track.js";
import type { ITrackRepository, ITrackDataRepository } from "../domain/repositories.js";
import type { Config } from "../config.js";

export interface HighwayResponse {
  song_info: {
    title?: string;
    artist?: string;
    album?: string;
    arrangement?: string;
    arrangement_index: number;
    arrangements: { index: number; name: string; notes: number }[];
    duration?: number;
    tuning: number[];
    capo: number;
    offset: number;
    stringCount: number;
    format?: string;
  };
  beats: { time: number; measure: number }[];
  sections: { time: number; name: string }[];
  anchors: { time: number; fret: number; width: number }[];
  chord_templates: {
    name: string;
    displayName?: string;
    arp?: true;
    fingers: number[];
    frets: number[];
  }[];
  lyrics: { t: number; d: number; w: string }[];
  tone_changes: { time: number; name: string }[];
  tone_base: string;
  notes: ReturnType<typeof toWireNote>[];
  chords: ReturnType<typeof toWireChord>[];
  handshapes: ReturnType<typeof toWireHandShape>[];
  phrases?: ReturnType<typeof toWirePhrase>[];
}

function walkXmlFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".xml") && !entry.name.includes("_showlights")) results.push(full);
    }
  }
  walk(dir);
  return results;
}

function mapBeat(b: Beat): { time: number; measure: number } {
  return { time: b.time, measure: b.measure };
}

function mapSection(s: Section): { time: number; name: string } {
  return { time: s.startTime, name: s.name };
}

function mapCt(ct: ChordTemplate): { name: string; displayName?: string; arp?: true; fingers: number[]; frets: number[] } {
  return { name: ct.name, displayName: ct.displayName || undefined, arp: ct.arpeggio ? true as const : undefined, fingers: [...ct.fingers], frets: [...ct.frets] };
}

export class HighwayService {
  constructor(
    private readonly tracks: ITrackRepository,
    private readonly trackData: ITrackDataRepository,
    private readonly config: Config,
  ) {}

  async getHighwayData(
    trackId: string,
    arrangementIndex: number,
  ): Promise<HighwayResponse> {
    const track = await this.tracks.findByTrackId(trackId);
    if (!track) throw new Error("Track not found");

    const data = await this.trackData.findByTrackId(track.id);
    if (!data) throw new Error("TrackData not found");

    const dlcDir = this.config.dlcDir;
    if (!dlcDir) throw new Error("DLC_DIR not configured");

    const filePath = path.resolve(dlcDir, data.originalFilename);
    if (!filePath.startsWith(path.resolve(dlcDir))) throw new Error("Path traversal detected");

    const format = track.format;
    const arrs = data.arrangements as ArrangementData[];

    if (format === "sloppak" || SloppakLoader.isSloppak(filePath)) {
      return this.readSloppak(filePath, arrs, arrangementIndex);
    }

    if (format === "loose" || LooseFolderReader.isLooseFolder(filePath)) {
      return this.readLoose(filePath, arrs, arrangementIndex);
    }

    return this.readPsarc(filePath, arrs, arrangementIndex);
  }

  private readPsarc(
    filePath: string,
    arrangements: ArrangementData[],
    arrangementIndex: number,
  ): HighwayResponse {
    const arrMeta = arrangements[arrangementIndex];
    if (!arrMeta) throw new Error(`Arrangement index ${arrangementIndex} not found`);

    const entries = PsarcReader.read(filePath, [
      "**/*.xml",
      "**/*.json",
    ]);

    const arrXmls: { name: string; xml: string }[] = [];
    let vocalsXml = "";
    const manifests: Record<string, unknown>[] = [];

    for (const [filename, buf] of entries) {
      const lower = filename.toLowerCase();
      const content = buf.toString("utf8");
      if (lower.includes("showlights")) continue;
      if (lower.includes("vocals") && lower.endsWith(".xml")) {
        vocalsXml = content;
      } else if (lower.endsWith(".json")) {
        try { manifests.push(JSON.parse(content) as Record<string, unknown>); } catch { /* skip */ }
      } else if (lower.endsWith(".xml")) {
        const stem = path.basename(filename, ".xml").toLowerCase();
        const name = extractArrNameFromXml(content) ?? arrangementDisplayName(stem, path.basename(filename, ".xml"));
        arrXmls.push({ name, xml: content });
      }
    }

    // For ODLC packages that contain only compiled .sng files (no XML), run rscli
    // to convert SNG→XML and add the results to arrXmls.
    if (arrXmls.length === 0 && this.config.rscliPath && fs.existsSync(this.config.rscliPath)) {
      const sngEntries = PsarcReader.read(filePath, ["**/*.sng"]);
      if (sngEntries.size > 0) {
        const tmpDir = path.join(os.tmpdir(), `slopsmith-sng-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        try {
          for (const [name, buf] of sngEntries) {
            const outPath = path.resolve(tmpDir, name);
            if (!outPath.startsWith(tmpDir + path.sep)) continue;
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.writeFileSync(outPath, buf);
          }
          convertSngToXml(tmpDir, this.config.rscliPath);
          const xmlArrDir = path.join(tmpDir, "songs", "arr");
          if (fs.existsSync(xmlArrDir)) {
            for (const f of fs.readdirSync(xmlArrDir)) {
              if (!f.endsWith(".xml") || f.includes("_showlights")) continue;
              const xmlContent = fs.readFileSync(path.join(xmlArrDir, f), "utf8");
              const xmlName = extractArrNameFromXml(xmlContent)
                ?? arrangementDisplayName(path.basename(f, ".xml").toLowerCase());
              arrXmls.push({ name: xmlName, xml: xmlContent });
            }
          }
        } finally {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        }
      }
    }

    let title = "", artist = "", album = "";
    let songLength = 0, offset = 0;
    for (const m of manifests) {
      const entriesDict = m["Entries"] as Record<string, unknown> | undefined;
      if (!entriesDict) continue;
      for (const entry of Object.values(entriesDict) as Record<string, unknown>[]) {
        const attrs = entry["Attributes"] as Record<string, unknown> | undefined;
        if (!attrs) continue;
        if (!title) {
          title = String(attrs["SongName"] ?? "");
          artist = String(attrs["ArtistName"] ?? "");
          album = String(attrs["AlbumName"] ?? "");
        }
        if (!songLength) {
          const sl = attrs["SongLength"];
          if (sl) songLength = Number(sl) || 0;
        }
      }
    }

    const targetLower = arrMeta.name.toLowerCase();
    let matchIdx = -1;
    for (let i = 0; i < arrXmls.length; i++) {
      const n = arrXmls[i].name.toLowerCase();
      if (n === targetLower) { matchIdx = i; break; }
    }
    if (matchIdx === -1) {
      for (let i = 0; i < arrXmls.length; i++) {
        const n = arrXmls[i].name.toLowerCase();
        if (n.includes(targetLower) || targetLower.includes(n)) { matchIdx = i; break; }
      }
    }
    if (matchIdx === -1 && arrXmls.length > 0) matchIdx = 0;

    let beats: { time: number; measure: number }[] = [];
    let sections: { time: number; name: string }[] = [];
    for (const ax of arrXmls) {
      const root = parseSongRoot(ax.xml);
      if (root) {
        if (!title) { title = root.title; artist = root.artist; album = root.album; }
        if (!songLength && root.songLength) songLength = root.songLength;
        if (!offset && root.offset) offset = root.offset;
        if (!beats.length && root.beats.length > 0) beats = root.beats.map(mapBeat);
        if (!sections.length && root.sections.length > 0) sections = root.sections.map(mapSection);
      }
    }

    let lyrics: { t: number; d: number; w: string }[] = [];
    if (vocalsXml) {
      try { lyrics = parseLyricsXml(vocalsXml) as unknown as { t: number; d: number; w: string }[]; } catch { /* ignore */ }
    }

    const arrangementsList = arrangements.map((a) => ({ index: a.index, name: a.name, notes: a.notes }));

    if (matchIdx === -1) {
      return {
        song_info: {
          title, artist, album, arrangement: arrMeta.name,
          arrangement_index: arrangementIndex, arrangements: arrangementsList,
          duration: songLength, tuning: [0, 0, 0, 0, 0, 0], capo: 0, offset, stringCount: 6, format: "psarc",
        },
        beats, sections, anchors: [], chord_templates: [], lyrics, tone_changes: [], tone_base: "",
        notes: [], chords: [], handshapes: [],
      };
    }

    const arr = parseArrangementXml(arrXmls[matchIdx].xml, arrXmls[matchIdx].name);
    const stringCount = arrangementStringCount(arr);

    const toneChanges: { time: number; name: string }[] = [];
    let toneBase = "";
    if (arr.tones) {
      toneBase = arr.tones.base;
      for (const tc of arr.tones.changes) toneChanges.push({ time: tc.time, name: tc.name });
    }

    return {
      song_info: {
        title, artist, album, arrangement: arr.name,
        arrangement_index: arrangementIndex, arrangements: arrangementsList,
        duration: songLength, tuning: [...arr.tuning], capo: arr.capo, offset, stringCount, format: "psarc",
      },
      beats, sections,
      anchors: arr.anchors.map(toWireAnchor),
      chord_templates: arr.chordTemplates.map(mapCt),
      lyrics,
      tone_changes: toneChanges,
      tone_base: toneBase,
      notes: arr.notes.map(toWireNote),
      chords: arr.chords.map(toWireChord),
      handshapes: arr.handShapes.map(toWireHandShape),
      phrases: arr.phrases ? arr.phrases.map(toWirePhrase) : undefined,
    };
  }

  private readSloppak(
    filePath: string,
    arrangements: ArrangementData[],
    arrangementIndex: number,
  ): HighwayResponse {
    const sourceDir = SloppakLoader.resolveDir(filePath, this.config.sloppakCacheDir);
    const manifest = SloppakLoader.readManifest(sourceDir);

    const arrMeta = arrangements[arrangementIndex] ?? { index: arrangementIndex, name: "Lead", notes: 0 };

    const manArr = manifest.arrangements?.find(
      (a) => a.name.toLowerCase() === arrMeta.name.toLowerCase(),
    );
    const arrFile = manArr ? path.join(sourceDir, "arrangements", manArr.file) : null;

    const arrangementsList = arrangements.map((a) => ({ index: a.index, name: a.name, notes: a.notes }));

    const songXmlPath = path.join(sourceDir, "song.xml");
    let beats: { time: number; measure: number }[] = [];
    let sections: { time: number; name: string }[] = [];
    let songLength = manifest.duration ?? 0;
    let offset = 0;
    let title = manifest.title ?? "";
    let artist = manifest.artist ?? "";
    let album = manifest.album ?? "";

    if (fs.existsSync(songXmlPath)) {
      const root = parseSongRoot(fs.readFileSync(songXmlPath, "utf8"));
      if (root) {
        if (root.beats.length) beats = root.beats.map(mapBeat);
        if (root.sections.length) sections = root.sections.map(mapSection);
        songLength = root.songLength || songLength;
        offset = root.offset;
      }
    }

    let lyrics: { t: number; d: number; w: string }[] = [];
    if (manifest.lyrics) {
      const lyricsPath = path.join(sourceDir, manifest.lyrics);
      if (fs.existsSync(lyricsPath)) {
        try {
          if (lyricsPath.endsWith(".json")) {
            lyrics = JSON.parse(fs.readFileSync(lyricsPath, "utf8"));
          } else {
            lyrics = parseLyricsXml(fs.readFileSync(lyricsPath, "utf8")) as unknown as { t: number; d: number; w: string }[];
          }
        } catch { /* ignore */ }
      }
    }

    if (!arrFile || !fs.existsSync(arrFile)) {
      return {
        song_info: {
          title, artist, album, arrangement: arrMeta.name,
          arrangement_index: arrangementIndex, arrangements: arrangementsList,
          duration: songLength, tuning: [0, 0, 0, 0, 0, 0], capo: 0, offset, stringCount: 6, format: "sloppak",
        },
        beats, sections, anchors: [], chord_templates: [], lyrics, tone_changes: [], tone_base: "",
        notes: [], chords: [], handshapes: [],
      };
    }

    const arrData = JSON.parse(fs.readFileSync(arrFile, "utf8")) as Record<string, unknown>;

    if (beats.length === 0) {
      const beatsRaw = arrData["beats"] as Record<string, unknown>[] | undefined;
      if (beatsRaw) {
        beats = beatsRaw.map((b) => ({ time: (b.time as number) ?? 0, measure: (b.measure as number) ?? -1 }));
      }
    }
    if (sections.length === 0) {
      const sectionsRaw = arrData["sections"] as Record<string, unknown>[] | undefined;
      if (sectionsRaw) {
        sections = sectionsRaw.map((s) => ({ time: (s.time ?? s.start_time ?? 0) as number, name: (s.name as string) ?? "" }));
      }
    }

    const arr = arrangementFromWireJson(arrData);
    const stringCount = arrangementStringCount(arr);

    const toneChanges: { time: number; name: string }[] = [];
    let toneBase = "";
    if (arr.tones) {
      toneBase = arr.tones.base;
      for (const tc of arr.tones.changes) toneChanges.push({ time: tc.time, name: tc.name });
    }

    return {
      song_info: {
        title, artist, album, arrangement: arr.name,
        arrangement_index: arrangementIndex, arrangements: arrangementsList,
        duration: songLength, tuning: [...arr.tuning], capo: arr.capo, offset, stringCount, format: "sloppak",
      },
      beats, sections,
      anchors: arr.anchors.map(toWireAnchor),
      chord_templates: arr.chordTemplates.map(mapCt),
      lyrics,
      tone_changes: toneChanges,
      tone_base: toneBase,
      notes: arr.notes.map(toWireNote),
      chords: arr.chords.map(toWireChord),
      handshapes: arr.handShapes.map(toWireHandShape),
      phrases: arr.phrases ? arr.phrases.map(toWirePhrase) : undefined,
    };
  }

  private readLoose(
    filePath: string,
    arrangements: ArrangementData[],
    arrangementIndex: number,
  ): HighwayResponse {
    const arrMeta = arrangements[arrangementIndex] ?? { index: arrangementIndex, name: "Lead", notes: 0 };

    const arrangementsList = arrangements.map((a) => ({ index: a.index, name: a.name, notes: a.notes }));

    const xmlFiles = walkXmlFiles(filePath);

    let title = "", artist = "", album = "";
    let songLength = 0, offset = 0;
    let beats: { time: number; measure: number }[] = [];
    let sections: { time: number; name: string }[] = [];
    let vocalsXml = "";
    const arrXmls: { name: string; xml: string }[] = [];

    for (const f of xmlFiles) {
      const lower = f.toLowerCase();
      const content = fs.readFileSync(f, "utf8");
      if (lower.includes("vocal")) {
        vocalsXml = content;
        continue;
      }

      const root = parseSongRoot(content);
      if (root) {
        if (!title) { title = root.title; artist = root.artist; album = root.album; }
        if (!songLength && root.songLength) songLength = root.songLength;
        if (!offset && root.offset) offset = root.offset;
        if (!beats.length && root.beats.length > 0) beats = root.beats.map(mapBeat);
        if (!sections.length && root.sections.length > 0) sections = root.sections.map(mapSection);
      }

      const stem = path.basename(f, ".xml").toLowerCase();
      const name = arrangementDisplayName(stem, path.basename(f, ".xml"));
      arrXmls.push({ name, xml: content });
    }

    const targetLower = arrMeta.name.toLowerCase();
    let matchIdx = -1;
    for (let i = 0; i < arrXmls.length; i++) {
      const n = arrXmls[i].name.toLowerCase();
      if (n === targetLower) { matchIdx = i; break; }
    }
    if (matchIdx === -1) {
      for (let i = 0; i < arrXmls.length; i++) {
        const n = arrXmls[i].name.toLowerCase();
        if (n.includes(targetLower) || targetLower.includes(n)) { matchIdx = i; break; }
      }
    }
    if (matchIdx === -1 && arrXmls.length > 0) matchIdx = 0;

    let lyrics: { t: number; d: number; w: string }[] = [];
    if (vocalsXml) {
      try { lyrics = parseLyricsXml(vocalsXml) as unknown as { t: number; d: number; w: string }[]; } catch { /* ignore */ }
    }

    if (matchIdx === -1) {
      return {
        song_info: {
          title, artist, album, arrangement: arrMeta.name,
          arrangement_index: arrangementIndex, arrangements: arrangementsList,
          duration: songLength, tuning: [0, 0, 0, 0, 0, 0], capo: 0, offset, stringCount: 6, format: "loose",
        },
        beats, sections, anchors: [], chord_templates: [], lyrics, tone_changes: [], tone_base: "",
        notes: [], chords: [], handshapes: [],
      };
    }

    const arr = parseArrangementXml(arrXmls[matchIdx].xml);
    const stringCount = arrangementStringCount(arr);

    const toneChanges: { time: number; name: string }[] = [];
    let toneBase = "";
    if (arr.tones) {
      toneBase = arr.tones.base;
      for (const tc of arr.tones.changes) toneChanges.push({ time: tc.time, name: tc.name });
    }

    return {
      song_info: {
        title, artist, album, arrangement: arr.name,
        arrangement_index: arrangementIndex, arrangements: arrangementsList,
        duration: songLength, tuning: [...arr.tuning], capo: arr.capo, offset, stringCount, format: "loose",
      },
      beats, sections,
      anchors: arr.anchors.map(toWireAnchor),
      chord_templates: arr.chordTemplates.map(mapCt),
      lyrics,
      tone_changes: toneChanges,
      tone_base: toneBase,
      notes: arr.notes.map(toWireNote),
      chords: arr.chords.map(toWireChord),
      handshapes: arr.handShapes.map(toWireHandShape),
      phrases: arr.phrases ? arr.phrases.map(toWirePhrase) : undefined,
    };
  }
}
