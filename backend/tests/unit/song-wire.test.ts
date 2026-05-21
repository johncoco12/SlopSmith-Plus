import { describe, it, expect } from "vitest";
import {
  toWireNote,
  toWireChordNote,
  toWireChord,
  toWireAnchor,
  toWireHandShape,
  toWireChordTemplate,
  toWirePhrase,
  noteFromWire,
  chordNoteFromWire,
  arrangementStringCount,
} from "../../src/domain/models/song.js";
import type { Note, ChordNote, Chord, Anchor, HandShape, ChordTemplate, Phrase, Arrangement } from "../../src/domain/models/song.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    time: 1.5,
    string: 2,
    fret: 5,
    sustain: 0,
    slideTo: -1,
    slideUnpitchTo: -1,
    bend: 0,
    hammerOn: false,
    pullOff: false,
    harmonic: false,
    harmonicPinch: false,
    palmMute: false,
    mute: false,
    vibrato: false,
    tremolo: false,
    accent: false,
    linkNext: false,
    tap: false,
    ...overrides,
  };
}

function makeChordNote(overrides: Partial<ChordNote> = {}): ChordNote {
  return {
    string: 0,
    fret: 3,
    sustain: 0,
    slideTo: -1,
    slideUnpitchTo: -1,
    bend: 0,
    hammerOn: false,
    pullOff: false,
    harmonic: false,
    harmonicPinch: false,
    palmMute: false,
    mute: false,
    vibrato: false,
    tremolo: false,
    accent: false,
    linkNext: false,
    tap: false,
    ...overrides,
  };
}

// ─── toWireNote ───────────────────────────────────────────────────────────────

describe("toWireNote", () => {
  it("maps required fields to compact keys", () => {
    const wire = toWireNote(makeNote());
    expect(wire.t).toBe(1.5);
    expect(wire.s).toBe(2);
    expect(wire.f).toBe(5);
  });

  it("omits falsy optional fields", () => {
    const wire = toWireNote(makeNote());
    expect(wire.sus).toBeUndefined();
    expect(wire.sl).toBeUndefined();
    expect(wire.ho).toBeUndefined();
    expect(wire.po).toBeUndefined();
  });

  it("includes sustain when non-zero", () => {
    const wire = toWireNote(makeNote({ sustain: 0.8 }));
    expect(wire.sus).toBe(0.8);
  });

  it("includes slideTo when >= 0", () => {
    const wire = toWireNote(makeNote({ slideTo: 7 }));
    expect(wire.sl).toBe(7);
  });

  it("includes slideUnpitchTo as sl2", () => {
    const wire = toWireNote(makeNote({ slideUnpitchTo: 4 }));
    expect(wire.sl2).toBe(4);
  });

  it("sets boolean flags to true when active", () => {
    const wire = toWireNote(makeNote({ hammerOn: true, palmMute: true, tap: true }));
    expect(wire.ho).toBe(true);
    expect(wire.pm).toBe(true);
    expect(wire.tap).toBe(true);
  });

  it("omits false flags entirely (not set to false)", () => {
    const wire = toWireNote(makeNote({ hammerOn: false }));
    expect("ho" in wire).toBe(false);
  });
});

// ─── noteFromWire round-trip ──────────────────────────────────────────────────

describe("noteFromWire", () => {
  it("round-trips a plain note", () => {
    const original = makeNote({ time: 2.25, string: 3, fret: 9, sustain: 0.5 });
    const recovered = noteFromWire(toWireNote(original));
    expect(recovered).toEqual(original);
  });

  it("round-trips a note with all flags", () => {
    const original = makeNote({
      hammerOn: true,
      pullOff: true,
      palmMute: true,
      mute: true,
      vibrato: true,
      tremolo: true,
      accent: true,
      linkNext: true,
      tap: true,
      harmonic: true,
      harmonicPinch: true,
    });
    const recovered = noteFromWire(toWireNote(original));
    expect(recovered).toEqual(original);
  });

  it("defaults missing optional wire fields", () => {
    const wire = { t: 1, s: 0, f: 5 };
    const note = noteFromWire(wire);
    expect(note.sustain).toBe(0);
    expect(note.slideTo).toBe(-1);
    expect(note.slideUnpitchTo).toBe(-1);
    expect(note.bend).toBe(0);
    expect(note.hammerOn).toBe(false);
  });
});

// ─── toWireChord ──────────────────────────────────────────────────────────────

describe("toWireChord", () => {
  it("maps chord fields correctly", () => {
    const chord: Chord = {
      time: 3.0,
      chordId: 2,
      highDensity: false,
      notes: [makeChordNote({ string: 0, fret: 2 }), makeChordNote({ string: 1, fret: 3 })],
    };
    const wire = toWireChord(chord);
    expect(wire.t).toBe(3.0);
    expect(wire.id).toBe(2);
    expect(wire.notes).toHaveLength(2);
    expect(wire.hd).toBeUndefined();
  });

  it("includes highDensity flag when true", () => {
    const chord: Chord = { time: 0, chordId: 0, highDensity: true, notes: [] };
    expect(toWireChord(chord).hd).toBe(true);
  });
});

// ─── toWireAnchor ─────────────────────────────────────────────────────────────

describe("toWireAnchor", () => {
  it("preserves all anchor fields", () => {
    const anchor: Anchor = { time: 4.5, fret: 1, width: 4 };
    expect(toWireAnchor(anchor)).toEqual({ time: 4.5, fret: 1, width: 4 });
  });
});

// ─── toWireHandShape ──────────────────────────────────────────────────────────

describe("toWireHandShape", () => {
  it("maps handshape fields to compact keys", () => {
    const hs: HandShape = { chordId: 3, startTime: 1.0, endTime: 2.0, arpeggio: false };
    const wire = toWireHandShape(hs);
    expect(wire.id).toBe(3);
    expect(wire.st).toBe(1.0);
    expect(wire.et).toBe(2.0);
    expect(wire.arp).toBeUndefined();
  });

  it("includes arp flag when true", () => {
    const hs: HandShape = { chordId: 0, startTime: 0, endTime: 1, arpeggio: true };
    expect(toWireHandShape(hs).arp).toBe(true);
  });
});

// ─── toWireChordTemplate ──────────────────────────────────────────────────────

describe("toWireChordTemplate", () => {
  it("maps a chord template correctly", () => {
    const ct: ChordTemplate = {
      name: "G",
      displayName: "G Major",
      fingers: [2, 1, 3, 4, -1, -1],
      frets: [3, 2, 0, 0, -1, -1],
      arpeggio: false,
    };
    const wire = toWireChordTemplate(ct);
    expect(wire.name).toBe("G");
    expect(wire.displayName).toBe("G Major");
    expect(wire.fingers).toEqual([2, 1, 3, 4, -1, -1]);
    expect(wire.arp).toBeUndefined();
  });
});

// ─── toWirePhrase ─────────────────────────────────────────────────────────────

describe("toWirePhrase", () => {
  it("serializes a phrase with levels", () => {
    const phrase: Phrase = {
      startTime: 0,
      endTime: 10,
      maxDifficulty: 2,
      levels: [
        {
          difficulty: 0,
          notes: [makeNote()],
          chords: [],
          anchors: [{ time: 0, fret: 1, width: 4 }],
          handShapes: [],
        },
      ],
    };
    const wire = toWirePhrase(phrase);
    expect(wire.start_time).toBe(0);
    expect(wire.end_time).toBe(10);
    expect(wire.max_difficulty).toBe(2);
    expect(wire.levels).toHaveLength(1);
    expect(wire.levels[0].notes).toHaveLength(1);
    expect(wire.levels[0].anchors).toHaveLength(1);
  });
});

// ─── arrangementStringCount ───────────────────────────────────────────────────

describe("arrangementStringCount", () => {
  function makeArr(overrides: Partial<Arrangement>): Arrangement {
    return {
      name: "Lead",
      tuning: [0, 0, 0, 0, 0, 0],
      capo: 0,
      notes: [],
      chords: [],
      anchors: [],
      handShapes: [],
      chordTemplates: [],
      ...overrides,
    };
  }

  it("returns 6 for a standard guitar arrangement with no notes", () => {
    expect(arrangementStringCount(makeArr({}))).toBe(6);
  });

  it("returns 4 for a bass arrangement by name", () => {
    expect(arrangementStringCount(makeArr({ name: "Bass", tuning: [0, 0, 0, 0] }))).toBe(4);
  });

  it("uses max string from notes", () => {
    const count = arrangementStringCount(makeArr({
      notes: [makeNote({ string: 6 })],
    }));
    expect(count).toBe(7);
  });

  it("uses max string from chord notes", () => {
    const count = arrangementStringCount(makeArr({
      chords: [{ time: 0, chordId: 0, highDensity: false, notes: [makeChordNote({ string: 5 })] }],
    }));
    expect(count).toBe(6);
  });

  it("uses tuning length for non-standard tuning lengths", () => {
    const count = arrangementStringCount(makeArr({
      name: "Lead 7",
      tuning: [0, 0, 0, 0, 0, 0, 0],
    }));
    expect(count).toBe(7);
  });
});
