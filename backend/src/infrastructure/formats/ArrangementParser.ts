import { XMLParser } from "fast-xml-parser";
import type {
  Anchor,
  Arrangement,
  Beat,
  Chord,
  ChordNote,
  ChordTemplate,
  HandShape,
  LyricWord,
  Note,
  Phrase,
  PhraseLevel,
  Section,
} from "../../domain/models/song.js";
import {
  noteFromWire,
  chordNoteFromWire,
} from "../../domain/models/song.js";

// ─── XML helpers ───────────────────────────────────────────────────────────

const ARRAY_TAGS = new Set([
  "note", "chord", "chordNote", "anchor", "beat", "section",
  "handShape", "phrase", "phraseIteration", "level", "chordTemplate",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

type El = Record<string, unknown>;

function num(el: El, key: string, fallback = 0): number {
  const v = el[`@_${key}`];
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function bool(el: El, key: string): boolean {
  const v = el[`@_${key}`];
  return v === 1 || v === "1" || v === true || v === "true";
}

function str(el: El, key: string, fallback = ""): string {
  const v = el[`@_${key}`];
  return v !== undefined && v !== null ? String(v) : fallback;
}

function arr<T>(el: El, ...path: string[]): T[] {
  let cur: unknown = el;
  for (const p of path) cur = (cur as El)?.[p];
  return Array.isArray(cur) ? (cur as T[]) : [];
}

// ─── Element parsers ───────────────────────────────────────────────────────

function parseNote(el: El): Note {
  return {
    time: num(el, "time"),
    string: num(el, "string"),
    fret: num(el, "fret"),
    sustain: num(el, "sustain"),
    slideTo: num(el, "slideTo", -1),
    slideUnpitchTo: num(el, "slideUnpitchTo", -1),
    bend: num(el, "bend"),
    hammerOn: bool(el, "hammerOn"),
    pullOff: bool(el, "pullOff"),
    harmonic: bool(el, "harmonic"),
    harmonicPinch: bool(el, "harmonicPinch"),
    palmMute: bool(el, "palmMute"),
    mute: bool(el, "mute"),
    vibrato: bool(el, "vibrato"),
    tremolo: bool(el, "tremolo"),
    accent: bool(el, "accent"),
    linkNext: bool(el, "linkNext"),
    tap: bool(el, "tap"),
  };
}

function parseChordNote(el: El): ChordNote {
  return {
    string: num(el, "string"),
    fret: num(el, "fret"),
    sustain: num(el, "sustain"),
    slideTo: num(el, "slideTo", -1),
    slideUnpitchTo: num(el, "slideUnpitchTo", -1),
    bend: num(el, "bend"),
    hammerOn: bool(el, "hammerOn"),
    pullOff: bool(el, "pullOff"),
    harmonic: bool(el, "harmonic"),
    harmonicPinch: bool(el, "harmonicPinch"),
    palmMute: bool(el, "palmMute"),
    mute: bool(el, "mute"),
    vibrato: bool(el, "vibrato"),
    tremolo: bool(el, "tremolo"),
    accent: bool(el, "accent"),
    linkNext: bool(el, "linkNext"),
    tap: bool(el, "tap"),
  };
}

function parseChord(el: El): Chord {
  const chordNotes = arr<El>(el, "chordNote").map(parseChordNote);
  return {
    time: num(el, "time"),
    chordId: num(el, "chordId"),
    highDensity: bool(el, "highDensity"),
    notes: chordNotes,
  };
}

function parseAnchor(el: El): Anchor {
  return { time: num(el, "time"), fret: num(el, "fret"), width: num(el, "width", 4) };
}

function parseHandShape(el: El): HandShape {
  return {
    chordId: num(el, "chordId"),
    startTime: num(el, "startTime"),
    endTime: num(el, "endTime"),
    arpeggio: bool(el, "arpeggio"),
  };
}

function parseLevel(el: El): PhraseLevel {
  return {
    difficulty: num(el, "difficulty"),
    notes: arr<El>(el, "notes", "note").map(parseNote),
    chords: arr<El>(el, "chords", "chord").map(parseChord),
    anchors: arr<El>(el, "anchors", "anchor").map(parseAnchor),
    handShapes: arr<El>(el, "handShapes", "handShape").map(parseHandShape),
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface ParsedSongRoot {
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly year: number;
  readonly songLength: number;
  readonly offset: number;
  readonly beats: readonly Beat[];
  readonly sections: readonly Section[];
}

export function parseSongRoot(xml: string): ParsedSongRoot | null {
  const doc = parser.parse(xml);
  const root = (doc["song"] ?? doc["Song"]) as El | undefined;
  if (!root || !root["ebeats"]) return null;

  const beats: Beat[] = arr<El>(root, "ebeats", "beat").map((b) => ({
    time: num(b, "time"),
    measure: num(b, "measure", -1),
  }));

  const sections: Section[] = arr<El>(root, "sections", "section").map((s) => ({
    name: str(s, "name"),
    number: num(s, "number"),
    startTime: num(s, "startTime"),
  }));

  return {
    title: str(root, "title"),
    artist: str(root, "artistName"),
    album: str(root, "albumName"),
    year: num(root, "albumYear"),
    songLength: num(root, "songLength"),
    offset: num(root, "startBeat"),
    beats,
    sections,
  };
}

export function parseArrangementXml(xml: string, arrangementName?: string): Arrangement {
  const doc = parser.parse(xml);
  const root = (doc["song"] ?? doc["Song"]) as El;

  // Tuning
  const tuningEl = root["tuning"] as El | undefined;
  const tuning: number[] = tuningEl
    ? Array.from({ length: 6 }, (_, i) => num(tuningEl, `string${i}`))
    : [0, 0, 0, 0, 0, 0];

  const capo = num(root, "capo");
  const name = arrangementName ?? str(root, "arrangement", "Lead");

  // All difficulty levels
  const allLevels = arr<El>(root, "levels", "level").map(parseLevel);
  const maxDifficulty =
    allLevels.length > 0 ? Math.max(...allLevels.map((l) => l.difficulty)) : 0;
  const topLevel = allLevels.find((l) => l.difficulty === maxDifficulty) ?? allLevels[0];

  // Chord templates
  const chordTemplates: ChordTemplate[] = arr<El>(root, "chordTemplates", "chordTemplate").map((ct) => ({
    name: str(ct, "chordName"),
    displayName: str(ct, "displayName"),
    arpeggio: bool(ct, "arpeggio"),
    fingers: Array.from({ length: 6 }, (_, i) => num(ct, `finger${i}`, -1)),
    frets: Array.from({ length: 6 }, (_, i) => num(ct, `fret${i}`, -1)),
  }));

  // Phrase-level difficulty ladder (only when multiple levels exist)
  const phrases = buildPhrases(root, allLevels, maxDifficulty);

  return {
    name,
    tuning,
    capo,
    notes: topLevel?.notes ?? [],
    chords: topLevel?.chords ?? [],
    anchors: topLevel?.anchors ?? [],
    handShapes: topLevel?.handShapes ?? [],
    chordTemplates,
    phrases: phrases.length > 1 ? phrases : undefined,
  };
}

function buildPhrases(root: El, allLevels: PhraseLevel[], maxDifficulty: number): Phrase[] {
  const iterations = arr<El>(root, "phraseIterations", "phraseIteration");
  const definitions = arr<El>(root, "phrases", "phrase");

  if (iterations.length < 2) return [];

  return iterations.map((iter, i): Phrase => {
    const nextIter = iterations[i + 1];
    const startTime = num(iter, "time");
    const endTime = nextIter ? num(nextIter, "time") : num(root, "songLength");
    const phraseIdx = num(iter, "phraseId");
    const phraseDef = definitions[phraseIdx];
    const phrasMax = phraseDef ? num(phraseDef, "maxDifficulty") : maxDifficulty;

    const levels: PhraseLevel[] = allLevels
      .filter((l) => l.difficulty <= phrasMax)
      .map((l) => ({
        difficulty: l.difficulty,
        notes: l.notes.filter((n) => n.time >= startTime && n.time < endTime),
        chords: l.chords.filter((c) => c.time >= startTime && c.time < endTime),
        anchors: l.anchors.filter((a) => a.time >= startTime && a.time < endTime),
        handShapes: l.handShapes.filter(
          (h) => h.startTime >= startTime && h.startTime < endTime
        ),
      }));

    return { startTime, endTime, maxDifficulty: phrasMax, levels };
  });
}

export function parseLyricsXml(xml: string): LyricWord[] {
  const doc = parser.parse(xml);
  const root = (doc["vocals"] ?? doc["Vocals"]) as El | undefined;
  if (!root) return [];
  return arr<El>(root, "vocal").map((v) => ({
    t: num(v, "time"),
    d: num(v, "length"),
    w: str(v, "lyric"),
  }));
}

// ─── Sloppak wire format deserialization ──────────────────────────────────

export function arrangementFromWireJson(data: El): Arrangement {
  const tuning = (data["tuning"] as number[]) ?? [0, 0, 0, 0, 0, 0];

  return {
    name: (data["name"] as string) ?? "Lead",
    tuning,
    capo: (data["capo"] as number) ?? 0,
    notes: ((data["notes"] as unknown[]) ?? []).map((n) =>
      noteFromWire(n as Parameters<typeof noteFromWire>[0])
    ),
    chords: ((data["chords"] as unknown[]) ?? []).map((c) => {
      const wc = c as { t: number; id: number; hd?: boolean; notes?: unknown[] };
      return {
        time: wc.t,
        chordId: wc.id,
        highDensity: wc.hd === true,
        notes: (wc.notes ?? []).map((n) =>
          chordNoteFromWire(n as Parameters<typeof chordNoteFromWire>[0], wc.t)
        ),
      } satisfies Chord;
    }),
    anchors: ((data["anchors"] as unknown[]) ?? []).map((a) => {
      const wa = a as { time: number; fret: number; width: number };
      return { time: wa.time, fret: wa.fret, width: wa.width } satisfies Anchor;
    }),
    handShapes: ((data["handshapes"] as unknown[]) ?? []).map((h) => {
      const wh = h as { id: number; st: number; et: number; arp?: boolean };
      return {
        chordId: wh.id,
        startTime: wh.st,
        endTime: wh.et,
        arpeggio: wh.arp === true,
      } satisfies HandShape;
    }),
    chordTemplates: ((data["chord_templates"] as unknown[]) ?? []).map((ct) => {
      const wct = ct as {
        name: string;
        displayName?: string;
        arp?: boolean;
        fingers: number[];
        frets: number[];
      };
      return {
        name: wct.name,
        displayName: wct.displayName ?? "",
        arpeggio: wct.arp === true,
        fingers: wct.fingers,
        frets: wct.frets,
      } satisfies ChordTemplate;
    }),
  };
}

// ─── Directory loader (used by SongService for PSARC and loose folders) ──

import fs from "node:fs";
import path from "node:path";
import type { Song } from "../../domain/models/song.js";

export async function loadSongFromDirectory(dir: string): Promise<Song> {
  const xmlFiles = (fs.readdirSync(dir, { recursive: true }) as string[])
    .map((f) => path.join(dir, f))
    .filter(
      (f) =>
        f.endsWith(".xml") &&
        !f.includes("_showlights") &&
        !f.includes("vocal")
    );

  let title = "", artist = "", album = "";
  let year = 0, songLength = 0, offset = 0;
  let beats: Beat[] = [], sections: Section[] = [];
  const arrangements: Arrangement[] = [];

  for (const xmlFile of xmlFiles) {
    const content = fs.readFileSync(xmlFile, "utf8");

    // Try song root (beats, metadata)
    const root = parseSongRoot(content);
    if (root && root.beats.length > 0) {
      title = title || root.title;
      artist = artist || root.artist;
      album = album || root.album;
      year = year || root.year;
      songLength = songLength || root.songLength;
      offset = offset || root.offset;
      beats = beats.length ? beats : [...root.beats];
      sections = sections.length ? sections : [...root.sections];
    }

    // Try arrangement
    try {
      const arr = parseArrangementXml(content);
      if (arr.notes.length > 0 || arr.chords.length > 0 || arr.chordTemplates.length > 0) {
        if (!title) {
          const r = parseSongRoot(content);
          if (r) {
            title = title || r.title;
            artist = artist || r.artist;
            album = album || r.album;
            year = year || r.year;
            songLength = songLength || r.songLength;
            if (!beats.length) beats = [...r.beats];
            if (!sections.length) sections = [...r.sections];
          }
        }
        arrangements.push(arr);
      }
    } catch {
      // not an arrangement XML
    }
  }

  // Lyrics
  const vocalFiles = (fs.readdirSync(dir, { recursive: true }) as string[])
    .map((f) => path.join(dir, f))
    .filter((f) => f.includes("vocal") && f.endsWith(".xml"));

  let lyrics: LyricWord[] = [];
  if (vocalFiles.length > 0) {
    try {
      lyrics = parseLyricsXml(fs.readFileSync(vocalFiles[0], "utf8"));
    } catch {
      // ignore
    }
  }

  // Try JSON manifests for metadata
  const manifestDir = path.join(dir, "manifests");
  if (fs.existsSync(manifestDir)) {
    for (const f of fs.readdirSync(manifestDir).filter((f) => f.endsWith(".json"))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(manifestDir, f), "utf8")) as Record<string, unknown>;
        const entryVals = Object.values((raw["Entries"] ?? {}) as Record<string, unknown>);
        const attrs = (entryVals[0] as Record<string, unknown>)?.["Attributes"] as Record<string, unknown>;
        if (attrs) {
          title = title || String(attrs["SongName"] ?? "");
          artist = artist || String(attrs["ArtistName"] ?? "");
          album = album || String(attrs["AlbumName"] ?? "");
          year = year || Number(attrs["SongYear"]) || 0;
        }
      } catch { /* ignore */ }
    }
  }

  return { title, artist, album, year, songLength, offset, beats, sections, arrangements, lyrics };
}
