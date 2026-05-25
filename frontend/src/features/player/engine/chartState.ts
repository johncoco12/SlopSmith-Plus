// All chart data received over the WebSocket, accumulated until 'ready'.
// The MasteryFilter reads from here and produces filtered views.

import type {
  ChartNote, ChartChord, Beat, Section, Anchor,
  ChordTemplate, Lyric, ToneChange, HandShape, SongInfo,
} from '../types.js';

const MAX_STRINGS = 8;

export class ChartState {
  songInfo: SongInfo = {};
  notes: ChartNote[] = [];
  chords: ChartChord[] = [];
  beats: Beat[] = [];
  sections: Section[] = [];
  anchors: Anchor[] = [];
  chordTemplates: ChordTemplate[] = [];
  lyrics: Lyric[] = [];
  toneChanges: ToneChange[] = [];
  toneBase = '';
  handShapes: HandShape[] = [];
  stringCount = 6;
  songOffset = 0;
  isReady = false;

  reset(): void {
    this.songInfo = {};
    this.notes = [];
    this.chords = [];
    this.beats = [];
    this.sections = [];
    this.anchors = [];
    this.chordTemplates = [];
    this.lyrics = [];
    this.toneChanges = [];
    this.toneBase = '';
    this.handShapes = [];
    this.stringCount = 6;
    this.songOffset = 0;
    this.isReady = false;
  }

  applySongInfo(msg: SongInfo): void {
    this.songInfo = msg;

    const parsedOffset = Number(msg.offset);
    this.songOffset = Number.isFinite(parsedOffset) ? parsedOffset : 0;

    // Resolve string count with the priority chain documented in CLAUDE.md.
    let sc: number;
    if (typeof msg.stringCount === 'number' && msg.stringCount > 0) {
      sc = msg.stringCount;
    } else if (Array.isArray(msg.tuning) && msg.tuning.length > 0) {
      sc = msg.tuning.length;
    } else {
      sc = 6;
    }
    const truncated = Number.isFinite(sc) ? Math.trunc(sc) : 1;
    this.stringCount = Math.max(1, Math.min(MAX_STRINGS, truncated));
  }

  finalise(): void {
    if (this.handShapes.length) {
      this.handShapes.sort((a, b) => a.start_time - b.start_time);
    }
    this.isReady = true;
  }
}
