// Chord chain and frame computation — derived once per source array.
//
// Rocksmith charts repeat the same chord shape consecutively (chains). We
// detect chains and mark chord positions as "full" (render all notes) or
// "repeat" (translucent box — saves visual noise when a shape is strummed
// many times in a row). Each chord also gets a baseFret that anchors the
// CHORD_FRAME_FRETS-wide bounding frame shown around the notes.

import type { ChartChord, ChordTemplate } from '@/features/player/types';

export const CHAIN_GAP_THRESHOLD = 0.5;
export const CHAIN_RENDER_FULL_MAX = 4;
export const CHORD_FRAME_FRETS = 4;

export const REPEAT_BOX_FILL = 'rgba(48, 80, 128, 0.06)';
export const REPEAT_BOX_BAR  = '#50a0dc';
export const MUTE_BOX_STROKE = '#6060809b';
export const MUTE_BOX_BAR   = '#606080d1';

export interface ChordRenderInfo {
  chainIndex: number;
  chainLen: number;
  isFull: boolean;
  baseFret: number;
}

function hasTechniqueFlags(n: ChartChord['notes'][number]): boolean {
  if (n.bn || n.ho || n.po || n.tp || n.pm || n.vb || n.tr || n.ac || n.hm || n.hp || n.mt) return true;
  if (typeof n.sl === 'number' && n.sl >= 0) return true;
  return false;
}

function chordHasTechniques(ch: ChartChord): boolean {
  return ch.notes.some(hasTechniqueFlags);
}

export function templateFret(cn: ChartChord['notes'][number], templates: ChordTemplate[], chordId: number): number {
  const tmpl = templates[chordId];
  const frets = tmpl?.frets ?? [];
  return cn.s < frets.length ? frets[cn.s] : cn.f;
}

export function isOpenNote(cn: ChartChord['notes'][number], templates: ChordTemplate[], chordId: number): boolean {
  return templateFret(cn, templates, chordId) === 0;
}

export function noteHasTechniqueFlags(n: ChartChord['notes'][number]): boolean {
  return hasTechniqueFlags(n);
}

export class ChordChainCache {
  private info = new WeakMap<ChartChord, ChordRenderInfo>();
  private cachedSrc: ChartChord[] | null = null;
  private cachedInverted: boolean | null = null;
  private frameMismatchWarned = new Set<number>();

  ensureUpToDate(src: ChartChord[], templates: ChordTemplate[], inverted: boolean): void {
    if (this.cachedSrc === src && this.cachedInverted === inverted) return;
    this.cachedSrc = src;
    this.cachedInverted = inverted;
    this._build(src, templates, inverted);
  }

  get(ch: ChartChord): ChordRenderInfo {
    return this.info.get(ch) ?? { chainIndex: 0, chainLen: 1, isFull: true, baseFret: 0 };
  }

  warnFrameMismatch(chordId: number, info: { frameLeft: number; frameRight: number; nonZeroFrets: number[] }): void {
    if (this.frameMismatchWarned.has(chordId)) return;
    this.frameMismatchWarned.add(chordId);
    console.warn('Chord frame mismatch:', chordId, info);
  }

  hasWarned(chordId: number): boolean {
    return this.frameMismatchWarned.has(chordId);
  }

  reset(): void {
    this.cachedSrc = null;
    this.cachedInverted = null;
    this.frameMismatchWarned.clear();
  }

  private _build(src: ChartChord[], templates: ChordTemplate[], inverted: boolean): void {
    // Pass 1 — chain bounds and isFull.
    let chainStart = 0;
    for (let i = 0; i <= src.length; i++) {
      const isBreak =
        i === src.length ||
        (i > chainStart &&
          (src[i].id !== src[i - 1].id ||
            Math.abs(src[i].t - src[i - 1].t) >= CHAIN_GAP_THRESHOLD));

      if (isBreak && i > chainStart) {
        const len = i - chainStart;
        for (let k = chainStart; k < i; k++) {
          const idx = k - chainStart;
          const hasTech = chordHasTechniques(src[k]);
          this.info.set(src[k], {
            chainIndex: idx,
            chainLen: len,
            isFull: len < CHAIN_RENDER_FULL_MAX || idx === 0 || hasTech,
            baseFret: 0,
          });
        }
        chainStart = i;
      }
    }

    // Pass 2 — baseFret (reads prev entry, so forward-only).
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const entry = this.info.get(ch)!;
      const sorted = [...ch.notes].sort((a, b) => inverted ? b.s - a.s : a.s - b.s);
      const nonZero = sorted.filter(cn => !isOpenNote(cn, templates, ch.id));

      if (nonZero.length >= 1) {
        entry.baseFret = Math.min(...nonZero.map(cn => cn.f));
      } else if (i > 0) {
        const prev = this.info.get(src[i - 1]);
        entry.baseFret = prev?.baseFret ?? 0;
      } else {
        entry.baseFret = 0;
      }
    }
  }
}
