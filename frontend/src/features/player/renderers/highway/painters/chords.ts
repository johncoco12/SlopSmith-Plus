// Chord rendering — chains, frames, muted chords, fret-line preview.

import {
  CHORD_FRAME_FRETS, REPEAT_BOX_BAR, REPEAT_BOX_FILL,
  MUTE_BOX_STROKE, MUTE_BOX_BAR,
  ChordChainCache, isOpenNote, noteHasTechniqueFlags, templateFret,
} from '../chordCache.js';
import { stringColor, stringDim, stringBright } from '../colors.js';
import { paintGemGlow } from './gemGlow.js';
import { drawNote, resolveNoteState } from './notes.js';
import { VISIBLE_SECONDS } from '@/features/player/engine/projection';
import type { DrawContext, ChartChord, ChordTemplate } from '@/features/player/types';

const FRETLINE_TARGET_OFFSET = -0.25;
const FRETLINE_WINDOW_BEFORE = 0.1;
const FRETLINE_WINDOW_AFTER = 0.3;

// ── Fret-line chord preview ───────────────────────────────────────────────────

interface FretPreviewNote { s: number; f: number }

export class FretLinePreview {
  private lastChord: ChartChord | null = null;
  private notes: FretPreviewNote[] = [];

  update(
    src: ChartChord[],
    lo: number, hi: number,
    currentTime: number,
    templates: ChordTemplate[],
  ): void {
    const targetTime = currentTime + FRETLINE_TARGET_OFFSET;
    let active: ChartChord | null = null;
    let activeNotes: FretPreviewNote[] = [];
    let bestT = -Infinity;

    for (let i = lo; i < hi; i++) {
      const ch = src[i];
      if (ch.t >= targetTime - FRETLINE_WINDOW_BEFORE &&
          ch.t < targetTime + FRETLINE_WINDOW_AFTER &&
          ch.t > bestT) {
        bestT = ch.t;
        active = ch;
        activeNotes = ch.notes
          .filter(cn => !isOpenNote(cn, templates, ch.id))
          .map(cn => ({ s: cn.s, f: cn.f }));
      }
    }

    if (!active) {
      for (let i = lo; i < hi; i++) {
        active = src[i];
        activeNotes = active.notes
          .filter(cn => !isOpenNote(cn, templates, active!.id))
          .map(cn => ({ s: cn.s, f: cn.f }));
        break;
      }
    }

    if (active !== this.lastChord) {
      this.lastChord = active;
      this.notes = activeNotes;
    }
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, inverted: boolean, fretX: DrawContext['fretX'], fillTextReadable: DrawContext['fillTextReadable']): void {
    if (!this.notes.length) return;

    const strTop = H * 0.83;
    const strBot = H * 0.95;
    const noteSize = Math.max(14, H * 0.033);
    const fontSize = Math.max(11, H * 0.027) | 0;
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cn of this.notes) {
      const yi = inverted ? 5 - cn.s : cn.s;
      const y = strTop + (yi / 5) * (strBot - strTop);
      const x = fretX(cn.f, 1, W);
      ctx.fillStyle = stringColor(cn.s);
      ctx.beginPath();
      ctx.arc(x, y, noteSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      fillTextReadable(String(cn.f), x, y);
    }
  }

  reset(): void {
    this.lastChord = null;
    this.notes = [];
  }
}

// ── Binary search for chord array ─────────────────────────────────────────────

function bsearchChords(arr: ChartChord[], time: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── Chord box geometry ────────────────────────────────────────────────────────

function computeChordBox(
  pY: number, H: number, W: number,
  sorted: ChartChord['notes'],
  sz: number, spread: number, baseFret: number,
  fretX: DrawContext['fretX'], scale: number,
): { boxX: number; boxW: number; boxTop: number; boxH: number } {
  const totalH = spread * Math.max(0, sorted.length - 1);
  const yCenter = pY * H;
  const boxTop = yCenter - totalH / 2 - sz * 0.5;
  const boxBottom = boxTop + Math.max(sz, totalH + sz);
  const boxX = fretX(baseFret, scale, W);
  const boxW = fretX(baseFret + CHORD_FRAME_FRETS, scale, W) - boxX;
  return { boxX, boxW, boxTop, boxH: boxBottom - boxTop };
}

// ── Main chord drawing ────────────────────────────────────────────────────────

export function drawChords(cx: DrawContext, cache: ChordChainCache, preview: FretLinePreview): void {
  const { ctx, W, H, chords, chordTemplates, currentTime, inverted, noteStateProvider, project, fretX, fillTextReadable } = cx;

  cache.ensureUpToDate(chords, chordTemplates, inverted);

  const tMin = currentTime - 0.25;
  const tMax = currentTime + VISIBLE_SECONDS;
  const lo = bsearchChords(chords, tMin);
  const hi = bsearchChords(chords, tMax);

  preview.update(chords, lo, hi, currentTime, chordTemplates);
  preview.draw(ctx, W, H, inverted, fretX, fillTextReadable);

  for (let i = hi - 1; i >= lo; i--) {
    const ch = chords[i];
    const p = project(ch.t - currentTime);
    if (!p) continue;

    const info = cache.get(ch);
    const { isFull, baseFret } = info;

    const sorted = [...ch.notes].sort((a, b) => inverted ? b.s - a.s : a.s - b.s);
    const sz = Math.max(10, 28 * p.scale * (H / 900));
    const spread = Math.max(sz * 0.85, sz + 16 * p.scale);
    const totalH = spread * Math.max(0, sorted.length - 1);

    const tmpl = chordTemplates[ch.id];
    const nonZeroNotes = sorted.filter(cn => !isOpenNote(cn, chordTemplates, ch.id));
    const hasNonZero = nonZeroNotes.length >= 1;

    const frameLeft = baseFret;
    const frameRight = baseFret + CHORD_FRAME_FRETS;

    // Warn once on frame mismatch.
    if (hasNonZero && !cache.hasWarned(ch.id)) {
      const inFrame = nonZeroNotes.every(cn => cn.f >= frameLeft && cn.f <= frameRight);
      if (!inFrame) {
        cache.warnFrameMismatch(ch.id, { frameLeft, frameRight, nonZeroFrets: nonZeroNotes.map(cn => cn.f) });
      }
    }

    const xMin = hasNonZero ? Math.min(...nonZeroNotes.map(cn => fretX(cn.f, p.scale, W))) : null;
    const xMax = hasNonZero ? Math.max(...nonZeroNotes.map(cn => fretX(cn.f, p.scale, W))) : null;

    // Muted chord — empty gray frame with X.
    const allMuted = sorted.length > 0 && sorted.every(cn => cn.mt);
    if (allMuted) {
      const box = computeChordBox(p.y, H, W, sorted, sz, spread, baseFret, fretX, p.scale);
      ctx.strokeStyle = MUTE_BOX_STROKE;
      ctx.lineWidth = Math.max(2, sz / 6);
      roundRect(ctx, box.boxX, box.boxTop, box.boxW, box.boxH, 2);
      ctx.stroke();
      ctx.fillStyle = MUTE_BOX_BAR;
      ctx.fillRect(box.boxX, box.boxTop + 2, box.boxW, 4);
      const xInset = sz * 0.6;
      ctx.beginPath();
      ctx.moveTo(box.boxX + xInset, box.boxTop + sz * 0.5);
      ctx.lineTo(box.boxX + box.boxW - xInset, box.boxTop + box.boxH - sz * 0.5);
      ctx.moveTo(box.boxX + box.boxW - xInset, box.boxTop + sz * 0.5);
      ctx.lineTo(box.boxX + xInset, box.boxTop + box.boxH - sz * 0.5);
      ctx.stroke();
      continue;
    }

    // Repeat chord — translucent box + bracket bar.
    if (!isFull) {
      const box = computeChordBox(p.y, H, W, sorted, sz, spread, baseFret, fretX, p.scale);
      ctx.fillStyle = REPEAT_BOX_FILL;
      roundRect(ctx, box.boxX, box.boxTop, box.boxW, box.boxH, 2);
      ctx.fill();
      ctx.fillStyle = REPEAT_BOX_BAR;
      ctx.fillRect(box.boxX, box.boxTop + 2, box.boxW, 4);
      continue;
    }

    // Full chord rendering.

    // Bracket bar above notes.
    if (hasNonZero || sorted.length >= 2) {
      const refNotes = hasNonZero ? nonZeroNotes : sorted;
      const positions = refNotes.map((cn, j) => ({
        x: fretX(cn.f, p.scale, W),
        y: p.y * H - totalH / 2 + j * spread,
      }));
      const barY = positions[0].y - sz * 0.7;
      const barLeft = hasNonZero ? xMin! : fretX(frameLeft, p.scale, W);
      const barRight = hasNonZero ? xMax! : fretX(frameRight, p.scale, W);
      ctx.fillStyle = REPEAT_BOX_BAR;
      ctx.lineWidth = Math.max(3, sz / 4);
      roundRect(ctx, barLeft - 2, barY - 2, barRight - barLeft + 4, 4, 2);
      ctx.fill();
      for (const pos of positions) {
        ctx.fillRect(pos.x - 2, barY, 4, pos.y - sz / 2 - barY);
      }
    }

    // Chord name.
    if (!ch.hd && p.scale > 0.15 && tmpl?.name) {
      const labelY = hasNonZero
        ? p.y * H - totalH / 2 - sz * 0.7 - sz * 0.4
        : p.y * H - sz * 0.8;
      const labelX = hasNonZero
        ? (xMin! + xMax!) / 2
        : (sorted.length >= 2
          ? (fretX(frameLeft, p.scale, W) + fretX(frameRight, p.scale, W)) / 2
          : fretX(sorted[0].f, p.scale, W));
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(14, sz * 0.45) | 0}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      fillTextReadable(tmpl.name, labelX, labelY);
    }

    // Individual note gems.
    const chordPositions: Array<{ s: number; f: number; bn: number; x: number; y: number; scale: number }> = [];
    const hasMultiple = sorted.length >= 2;

    sorted.forEach((cn, j) => {
      const x = fretX(cn.f, p.scale, W);
      const ny = p.y * H - totalH / 2 + j * spread;
      const cnNs = noteStateProvider ? resolveNoteState(noteStateProvider, cn, ch.t) : null;

      // Wide open-string bar inside chord (when no technique flags).
      if (templateFret(cn, chordTemplates, ch.id) === 0 && hasMultiple && !noteHasTechniqueFlags(cn)) {
        const litBar = !!(cnNs && cnNs.state !== 'miss');
        const color = litBar ? (cnNs!.color ?? stringBright(cn.s)) : stringColor(cn.s);
        const dark  = litBar ? stringColor(cn.s) : stringDim(cn.s);
        const barH = sz;
        const barLeft = fretX(frameLeft, p.scale, W);
        const barRight = fretX(frameRight, p.scale, W);
        ctx.fillStyle = dark;
        roundRect(ctx, barLeft - 1, ny - barH / 2 - 1, barRight - barLeft + 2, barH + 2, 3);
        ctx.fill();
        ctx.fillStyle = color;
        roundRect(ctx, barLeft, ny - barH / 2, barRight - barLeft, barH, 2);
        ctx.fill();
        paintGemGlow(ctx, (barLeft + barRight) / 2, ny, barH * 0.5, cn.s, cnNs);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, sz * 0.5) | 0}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fillTextReadable('0', (barLeft + barRight) / 2, ny);
      } else {
        drawNote(ctx, W, H, x, ny, p.scale, cn.s, cn.f, { ...cn, chord: true }, cnNs, fillTextReadable);
      }

      chordPositions.push({ s: cn.s, f: cn.f, bn: cn.bn ?? 0, x, y: ny, scale: p.scale });
    });

    // Unison bends within chord.
    const bent   = chordPositions.filter(n => n.bn > 0);
    const unbent = chordPositions.filter(n => n.bn === 0);
    if (bent.length && unbent.length && sz >= 14) {
      for (const bn of bent) {
        let closest = unbent[0];
        for (const ub of unbent) {
          if (Math.abs(ub.s - bn.s) < Math.abs(closest.s - bn.s)) closest = ub;
        }
        const midX = (bn.x + closest.x) / 2 + sz * 0.5;
        const midY = (bn.y + closest.y) / 2;
        ctx.save();
        ctx.strokeStyle = '#60d0ff';
        ctx.lineWidth = Math.max(2, sz / 12);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bn.x, bn.y);
        ctx.quadraticCurveTo(midX, midY, closest.x, closest.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        const labelSz = Math.max(10, sz * 0.3) | 0;
        ctx.fillStyle = '#60d0ff';
        ctx.font = `bold ${labelSz}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cpX = (bn.x + 2 * midX + closest.x) / 4;
        const cpY = (bn.y + 2 * midY + closest.y) / 4;
        fillTextReadable('U', cpX + sz * 0.3, cpY);
      }
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
