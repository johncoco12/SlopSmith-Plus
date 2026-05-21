// ─── Value objects ─────────────────────────────────────────────────────────

export interface Note {
  readonly time: number;
  readonly string: number;
  readonly fret: number;
  readonly sustain: number;
  readonly slideTo: number;
  readonly slideUnpitchTo: number;
  readonly bend: number;
  readonly hammerOn: boolean;
  readonly pullOff: boolean;
  readonly harmonic: boolean;
  readonly harmonicPinch: boolean;
  readonly palmMute: boolean;
  readonly mute: boolean;
  readonly vibrato: boolean;
  readonly tremolo: boolean;
  readonly accent: boolean;
  readonly linkNext: boolean;
  readonly tap: boolean;
}

export interface ChordNote
  extends Omit<Note, "time" | "string" | "fret"> {
  readonly string: number;
  readonly fret: number;
}

export interface ChordTemplate {
  readonly name: string;
  readonly displayName: string;
  readonly fingers: readonly number[];
  readonly frets: readonly number[];
  readonly arpeggio: boolean;
}

export interface Chord {
  readonly time: number;
  readonly chordId: number;
  readonly notes: readonly ChordNote[];
  readonly highDensity: boolean;
}

export interface Anchor {
  readonly time: number;
  readonly fret: number;
  readonly width: number;
}

export interface HandShape {
  readonly chordId: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly arpeggio: boolean;
}

export interface Beat {
  readonly time: number;
  readonly measure: number; // -1 = non-downbeat
}

export interface Section {
  readonly name: string;
  readonly number: number;
  readonly startTime: number;
}

export interface PhraseLevel {
  readonly difficulty: number;
  readonly notes: readonly Note[];
  readonly chords: readonly Chord[];
  readonly anchors: readonly Anchor[];
  readonly handShapes: readonly HandShape[];
}

export interface Phrase {
  readonly startTime: number;
  readonly endTime: number;
  readonly maxDifficulty: number;
  readonly levels: readonly PhraseLevel[];
}

export interface ToneChange {
  readonly time: number;
  readonly name: string;
}

export interface ToneData {
  readonly base: string;
  readonly changes: readonly ToneChange[];
}

export interface Arrangement {
  readonly name: string;
  readonly tuning: readonly number[];
  readonly capo: number;
  readonly notes: readonly Note[];
  readonly chords: readonly Chord[];
  readonly anchors: readonly Anchor[];
  readonly handShapes: readonly HandShape[];
  readonly chordTemplates: readonly ChordTemplate[];
  readonly phrases?: readonly Phrase[];
  readonly tones?: ToneData;
}

export interface LyricWord {
  readonly t: number;
  readonly d: number;
  readonly w: string;
}

export interface Song {
  readonly title: string;
  readonly artist: string;
  readonly album: string;
  readonly year: number;
  readonly songLength: number;
  readonly offset: number;
  readonly beats: readonly Beat[];
  readonly sections: readonly Section[];
  readonly arrangements: readonly Arrangement[];
  readonly lyrics: readonly LyricWord[];
}

// ─── Wire format (what the WebSocket sends to the frontend) ───────────────
// Compact field names to keep frame sizes small.

export interface WireNote {
  t: number;
  s: number;
  f: number;
  sus?: number;
  sl?: number;
  sl2?: number;
  bn?: number;
  ho?: true;
  po?: true;
  hm?: true;
  hp?: true;
  pm?: true;
  mu?: true;
  vb?: true;
  tr?: true;
  ac?: true;
  ln?: true;
  tap?: true;
}

export interface WireChordNote {
  s: number;
  f: number;
  sus?: number;
  sl?: number;
  sl2?: number;
  bn?: number;
  ho?: true;
  po?: true;
  pm?: true;
  mu?: true;
  vb?: true;
  tr?: true;
  ac?: true;
  ln?: true;
  tap?: true;
}

export interface WireChord {
  t: number;
  id: number;
  hd?: true;
  notes: WireChordNote[];
}

export interface WireAnchor {
  time: number;
  fret: number;
  width: number;
}

export interface WireHandShape {
  id: number;
  st: number;
  et: number;
  arp?: true;
}

export interface WireChordTemplate {
  name: string;
  displayName?: string;
  arp?: true;
  fingers: readonly number[];
  frets: readonly number[];
}

export interface WirePhraseLevel {
  difficulty: number;
  notes: WireNote[];
  chords: WireChord[];
  anchors: WireAnchor[];
  handshapes: WireHandShape[];
}

export interface WirePhrase {
  start_time: number;
  end_time: number;
  max_difficulty: number;
  levels: WirePhraseLevel[];
}

// ─── Serialization to wire format ─────────────────────────────────────────

function setFlag<T extends object>(obj: T, key: keyof T, val: boolean) {
  if (val) (obj as Record<string, unknown>)[key as string] = true;
}

export function toWireNote(n: Note): WireNote {
  const w: WireNote = { t: n.time, s: n.string, f: n.fret };
  if (n.sustain) w.sus = n.sustain;
  if (n.slideTo >= 0) w.sl = n.slideTo;
  if (n.slideUnpitchTo >= 0) w.sl2 = n.slideUnpitchTo;
  if (n.bend) w.bn = n.bend;
  setFlag(w, "ho", n.hammerOn);
  setFlag(w, "po", n.pullOff);
  setFlag(w, "hm", n.harmonic);
  setFlag(w, "hp", n.harmonicPinch);
  setFlag(w, "pm", n.palmMute);
  setFlag(w, "mu", n.mute);
  setFlag(w, "vb", n.vibrato);
  setFlag(w, "tr", n.tremolo);
  setFlag(w, "ac", n.accent);
  setFlag(w, "ln", n.linkNext);
  setFlag(w, "tap", n.tap);
  return w;
}

export function toWireChordNote(n: ChordNote): WireChordNote {
  const w: WireChordNote = { s: n.string, f: n.fret };
  if (n.sustain) w.sus = n.sustain;
  if (n.slideTo >= 0) w.sl = n.slideTo;
  if (n.slideUnpitchTo >= 0) w.sl2 = n.slideUnpitchTo;
  if (n.bend) w.bn = n.bend;
  setFlag(w, "ho", n.hammerOn);
  setFlag(w, "po", n.pullOff);
  setFlag(w, "pm", n.palmMute);
  setFlag(w, "mu", n.mute);
  setFlag(w, "vb", n.vibrato);
  setFlag(w, "tr", n.tremolo);
  setFlag(w, "ac", n.accent);
  setFlag(w, "ln", n.linkNext);
  setFlag(w, "tap", n.tap);
  return w;
}

export function toWireChord(c: Chord): WireChord {
  const w: WireChord = { t: c.time, id: c.chordId, notes: c.notes.map(toWireChordNote) };
  if (c.highDensity) w.hd = true;
  return w;
}

export function toWireAnchor(a: Anchor): WireAnchor {
  return { time: a.time, fret: a.fret, width: a.width };
}

export function toWireHandShape(h: HandShape): WireHandShape {
  const w: WireHandShape = { id: h.chordId, st: h.startTime, et: h.endTime };
  if (h.arpeggio) w.arp = true;
  return w;
}

export function toWireChordTemplate(ct: ChordTemplate): WireChordTemplate {
  const w: WireChordTemplate = { name: ct.name, fingers: ct.fingers, frets: ct.frets };
  if (ct.displayName) w.displayName = ct.displayName;
  if (ct.arpeggio) w.arp = true;
  return w;
}

export function toWirePhrase(p: Phrase): WirePhrase {
  return {
    start_time: p.startTime,
    end_time: p.endTime,
    max_difficulty: p.maxDifficulty,
    levels: p.levels.map((l) => ({
      difficulty: l.difficulty,
      notes: l.notes.map(toWireNote),
      chords: l.chords.map(toWireChord),
      anchors: l.anchors.map(toWireAnchor),
      handshapes: l.handShapes.map(toWireHandShape),
    })),
  };
}

// ─── Deserialization from wire format (for sloppak JSON) ──────────────────

export function noteFromWire(d: WireNote): Note {
  return {
    time: d.t,
    string: d.s,
    fret: d.f,
    sustain: d.sus ?? 0,
    slideTo: d.sl ?? -1,
    slideUnpitchTo: d.sl2 ?? -1,
    bend: d.bn ?? 0,
    hammerOn: d.ho === true,
    pullOff: d.po === true,
    harmonic: d.hm === true,
    harmonicPinch: d.hp === true,
    palmMute: d.pm === true,
    mute: d.mu === true,
    vibrato: d.vb === true,
    tremolo: d.tr === true,
    accent: d.ac === true,
    linkNext: d.ln === true,
    tap: d.tap === true,
  };
}

export function chordNoteFromWire(d: WireChordNote, chordTime: number): ChordNote {
  return {
    string: d.s,
    fret: d.f,
    sustain: d.sus ?? 0,
    slideTo: d.sl ?? -1,
    slideUnpitchTo: d.sl2 ?? -1,
    bend: d.bn ?? 0,
    hammerOn: d.ho === true,
    pullOff: d.po === true,
    harmonic: false,
    harmonicPinch: false,
    palmMute: d.pm === true,
    mute: d.mu === true,
    vibrato: d.vb === true,
    tremolo: d.tr === true,
    accent: d.ac === true,
    linkNext: d.ln === true,
    tap: d.tap === true,
  };
}

// ─── Utilities ─────────────────────────────────────────────────────────────

export function arrangementStringCount(arr: Arrangement): number {
  const nameBased = arr.name.toLowerCase().includes("bass") ? 4 : 6;
  const fromTuning = arr.tuning.length !== 6 ? arr.tuning.length : 0;

  let maxStr = 0;
  for (const n of arr.notes) if (n.string > maxStr) maxStr = n.string;
  for (const c of arr.chords)
    for (const n of c.notes) if (n.string > maxStr) maxStr = n.string;

  return Math.max(maxStr + 1, fromTuning || nameBased);
}
