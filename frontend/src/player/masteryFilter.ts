// Phrase-based difficulty (master difficulty) filter.
//
// When the server sends phrase-ladder data, this class maps a [0..1] mastery
// fraction to per-phrase level indices and produces filtered note/chord/anchor
// arrays. When no phrase data is available the filtered arrays are null, meaning
// draw code falls through to the flat arrays.

import type { ChartNote, ChartChord, Anchor, HandShape, Phrase } from './types.js';

export interface FilteredArrays {
  notes: ChartNote[] | null;
  chords: ChartChord[] | null;
  anchors: Anchor[] | null;
  handShapes: HandShape[] | null;
  phrasesHaveHandShapes: boolean;
}

const EMPTY: FilteredArrays = {
  notes: null,
  chords: null,
  anchors: null,
  handShapes: null,
  phrasesHaveHandShapes: false,
};

export class MasteryFilter {
  private phrases: Phrase[] | null = null;
  private mastery = 1.0;
  private filtered: FilteredArrays = EMPTY;

  setPhrases(phrases: Phrase[]): void {
    this.phrases = phrases;
    this._rebuild();
  }

  appendPhrase(phrase: Phrase): void {
    if (!this.phrases) this.phrases = [];
    this.phrases.push(phrase);
    // Don't rebuild mid-stream — caller calls finalise() after 'ready'.
  }

  finalise(): void {
    this._rebuild();
  }

  setMastery(fraction: number): void {
    const next = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 1));
    if (next === this.mastery) return;
    this.mastery = next;
    this._rebuild();
  }

  getMastery(): number {
    return this.mastery;
  }

  hasPhraseData(): boolean {
    return !!(this.phrases && this.phrases.length > 0);
  }

  getFiltered(): FilteredArrays {
    return this.filtered;
  }

  reset(): void {
    this.phrases = null;
    this.filtered = EMPTY;
  }

  private _rebuild(): void {
    if (!this.phrases || this.phrases.length === 0) {
      this.filtered = EMPTY;
      return;
    }

    const outNotes: ChartNote[] = [];
    const outChords: ChartChord[] = [];
    const outAnchors: Anchor[] = [];
    const outHandShapes: HandShape[] = [];
    let anyHandShapes = false;

    for (const phrase of this.phrases) {
      const n = phrase.levels.length;
      if (n === 0) continue;

      // Scan all levels to determine if any authored handshapes.
      if (!anyHandShapes) {
        for (const lv of phrase.levels) {
          if (lv.handshapes && lv.handshapes.length > 0) {
            anyHandShapes = true;
            break;
          }
        }
      }

      const idx = Math.min(n - 1, Math.floor(this.mastery * n));
      const lv = phrase.levels[idx];
      for (const x of lv.notes)   outNotes.push(x);
      for (const x of lv.chords)  outChords.push(x);
      for (const x of lv.anchors) outAnchors.push(x);
      for (const x of (lv.handshapes ?? [])) outHandShapes.push(x);
    }

    if (outHandShapes.length) {
      outHandShapes.sort((a, b) => a.start_time - b.start_time);
    }

    this.filtered = {
      notes: outNotes,
      chords: outChords,
      anchors: outAnchors,
      handShapes: outHandShapes,
      phrasesHaveHandShapes: anyHandShapes,
    };
  }
}
