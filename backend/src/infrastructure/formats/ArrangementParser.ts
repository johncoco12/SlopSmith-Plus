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
  ToneData,
} from "../../domain/models/song.js";
import {
  noteFromWire,
  chordNoteFromWire,
} from "../../domain/models/song.js";

const ARRANGEMENT_NAME_MAP: Record<string, string> = {
  "part real_guitar": "Lead",
  "part real_guitar_22": "Rhythm",
  "part real_bass": "Bass",
  "part real_guitar_bonus": "Bonus Lead",
  "part real_bass_22": "Bass 2",
};

const ARRANGEMENT_PRIORITY: Record<string, number> = {
  lead: 0, combo: 1, rhythm: 2, bass: 3,
};

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
  const v = el[`@_${key}`] ?? el[key];
  if (v === undefined || v === null) return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function bool(el: El, key: string): boolean {
  const v = el[`@_${key}`];
  return v === 1 || v === "1" || v === true || v === "true";
}

function str(el: El, key: string, fallback = ""): string {
  const v = el[`@_${key}`] ?? el[key];
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

function checkArpeggio(el: El): boolean {
  for (const attr of ["arpeggio", "Arpeggio", "arp", "Arp"]) {
    const v = el[attr];
    if (v !== undefined && v !== "" && v !== "0" && v !== "false" && v !== "False" && v !== "FALSE") return true;
  }
  return false;
}

function checkChordTemplateArpeggio(ct: El): boolean {
  if (checkArpeggio(ct)) return true;
  const displayName = str(ct, "displayName", "");
  const lowered = displayName.toLowerCase();
  return lowered.includes("-arp") || lowered.includes("arpeggio");
}

function parseHandShape(el: El): HandShape {
  return {
    chordId: num(el, "chordId"),
    startTime: num(el, "startTime"),
    endTime: num(el, "endTime"),
    arpeggio: checkArpeggio(el),
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
  if (!root) return null;

  const beats: Beat[] = root["ebeats"]
    ? arr<El>(root, "ebeats", "beat").map((b) => ({
        time: num(b, "time"),
        measure: num(b, "measure", -1),
      }))
    : [];

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

export function arrangementDisplayName(
  rawName: string,
  filenameStem?: string,
): string {
  const low = rawName.toLowerCase().trim();
  const mapped = ARRANGEMENT_NAME_MAP[low];
  if (mapped) return mapped;

  if (!rawName || low.startsWith("part ")) {
    const fname = (filenameStem ?? rawName).toLowerCase();
    if (fname.includes("lead")) return "Lead";
    if (fname.includes("rhythm")) return "Rhythm";
    if (fname.includes("bass")) return "Bass";
    if (fname.includes("combo")) return "Combo";
  }
  return rawName;
}

export function sortArrangementsByPriority<T extends { name: string }>(arrs: T[]): T[] {
  return [...arrs].sort((a, b) => {
    const pa = ARRANGEMENT_PRIORITY[a.name.toLowerCase()] ?? 99;
    const pb = ARRANGEMENT_PRIORITY[b.name.toLowerCase()] ?? 99;
    return pa - pb;
  });
}

export function parseArrangementXml(xml: string, arrangementName?: string): Arrangement {
  const doc = parser.parse(xml);
  const root = (doc["song"] ?? doc["Song"]) as El;

  // Tuning. RS XML has string0..string5; extended-range instruments (7/8-string
  // guitar, 5-string bass) add string6+ attributes.
  const tuningEl = root["tuning"] as El | undefined;
  const rawName = str(root, "arrangement", "");
  const name = arrangementName ?? arrangementDisplayName(rawName);
  function readStringRange(el: El, prefix: string, defaultVal: number, count?: number): number[] {
    if (count !== undefined) {
      return Array.from({ length: count }, (_, i) => num(el, `${prefix}${i}`, defaultVal));
    }
    const result: number[] = [];
    for (let i = 0; ; i++) {
      const v = el[`${prefix}${i}`];
      if (v === undefined) break;
      result.push(Number(v));
    }
    return result.length > 0 ? result : Array.from({ length: 6 }, () => defaultVal);
  }
  const defaultStringCount = name.toLowerCase().includes("bass") ? 4 : 6;
  const tuning: number[] = tuningEl ? readStringRange(tuningEl, "string", 0) : Array.from({ length: defaultStringCount }, () => 0);
  // Truncate tuning for bass when the XML has extra trailing zero strings
  if (name.toLowerCase().includes("bass") && tuning.length > 4) {
    const unused = tuning.slice(4).every((v) => v === 0);
    if (unused) tuning.length = 4;
  }
  const stringCount = tuning.length < 6 ? (tuning.length === 4 ? 4 : 6) : tuning.length;

  const capo = num(root, "capo");

  // All difficulty levels
  const allLevels = arr<El>(root, "levels", "level").map(parseLevel);
  // Find the highest difficulty level that has notes (some DDC-created
  // arrangements pad high difficulties with 0-note, chord-only ghost levels)
  const levelsWithNotes = allLevels.filter((l) => l.notes.length > 0);
  const maxDifficulty = levelsWithNotes.length > 0
    ? Math.max(...levelsWithNotes.map((l) => l.difficulty))
    : (allLevels.length > 0 ? Math.max(...allLevels.map((l) => l.difficulty)) : 0);
  const topLevel = allLevels.find((l) => l.difficulty === maxDifficulty) ?? allLevels[0];

  // Chord templates. RS XML names fret0..finger5; extended-range adds fret6+.
  const chordTemplates: ChordTemplate[] = arr<El>(root, "chordTemplates", "chordTemplate").map((ct) => ({
    name: str(ct, "chordName"),
    displayName: str(ct, "displayName"),
    arpeggio: checkChordTemplateArpeggio(ct),
    fingers: readStringRange(ct, "finger", -1, stringCount),
    frets: readStringRange(ct, "fret", -1, stringCount),
  }));

  // Phrase-level difficulty ladder (only when multiple levels exist)
  const phrases = buildPhrases(root, allLevels, maxDifficulty);

  // Synthesize chord notes from template frets when chordNote children are
  // absent (RS XML often references a chordId without inline <chordNote>s).
  function synthesizeChordNotes(chords: readonly Chord[]): void {
    for (const c of chords) {
      if (c.notes.length === 0 && c.chordId >= 0 && c.chordId < chordTemplates.length) {
        const ct = chordTemplates[c.chordId];
        const notes: ChordNote[] = [];
        for (let s = 0; s < ct.frets.length; s++) {
          if (ct.frets[s] >= 0) {
            notes.push({ string: s, fret: ct.frets[s], sustain: 0, slideTo: -1, slideUnpitchTo: -1, bend: 0, hammerOn: false, pullOff: false, harmonic: false, harmonicPinch: false, palmMute: false, mute: false, vibrato: false, tremolo: false, accent: false, linkNext: false, tap: false });
          }
        }
        (c.notes as ChordNote[]).push(...notes);
      }
    }
  }
  synthesizeChordNotes(topLevel?.chords ?? []);

  // Also synthesize in phrases (multi-difficulty arrangements)
  if (phrases) {
    for (const p of phrases) {
      for (const lv of p.levels) {
        synthesizeChordNotes(lv.chords as Chord[]);
      }
    }
  }

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

function phraseLevelFromWire(d: Record<string, unknown>): PhraseLevel {
  return {
    difficulty: (d.difficulty as number) ?? 0,
    notes: ((d.notes as unknown[]) ?? []).map((n) => noteFromWire(n as Record<string, unknown>)),
    chords: ((d.chords as unknown[]) ?? []).map((c) => {
      const wc = c as Record<string, unknown>;
      const t = (wc.t as number) ?? 0;
      return {
        time: t,
        chordId: (wc.id as number) ?? 0,
        highDensity: (wc.hd ?? false) === true,
        notes: ((wc.notes as unknown[]) ?? []).map((n) =>
          chordNoteFromWire(n as Record<string, unknown>, t),
        ),
      } satisfies Chord;
    }),
    anchors: ((d.anchors as unknown[]) ?? []).map((a) => {
      const wa = a as Record<string, unknown>;
      return { time: wa.time as number, fret: wa.fret as number, width: (wa.width as number) ?? 4 } satisfies Anchor;
    }),
    handShapes: ((d.handshapes as unknown[]) ?? []).map((h) => {
      const wh = h as Record<string, unknown>;
      return {
        chordId: (wh.id ?? wh.chord_id ?? 0) as number,
        startTime: (wh.st ?? wh.start_time ?? 0) as number,
        endTime: (wh.et ?? wh.end_time ?? 0) as number,
        arpeggio: (wh.arp ?? false) === true,
      } satisfies HandShape;
    }),
  };
}

function phraseFromWire(d: Record<string, unknown>): Phrase {
  return {
    startTime: (d.start_time as number) ?? 0,
    endTime: (d.end_time as number) ?? 0,
    maxDifficulty: (d.max_difficulty as number) ?? 0,
    levels: ((d.levels as unknown[]) ?? []).map((lv) => phraseLevelFromWire(lv as Record<string, unknown>)),
  };
}

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
      const wh = h as Record<string, unknown>;
      return {
        chordId: (wh.id ?? wh.chord_id ?? 0) as number,
        startTime: (wh.st ?? wh.start_time ?? 0) as number,
        endTime: (wh.et ?? wh.end_time ?? 0) as number,
        arpeggio: (wh.arp ?? false) === true,
      } satisfies HandShape;
    }),
    chordTemplates: (data["chord_templates"] as unknown[] ?? data["templates"] as unknown[] ?? []).map((ct) => {
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
    phrases: data["phrases"]
      ? ((data["phrases"] as unknown[]) ?? []).map((p) => phraseFromWire(p as Record<string, unknown>))
      : undefined,
    tones: data["tones"] as ToneData | undefined,
  };
}

// ─── Directory loader (used by SongService for PSARC and loose folders) ──

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Song } from "../../domain/models/song.js";

function hasArrangementXml(root: Record<string, unknown>): boolean {
  try {
    const tag = root["_tag"];
    if (tag === "song") {
      const arr = (root["arrangement"] as Record<string, unknown>) ?? {};
      const text = (arr["#text"] ?? arr[""] ?? "") as string;
      const low = text.toLowerCase().trim();
      return !["vocals", "showlights", "jvocals"].includes(low);
    }
    return tag === "song";
  } catch {
    return false;
  }
}

function convertSngToXml(dir: string, rscliPath: string): void {
  const sngFiles = (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".sng"));

  if (sngFiles.length === 0) return;

  // Detect platform from directory structure
  let platform = "pc";
  for (const sng of sngFiles) {
    const lower = sng.toLowerCase();
    if (lower.includes("/macos/") || lower.includes("/mac/")) {
      platform = "mac";
      break;
    }
  }

  const arrDir = path.join(dir, "songs", "arr");
  fs.mkdirSync(arrDir, { recursive: true });

  for (const sngRel of sngFiles) {
    const stem = path.basename(sngRel, ".sng");
    if (stem.toLowerCase().includes("vocals")) continue;

    const sngFull = path.join(dir, sngRel);
    const xmlOut = path.join(arrDir, `${stem}.xml`);
    if (fs.existsSync(xmlOut)) continue;

    try {
      const result = execSync(
        `"${rscliPath}" sng2xml "${sngFull}" "${xmlOut}" ${platform}`,
        { timeout: 30000, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      // sng2xml failed for this file — skip
    }
  }
}

export async function loadSongFromDirectory(dir: string, rscliPath?: string): Promise<Song> {
  let xmlFiles: string[];

  // Initial XML scan
  xmlFiles = (fs.readdirSync(dir, { recursive: true }) as string[])
    .map((f) => path.join(dir, f))
    .filter((f) => f.endsWith(".xml") && !f.includes("_showlights") && !f.includes("vocal"));

  // If no arrangement XMLs found, try SNG conversion
  if (xmlFiles.length === 0 && rscliPath && fs.existsSync(rscliPath)) {
    convertSngToXml(dir, rscliPath);
    // Re-scan for converted XMLs
    xmlFiles = (fs.readdirSync(dir, { recursive: true }) as string[])
      .map((f) => path.join(dir, f))
      .filter((f) => f.endsWith(".xml") && !f.includes("_showlights") && !f.includes("vocal"));
  }

  let title = "", artist = "", album = "";
  let year = 0, songLength = 0, offset = 0;
  let beats: Beat[] = [], sections: Section[] = [];
  const arrangements: Arrangement[] = [];

  function arrangementNameFromFilename(filePath: string): string | undefined {
    const stem = path.basename(filePath, ".xml").toLowerCase();
    const parts = stem.split("_");
    const last = parts[parts.length - 1];
    if (last in ARRANGEMENT_PRIORITY) {
      return last.charAt(0).toUpperCase() + last.slice(1);
    }
    const match = parts.find((p) => p in ARRANGEMENT_PRIORITY);
    if (match) return match.charAt(0).toUpperCase() + match.slice(1);
    return undefined;
  }

  for (const xmlFile of xmlFiles) {
    const content = fs.readFileSync(xmlFile, "utf8");
    const filenameArrName = arrangementNameFromFilename(xmlFile);

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
      const arr = parseArrangementXml(content, filenameArrName);
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

  return { title, artist, album, year, songLength, offset, beats, sections, arrangements: sortArrangementsByPriority(arrangements), lyrics };
}
